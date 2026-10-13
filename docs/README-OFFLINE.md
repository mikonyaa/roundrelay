# RoundRelay 0.1.1-rc.1 — local web package

Prerequisite: Node.js 24.21.0 LTS (24.x). Obtain Node and this archive while online.
Afterward, the application needs no network, account, node_modules or dev server.

1. Extract the complete ZIP to its own directory.
2. In that directory run `node serve.mjs --port 0`.
3. Open the printed `http://127.0.0.1:PORT/` URL in your browser.
4. Try the 24-person sample or import `sample-event.json`.

The dependency-free server serves only app/ on loopback. Port 0 chooses a free port.
Ctrl+C stops this server. A busy specified port reports an error and leaves its owner alone.
Different ports have different browser storage; import a downloaded backup to transfer an event.
The module application is not a file:// application. Keep all app/ assets together.

Start round 1, finish it, select Aster and Birch, mark absent from round 2, Preview repair,
review the zero-move diff, Apply, then Undo before starting an affected round.
Open projector from the conductor. It shares public labels only, in this same browser/origin.
Print routes opens a preview first. Timer expiry never finishes or advances a round.

Download backup frequently. IndexedDB can be cleared or fail; Saved means its transaction
committed, not that you have an independent backup. A pending draft is included in JSON.
The projector does not read the private database, but same-origin scripts are not cryptographically
isolated. There is no live phone synchronization.

This candidate keeps portable JSON v1. Invalid drafts remain backed up and repairable;
public assignment routes/CSV/print are blocked until the accepted plan validates. Existing
projector tabs follow imports and older restores; close v0.1.0 tabs before upgrading.
Pageshow reopens/reclaims storage, preserving unsaved edits unless another writer changed
the saved event. Download an unsaved backup before explicit recovery loads saved data.
See [compatibility](MIGRATION-0.1.1.md), [protocol](PROJECTION-PROTOCOL.md),
[recovery](RECOVERY.md) and [room/hardware rehearsal](ROOM-REHEARSAL.md).
The [candidate acceptance checklist](LOCAL-CANDIDATE-QA.md) distinguishes automated
checks from actual BFCache, hardware sleep and room gates.
The `rehearsal-fixtures/` folder contains ready synthetic inputs, not a completed room pilot.

License: MIT. See LICENSE and THIRD-PARTY-NOTICES.txt. All examples are synthetic aliases.
