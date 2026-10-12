import {
  canonical,
  clone,
  type EventProject,
  type FutureState,
} from "../model/schema";
export function protectionFingerprint(p: EventProject): string {
  return canonical(
    p.rounds.filter((r) => r.status !== "planned").map((r) => ({ ...r })),
  );
}
export function futureState(p: EventProject): FutureState {
  const ids = new Set(
    p.rounds.filter((r) => r.status === "planned").map((r) => r.roundId),
  );
  return clone({
    rounds: p.rounds
      .filter((r) => ids.has(r.roundId))
      .map((r) => ({
        roundId: r.roundId,
        groups: r.groups,
        assignments: r.assignments,
      })),
    availability: p.availability.filter((a) => ids.has(a.roundId)),
  });
}
export function restoreFuture(
  p: EventProject,
  future: FutureState,
): EventProject {
  const copy = clone(p);
  for (const f of future.rounds) {
    const round = copy.rounds.find((r) => r.roundId === f.roundId);
    if (!round || round.status !== "planned")
      throw new Error("Affected rounds must still be planned");
    round.groups = clone(f.groups);
    round.assignments = clone(f.assignments);
  }
  const ids = new Set(future.rounds.map((r) => r.roundId));
  copy.availability = [
    ...copy.availability.filter((a) => !ids.has(a.roundId)),
    ...clone(future.availability),
  ];
  return copy;
}
export function undoReason(p: EventProject): string | null {
  const h = p.repairHistory.at(-1);
  if (!h || h.undone) return "No accepted repair to undo.";
  if (
    h.after.rounds.some(
      (r) =>
        p.rounds.find((x) => x.roundId === r.roundId)?.status !== "planned",
    )
  )
    return "Undo is unavailable because an affected round has started.";
  if (p.conductor.pendingDraft)
    return "Resolve or cancel the pending draft first.";
  if (p.revision !== h.revisionAfter)
    return "Undo is unavailable because the event changed after this repair.";
  return null;
}
