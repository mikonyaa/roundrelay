import {
  canonical,
  ordered,
  projectSchema,
  type Diagnostic,
  type EventProject,
  type Round,
} from "../model/schema";

export function validateProject(input: unknown): Diagnostic[] {
  const shape = projectSchema.safeParse(input);
  if (!shape.success)
    return shape.error.issues
      .slice(0, 100)
      .map((i) => ({
        code: "schema",
        path: i.path.join("."),
        message: i.message,
      }));
  const p = shape.data;
  const errors: Diagnostic[] = [];
  const issue = (code: string, path: string, message: string) =>
    errors.push({ code, path, message });
  const unique = (values: string[], path: string) => {
    const seen = new Set<string>();
    for (const v of values) {
      if (seen.has(v)) issue("duplicate-id", path, `Duplicate ID: ${v}`);
      seen.add(v);
    }
  };
  unique(
    p.participants.map((x) => x.participantId),
    "participants",
  );
  unique(
    p.rounds.map((x) => x.roundId),
    "rounds",
  );
  unique(
    p.rounds.map((x) => String(x.order)),
    "rounds.order",
  );
  const participants = new Set(p.participants.map((x) => x.participantId));
  const rounds = new Set(p.rounds.map((x) => x.roundId));
  const available = new Map<string, boolean>();
  for (const a of p.availability) {
    const key = `${a.roundId}/${a.participantId}`;
    if (available.has(key))
      issue(
        "duplicate-availability",
        "availability",
        `Duplicate availability: ${key}`,
      );
    available.set(key, a.available);
    if (!participants.has(a.participantId) || !rounds.has(a.roundId))
      issue("unknown-id", "availability", `Unknown ID: ${key}`);
  }
  for (const pair of p.constraints.mustSeparate) {
    if (
      pair.participantIds[0] === pair.participantIds[1] ||
      pair.participantIds.some((id) => !participants.has(id))
    )
      issue(
        "invalid-pair",
        "constraints",
        "mustSeparate needs two distinct existing participant IDs",
      );
  }
  const sorted = ordered(p);
  sorted.forEach((r, i) => {
    if (r.order !== i + 1)
      issue(
        "order",
        r.roundId,
        "Round orders must be consecutive starting at 1",
      );
  });
  const active = p.rounds.filter(
    (r) => r.status === "running" || r.status === "paused",
  );
  if (
    active.length > 1 ||
    (active[0]?.roundId ?? null) !== p.conductor.activeRoundId
  )
    issue(
      "state",
      "conductor",
      "Exactly one active round must match activeRoundId, or both must be empty",
    );
  let seenPlanned = false;
  let seenActive = false;
  for (const r of sorted) {
    if (r.status === "running" || r.status === "paused") seenActive = true;
    if (r.status === "completed" && seenActive)
      issue(
        "state",
        r.roundId,
        "Completed rounds must precede the active round",
      );
    if (r.status === "planned") seenPlanned = true;
    else if (seenPlanned)
      issue("state", r.roundId, "Started rounds must precede planned rounds");
    errors.push(...validateRound(p, r));
    if (r.status === "planned") {
      if (r.frozen !== null || r.timer !== null)
        issue(
          "state",
          r.roundId,
          "A planned round cannot have frozen data or a timer",
        );
    } else {
      if (!r.frozen || !r.timer) {
        issue(
          "frozen",
          r.roundId,
          "Started rounds require a frozen snapshot and timer",
        );
        continue;
      }
      const live = {
        publicTitle: r.publicTitle,
        durationMs: r.durationMs,
        groups: r.groups,
        assignments: r.assignments,
        availability: p.availability.filter((a) => a.roundId === r.roundId),
        mustSeparate: p.constraints.mustSeparate,
      };
      const frozen = { ...r.frozen };
      const { publicParticipants: labels, ...rest } = frozen;
      if (canonical(live) !== canonical(rest))
        issue(
          "frozen",
          r.roundId,
          "Started round differs from its frozen snapshot",
        );
      unique(
        labels.map((x) => x.participantId),
        `${r.roundId}.frozen.publicParticipants`,
      );
      if (
        r.assignments.some(
          (a) => !labels.some((x) => x.participantId === a.participantId),
        )
      )
        issue("frozen", r.roundId, "Frozen public labels are missing");
      if (r.status === "running" && r.timer.deadlineEpochMs === null)
        issue("timer", r.roundId, "Running requires a deadline");
      if (r.status !== "running" && r.timer.deadlineEpochMs !== null)
        issue(
          "timer",
          r.roundId,
          "Paused/completed cannot have a live deadline",
        );
    }
  }
  if (p.conductor.pendingDraft) {
    const draft = p.conductor.pendingDraft;
    unique(
      draft.availabilityChanges.map((x) => `${x.roundId}/${x.participantId}`),
      "pendingDraft.availabilityChanges",
    );
    unique(
      draft.futureGroupChanges.map((x) => `${x.roundId}/${x.groupId}`),
      "pendingDraft.futureGroupChanges",
    );
    for (const a of draft.availabilityChanges)
      if (
        !participants.has(a.participantId) ||
        !p.rounds.some((r) => r.roundId === a.roundId && r.status === "planned")
      )
        issue(
          "draft",
          "pendingDraft",
          "Availability draft must reference existing participants and planned rounds",
        );
    for (const g of draft.futureGroupChanges)
      if (
        !p.rounds.some(
          (r) =>
            r.roundId === g.roundId &&
            r.status === "planned" &&
            r.groups.some((x) => x.groupId === g.groupId),
        )
      )
        issue(
          "draft",
          "pendingDraft",
          "Group draft must reference an existing future group",
        );
  }
  return errors.slice(0, 100);
}

export function validateRound(p: EventProject, r: Round): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const issue = (code: string, message: string) =>
    errors.push({ code, path: r.roundId, message });
  const ids = new Set(p.participants.map((x) => x.participantId));
  const groups = new Map(r.groups.map((g) => [g.groupId, g]));
  if (groups.size !== r.groups.length)
    issue("duplicate-id", "Duplicate group ID");
  const availability = new Map(
    p.availability
      .filter((x) => x.roundId === r.roundId)
      .map((a) => [a.participantId, a.available]),
  );
  const assigned = new Map<string, string>();
  const sizes = new Map<string, number>();
  for (const a of r.assignments) {
    if (assigned.has(a.participantId))
      issue(
        "duplicate-assignment",
        `Participant ${a.participantId} is assigned twice`,
      );
    assigned.set(a.participantId, a.groupId);
    if (!ids.has(a.participantId))
      issue("unknown-participant", `Unknown participant ${a.participantId}`);
    if (availability.get(a.participantId) !== true)
      issue(
        "absent-assigned",
        `Unavailable participant ${a.participantId} is assigned`,
      );
    if (!groups.get(a.groupId)?.enabled)
      issue("invalid-group", `Unknown or disabled group ${a.groupId}`);
    sizes.set(a.groupId, (sizes.get(a.groupId) ?? 0) + 1);
  }
  for (const id of ids) {
    if (!availability.has(id))
      issue("missing-availability", `Explicit availability missing for ${id}`);
    if (availability.get(id) && !assigned.has(id))
      issue("missing-assignment", `Available participant ${id} has no group`);
  }
  for (const g of r.groups) {
    if (g.minSize > g.maxSize)
      issue("bounds", `${g.publicLabel}: minimum exceeds maximum`);
    const size = sizes.get(g.groupId) ?? 0;
    if (g.enabled && (size < g.minSize || size > g.maxSize))
      issue(
        "capacity",
        `${g.publicLabel}: ${size} assigned, allowed ${g.minSize}–${g.maxSize}`,
      );
  }
  for (const pair of p.constraints.mustSeparate) {
    const [a, b] = pair.participantIds;
    if (assigned.has(a) && assigned.get(a) === assigned.get(b))
      issue("must-separate", `${a} and ${b} must use different groups`);
  }
  return errors;
}
