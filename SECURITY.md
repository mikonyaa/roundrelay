# Security

RoundRelay processes untrusted JSON/CSV locally with strict shape, depth, length and count
limits. Labels render through React text nodes. No eval/innerHTML, remote project modules,
participant uploads or analytics. CSV exports prefix formula-leading labels. The local server
binds loopback and serves only its app/ directory with path/realpath checks and CSP.

Portable JSON may contain private notes/reasons; keep it private. Public projector/print
snapshots exclude those fields. Different IndexedDB/channel names do not cryptographically
isolate scripts sharing an origin. Browser storage and checksums are not authenticated backups.

Report reproducible security issues privately to the repository owner through an available
GitHub private reporting channel; otherwise request a private contact without publishing
real participant data. Include synthetic input, version, browser and reproduction steps.

For v0.1.0 the dependency lock is audited and runtime notices are included. esbuild 0.28.1
is explicitly pinned to address GHSA-g7r4-m6w7-qqqr in the development toolchain.
