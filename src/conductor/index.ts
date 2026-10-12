import {
  LIMITS,
  clone,
  draftSchema,
  ordered,
  type Draft,
  type EventProject,
} from "../model/schema";
import {
  futureState,
  protectionFingerprint,
  restoreFuture,
  undoReason,
} from "../history";
import { pauseTimer, remaining, resumeTimer, startTimer } from "../timer";
import { patchedProject, scorePlan, type Proposal } from "../planner";
import { validateProposal } from "../validate/proposal";
import { validateProject, validateRound } from "../validate";

export type Command =
  | { type: "start"; now: number }
  | { type: "pause" | "resume" | "finish"; now: number }
  | { type: "correct-time"; now: number; remainingMs: number }
  | { type: "draft"; patch: Draft }
  | { type: "cancel-draft" }
  | { type: "apply"; proposal: Proposal; now: number }
  | { type: "undo" };
export function reduceProject(
  base: EventProject,
  command: Command,
): EventProject {
  let p = clone(base);
  const active = p.rounds.find((r) => r.roundId === p.conductor.activeRoundId);
  if (
    "now" in command &&
    (!Number.isSafeInteger(command.now) || command.now < 0)
  )
    throw new Error("Invalid wall time");
  switch (command.type) {
    case "start": {
      if (active) return base;
      const next = ordered(p).find((r) => r.status === "planned");
      if (!next) return base;
      if (p.conductor.pendingDraft)
        throw new Error(
          "Apply or cancel the pending future draft before starting a round",
        );
      if (validateProject(p).length || validateRound(p, next).length)
        throw new Error("Fix hard constraints before starting");
      next.status = "running";
      next.timer = startTimer(next.durationMs, command.now);
      next.frozen = clone({
        publicTitle: next.publicTitle,
        durationMs: next.durationMs,
        groups: next.groups,
        assignments: next.assignments,
        publicParticipants: p.participants.map(
          ({ participantId, publicLabel }) => ({ participantId, publicLabel }),
        ),
        availability: p.availability.filter((a) => a.roundId === next.roundId),
        mustSeparate: p.constraints.mustSeparate,
      });
      p.conductor.activeRoundId = next.roundId;
      break;
    }
    case "pause":
      if (!active || active.status !== "running" || !active.timer) return base;
      active.timer = pauseTimer(active.timer, command.now);
      active.status = "paused";
      break;
    case "resume":
      if (!active || active.status !== "paused" || !active.timer) return base;
      active.timer = resumeTimer(active.timer, command.now);
      active.status = "running";
      break;
    case "finish":
      if (!active || !active.timer) return base;
      active.timer = pauseTimer(active.timer, command.now);
      active.status = "completed";
      p.conductor.activeRoundId = null;
      break;
    case "correct-time": {
      if (!active || !active.timer)
        throw new Error("Start a round before adjusting time");
      if (
        !Number.isInteger(command.remainingMs) ||
        command.remainingMs < 0 ||
        command.remainingMs > 14400000
      )
        throw new Error("Remaining time must be 0–14400 seconds");
      active.timer.remainingMs = command.remainingMs;
      active.timer.deadlineEpochMs =
        active.status === "running" ? command.now + command.remainingMs : null;
      break;
    }
    case "draft":
      draftSchema.parse(command.patch);
      patchedProject(p, command.patch);
      p.conductor.pendingDraft = clone(command.patch);
      break;
    case "cancel-draft":
      if (!p.conductor.pendingDraft) return base;
      p.conductor.pendingDraft = null;
      break;
    case "apply": {
      const q = command.proposal;
      const before = futureState(p);
      p = validateProposal(p, q);
      const score = scorePlan(base, p);
      p.repairHistory.push({
        operationId: `repair-${base.revision + 1}`,
        revisionAfter: base.revision + 1,
        createdAtEpochMs: command.now,
        inputHash: q.inputHash,
        before,
        after: futureState(p),
        undone: false,
        moved: score.moved,
        added: score.added,
        removed: score.removed,
        plannerVersion: q.plannerVersion,
      });
      p.repairHistory = p.repairHistory.slice(-100);
      break;
    }
    case "undo": {
      const reason = undoReason(p);
      if (reason) throw new Error(reason);
      p = restoreFuture(p, p.repairHistory.at(-1)!.before);
      p.repairHistory.at(-1)!.undone = true;
      if (
        validateProject(p).length ||
        protectionFingerprint(p) !== protectionFingerprint(base)
      )
        throw new Error("Undo validation failed");
      break;
    }
  }
  p.revision = base.revision + 1;
  // The pretty-printed portable backup must remain importable under the same 2 MiB limit.
  while (
    p.repairHistory.length > 1 &&
    new TextEncoder().encode(JSON.stringify(p, null, 2)).length > LIMITS.bytes
  )
    p.repairHistory.shift();
  if (
    new TextEncoder().encode(JSON.stringify(p, null, 2)).length > LIMITS.bytes
  )
    throw new Error(
      "Snapshot exceeds the portable 2 MiB limit. Download a backup and simplify the source project.",
    );
  return p;
}
export { remaining };
