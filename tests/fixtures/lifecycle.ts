import type { EventProject } from "../../src/model/schema";

// Hand-authored independently of the sample generator and planner.
export function lifecycleProject(
  eventId = "alpha",
  revision = 20,
  title = "ALPHA",
): EventProject {
  return {
    kind: "roundrelay-event",
    schemaVersion: 1,
    eventId,
    revision,
    title,
    participants: [
      {
        participantId: "a",
        publicLabel: "PUBLIC A",
        privateNote: "PRIVATE_LIFECYCLE_CANARY",
      },
      { participantId: "b", publicLabel: "PUBLIC B" },
      { participantId: "c", publicLabel: "PUBLIC C" },
      { participantId: "d", publicLabel: "PUBLIC D" },
    ],
    rounds: [1, 2].map((order) => ({
      roundId: `round-${order}`,
      order,
      publicTitle: `Conversation ${order}`,
      durationMs: 120000,
      groups: [
        {
          groupId: "east",
          publicLabel: "East",
          minSize: 1,
          maxSize: 4,
          enabled: true,
        },
        {
          groupId: "west",
          publicLabel: "West",
          minSize: 1,
          maxSize: 4,
          enabled: true,
        },
      ],
      assignments:
        order === 1
          ? [
              { participantId: "a", groupId: "east" },
              { participantId: "b", groupId: "east" },
              { participantId: "c", groupId: "west" },
              { participantId: "d", groupId: "west" },
            ]
          : [
              { participantId: "a", groupId: "west" },
              { participantId: "b", groupId: "east" },
              { participantId: "c", groupId: "east" },
              { participantId: "d", groupId: "west" },
            ],
      status: "planned",
      timer: null,
      frozen: null,
    })),
    availability: [1, 2].flatMap((order) =>
      ["a", "b", "c", "d"].map((participantId) => ({
        participantId,
        roundId: `round-${order}`,
        available: true,
      })),
    ),
    constraints: { mustSeparate: [] },
    conductor: { activeRoundId: null, pendingDraft: null },
    repairHistory: [],
    metadata: {
      createdAt: "2026-10-14T00:00:00Z",
      appVersion: "0.1.0",
      source: "Independent lifecycle fixture",
    },
  };
}
