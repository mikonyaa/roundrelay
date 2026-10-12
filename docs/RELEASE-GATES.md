# Release gates

Gate A before the first public repository/push: complete P0/local P1; independent hard/state/
freeze/undo/timer/status/oracle tests; real multi-tab/privacy/60-person/long-label browser QA;
own-renderer suspension; final ZIP extracted outside sources and rehearsed as a consumer;
actual synthetic demo/print examples; compatible license/notices; staged history/source,
ZIP entries and screenshots inspected for private data/secrets. No external facilitator claims.

Gate B: select S only from a successful **push** on **main**, workflow **Quality and Pages**,
exact headSha S. Inspect every required verification step and all required jobs; a stale badge
or a manual run does not qualify. Download verified-release-inputs from that exact run and
release those ZIP bytes. Record run ID/URL, source SHA, tool versions and asset checksums in
release-manifest.json. Checksums do not include themselves or claim a signed attestation.
Tag v0.1.0 must peel to S. Publish with verify-tag and notes-file; never overwrite published bytes.

Pages deploys only the allowlisted app/ tree from that same package staging area, on this new
repository. Ordinary PRs have read-only permissions and never deploy. No untrusted privileged
checkout, self-hosted Mac, custom domain, root-user-site modification or paid runner.
Action full SHAs were retrieved from upstream tag refs and independently resolved as commits
before writing the workflow on 2026-10-12. No reliance on a GITHUB_TOKEN-triggered follow-on run.

Post-release: anonymous source/README/LICENSE/demo/workflow/release/asset checks, public
ZIP checksum, new consumer extraction and conductor/projector/attendance/preview/apply/
undo/print/backup reimport. Actual page_url also passes the rehearsal and projector refresh.
Record releaseCommit S separately if final main later contains documentation corrections.
