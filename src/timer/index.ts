import { durationSchema, type TimerControl } from "../model/schema";
export const remaining = (
  control: TimerControl | null,
  now = Date.now(),
): number =>
  !control
    ? 0
    : control.deadlineEpochMs === null
      ? control.remainingMs
      : Math.max(0, control.deadlineEpochMs - now);
export function startTimer(durationMs: number, now: number): TimerControl {
  durationSchema.parse(durationMs);
  return {
    durationMs,
    deadlineEpochMs: now + durationMs,
    remainingMs: durationMs,
    startedAtEpochMs: now,
  };
}
export const pauseTimer = (t: TimerControl, now: number): TimerControl => ({
  ...t,
  remainingMs: remaining(t, now),
  deadlineEpochMs: null,
});
export const resumeTimer = (t: TimerControl, now: number): TimerControl => ({
  ...t,
  deadlineEpochMs: now + t.remainingMs,
});
export function formatTime(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function clockAmbiguity(
  wallDelta: number,
  monoDelta: number,
  interrupted: boolean,
): string | null {
  if (interrupted) return null; // Hidden/suspended time is elapsed time, not evidence of a clock jump.
  return Math.abs(wallDelta - monoDelta) > 3000
    ? "The wall clock and monotonic clock disagree. Check the remaining time; you can correct it manually."
    : null;
}
