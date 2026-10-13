import { z } from "zod";
import { timerSchema, type EventProject } from "../model/schema";
import { operationalReadiness } from "../conductor/readiness";
export const publicPayloadSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal("snapshot"),
    revision: z.number().int().nonnegative(),
    sentAt: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    publicTitle: z.string().min(1).max(120),
    roundLabel: z.string().min(1).max(180),
    status: z.enum([
      "planned",
      "running",
      "paused",
      "completed",
      "finished",
      "unavailable",
    ]),
    timer: timerSchema.nullable(),
    groups: z
      .array(
        z.strictObject({
          publicLabel: z.string().min(1).max(120),
          participants: z.array(z.string().min(1).max(120)).max(60),
        }),
      )
      .max(12),
  })
  .superRefine((payload, context) => {
    const invalid = (message: string) =>
      context.addIssue({ code: "custom", message });
    if (
      payload.groups.reduce(
        (count, group) => count + group.participants.length,
        0,
      ) > 60
    )
      invalid("Too many public assignments");
    if (payload.status === "unavailable") {
      if (payload.timer || payload.groups.length)
        invalid("Unavailable routes cannot carry a timer or assignments");
    } else if (payload.status === "planned") {
      if (payload.timer) invalid("Planned projection cannot carry a timer");
    } else if (
      !payload.timer ||
      (payload.status === "running") !==
        (payload.timer.deadlineEpochMs !== null)
    ) {
      invalid("Projection status and timer disagree");
    }
  });
export type PublicPayload = z.infer<typeof publicPayloadSchema>;
export const channelName = (sessionId: string): string =>
  `roundrelay-public-v2-${sessionId}`;
export function publicPayload(p: EventProject): PublicPayload {
  if (!operationalReadiness(p).routesReady)
    return {
      version: 1,
      type: "snapshot",
      revision: p.revision,
      sentAt: Date.now(),
      publicTitle: p.title,
      roundLabel: "Routes unavailable · repair the draft in the conductor",
      status: "unavailable",
      timer: null,
      groups: [],
    };
  const r =
    p.rounds.find((r) => r.roundId === p.conductor.activeRoundId) ??
    [...p.rounds]
      .sort((a, b) => a.order - b.order)
      .find((r) => r.status === "planned") ??
    [...p.rounds].sort((a, b) => b.order - a.order)[0];
  return {
    version: 1,
    type: "snapshot",
    revision: p.revision,
    sentAt: Date.now(),
    publicTitle: p.title,
    roundLabel: `Round ${r.order} / ${p.rounds.length} · ${r.frozen?.publicTitle ?? r.publicTitle}`,
    status: p.rounds.every((x) => x.status === "completed")
      ? "finished"
      : r.status,
    timer: r.timer ? { ...r.timer } : null,
    groups: r.groups
      .filter((g) => g.enabled)
      .map((g) => ({
        publicLabel: g.publicLabel,
        participants: r.assignments
          .filter((a) => a.groupId === g.groupId)
          .map(
            (a) =>
              r.frozen?.publicParticipants.find(
                (x) => x.participantId === a.participantId,
              )?.publicLabel ??
              p.participants.find((x) => x.participantId === a.participantId)
                ?.publicLabel ??
              "Unknown",
          ),
      })),
  };
}
