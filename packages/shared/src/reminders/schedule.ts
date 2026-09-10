/**
 * Reminder scheduling.
 *
 * PRD §16 lets a student set a title, a date and time, a repeat rule, and an
 * optional syllabus item. Repeats use a small enum rather than RRULE (D18): the
 * specification describes nothing RRULE would be needed for, and the extra
 * generality would have to be mapped back onto the platform scheduler anyway.
 *
 * Pure, with `now` as a parameter, so the next-occurrence logic can be tested
 * across midnight, month ends and daylight-saving shifts without waiting.
 */

export const REPEAT_RULES = ['none', 'daily', 'weekdays', 'weekly'] as const;
export type RepeatRule = (typeof REPEAT_RULES)[number];

export interface ReminderSchedule {
  /** Epoch milliseconds of the first (or only) occurrence. */
  readonly scheduledAt: number;
  readonly repeat: RepeatRule;
}

const DAY_MS = 86_400_000;

/**
 * The next time a reminder should fire, at or after `now`.
 *
 * Returns null when a one-off reminder has already passed — it has nothing left
 * to fire, and scheduling it would deliver a notification about a moment that is
 * over.
 */
export function nextOccurrence(schedule: ReminderSchedule, now: number): number | null {
  if (!Number.isFinite(schedule.scheduledAt) || !Number.isFinite(now)) {
    throw new RangeError('scheduledAt and now must be finite timestamps');
  }

  if (schedule.scheduledAt >= now) {
    // Even a repeating reminder fires first at its chosen moment.
    if (schedule.repeat !== 'weekdays') return schedule.scheduledAt;
    return nextWeekdayAtSameTime(schedule.scheduledAt, schedule.scheduledAt);
  }

  switch (schedule.repeat) {
    case 'none':
      return null;

    case 'daily':
      return advanceByDays(schedule.scheduledAt, now, 1);

    case 'weekly':
      return advanceByDays(schedule.scheduledAt, now, 7);

    case 'weekdays':
      return nextWeekdayAtSameTime(schedule.scheduledAt, now);
  }
}

/**
 * Advances a past time forward in whole steps until it is at or after `now`.
 *
 * Steps day by day rather than adding a fixed span, so the wall-clock time is
 * preserved across a daylight-saving change: a 07:00 reminder stays at 07:00.
 */
function advanceByDays(scheduledAt: number, now: number, stepDays: number): number {
  const next = new Date(scheduledAt);

  // A coarse jump first, so a reminder untouched for years does not loop daily.
  const behindMs = now - next.getTime();
  if (behindMs > 0) {
    const wholeSteps = Math.floor(behindMs / (DAY_MS * stepDays));
    if (wholeSteps > 0) next.setDate(next.getDate() + wholeSteps * stepDays);
  }

  while (next.getTime() < now) {
    next.setDate(next.getDate() + stepDays);
  }

  return next.getTime();
}

/** Monday to Friday, keeping the original time of day. */
function nextWeekdayAtSameTime(scheduledAt: number, now: number): number {
  const next = new Date(scheduledAt);

  while (next.getTime() < now || isWeekend(next)) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime();
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Human-readable repeat description for the reminders list. */
export function describeRepeat(repeat: RepeatRule): string {
  switch (repeat) {
    case 'none':
      return 'Once';
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return 'Weekdays';
    case 'weekly':
      return 'Every week';
  }
}

/**
 * True when a one-off reminder is in the past and can no longer fire.
 *
 * Named for reminders specifically; the timer engine has its own `isExpired`
 * for a countdown reaching zero, which is a different question.
 */
export function isReminderExpired(schedule: ReminderSchedule, now: number): boolean {
  return nextOccurrence(schedule, now) === null;
}

/** Validates a reminder title the way the syllabus validators do. */
export function validateReminderTitle(
  title: string,
): { valid: true } | { valid: false; message: string } {
  const trimmed = title.trim();
  if (trimmed.length === 0) return { valid: false, message: 'Enter a title.' };
  if (trimmed.length > 100) return { valid: false, message: 'That title is too long.' };
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Choosing when a reminder fires
// ---------------------------------------------------------------------------

/** The most a reminder can be pushed out: a year, which no revision plan exceeds. */
const MAX_DELAY_MINUTES = 365 * 24 * 60;

/**
 * Reads a delay a student typed, in whatever shape they typed it.
 *
 * A reminder is an alarm, and an alarm the student cannot set for 25 minutes is
 * not one. Accepts "25", "25m", "1h", "1h 30", "1h30m", "90 min", "2 hours" —
 * because a person setting an alarm types the first thing that comes to mind,
 * and being told their input is invalid is the app's failure, not theirs.
 *
 * Returns null when nothing in the text is a duration, so the caller can say so
 * rather than silently scheduling something else.
 */
export function parseDelayMinutes(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (text.length === 0) return null;

  // "1h 30m", "1 hour 30", "1h30"
  const both = /^(\d+)\s*(?:h|hr|hrs|hour|hours)\s*(\d+)?\s*(?:m|min|mins|minute|minutes)?$/.exec(
    text,
  );
  if (both !== null) {
    const hours = Number(both[1]);
    const minutes = both[2] === undefined ? 0 : Number(both[2]);
    if (minutes > 59) return null;
    return clampDelay(hours * 60 + minutes);
  }

  const minutesOnly = /^(\d+)\s*(?:m|min|mins|minute|minutes)?$/.exec(text);
  if (minutesOnly !== null) return clampDelay(Number(minutesOnly[1]));

  return null;
}

function clampDelay(minutes: number): number | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes > MAX_DELAY_MINUTES ? null : minutes;
}

/**
 * Reads a clock time a student typed: "7:30", "07:05", "19:45", "7.30".
 *
 * Returns minutes since midnight, or null when it is not a time. Deliberately
 * 24-hour: a student typing "7:30" for a morning alarm and getting an evening
 * one has been failed by the app, and no am/pm guess is better than asking.
 */
export function parseClockTime(input: string): number | null {
  const match = /^(\d{1,2})\s*[:.]\s*(\d{2})$/.exec(input.trim());
  if (match === null) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/**
 * The next moment matching a clock time.
 *
 * A time that has already passed today means tomorrow. Setting "07:00" at nine
 * in the morning is a student planning tomorrow, not asking for an alarm that
 * fires immediately or never.
 */
export function nextTimeOfDay(minutesSinceMidnight: number, now: number): number {
  const at = new Date(now);
  at.setHours(Math.floor(minutesSinceMidnight / 60), minutesSinceMidnight % 60, 0, 0);

  if (at.getTime() <= now) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/** How long until a reminder fires, in the words a person would use. */
export function describeDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hoursPart = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;

  if (rest === 0) return hoursPart;
  return `${hoursPart} ${rest} ${rest === 1 ? 'minute' : 'minutes'}`;
}
