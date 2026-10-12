# Technical QA — v0.1.0

Local platform: macOS arm64, Node **24.21.0**. Exact browser engines from Playwright **1.64.0**:
Chromium **156.0.8078.4**, Firefox **157.0**, WebKit **27.2**. These are the tested automation
engines; WebKit is not a statement that Safari was tested. Real facilitator testing is not done.

The checked suite has **28 unit tests** and **15 browser scenarios × 3 engines = 45 E2E tests**.
The independent exhaustive oracle covers all 64 graphs of four participants / two groups of two.
Required scenarios are executed, without skip markers or retries hiding a failed release gate.

| Requirement                                         | Evidence                                                                                                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable JSON and quoted CSV; repeated display labels | Unit + browser import round-trip including BOM, CRLF, quoted comma and Unicode.                                                                                              |
| Hard validator                                      | Duplicate/missing/absent assignments, IDs, capacity and mustSeparate tests; buggy duplicate candidate rejected at Apply.                                                     |
| Frozen completed/current and timer controls         | Real 24-person round1 finish / two departures / zero-move Apply/Undo; running late arrival; exact canonical protected state equality.                                        |
| Atomic pending attendance and group definitions     | Draft reload keeps accepted state; min/max/enabled Apply/Cancel/Undo; started-round undo fenced.                                                                             |
| Stale proposals/results                             | Attendance/timer/finish changes reject proposals; browser worker termination on new draft and cancellation.                                                                  |
| Honest solver outcomes                              | Feasible, numeric 14<16 capacity proof, zero-budget unsolved; fixed-seed deterministic candidate/score.                                                                      |
| 60 people and six rounds                            | Measured bounded planner test, cancellation while timer/projector remain available, long-label paginated projector.                                                          |
| Real time                                           | Real reload/background/paused reload/resume/expiry; independent external timer around SIGSTOP/SIGCONT of only the fresh test browser's sole renderer.                        |
| Privacy                                             | Private-note/reason canaries absent from serialized public messages, DOM, URL, print; projector runs with IndexedDB access forbidden; fresh snapshot/reload/stale heartbeat. |
| Error/recovery/races                                | Invalid and oversized input cannot replace current event; inert HTML labels; storage failure backup; two-tab ownership/recovery.                                             |
| Responsive/print                                    | Screenshots inspected at 390 px, 1280×720 and 1920×1080; full 60-route PDF text checked for every name and 61 plan-version occurrences.                                      |
| Consumer artifact                                   | Actual final web ZIP extracted to a temporary directory outside sources; dependency-free loopback server; full rehearsal, backup/reimport, path protection and CSP.          |

Own-renderer suspension measured approximately **3,202 ms** outside Chromium using process
hrtime; after continuation displayed **297 seconds**, matching the absolute wall deadline.
The test launches an isolated browser with a single renderer, verifies its process identity via
that browser's CDP session, and always sends SIGCONT before closing it. It never sleeps the Mac,
changes system time, pauses another session's renderer or closes another browser.
**Hardware sleep, Safari, and live phone synchronization are not tested or promised.**

Visual issues corrected before publication: long labels previously overflowed the 720px projector;
they now use wide group parts. A Firefox popup viewport protocol stall was removed by opening
the second viewport in a fresh real projector tab. A unit fixture initially spent its entire 5s
optimization budget; it now uses a small explicit budget appropriate to its atomic-undo assertion.
No required test was skipped to obtain a green run.

The recorded synthetic rehearsal is about **25 seconds** and has five real screenshots plus
the saved after-repair event. The public print examples are actual Chromium PDFs.
All 201 locked dependency entries have compatible recorded licenses; npm audit after the
esbuild 0.28.1 fix reported **0 vulnerabilities** on 2026-10-12. Runtime notices include full text.

Release provenance is recorded separately in release-manifest.json: exact source commit,
successful push/main CI run and SHA256 for every payload asset. Post-release public artifact
and actual Pages checks are described in the release notes, with any hosting blocker stated.
