/**
 * Duration formatting for study time.
 *
 * All PrepPilot durations are stored and passed around as **whole seconds**.
 * Study sessions derive their elapsed time from stored timestamps rather than a
 * live counter, so a session survives the app being backgrounded or killed.
 */

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;

function assertSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) {
    throw new RangeError(`seconds must be a finite number, received ${seconds}`);
  }
  // Clamp rather than throw: clock skew or a paused-then-resumed session can
  // produce a small negative delta, and a dashboard should render 0, not crash.
  return Math.max(0, Math.floor(seconds));
}

/** Formats as `"20h 11m"` — the dashboard "Time Spent" and per-subject totals. */
export function formatHoursMinutes(seconds: number): string {
  const safe = assertSeconds(seconds);
  const hours = Math.floor(safe / SECONDS_PER_HOUR);
  const minutes = Math.floor((safe % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

/**
 * Formats compactly, rolling over to days past 24 hours:
 * `"13h 04m"` under a day, `"2d 07h"` beyond it.
 */
export function formatCompactDuration(seconds: number): string {
  const safe = assertSeconds(seconds);
  if (safe < SECONDS_PER_DAY) return formatHoursMinutes(safe);

  const days = Math.floor(safe / SECONDS_PER_DAY);
  const hours = Math.floor((safe % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  return `${days}d ${String(hours).padStart(2, '0')}h`;
}

/** Formats as a zero-padded clock `"00:21:25"` for the running timer display. */
export function formatClock(seconds: number): string {
  const safe = assertSeconds(seconds);
  const hours = Math.floor(safe / SECONDS_PER_HOUR);
  const minutes = Math.floor((safe % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const secs = safe % SECONDS_PER_MINUTE;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':');
}

/**
 * Whole seconds between two epoch-millisecond timestamps, never negative.
 *
 * Named for the pair of instants rather than for "elapsed", which the timer
 * engine also needs for its own richer notion of elapsed study time.
 */
export function secondsBetween(startedAtMs: number, nowMs: number): number {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) {
    throw new RangeError('timestamps must be finite numbers');
  }
  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
}
