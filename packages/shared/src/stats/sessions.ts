/**
 * Aggregations over recorded study sessions, for the dashboard and history.
 *
 * Pure and time-zone aware by parameter: "today" depends on where the student is,
 * and a helper that quietly used UTC would show the wrong day's total to most of
 * the world for part of every day.
 */

/** The minimum a session must expose to be counted. */
export interface SessionLike {
  readonly startedAt: number;
  readonly durationSeconds: number;
  readonly subjectId?: string | null;
  readonly subjectName?: string | null;
}

/** Local calendar day as `YYYY-MM-DD`, derived from the device's own offset. */
export function localDayKey(timestampMs: number, now: Date = new Date(timestampMs)): string {
  if (!Number.isFinite(timestampMs)) {
    throw new RangeError(`timestampMs must be finite, received ${timestampMs}`);
  }
  const date = now;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Seconds studied on the calendar day containing `referenceMs`. */
export function secondsOnDay(sessions: readonly SessionLike[], referenceMs: number): number {
  const target = localDayKey(referenceMs);

  let total = 0;
  for (const session of sessions) {
    if (localDayKey(session.startedAt, new Date(session.startedAt)) === target) {
      total += Math.max(0, session.durationSeconds);
    }
  }
  return total;
}

export function totalSeconds(sessions: readonly SessionLike[]): number {
  let total = 0;
  for (const session of sessions) {
    total += Math.max(0, session.durationSeconds);
  }
  return total;
}

export interface DayTotal {
  /** `YYYY-MM-DD` in the device's local time. */
  readonly day: string;
  readonly seconds: number;
}

/**
 * Study time per day for the last `days` calendar days, oldest first.
 *
 * Days with no sessions are included with zero, so a chart has an unbroken axis
 * rather than silently collapsing the gaps and misrepresenting a streak.
 */
export function dailyTotals(
  sessions: readonly SessionLike[],
  referenceMs: number,
  days = 7,
): DayTotal[] {
  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError(`days must be a positive integer, received ${days}`);
  }

  const byDay = new Map<string, number>();
  for (const session of sessions) {
    const key = localDayKey(session.startedAt, new Date(session.startedAt));
    byDay.set(key, (byDay.get(key) ?? 0) + Math.max(0, session.durationSeconds));
  }

  const result: DayTotal[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(referenceMs);
    // setDate handles month and year boundaries, unlike subtracting milliseconds,
    // which also breaks across daylight-saving transitions.
    date.setDate(date.getDate() - offset);
    const key = localDayKey(date.getTime(), date);
    result.push({ day: key, seconds: byDay.get(key) ?? 0 });
  }

  return result;
}

export interface SubjectTotal {
  readonly subjectId: string;
  readonly subjectName: string;
  readonly seconds: number;
}

/**
 * Study time per subject, largest first.
 *
 * Sessions with no subject attached are omitted rather than bucketed under a
 * placeholder: they are real study time, but they belong to no subject, and
 * inventing one would misattribute them.
 */
export function totalsBySubject(sessions: readonly SessionLike[]): SubjectTotal[] {
  const bySubject = new Map<string, SubjectTotal>();

  for (const session of sessions) {
    const id = session.subjectId;
    if (id === null || id === undefined) continue;

    const existing = bySubject.get(id);
    const seconds = (existing?.seconds ?? 0) + Math.max(0, session.durationSeconds);
    bySubject.set(id, {
      subjectId: id,
      // A later session's snapshot wins, so a renamed subject shows its newer name.
      subjectName: session.subjectName ?? existing?.subjectName ?? 'Untitled subject',
      seconds,
    });
  }

  return [...bySubject.values()].sort((a, b) => b.seconds - a.seconds);
}

/**
 * Consecutive days with study time, counting back from the reference day.
 *
 * A day with no sessions ends the streak. The reference day itself not having
 * any study yet does *not* break it — a student checking the dashboard at
 * breakfast has not lost their streak.
 */
export function currentStreakDays(sessions: readonly SessionLike[], referenceMs: number): number {
  const studied = new Set<string>();
  for (const session of sessions) {
    if (session.durationSeconds > 0) {
      studied.add(localDayKey(session.startedAt, new Date(session.startedAt)));
    }
  }
  if (studied.size === 0) return 0;

  const dayAt = (offset: number): string => {
    const date = new Date(referenceMs);
    date.setDate(date.getDate() - offset);
    return localDayKey(date.getTime(), date);
  };

  // Today counts only if it has study; either way the streak continues from
  // yesterday backwards.
  let streak = studied.has(dayAt(0)) ? 1 : 0;
  for (let offset = 1; ; offset += 1) {
    if (!studied.has(dayAt(offset))) break;
    streak += 1;
  }

  return streak;
}
