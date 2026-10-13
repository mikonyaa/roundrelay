import { z } from "zod";
import {
  publicPayload,
  publicPayloadSchema,
  type PublicPayload,
} from "./payload";
import type { EventProject } from "../model/schema";

const counter = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const transportCursorSchema = z.strictObject({
  sessionId: z.uuid(),
  workspaceEpoch: counter,
  sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
export type TransportCursor = z.infer<typeof transportCursorSchema>;
export const envelopeSchema = z.strictObject({
  version: z.literal(2),
  type: z.literal("snapshot"),
  sessionId: z.uuid(),
  workspaceEpoch: counter,
  sequence: counter,
  payload: publicPayloadSchema,
});
export type ProjectionEnvelope = z.infer<typeof envelopeSchema>;
export const snapshotRequestSchema = z.strictObject({
  version: z.literal(2),
  type: z.literal("request-snapshot"),
  sessionId: z.uuid(),
});

// Business revision may decrease on import/restore. Only the transport orders packets.
export class ProjectionPublisher {
  readonly sessionId: string;
  private cursor: TransportCursor;
  private workspace: number | null = null;
  constructor(
    previous: unknown = null,
    private readonly store: (cursor: TransportCursor) => void = () => {},
  ) {
    const parsed = transportCursorSchema.safeParse(previous);
    this.cursor = parsed.success
      ? { ...parsed.data }
      : { sessionId: crypto.randomUUID(), workspaceEpoch: 1, sequence: 0 };
    this.sessionId = this.cursor.sessionId;
  }
  snapshot(project: EventProject, workspace: number): ProjectionEnvelope {
    if (this.workspace !== workspace) {
      this.cursor.workspaceEpoch++;
      this.workspace = workspace;
    }
    this.cursor.sequence++;
    transportCursorSchema.parse(this.cursor);
    this.store({ ...this.cursor });
    return envelopeSchema.parse({
      version: 2,
      type: "snapshot",
      ...this.cursor,
      payload: publicPayload(project),
    });
  }
}

export class ProjectionReceiver {
  private cursor: ProjectionEnvelope | null = null;
  payload: PublicPayload | null = null;
  lastAcceptedAt = 0;
  constructor(private readonly sessionId: string) {}
  accept(input: unknown, receivedAt = Date.now()): boolean {
    const parsed = envelopeSchema.safeParse(input);
    if (!parsed.success || parsed.data.sessionId !== this.sessionId)
      return false;
    const packet = parsed.data;
    if (
      this.cursor &&
      (packet.sequence <= this.cursor.sequence ||
        packet.workspaceEpoch < this.cursor.workspaceEpoch)
    )
      return false;
    this.cursor = packet;
    this.payload = packet.payload;
    this.lastAcceptedAt = receivedAt;
    return true;
  }
}
