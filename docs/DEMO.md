# Actual synthetic browser rehearsal

[Watch the 28-second MP4](media/rehearsal.mp4) or [WebM](media/rehearsal.webm).
The recording uses a real isolated Chromium and the running application, with 24 original
synthetic aliases. The first round is finished immediately to avoid five minutes of idle time.
This is a technical rehearsal, not a workshop involving the user's real participants.

Real screenshot sequence:

1. [Round 1 running](media/01-running.png).
2. [Two departures and zero-move future diff](media/02-preview.png).
3. [Committed repair history](media/03-history.png).
4. [Round 2 public projector](media/04-projector.png).
5. [Versioned printable routes](media/05-print.png).

The video records the conductor window. The projector is a separate real tab, captured in
step 4. [Saved after-repair project](../examples/rehearsal-after-repair.json) includes the actual
committed repair and frozen first round. Reimport it to inspect the history. The original
[sample](../examples/workshop-24.json) starts from a clean planned state.

Reproduce: start the dev server, then `ROUNDRELAY_URL=http://127.0.0.1:5173/ npm run demo:record`.
Playwright browsers must be installed; ffmpeg creates MP4 when available. Real screenshots
and WebM are the fallback, not generated pictures of an imagined interface.
