# Bounded competitive and reuse review — 2026-10-12

This is a short first-party review and one real browser comparison, not an exhaustive market
survey. Lack of a documented workflow is not evidence that a product lacks the feature.

| Product                                                          | Current first-party evidence                                                                                                                                                                                                                      | License / reuse decision                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GroupMixer](https://groupmixer.app/multi-round-group-generator) | Multi-round groups, partial attendance, custom/session capacities, repeat objectives, seeds, local solving, saved results, live reveal and manual group editing. The page distinguishes ordinary solves from account-checked advanced generation. | [Open GroupMixer source](https://github.com/agdtaurines/GroupMixer/blob/master/LICENSE.md) is MIT. Rust/WASM solver has a broader weighted planning pipeline. Not reused: new WASM build/adapter and exact preserve-first future-repair objective would enlarge this tool's trusted surface.                               |
| [rosterfair](https://github.com/KanadeK/rosterfair)              | Node CLI/library, capacity/apart rules, seeded bounded search, historical pairs, multi-round JSON/CSV/HTML reporting. Inspected actual schema, public exports and `findFeasibleAssignment` / `solveScenario` implementation, beyond the README.   | [MIT](https://github.com/KanadeK/rosterfair/blob/main/LICENSE). Reusable JavaScript, no backend requirement. Its round loop uses the same scenario and builds new assignments; adapting per-round attendance/minima and strict lexicographic move priority would still require a substantial repair layer. No code copied. |
| [MixerSeater](https://www.mixerseater.com/how_it_works)          | Rotation parameters, attendee/preferences upload, printable group/individual agendas, mobile agendas, and first-party claims of dynamic adaptation for virtual events.                                                                            | Hosted commercial platform. No explicit reusable source license established in this bounded review; source not copied. Dynamic adaptation already exists in this category.                                                                                                                                                 |
| [FastRounds](https://fastrounds.com/)                            | Host dashboard, manual/automatic rounds, attendee codes from phones, timer-driven rotations, optional messaging; free start and paid plans are presented.                                                                                         | Hosted commercial platform. No reusable source license established; source not copied. RoundRelay does not compete on networked attendee synchronization.                                                                                                                                                                  |

## One concrete operation

In a fresh isolated Chromium, loaded our own 24 aliases into GroupMixer, four groups and four
sessions. Verified the 24-name input after initial load, generated a saved result, and used
Show groups now: the real result showed **24/24 people, four groups of six, four sessions**.
The result exposes Edit groups, locked-person preservation, improve/reshuffle and Undo.
The scenario-editor control was intercepted by its schedule-board canvas in this browser run;
we stopped the bounded review there. This is not a claim that partial attendance or historical
preservation is absent. Partial attendance is explicitly advertised in the live product.

RoundRelay's same-size rehearsal starts round 1, freezes and completes it, stages Aster/Birch
departures from round 2, previews **0 moves / 6 removed round assignments**, applies the full
future patch, and undoes it without changing round 1. The saved JSON, real browser tests and
demo expose that exact behavior. The differentiator being built is this explicit conductor
operation with independently checked frozen/timer data and a complete future diff.

## Chosen implementation

An original small bounded preserve-first heuristic plus round-local search in a Web Worker.
It does not add a heavy backend or a general solver API. Availability, capacity, stable IDs and
mustSeparate are independently validated. Capacity contradictions have simple numeric proof;
exhausted complex search is unsolved. This deliberately accepts a narrower solving envelope
to keep live-event behavior auditable. External facilitator interviews remain a future user
experiment; no results are claimed.

## Technical sources checked

- [MDN performance.now](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now):
  monotonic diagnostics and platform-dependent sleep behavior; use wall deadlines for the timer.
- [MDN BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API):
  same-origin/storage-partition scope, no automatic protocol or remote-device synchronization.
- [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB):
  transaction completion, blocked upgrades and version-change handling.
- [Vite static deployment](https://vite.dev/guide/static-deploy.html): relative base for repository
  subpaths, dedicated Pages artifact/deployment, and distinct build/preview/deployment.

Support is tested against the exact installed Playwright engines, not inferred from a broad
compatibility chart. See QA.md. Same-origin browser primitives are not cryptographic isolation.
