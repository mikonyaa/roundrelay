# Local candidate acceptance

0.1.1-rc.1 addresses RR-1, RR-2 and RR-3. It is a local candidate, not a published release,
real room pilot, Safari test or a new hosted CI result. Historical QA files retain their
original source/version scope. The accompanying local report and evidence identify actual
command results and the packaged source commit; build-info.json records sourceDirty.

Use Node 24.21.0 and the declared Playwright browsers. Run these commands on the same
candidate source, in order:

```sh
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm run build
ROUNDRELAY_ALL_BROWSERS=1 npm run test:e2e
npm run package:web
npm run test:production
npm run test:suspension
```

The suite contains 38 unit tests and 32 browser scenarios per engine. The lifecycle fixtures
are independently hand-authored; the original 24/60-person fixtures are unchanged. Tests
cover ALPHA20 to BETA0 and ALPHA5, malformed/replayed packets and freshness, invalid group
and participant destinations, saved/queued/dirty edits, competing owners, legacy lease
migration, closed handles and actual document history traversal. Synthetic page events
exercise the return branch but are not actual BFCache proof.

The production gate extracts the ZIP to a separate temporary directory, serves only its
app/ through the included dependency-free server, and never imports application source
for its lifecycle assertions. It checks genuine public wire messages, private canaries,
accepted routes, draft backup/repair, 24/60-person flows, byte-for-byte frozen rounds and
availability, 390px, keyboard, print PDF and a deliberately stalled worker. It also checks
blocked paths, CSP, no node_modules and no external requests. The worker stall is a
controlled test injection, not a claim about observed hardware faults.

The suspension script uses a separate Chromium instance and stops only its identified
renderer for a measured interval. This tests a real suspended renderer and wall-deadline
behavior. It does not suspend the computer or prove hardware sleep handling.

Actual BFCache acceptance needs pageshow.persisted=true, retained heap identity, preserved
edits and successful post-restore writes. Default Playwright history runs do not prove it.
If a separate enabled-BFCache probe reports rejection reasons, record the gate as not
passed, even when the ordinary reload preserves committed edits.

Real facilitator rehearsal, physical display readability, actual printing, BFCache and
running/paused hardware sleep remain separate external gates. Use
[ROOM-REHEARSAL.md](ROOM-REHEARSAL.md) and its prepared fixtures. Passing local checks
alone does not establish 10/10 or production readiness.
