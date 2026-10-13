# Changelog

## 0.1.1-rc.1 — local candidate, 2026-10-14

- Order projector messages by stable transport session, workspace epoch and monotonic sequence;
  replacement/older restore/reload work, and rejected packets cannot extend Live freshness.
- Share independent accepted-plan readiness across Start, CSV, print and public projection;
  invalid drafts remain repairable/backed up, with no misleading Not attending destination.
- Reopen suspended IndexedDB with connection/lease/CAS fencing; preserve latest queued edits
  and unsaved conflicting drafts until explicit recovery. Idempotent open/claim/release.
- Extract projection and persistence lifecycle controllers without rewriting the planner,
  independent validator or wall-clock timer. Add regression fixtures and extracted-ZIP consumers.
- Keep EventProject v1 compatible; document v2 transport, additive storage migration, recovery
  and unverified room/BFCache/hardware gates. No publication or new hosted CI claim.

## 0.1.0 — 2026-10-12

- Local workshop conductor with strict JSON/quoted CSV preview and independent validation.
- Frozen round snapshots and absolute-deadline start/pause/resume/finish controls.
- Pending attendance/group draft, bounded worker repair, complete Apply/Cancel/Undo.
- Same-browser public-only projector with heartbeat, readable pagination and fullscreen.
- IndexedDB autosave/recovery and transactional cross-tab writer fencing.
- Versioned printable routes, public formula-safe CSV and portable backups.
- Synthetic 24/60-person fixtures, actual browser demo and dependency-free offline ZIP.
