# RoundRelay 0.1.0 — local web package

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

License: MIT. See LICENSE and THIRD-PARTY-NOTICES.txt. All examples are synthetic aliases.
