import { z } from "zod";

export const LIMITS = {
  bytes: 2 * 1024 * 1024,
  participants: 60,
  rounds: 6,
  groups: 12,
  pairs: 200,
  history: 100,
  depth: 16,
} as const;
const id = z
  .string()
  .min(1)
  .max(80)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "Use letters, digits, underscore or hyphen for IDs",
  );
const label = z.string().min(1).max(120);
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const durationSchema = z
  .number()
  .int()
  .min(1000)
  .max(4 * 60 * 60 * 1000);
export const participantSchema = z.strictObject({
  participantId: id,
  publicLabel: label,
  privateNote: z.string().max(500).optional(),
});
export const groupSchema = z.strictObject({
  groupId: id,
  publicLabel: label,
  minSize: z.number().int().min(0).max(60),
  maxSize: z.number().int().min(0).max(60),
  enabled: z.boolean(),
});
export const assignmentSchema = z.strictObject({
  participantId: id,
  groupId: id,
});
export const availabilitySchema = z.strictObject({
  participantId: id,
  roundId: id,
  available: z.boolean(),
});
export const pairSchema = z.strictObject({
  participantIds: z.tuple([id, id]),
  reason: z.string().max(500).optional(),
});
export const timerSchema = z.strictObject({
  durationMs: durationSchema,
  deadlineEpochMs: integer.nullable(),
  remainingMs: z.number().int().min(0).max(14400000),
  startedAtEpochMs: integer.nullable(),
});
export const frozenSchema = z.strictObject({
  publicTitle: label,
  durationMs: durationSchema,
  groups: z.array(groupSchema).min(1).max(12),
  assignments: z.array(assignmentSchema).max(60),
  publicParticipants: z
    .array(z.strictObject({ participantId: id, publicLabel: label }))
    .max(60),
  availability: z.array(availabilitySchema).max(60),
  mustSeparate: z.array(pairSchema).max(200),
});
export const roundSchema = z.strictObject({
  roundId: id,
  order: z.number().int().min(1).max(6),
  publicTitle: label,
  durationMs: durationSchema,
  groups: z.array(groupSchema).min(1).max(12),
  assignments: z.array(assignmentSchema).max(60),
  status: z.enum(["planned", "running", "paused", "completed"]),
  timer: timerSchema.nullable(),
  frozen: frozenSchema.nullable(),
});
export const groupChangeSchema = z.strictObject({
  roundId: id,
  groupId: id,
  minSize: z.number().int().min(0).max(60),
  maxSize: z.number().int().min(0).max(60),
  enabled: z.boolean(),
});
export const draftSchema = z.strictObject({
  availabilityChanges: z.array(availabilitySchema).max(360),
  futureGroupChanges: z.array(groupChangeSchema).max(72),
});
export const futureSchema = z.strictObject({
  rounds: z
    .array(
      z.strictObject({
        roundId: id,
        groups: z.array(groupSchema).min(1).max(12),
        assignments: z.array(assignmentSchema).max(60),
      }),
    )
    .max(6),
  availability: z.array(availabilitySchema).max(360),
});
export const historySchema = z.strictObject({
  operationId: id,
  revisionAfter: integer,
  createdAtEpochMs: integer,
  inputHash: z.string().max(80),
  before: futureSchema,
  after: futureSchema,
  undone: z.boolean(),
  moved: integer,
  added: integer,
  removed: integer,
  plannerVersion: z.string().max(80),
});
export const projectSchema = z.strictObject({
  kind: z.literal("roundrelay-event"),
  schemaVersion: z.literal(1),
  eventId: id,
  revision: integer,
  title: label,
  participants: z.array(participantSchema).min(1).max(60),
  rounds: z.array(roundSchema).min(1).max(6),
  availability: z.array(availabilitySchema).max(360),
  constraints: z.strictObject({ mustSeparate: z.array(pairSchema).max(200) }),
  conductor: z.strictObject({
    activeRoundId: id.nullable(),
    pendingDraft: draftSchema.nullable(),
  }),
  repairHistory: z.array(historySchema).max(100),
  metadata: z.strictObject({
    createdAt: z.string().max(40),
    appVersion: z.string().max(30),
    source: z.string().max(120),
  }),
});
export type EventProject = z.infer<typeof projectSchema>;
export type Round = z.infer<typeof roundSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type FutureState = z.infer<typeof futureSchema>;
export type Group = z.infer<typeof groupSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type TimerControl = z.infer<typeof timerSchema>;
export type Diagnostic = { code: string; path: string; message: string };

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
// Identity checksum, not a cryptographic signature. Apply also checks exact revision, patch and frozen data.
export function checksum(value: unknown): string {
  let n = 0xcbf29ce484222325n;
  for (const c of canonical(value))
    n = BigInt.asUintN(64, (n ^ BigInt(c.charCodeAt(0))) * 0x100000001b3n);
  return n.toString(16).padStart(16, "0");
}
export const clone = <T>(value: T): T => structuredClone(value);
export const ordered = (p: EventProject): Round[] =>
  [...p.rounds].sort((a, b) => a.order - b.order);
