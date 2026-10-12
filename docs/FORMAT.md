# EventProject v1

See the complete [24-person file](../examples/workshop-24.json) and the executable strict
[schema](../src/model/schema.ts). Root keys: kind `roundrelay-event`, schemaVersion `1`,
eventId, revision, title, participants, rounds, availability, constraints, conductor,
repairHistory, metadata. Unknown keys/versions are rejected. IDs use 1–80 ASCII letters,
digits, underscores or hyphens. Labels are 1–120 characters; notes/reasons at most 500.

Participant IDs are stable, independent of publicLabel. Rounds use orders 1…N; group IDs
are stable within each round. Assignments remain arrays `{participantId, groupId}` so
duplicate entries reach the validator. Availability explicitly covers every participant/round.
Every available participant is assigned once; absent participants have no assignment.
Enabled groups satisfy min/max; disabled groups have no assignments. mustSeparate holds
two distinct participant IDs and an optional private reason, at most 200 pairs.

Limits: 2 MiB per JSON/CSV input, JSON nesting at most 16, 60 participants, 6 rounds,
12 groups/round, 60 assignments/round, 360 availability entries, 100 repair operations.
Durations are finite integers 1,000…14,400,000 ms. Small teaching examples are allowed;
the primary tested envelope is 20–60 people / 3–6 rounds. Numeric overflow is rejected.

Round state includes status, nullable timer and nullable frozen snapshot. Started rounds
require frozen labels/assignments/groups/availability/constraints and an absolute timer
control record. Import validates consistency before replacing the open state. There is no
signature claiming that an imported historical snapshot is authentic.

`conductor.pendingDraft` holds availabilityChanges (explicit per round) and futureGroupChanges
(roundId, groupId, minSize, maxSize, enabled). Effective-from UI expands only planned rounds
at/after the selected order. Draft schema limits are 360 attendance and 72 group edits.
The accepted plan and pending draft remain distinct. History stores full before/after future
states, including availability and group definitions, rather than only a visual diff.

CSV requires exactly `participant_id,public_label` and `round,group,participant_id` headers.
Round is an integer starting at 1. Group is its stable ID and initial public label. Preview
explicitly supplies min/max/duration; nonlisted participant/round combinations mean absent.
Quoted cells and Unicode are preserved; identity is never guessed from similar names.
