# 0.1.1-rc.1 compatibility

This is a local release candidate, not a published release or a new hosted CI result.

- Portable EventProject JSON remains `schemaVersion: 1`; old backups, including pending
  drafts and bounded repair history, remain importable. App metadata records the creator
  version but is not used to order projection messages.
- IndexedDB database/store/version remain `roundrelay-v1` / `workspace` / `1`. Existing
  records lacking leaseEpoch are read as epoch zero; the next claim adds a fenced lease.
  No event data is dropped, and CAS snapshot generation is retained.
- Close older conductor tabs before using the candidate on the same origin. Older app
  code does not enforce the new lease-epoch fence; mixed-version writers are unsupported.
- Projection transport uses a new v2 channel and strict envelope. Open a fresh projector
  from the candidate after upgrading. Reload/history continuity applies within that version;
  new conductor tabs get their own stream. Session storage disabled: reopen projector after reload.
- Hard-invalid drafts still import, remain editable and download as JSON. CSV/print/public
  assignment routes are blocked until independent validation of the accepted plan succeeds.
  Explicit absent attendance alone produces Not attending. Pending edits do not alter accepted routes.
- Static app/ assets, local loopback serving, public labels, CSV formula escaping, timers,
  planner, independent candidate validation and frozen historical rounds are retained.

Backup before upgrading. Extract to a separate directory and test on a separate port first.
To transfer an event across ports or roll back, import a downloaded v1 JSON backup. Rollback
to 0.1.0 also restores its known lifecycle defects; it is not a claim of equivalent behavior.

See [protocol](PROJECTION-PROTOCOL.md), [recovery](RECOVERY.md) and
[manual room/hardware gates](ROOM-REHEARSAL.md). Those manual gates have not been passed
by generating fixtures or by dispatching page events.
