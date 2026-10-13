# Room rehearsal and external acceptance — not yet executed

Use the candidate ZIP's supplied server, a real conductor computer/browser, actual room
projector/display and printer. A facilitator should run the session. Prepare the package,
Node 24.21 and browser while online, then disconnect the network. Record candidate checksum,
build-info source commit, browser/OS/device versions, display resolution and room conditions.
Do not substitute the screenshots or synthetic fixtures for a pilot with people.

The ZIP includes `rehearsal-fixtures/`: ALPHA revision20, BETA revision0, same-event ALPHA5,
unknown-group and unknown-participant drafts, plus the original 60-person fixture.
`sample-event.json` supplies the original 24-person plan. All aliases are synthetic.
In the source tree the new files use the `fixtures/lifecycle-` prefix.

1. Import ALPHA20, open the physical projector. Import BETA0, then ALPHA20 and ALPHA5.
   Verify title, public alias and plan version change in the same projector tab. Record
   the visible result, not only conductor state. Confirm no private canary appears publicly.
2. Import each invalid draft. Verify CSV/print buttons and public assignments are blocked,
   the explanation is visible, and JSON backup works. Edit East maximum to 3, Preview and
   Apply. Verify every available person now has one destination and public exports work.
3. Run the 24-person plan: start/finish round1, start round2, mark two absent from round3,
   add one back later, preview/apply and check current/completed groups against saved JSON.
   Verify Undo is fenced once an affected round starts. Do not expect a global optimum.
4. Repeat with 60 people. Inspect pagination at 1280x720 and 1920x1080, long names and
   readability from the farthest seat. A route must be easy to follow without using the laptop.
5. Print 24/60 routes on the actual printer. Check wraps, page breaks, version stamps,
   explicit absent destinations and every public label. Test 390px and keyboard Alt+S/Alt+F.
6. Download a backup with pending edits. Restore an older same-event backup during the
   rehearsal and confirm the already-open display follows. Keep the before/after files.
7. **Actual BFCache:** enable Preserve log in that browser's developer tools and register:

   ```js
   addEventListener("pageshow", (e) => console.info("pageshow", e.persisted));
   addEventListener("pagehide", (e) => console.info("pagehide", e.persisted));
   ```

   Navigate to another document and return with browser Back/Forward. Record actual
   `persisted` values and the browser's BFCache eligibility/rejection reasons. Only
   persisted=true proves this gate. Compare the downloaded saved/pending snapshot, edit
   again and verify it commits. Repeat with a second tab taking ownership while away;
   the returning tab must preserve any local draft for backup and stay read-only.

8. **Hardware sleep:** with the real running round, save changes and record its deadline
   and an independent external clock. Sleep the device for a measured interval, wake,
   compare timer with the wall deadline, then edit/save/print. Repeat paused. Test the
   second-tab ownership/recovery path. Never infer hardware sleep from renderer SIGSTOP.
9. Continue a realistic session with late arrivals, departures, absent people, backup
   restore, sleep and print. Record facilitator errors, unreadable labels and time to recover.

Record one row per gate:

| Gate                          | Device/browser | Actual event/elapsed evidence | Expected vs observed | PASS/FAIL/NOT RUN | Evidence file |
| ----------------------------- | -------------- | ----------------------------- | -------------------- | ----------------- | ------------- |
| Room/display readability      |                |                               |                      | NOT RUN           |               |
| Printer 24/60                 |                |                               |                      | NOT RUN           |               |
| BFCache persisted=true        |                |                               |                      | NOT RUN           |               |
| Hardware sleep running/paused |                |                               |                      | NOT RUN           |               |
| Facilitator full rehearsal    |                |                               |                      | NOT RUN           |               |

A rejected BFCache entry is an environment observation, not a passed restore. A manual
failure requires another candidate and rerun of affected gates. Local unit/browser/ZIP
checks do not alone justify 10/10, a real pilot or production readiness.
