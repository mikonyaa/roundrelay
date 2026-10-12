# Contributing

Use Node 24.21.0 and `npm ci`. Install Playwright Chromium/Firefox/WebKit separately.
Run typecheck, lint, unit tests, build, browser tests, package:web, test:production and
test:suspension before proposing a release. Use only synthetic fixtures and temporary browser
profiles. Do not put real participant backups, tokens, profiles or raw traces in public artifacts.

Preserve the independent validator. Planner changes must keep bounded status semantics,
current/completed protection, deterministic inputs and the separate exhaustive oracle.
Never weaken a hard constraint silently. Keep UI workflows usable at 390 px and projector
labels legible at 1280×720 and 1920×1080. Include a concrete trigger/result and checks in PRs.

Changes to an already published release require a new version and tag; do not replace bytes.
