# Bounded future repair

Version `bounded-preserve-1`. Input is a cloned immutable event, first mutable round,
accepted assignments, full pending patch, revision, seed and fixed iteration budget.
Input identity includes all of these. Its FNV-1a checksum is an identity aid, not a signature;
Apply additionally checks exact patch, revision, full protected data, exact future group and
availability definitions, and an independent hard validator. The proposal never mutates state.

1. Check enabled capacity totals. Too few/too many available people or inverted bounds yields
   proven-infeasible with numeric evidence. Complex separation failures are never labeled impossible.
2. Remove unavailable participants while preserving every continuing assignment. If valid, return
   it immediately with zero moves. It is intentionally not reshuffled to improve secondary scores.
3. For each invalid future round, search under increasing continuing-attendee move caps. A lower
   bound counts people forced out of disabled groups. Placement choices prefer the old group,
   then unmet minima/load, then group IDs. Prune capacity, min-size deficits and mustSeparate.
4. Once a feasible full candidate exists with positive moves, try deterministic seeded valid pair
   swaps. Compare lexicographic move count, repeated scheduled pair instances, squared size
   deviation sum, then ID assignment string. No worsening candidate is accepted.
5. Independently validate the complete proposed project and compare frozen/current/timer control
   data byte-for-byte using canonical serialization. Failed validation gives error, no candidate.

The iteration counter counts placements and optimization trials. Default cap is 30,000 and
wall timeout 1.8 seconds (UI budget 0…200,000). A timeout with a valid candidate returns feasible
with honest termination reason; without one, unsolved. Cancelling terminates this worker,
so a blocked synchronous loop does not delay cancellation. Any revision change terminates
the worker and its old request result cannot be applied.

Move counts are round-assignment counts, not unique people. Added/removed assignment counts
are separate. Repeats use unordered participant IDs and `sum(max(0, count−1))` across all
frozen and proposed rounds. These are **scheduled encounters**, not attendance confirmation.
No global optimality proof is provided, including for zero-move secondary objectives.

Required corpus: sample departures → feasible / zero moves; 24 people minus 10 with four
min=4 groups → proven capacity contradiction (14 < 16); separation violation with budget=0
→ unsolved. A separate exhaustive mask oracle covers all 64 four-person separation graphs
with two groups of two. It does not use the planner or validator to establish feasibility.

Limit: increasing move caps can exhaust its budget on a feasible complex separation problem.
The safe result is unsolved. Change future bounds explicitly or try another budget/seed. The
algorithm is a repair tool, not an all-purpose seating generator or mathematical solver API.
