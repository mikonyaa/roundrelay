import { describe, expect, it } from "vitest";
import { sampleProject } from "../../src/model/sample";
import {
  canonical,
  clone,
  type Draft,
  type EventProject,
} from "../../src/model/schema";
import { validateProject } from "../../src/validate";
import { reduceProject } from "../../src/conductor";
import {
  futureState,
  protectionFingerprint,
  undoReason,
} from "../../src/history";
import {
  DEFAULT_OPTIONS,
  planRepair,
  proposedProject,
} from "../../src/planner";
import {
  clockAmbiguity,
  formatTime,
  pauseTimer,
  remaining,
  resumeTimer,
  startTimer,
} from "../../src/timer";
import {
  csvCell,
  exportRoutesCSV,
  importCSV,
  importJSON,
} from "../../src/import";
import {
  publicPayload,
  publicPayloadSchema,
} from "../../src/projector/payload";

const departures = (p: EventProject, ids = ["p01", "p02"]): Draft => ({
  availabilityChanges: p.rounds
    .filter((r) => r.status === "planned")
    .flatMap((r) =>
      ids.map((participantId) => ({
        participantId,
        roundId: r.roundId,
        available: false,
      })),
    ),
  futureGroupChanges: [],
});
const stage = (p: EventProject, patch: Draft) =>
  reduceProject(p, { type: "draft", patch });
const apply = (p: EventProject) =>
  reduceProject(p, {
    type: "apply",
    proposal: planRepair(p, p.conductor.pendingDraft!),
    now: 10000,
  });

describe("independent hard validator and imports", () => {
  it("validates original 24 and 60 person fixtures", () => {
    expect(validateProject(sampleProject())).toEqual([]);
    expect(validateProject(sampleProject(60, 6))).toEqual([]);
  });
  it.each([
    [
      "duplicate-assignment",
      (p: EventProject) =>
        p.rounds[0].assignments.push(p.rounds[0].assignments[0]),
    ],
    ["missing-assignment", (p: EventProject) => p.rounds[0].assignments.pop()],
    [
      "absent-assigned",
      (p: EventProject) => {
        p.availability[0].available = false;
      },
    ],
    [
      "invalid-group",
      (p: EventProject) => {
        p.rounds[0].assignments[0].groupId = "nope";
      },
    ],
    [
      "capacity",
      (p: EventProject) => {
        p.rounds[0].groups[0].maxSize = 5;
      },
    ],
    [
      "must-separate",
      (p: EventProject) =>
        p.constraints.mustSeparate.push({ participantIds: ["p01", "p05"] }),
    ],
    [
      "duplicate-id",
      (p: EventProject) => {
        p.participants[1].participantId = p.participants[0].participantId;
      },
    ],
  ])("rejects %s independently", (code, mutate) => {
    const p = sampleProject();
    mutate(p);
    expect(validateProject(p).map((d) => d.code)).toContain(code);
  });
  it("preserves Unicode, BOM, CRLF, quoted commas, stable IDs and duplicated public labels", () => {
    const preview = importCSV(
      '\uFEFFparticipant_id,public_label\r\np01,"Sage, 星"\r\np02,"Sage, 星"\r\n',
      "round,group,participant_id\r\n1,field,p02\r\n1,field,p01\r\n2,studio,p01\r\n2,studio,p02\r\n",
      { minSize: 1, maxSize: 2, durationMs: 1000 },
    );
    expect(preview.diagnostics).toEqual([]);
    expect(
      preview.project.rounds[0].assignments.map((a) => a.participantId),
    ).toEqual(["p02", "p01"]);
    expect(preview.project.participants.map((p) => p.publicLabel)).toEqual([
      "Sage, 星",
      "Sage, 星",
    ]);
    expect(importJSON(JSON.stringify(preview.project)).project).toEqual(
      preview.project,
    );
  });
  it("does not silently discard malformed CSV rows or unknown participants", () => {
    expect(() =>
      importCSV(
        'participant_id,public_label\np01,"unfinished',
        "round,group,participant_id\n1,g,p01",
        { minSize: 0, maxSize: 3, durationMs: 1000 },
      ),
    ).toThrow();
    expect(() =>
      importCSV(
        "participant_id,public_label\np01,Sage,extra",
        "round,group,participant_id\n1,g,p01",
        { minSize: 0, maxSize: 3, durationMs: 1000 },
      ),
    ).toThrow();
    const p = importCSV(
      "participant_id,public_label\np01,Sage",
      "round,group,participant_id\n1,g,unknown",
      { minSize: 0, maxSize: 3, durationMs: 1000 },
    );
    expect(p.missingIds).toEqual(["unknown"]);
    expect(p.project.rounds[0].assignments).toHaveLength(1);
    expect(p.diagnostics.length).toBeGreaterThan(0);
  });
  it("rejects wrong versions, unknown keys, huge input, depth, numeric overflow and bounds", () => {
    const p = sampleProject();
    expect(() =>
      importJSON(JSON.stringify({ ...p, schemaVersion: 2 })),
    ).toThrow();
    expect(() =>
      importJSON(JSON.stringify({ ...p, remoteModules: [] })),
    ).toThrow();
    expect(() => importJSON("x".repeat(2097153))).toThrow("2 MiB");
    expect(() => importJSON("[".repeat(17) + "]".repeat(17))).toThrow("depth");
    expect(() =>
      importJSON(JSON.stringify(p).replace("300000", "1e999")),
    ).toThrow();
    p.participants[0].privateNote = "x".repeat(501);
    expect(() => importJSON(JSON.stringify(p))).toThrow();
  });
});

describe("freeze, apply, stale and complete atomic undo", () => {
  it("completes round 1, removes two only in future, applies and undoes with identical historical fingerprint", () => {
    let p = reduceProject(sampleProject(), { type: "start", now: 1000 });
    p = reduceProject(p, { type: "finish", now: 2000 });
    const fingerprint = protectionFingerprint(p),
      before = futureState(p);
    p = stage(p, departures(p));
    const q = planRepair(p, p.conductor.pendingDraft!);
    expect(q.status).toBe("feasible");
    expect(q.score?.moved).toBe(0);
    expect(q.score?.removed).toBe(6);
    p = reduceProject(p, { type: "apply", proposal: q, now: 3000 });
    expect(validateProject(p)).toEqual([]);
    expect(protectionFingerprint(p)).toBe(fingerprint);
    expect(p.rounds[1].assignments).toHaveLength(22);
    expect(p.rounds[0].assignments).toHaveLength(24);
    p = reduceProject(p, { type: "undo" });
    expect(futureState(p)).toEqual(before);
    expect(protectionFingerprint(p)).toBe(fingerprint);
    expect(p.repairHistory.at(-1)?.undone).toBe(true);
  });
  it("late arrival during running cannot mutate current assignments, status or timer state", () => {
    let base = sampleProject();
    for (const r of base.rounds)
      r.assignments = r.assignments.filter((a) => a.participantId !== "p01");
    base.availability
      .filter((a) => a.participantId === "p01")
      .forEach((a) => {
        a.available = false;
      });
    base = reduceProject(base, { type: "start", now: 1000 });
    const frozen = protectionFingerprint(base);
    const patch = departures(base, ["p01"]);
    patch.availabilityChanges.forEach((a) => {
      a.available = true;
    });
    const staged = stage(base, patch),
      repaired = apply(staged);
    expect(validateProject(repaired)).toEqual([]);
    expect(protectionFingerprint(repaired)).toBe(frozen);
    expect(repaired.rounds[1].assignments).toHaveLength(24);
  });
  it("draft group/attendance changes survive reload; cancel and undo restore all fields", () => {
    const original = sampleProject();
    let p = reduceProject(original, { type: "start", now: 1000 });
    const fingerprint = protectionFingerprint(p),
      before = futureState(p);
    const patch = departures(p);
    patch.futureGroupChanges.push({
      roundId: "r2",
      groupId: "g1",
      minSize: 3,
      maxSize: 7,
      enabled: true,
    });
    p = stage(p, patch);
    p = importJSON(JSON.stringify(p)).project;
    expect(futureState(p)).toEqual(before);
    expect(p.conductor.pendingDraft).toEqual(patch);
    const cancelled = reduceProject(p, { type: "cancel-draft" });
    expect(futureState(cancelled)).toEqual(before);
    p = apply(p);
    expect(p.rounds[1].groups[0].maxSize).toBe(7);
    expect(p.conductor.pendingDraft).toBeNull();
    p = reduceProject(p, { type: "undo" });
    expect(futureState(p)).toEqual(before);
    expect(protectionFingerprint(p)).toBe(fingerprint);
  });
  it("explicit group disabling is atomic and included in undo", () => {
    let p = sampleProject();
    const before = futureState(p);
    const patch: Draft = {
      availabilityChanges: [],
      futureGroupChanges: p.rounds.flatMap((r) =>
        r.groups.map((g) => ({
          roundId: r.roundId,
          groupId: g.groupId,
          minSize: g.groupId === "g1" ? 0 : 4,
          maxSize: g.groupId === "g1" ? 6 : 8,
          enabled: g.groupId !== "g1",
        })),
      ),
    };
    p = stage(p, patch);
    const q = planRepair(p, patch, {
      ...DEFAULT_OPTIONS,
      iterationBudget: 1500,
      maxElapsedMs: 2000,
    });
    expect(q.status).toBe("feasible");
    p = reduceProject(p, { type: "apply", proposal: q, now: 1000 });
    expect(validateProject(p)).toEqual([]);
    expect(p.rounds.every((r) => !r.groups[0].enabled)).toBe(true);
    p = reduceProject(p, { type: "undo" });
    expect(futureState(p)).toEqual(before);
  });
  it.each(["pause", "finish", "correct-time", "draft"] as const)(
    "rejects preview stale after %s",
    (type) => {
      let p = reduceProject(sampleProject(), { type: "start", now: 1000 });
      p = stage(p, departures(p));
      const q = planRepair(p, p.conductor.pendingDraft!);
      p = reduceProject(
        p,
        type === "draft"
          ? { type, patch: departures(p, ["p03"]) }
          : type === "correct-time"
            ? { type, now: 2000, remainingMs: 10000 }
            : { type, now: 2000 },
      );
      expect(() =>
        reduceProject(p, { type: "apply", proposal: q, now: 3000 }),
      ).toThrow("stale");
    },
  );
  it("blocks starting with pending changes; start and finish are idempotent; undo stops at a started round", () => {
    let p = stage(sampleProject(), departures(sampleProject()));
    expect(() => reduceProject(p, { type: "start", now: 0 })).toThrow(
      "pending",
    );
    p = apply(p);
    p = reduceProject(p, { type: "start", now: 1000 });
    expect(undoReason(p)).toContain("started");
    expect(reduceProject(p, { type: "start", now: 2000 })).toBe(p);
    p = reduceProject(p, { type: "finish", now: 3000 });
    expect(reduceProject(p, { type: "finish", now: 4000 })).toBe(p);
  });
  it("rejects a buggy duplicate or malicious partial-patch candidate at Apply", () => {
    const p = stage(sampleProject(), departures(sampleProject())),
      q = planRepair(p, p.conductor.pendingDraft!);
    const duplicate = clone(q);
    duplicate.candidate!.rounds[0].assignments.push(
      duplicate.candidate!.rounds[0].assignments[0],
    );
    expect(() =>
      reduceProject(p, { type: "apply", proposal: duplicate, now: 1000 }),
    ).toThrow("validation rejected");
    const changedBounds = clone(q);
    changedBounds.candidate!.rounds[0].groups[0].maxSize = 60;
    expect(() =>
      reduceProject(p, { type: "apply", proposal: changedBounds, now: 1000 }),
    ).toThrow("exact future patch");
    const omit = clone(q);
    omit.candidate!.rounds.pop();
    expect(() =>
      reduceProject(p, { type: "apply", proposal: omit, now: 1000 }),
    ).toThrow("exact future patch");
  });
});

describe("bounded planner status corpus, determinism and independent oracle", () => {
  it("demonstrates all three statuses honestly", () => {
    const p = sampleProject();
    expect(planRepair(p, departures(p)).status).toBe("feasible");
    const impossible = departures(
      p,
      p.participants.slice(0, 10).map((x) => x.participantId),
    );
    const proof = planRepair(p, impossible);
    expect(proof.status).toBe("proven-infeasible");
    expect(proof.diagnostics[0].message).toContain("14 available");
    expect(proof.diagnostics[0].message).toContain("at least 16");
    p.constraints.mustSeparate.push({ participantIds: ["p01", "p05"] });
    const unsolved = planRepair(
      p,
      { availabilityChanges: [], futureGroupChanges: [] },
      { ...DEFAULT_OPTIONS, iterationBudget: 0 },
    );
    expect(unsolved.status).toBe("unsolved");
    expect(unsolved.terminationReason).toBe("iteration-budget");
  });
  it("fixed inputs, seed and sufficient deterministic budget reproduce candidate and score", () => {
    const p = sampleProject();
    p.constraints.mustSeparate.push({ participantIds: ["p01", "p05"] });
    const patch: Draft = { availabilityChanges: [], futureGroupChanges: [] },
      options = { seed: 17, iterationBudget: 700, maxElapsedMs: 5000 };
    const a = planRepair(p, patch, options),
      b = planRepair(p, patch, options);
    expect(a.status).toBe("feasible");
    expect(a.candidate).toEqual(b.candidate);
    expect(a.score).toEqual(b.score);
    expect(a.iterations).toBe(b.iterations);
    expect(validateProject(proposedProject(p, a))).toEqual([]);
  });
  it("matches a separate exhaustive enumeration oracle over all 64 separation graphs of 4 people", () => {
    // Oracle uses complete base-2 assignment enumeration, no production solver or validator.
    const pairs = [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ];
    for (let graph = 0; graph < 64; graph++) {
      const edges = pairs.filter((_, k) => graph & (1 << k));
      let oracle = false;
      for (let mask = 0; mask < 16; mask++) {
        const slots = Array.from({ length: 4 }, (_, i) => (mask >> i) & 1);
        if (slots.filter((x) => x === 0).length !== 2) continue;
        if (edges.every(([a, b]) => slots[a] !== slots[b])) oracle = true;
      }
      const p = sampleProject();
      p.participants = p.participants.slice(0, 4);
      p.rounds = [p.rounds[0]];
      p.rounds[0].groups = p.rounds[0].groups
        .slice(0, 2)
        .map((g) => ({ ...g, minSize: 2, maxSize: 2 }));
      p.rounds[0].assignments = p.participants.map((person, i) => ({
        participantId: person.participantId,
        groupId: i < 2 ? "g1" : "g2",
      }));
      p.availability = p.participants.map((person) => ({
        roundId: "r1",
        participantId: person.participantId,
        available: true,
      }));
      p.constraints.mustSeparate = edges.map(([a, b]) => ({
        participantIds: [
          p.participants[a].participantId,
          p.participants[b].participantId,
        ],
      }));
      const q = planRepair(
        p,
        { availabilityChanges: [], futureGroupChanges: [] },
        { seed: 1, iterationBudget: 10000, maxElapsedMs: 5000 },
      );
      expect(q.status === "feasible", `graph ${graph}`).toBe(oracle);
      if (q.status === "feasible")
        expect(validateProject(proposedProject(p, q))).toEqual([]);
      else expect(q.status).toBe("unsolved");
    }
  });
  it("60-person / 6-round repair stays in its measured wall and iteration envelope", () => {
    const p = sampleProject(60, 6);
    p.constraints.mustSeparate.push({ participantIds: ["p01", "p07"] });
    const result = planRepair(
      p,
      { availabilityChanges: [], futureGroupChanges: [] },
      { seed: 7, iterationBudget: 3000, maxElapsedMs: 1200 },
    );
    expect(result.elapsedMs).toBeLessThan(1500);
    expect(result.iterations).toBeLessThanOrEqual(3000);
    if (result.candidate)
      expect(validateProject(proposedProject(p, result))).toEqual([]);
    else expect(result.status).toBe("unsolved");
  });
});

describe("timer and public data boundary", () => {
  it("uses absolute time across idle/reload, pause, resume and expiry without auto-completion", () => {
    const t = startTimer(10000, 1000);
    expect(remaining(t, 6000)).toBe(5000);
    expect(remaining(JSON.parse(JSON.stringify(t)), 11000)).toBe(0);
    const paused = pauseTimer(t, 3000);
    expect(remaining(paused, 90000)).toBe(8000);
    const resumed = resumeTimer(paused, 100000);
    expect(remaining(resumed, 105000)).toBe(3000);
    const p = reduceProject(sampleProject(24, 4, 1000), {
      type: "start",
      now: 0,
    });
    expect(remaining(p.rounds[0].timer, 10000)).toBe(0);
    expect(p.rounds[0].status).toBe("running");
    expect(p.rounds[1].status).toBe("planned");
    expect(formatTime(999)).toBe("00:01");
    expect(() => startTimer(Infinity, 0)).toThrow();
  });
  it("diagnoses visible clock divergence but does not label hidden elapsed time as a jump", () => {
    expect(clockAmbiguity(10000, 100, false)).toContain("disagree");
    expect(clockAmbiguity(10000, 100, true)).toBeNull();
  });
  it("never passes private notes, reasons, history or IDs to the projector; exports only public routes with formula protection", () => {
    const p = sampleProject();
    p.participants[0].privateNote = "PRIVATE_NOTE_CANARY";
    p.constraints.mustSeparate.push({
      participantIds: ["p01", "p02"],
      reason: "PRIVATE_REASON_CANARY",
    });
    const payload = publicPayload(p);
    expect(publicPayloadSchema.safeParse(payload).success).toBe(true);
    const json = canonical(payload);
    expect(json).not.toContain("PRIVATE_");
    expect(json).not.toContain("participantId");
    expect(json).not.toContain("repairHistory");
    expect(exportRoutesCSV(p)).not.toContain("PRIVATE_");
    expect(csvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
    expect(csvCell("  +1")).toBe('"\'  +1"');
  });
});
