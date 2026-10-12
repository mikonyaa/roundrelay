# Public v0.1.0 verification

[Release](https://github.com/mikonyaa/roundrelay/releases/tag/v0.1.0) ·
[Pages](https://mikonyaa.github.io/roundrelay/) ·
[Exact release CI run](https://github.com/mikonyaa/roundrelay/actions/runs/38294138685).

Release commit S: `7744b34688d412cbeceaa31dfce42cf31006ab8e`. The annotated v0.1.0
tag peels to S locally and remotely. Its successful push/main workflow executed verify
and deploy: 28 unit tests, 45 E2E tests, extracted-ZIP consumer rehearsal and real own-renderer
suspension. No required tests were skipped. Node 24.21.0; Chromium 156.0.8078.4,
Firefox 157.0 and Playwright WebKit 27.2. WebKit is not a Safari test.

The release web ZIP is copied byte-for-byte from `verified-release-inputs` in that exact run.
SHA256: `685aead38cb0b9ac5e3cd38c314dbff3b4c3b6ca99bea8714660ae88b1d9f894`.
All **11 public assets** were downloaded anonymously; every checksum passed. The public
ZIP format/build-info/source SHA were inspected, then it was extracted outside the source
directory and rehearsed using its supplied dependency-free server, without node_modules or
a dev server. Conductor/projector/finish/departures/preview/apply/undo/print/backup/reimport passed.
Anonymous README, LICENSE, source, sample and actual demo downloads also succeeded.

Actual Pages checks, in a new temporary Chromium profile:

- The same complete 24-person consumer rehearsal and backup/reimport passed.
- A public projector received a new snapshot and survived hard refresh at the repository subpath.
- Synthetic private note/reason canaries stayed out of public messages, DOM, URL and print.
- No app data requests went to another origin; labels/fonts/worker remained local to the app path.
- Running round data and timer control fingerprint stayed unchanged after future Apply/Undo.
- Responsive conductor at 390 px and actual public print output were captured and inspected.
- A 60-person / 6-round plan completed future Preview/Apply/Undo and printed 60 routes.
  That two-departure, zero-move test reported **13 ms planner time / 823 ms wall preview time**;
  these are observed measurements for this case, not a universal performance guarantee.

The manifest is an unsigned provenance record. The published tag and assets are retained.
Subsequent main commits add documentation links/evidence; they do not replace the v0.1.0
release commit or bytes. Hardware sleep of the Mac, Safari and phone synchronization were
not tested. The bounded planner can return unsolved; system-clock changes during sleep
remain ambiguous. No real facilitator study or adoption results are claimed.
