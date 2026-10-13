import type { EventProject } from "./schema";
import { APP_VERSION } from "./version";
const aliases = [
  "Aster",
  "Birch",
  "Cedar",
  "Dune",
  "Ember",
  "Fern",
  "Grove",
  "Harbor",
  "Iris",
  "Juniper",
  "Kite",
  "Linden",
  "Moss",
  "North",
  "Orbit",
  "Pebble",
  "Quartz",
  "Reed",
  "Sage",
  "Tide",
  "Umber",
  "Vale",
  "Willow",
  "Zephyr",
];
export function sampleProject(
  count = 24,
  roundCount = 4,
  durationMs = 5 * 60000,
  long = false,
): EventProject {
  const groupCount = count === 60 ? 6 : 4;
  const participants = Array.from({ length: count }, (_, i) => ({
    participantId: `p${String(i + 1).padStart(2, "0")}`,
    publicLabel: long
      ? `${aliases[i % 24]} — a very long synthetic workshop participant label ${i + 1}`
      : count > 24
        ? `${aliases[i % 24]} ${Math.floor(i / 24) + 1}`
        : aliases[i],
  }));
  const rounds = Array.from({ length: roundCount }, (_, r) => ({
    roundId: `r${r + 1}`,
    order: r + 1,
    publicTitle: [
      "Opening exchanges",
      "New perspectives",
      "Build together",
      "Carry it forward",
      "Connect the dots",
      "Closing reflections",
    ][r],
    durationMs,
    groups: Array.from({ length: groupCount }, (_, g) => ({
      groupId: `g${g + 1}`,
      publicLabel: [
        "Field",
        "Studio",
        "Garden",
        "Library",
        "Terrace",
        "Atelier",
      ][g],
      minSize: count === 60 ? 7 : 4,
      maxSize: count === 60 ? 10 : 6,
      enabled: true,
    })),
    assignments: participants.map((p, i) => ({
      participantId: p.participantId,
      groupId: `g${(((i % groupCount) + Math.floor(i / groupCount) * r) % groupCount) + 1}`,
    })),
    status: "planned" as const,
    timer: null,
    frozen: null,
  }));
  return {
    kind: "roundrelay-event",
    schemaVersion: 1,
    eventId: `sample-${count}`,
    revision: 0,
    title:
      count === 60
        ? "The big room · 60 people"
        : "Small circles, fresh perspectives",
    participants,
    rounds,
    availability: rounds.flatMap((r) =>
      participants.map((p) => ({
        participantId: p.participantId,
        roundId: r.roundId,
        available: true,
      })),
    ),
    constraints: { mustSeparate: [] },
    conductor: { activeRoundId: null, pendingDraft: null },
    repairHistory: [],
    metadata: {
      createdAt: "2026-10-12T00:00:00Z",
      appVersion: APP_VERSION,
      source: "Original synthetic RoundRelay sample",
    },
  };
}
