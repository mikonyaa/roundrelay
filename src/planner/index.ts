import {
  canonical,
  checksum,
  clone,
  ordered,
  type Assignment,
  type Diagnostic,
  type Draft,
  type EventProject,
  type FutureState,
} from "../model/schema";
import { futureState, protectionFingerprint, restoreFuture } from "../history";
import { validateProject, validateRound } from "../validate";

export const PLANNER_VERSION = "bounded-preserve-1";
export type Score = {
  moved: number;
  added: number;
  removed: number;
  repeatedScheduledPairs: number;
  imbalance: number;
  tieBreak: string;
};
export type PlannerOptions = {
  seed: number;
  iterationBudget: number;
  maxElapsedMs: number;
};
export const DEFAULT_OPTIONS: PlannerOptions = {
  seed: 42,
  iterationBudget: 30000,
  maxElapsedMs: 1800,
};
export type Proposal = {
  status: "feasible" | "proven-infeasible" | "unsolved" | "error";
  candidate?: FutureState;
  baseRevision: number;
  inputHash: string;
  plannerVersion: string;
  seed: number;
  iterations: number;
  elapsedMs: number;
  protectedFingerprint: string;
  patch: Draft;
  options: PlannerOptions;
  score?: Score;
  beforeScore: Score;
  diagnostics: Diagnostic[];
  terminationReason:
    | "preserved"
    | "iteration-budget"
    | "wall-timeout"
    | "search-exhausted"
    | "capacity-proof"
    | "invalid-input";
};
export function patchedProject(base: EventProject, draft: Draft): EventProject {
  const p = clone(base);
  for (const a of draft.availabilityChanges) {
    if (
      !p.rounds.some(
        (r) => r.roundId === a.roundId && r.status === "planned",
      ) ||
      !p.participants.some((x) => x.participantId === a.participantId)
    )
      throw new Error("Availability edits are future-only");
    const entry = p.availability.find(
      (x) => x.roundId === a.roundId && x.participantId === a.participantId,
    );
    if (!entry) throw new Error("Missing explicit availability");
    entry.available = a.available;
  }
  for (const edit of draft.futureGroupChanges) {
    const r = p.rounds.find(
      (r) => r.roundId === edit.roundId && r.status === "planned",
    );
    const g = r?.groups.find((g) => g.groupId === edit.groupId);
    if (!g) throw new Error("Group edits are future-only and preserve IDs");
    g.minSize = edit.minSize;
    g.maxSize = edit.maxSize;
    g.enabled = edit.enabled;
  }
  return p;
}
export const plannerInputHash = (
  p: EventProject,
  draft: Draft,
  options: PlannerOptions,
): string =>
  checksum({
    p,
    draft,
    options,
    plannerVersion: PLANNER_VERSION,
    firstMutableRound: ordered(p).find((r) => r.status === "planned")?.roundId,
  });

export function scorePlan(base: EventProject, proposed: EventProject): Score {
  let moved = 0,
    added = 0,
    removed = 0,
    imbalance = 0;
  const pairs = new Map<string, number>();
  for (const r of ordered(proposed)) {
    const previous = new Map(
      base.rounds
        .find((x) => x.roundId === r.roundId)
        ?.assignments.map((a) => [a.participantId, a.groupId]),
    );
    const next = new Map(
      r.assignments.map((a) => [a.participantId, a.groupId]),
    );
    if (r.status === "planned") {
      for (const [id, group] of next) {
        if (!previous.has(id)) added++;
        else if (previous.get(id) !== group) moved++;
      }
      for (const id of previous.keys()) if (!next.has(id)) removed++;
    }
    const sizes: number[] = [];
    for (const g of r.groups.filter((g) => g.enabled)) {
      const members = r.assignments
        .filter((a) => a.groupId === g.groupId)
        .map((a) => a.participantId)
        .sort();
      sizes.push(members.length);
      for (let i = 0; i < members.length; i++)
        for (let j = i + 1; j < members.length; j++) {
          const key = `${members[i]}/${members[j]}`;
          pairs.set(key, (pairs.get(key) ?? 0) + 1);
        }
    }
    const mean = sizes.length
      ? sizes.reduce((a, b) => a + b, 0) / sizes.length
      : 0;
    imbalance += sizes.reduce((sum, size) => sum + (size - mean) ** 2, 0);
  }
  return {
    moved,
    added,
    removed,
    repeatedScheduledPairs: [...pairs.values()].reduce(
      (sum, n) => sum + Math.max(0, n - 1),
      0,
    ),
    imbalance: Math.round(imbalance * 1000) / 1000,
    tieBreak: ordered(proposed)
      .filter((r) => r.status === "planned")
      .map((r) =>
        [...r.assignments]
          .sort((a, b) => a.participantId.localeCompare(b.participantId, "en"))
          .map((a) => `${a.participantId}:${a.groupId}`)
          .join("|"),
      )
      .join(";"),
  };
}
function better(a: Score, b: Score): boolean {
  if (a.moved !== b.moved) return a.moved < b.moved;
  if (a.repeatedScheduledPairs !== b.repeatedScheduledPairs)
    return a.repeatedScheduledPairs < b.repeatedScheduledPairs;
  if (a.imbalance !== b.imbalance) return a.imbalance < b.imbalance;
  return a.tieBreak < b.tieBreak;
}

export function planRepair(
  base: EventProject,
  patch: Draft,
  options: PlannerOptions = DEFAULT_OPTIONS,
): Proposal {
  const started = Date.now();
  let iterations = 0;
  let stopped: "iteration-budget" | "wall-timeout" | null = null;
  const result: Proposal = {
    status: "error",
    baseRevision: base.revision,
    inputHash: plannerInputHash(base, patch, options),
    plannerVersion: PLANNER_VERSION,
    seed: options.seed,
    iterations: 0,
    elapsedMs: 0,
    protectedFingerprint: protectionFingerprint(base),
    patch: clone(patch),
    options: clone(options),
    beforeScore: scorePlan(base, base),
    diagnostics: [],
    terminationReason: "invalid-input",
  };
  const finish = (): Proposal => ({
    ...result,
    iterations,
    elapsedMs: Date.now() - started,
  });
  const step = (): boolean => {
    if (iterations >= options.iterationBudget) {
      stopped = "iteration-budget";
      return false;
    }
    if (Date.now() - started >= options.maxElapsedMs) {
      stopped = "wall-timeout";
      return false;
    }
    iterations++;
    return true;
  };
  try {
    if (
      !Number.isInteger(options.iterationBudget) ||
      options.iterationBudget < 0 ||
      options.iterationBudget > 200000 ||
      !Number.isInteger(options.seed) ||
      !Number.isFinite(options.maxElapsedMs) ||
      options.maxElapsedMs < 1 ||
      options.maxElapsedMs > 5000
    )
      throw new Error("Invalid bounded planner options");
    const p = patchedProject(base, patch);
    const future = ordered(p).filter((r) => r.status === "planned");
    if (!future.length) throw new Error("No future rounds remain");
    for (const r of future) {
      const n = p.availability.filter(
        (a) => a.roundId === r.roundId && a.available,
      ).length;
      const enabled = r.groups.filter((g) => g.enabled);
      const min = enabled.reduce((sum, g) => sum + g.minSize, 0),
        max = enabled.reduce((sum, g) => sum + g.maxSize, 0);
      if (n < min || n > max || enabled.some((g) => g.minSize > g.maxSize)) {
        result.status = "proven-infeasible";
        result.terminationReason = "capacity-proof";
        result.diagnostics = [
          {
            code: "capacity-proof",
            path: r.roundId,
            message: `${r.publicTitle}: ${n} available; enabled groups require at least ${min} and allow at most ${max}. Bounds must also satisfy min ≤ max. Edit future bounds explicitly or cancel the draft.`,
          },
        ];
        return finish();
      }
    }
    // First preserve every continuing attendee. Departures alone often need zero moves.
    let preserved = true;
    for (const r of future) {
      const old = base.rounds.find((x) => x.roundId === r.roundId)!;
      const available = new Set(
        p.availability
          .filter((a) => a.roundId === r.roundId && a.available)
          .map((a) => a.participantId),
      );
      r.assignments = clone(
        old.assignments.filter((a) => available.has(a.participantId)),
      );
      if (validateRound(p, r).length) preserved = false;
    }
    if (preserved) {
      result.status = "feasible";
      result.terminationReason = "preserved";
    } else {
      // Round-local bounded DFS, iterative move caps. It never weakens a hard constraint.
      for (const r of future) {
        if (!validateRound(p, r).length) continue;
        const old = new Map(
          base.rounds
            .find((x) => x.roundId === r.roundId)!
            .assignments.map((a) => [a.participantId, a.groupId]),
        );
        const ids = p.availability
          .filter((a) => a.roundId === r.roundId && a.available)
          .map((a) => a.participantId);
        const apart = new Map(ids.map((id) => [id, new Set<string>()]));
        for (const {
          participantIds: [a, b],
        } of p.constraints.mustSeparate) {
          apart.get(a)?.add(b);
          apart.get(b)?.add(a);
        }
        ids.sort(
          (a, b) =>
            (apart.get(b)?.size ?? 0) - (apart.get(a)?.size ?? 0) ||
            a.localeCompare(b, "en"),
        );
        const groups = r.groups
          .filter((g) => g.enabled)
          .sort((a, b) => a.groupId.localeCompare(b.groupId, "en"));
        let found: Assignment[] | null = null;
        const enabledIds = new Set(groups.map((g) => g.groupId));
        const forcedMoves = ids.filter(
          (id) => old.has(id) && !enabledIds.has(old.get(id)!),
        ).length;
        for (
          let moveCap = forcedMoves;
          moveCap <= ids.length && !stopped && !found;
          moveCap++
        ) {
          const placements = new Map<string, string>();
          const loads = new Map(groups.map((g) => [g.groupId, 0]));
          const search = (index: number, moves: number): boolean => {
            if (index === ids.length) {
              if (groups.some((g) => (loads.get(g.groupId) ?? 0) < g.minSize))
                return false;
              found = ids.map((participantId) => ({
                participantId,
                groupId: placements.get(participantId)!,
              }));
              return true;
            }
            const left = ids.length - index;
            if (
              groups.reduce(
                (n, g) => n + Math.max(0, g.minSize - loads.get(g.groupId)!),
                0,
              ) > left
            )
              return false;
            const id = ids[index];
            const choices = [...groups].sort(
              (a, b) =>
                Number(b.groupId === old.get(id)) -
                  Number(a.groupId === old.get(id)) ||
                Number(loads.get(a.groupId)! >= a.minSize) -
                  Number(loads.get(b.groupId)! >= b.minSize) ||
                loads.get(a.groupId)! - loads.get(b.groupId)! ||
                a.groupId.localeCompare(b.groupId, "en"),
            );
            for (const g of choices) {
              if (!step()) return false;
              const cost = old.has(id) && old.get(id) !== g.groupId ? 1 : 0;
              if (
                moves + cost > moveCap ||
                loads.get(g.groupId)! >= g.maxSize ||
                [...apart.get(id)!].some(
                  (other) => placements.get(other) === g.groupId,
                )
              )
                continue;
              placements.set(id, g.groupId);
              loads.set(g.groupId, loads.get(g.groupId)! + 1);
              if (search(index + 1, moves + cost)) return true;
              placements.delete(id);
              loads.set(g.groupId, loads.get(g.groupId)! - 1);
              if (stopped) return false;
            }
            return false;
          };
          search(0, 0);
        }
        if (!found) {
          result.status = "unsolved";
          result.terminationReason = stopped ?? "search-exhausted";
          result.diagnostics = [
            {
              code: "unsolved",
              path: r.roundId,
              message:
                "No valid repair found within this bounded search. This is not proof of impossibility. Change future constraints explicitly or try another seed/budget.",
            },
          ];
          return finish();
        }
        r.assignments = found;
      }
      result.status = "feasible";
      result.terminationReason = stopped ?? "iteration-budget";
    }
    // A zero-move plan has no continuing-attendee rearrangement to optimize. Preserve it.
    let best = scorePlan(base, p);
    if (best.moved > 0) {
      let randomState = options.seed >>> 0 || 1;
      const random = () => {
        randomState ^= randomState << 13;
        randomState ^= randomState >>> 17;
        randomState ^= randomState << 5;
        return (randomState >>> 0) / 4294967296;
      };
      while (step()) {
        const r = future[Math.floor(random() * future.length)];
        if (r.assignments.length < 2) continue;
        const i = Math.floor(random() * r.assignments.length),
          j = Math.floor(random() * r.assignments.length);
        if (i === j || r.assignments[i].groupId === r.assignments[j].groupId)
          continue;
        [r.assignments[i].groupId, r.assignments[j].groupId] = [
          r.assignments[j].groupId,
          r.assignments[i].groupId,
        ];
        const valid = !validateRound(p, r).length;
        const score = valid ? scorePlan(base, p) : best;
        if (valid && better(score, best)) best = score;
        else
          [r.assignments[i].groupId, r.assignments[j].groupId] = [
            r.assignments[j].groupId,
            r.assignments[i].groupId,
          ];
      }
      result.terminationReason = stopped ?? "iteration-budget";
    }
    p.conductor.pendingDraft = null;
    const diagnostics = validateProject(p);
    if (
      diagnostics.length ||
      protectionFingerprint(p) !== result.protectedFingerprint
    ) {
      result.status = "error";
      result.diagnostics = diagnostics.length
        ? diagnostics
        : [
            {
              code: "frozen",
              path: "rounds",
              message: "Frozen protection failed",
            },
          ];
      result.terminationReason = "invalid-input";
    } else {
      result.candidate = futureState(p);
      result.score = best;
    }
    return finish();
  } catch (error) {
    result.diagnostics = [
      {
        code: "planner-error",
        path: "",
        message: error instanceof Error ? error.message : "Planner failed",
      },
    ];
    return finish();
  }
}

export function proposedProject(
  base: EventProject,
  proposal: Proposal,
): EventProject {
  if (!proposal.candidate) throw new Error("No candidate");
  return restoreFuture(
    patchedProject(base, proposal.patch),
    proposal.candidate,
  );
}
export const patchMatches = (a: Draft | null, b: Draft): boolean =>
  canonical(a) === canonical(b);
