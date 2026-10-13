# Local storage lifecycle and recovery

Open, close/release and claim are idempotent. Concurrent opens share one connection.
Release retires that exact handle immediately and fences its queued operations. A late
opening is closed and rejected; opening again waits for release to finish. Claim opens
storage when necessary. Version-change/forced-close notifications invalidate the handle.

Each write uses a connection generation, owner UUID, persisted lease epoch and expected
snapshot generation. A new/reclaimed lease advances lease epoch; repeated claim on the
same live lease does not. The transaction checks ownership, lease epoch and CAS before
writing. Renewal and release are fenced too; stale release cannot clear another lease.
Leases expire after five seconds and renew every 1.5 seconds while the conductor is active.

On pagehide the controller stops accepting commands, retires queued saves and releases
the connection. On pageshow it waits for pending work, opens, claims and compares saved
data with its last committed snapshot. If storage is unchanged, the latest unsaved
in-memory edit is saved using the new fence. If a different writer committed changes,
an unsaved local draft is retained for backup and the returning tab stays read-only.
No automatic merge or overwrite occurs. Read-only polling also retains unsaved local data.

Download backup before **Recover saved event** when any unsaved data remains. Recovery
explicitly chooses the last committed database snapshot. It refuses while another live
conductor owns the lease. Close that tab and retry after its release/expiry. Recovery
reopens a closed handle and can write again after claiming it. It does not restore an
unsaved draft that was never committed after browser termination; use its downloaded JSON.

**Saved locally** means the latest write completed its transaction. **Saving** and
**Unsaved** are not durability claims. A transaction committed just before pagehide still
counts as the committed snapshot. A queued operation from an old connection cannot write
after resume, even if owner and business revision happen to match.

IndexedDB quota/corruption/disabled storage keeps the available in-memory snapshot and
backup path. The app can hold an in-memory event when storage is unavailable at startup.
Browser storage can be cleared. Download portable backups regularly, especially before
imports and recovery. Changing the local serving port creates a different storage origin.

Synthetic page-transition tests and real browser history traversal are different gates
from actual BFCache persistence and hardware sleep. See [room rehearsal](ROOM-REHEARSAL.md).
