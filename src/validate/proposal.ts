import { canonical, futureSchema, type EventProject } from "../model/schema";
import { futureState, protectionFingerprint } from "../history";
import {
  PLANNER_VERSION,
  patchedProject,
  patchMatches,
  plannerInputHash,
  proposedProject,
  scorePlan,
  type Proposal,
} from "../planner";
import { validateProject } from "./index";

// Shared by Preview and Apply. It never trusts the worker's validity or score claims.
export function validateProposal(
  base: EventProject,
  q: Proposal,
): EventProject {
  if (q.status !== "feasible" || !q.candidate)
    throw new Error("Only a feasible candidate can be applied");
  if (
    q.baseRevision !== base.revision ||
    q.protectedFingerprint !== protectionFingerprint(base) ||
    !patchMatches(base.conductor.pendingDraft, q.patch) ||
    q.inputHash !== plannerInputHash(base, q.patch, q.options)
  )
    throw new Error("Preview is stale. Compute a new preview.");
  if (q.plannerVersion !== PLANNER_VERSION)
    throw new Error("Unsupported planner version");
  futureSchema.parse(q.candidate);
  const expected = futureState(patchedProject(base, q.patch));
  if (
    canonical(
      q.candidate.rounds.map((r) => ({ roundId: r.roundId, groups: r.groups })),
    ) !==
      canonical(
        expected.rounds.map((r) => ({ roundId: r.roundId, groups: r.groups })),
      ) ||
    canonical(q.candidate.availability) !== canonical(expected.availability)
  )
    throw new Error("Candidate does not include the exact future patch");
  const proposed = proposedProject(base, q);
  proposed.conductor.pendingDraft = null;
  const errors = validateProject(proposed);
  if (
    errors.length ||
    protectionFingerprint(proposed) !== protectionFingerprint(base)
  )
    throw new Error(
      `Independent validation rejected candidate: ${errors[0]?.message ?? "Frozen state changed"}`,
    );
  if (canonical(q.score) !== canonical(scorePlan(base, proposed)))
    throw new Error("Independent score check rejected the candidate");
  return proposed;
}
