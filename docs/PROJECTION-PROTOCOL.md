# Public projection protocol v2

The channel name is `roundrelay-public-v2-<session UUID>`. The transport envelope is a
strict object with `version: 2`, `type: snapshot`, `sessionId`, positive safe-integer
`workspaceEpoch` and `sequence`, and `payload`. The public payload retains its v1 shape:
version, type, revision, sentAt, publicTitle, roundLabel, status, timer and groups. It
contains no event/participant/group IDs, private notes, constraint reasons or history.
The envelope's session UUID is transport identity, not participant or event identity.

The publisher persists its transport cursor in this conductor tab's sessionStorage.
Reload and browser history return continue that stream. A fresh document navigation
starts a new stream, including a new tab that inherited a copy of its opener's storage.
If sessionStorage is disabled, ordering still works during this mount; after reload use
Open projector again. Changing origin/port also requires a new projector.

Every snapshot/request response/heartbeat advances sequence. A new publisher mount,
initial database adoption, import/replacement, explicit saved-state recovery or resume
adoption advances workspace epoch. Timer and pending draft commands keep that workspace
epoch. Business revision remains project data: ALPHA20 to BETA0 and ALPHA20 to ALPHA5
are valid replacements. Counter overflow fails validation instead of wrapping.

A receiver accepts only a schema-valid envelope for its session whose sequence strictly
increases and whose epoch does not decrease. Duplicate, reordered, retired-epoch, wrong
session, unknown-key and malformed packets are discarded. Discarded packets change
neither displayed data nor freshness. Freshness uses the receiver's acceptance time,
not the sender's wall clock. Newly generated heartbeats count; replayed heartbeats do not.
The receiver keeps its cursor across pagehide/pageshow in the same JS heap.

Requests are strict `{version: 2, type: request-snapshot, sessionId}` objects. The
projector reconnects and requests on pageshow; both views close channels on pagehide.
The conductor resumes sending only after its lifecycle controller reclaims ownership.
No projector reads IndexedDB, submits commands or acquires a database lease.

Public status `unavailable` carries no timer or assignments. It reports an invalid
accepted plan while leaving repair and portable JSON backup in the conductor available.
A valid accepted plan can be projected/printed/exported while future edits are pending.
Status/timer combinations, label bounds, numeric bounds and total public attendance
are validated at the receiving boundary.

After 6.5 seconds without an accepted packet the last snapshot is visibly stale. This
same-origin protocol is not authentication against other same-origin scripts. It is
not network/phone synchronization. v1 channel listeners cannot join v2; close and reopen
old projector tabs after switching app versions. Portable project JSON remains v1.
