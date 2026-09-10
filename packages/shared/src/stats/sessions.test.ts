import { describe, expect, it } from 'vitest';
import {
  currentStreakDays,
  dailyTotals,
  localDayKey,
  secondsOnDay,
  totalSeconds,
  totalsBySubject,
  type SessionLike,
} from './sessions';

/** Local noon on a given date, so a timezone shift cannot slide it into another day. */
const at = (year: number, month: number, day: number, hour = 12): number =>
  new Date(year, month - 1, day, hour).getTime();

const session = (startedAt: number, durationSeconds: number, extra: Partial<SessionLike> = {}) => ({
  startedAt,
  durationSeconds,
  ...extra,
});

const TODAY = at(2026, 8, 23);

describe('localDayKey', () => {
  it('formats the local calendar day', () => {
    expect(localDayKey(at(2026, 8, 23))).toBe('2026-08-23');
  });

  it('zero-pads months and days', () => {
    expect(localDayKey(at(2026, 1, 5))).toBe('2026-01-05');
  });

  /** A session just before midnight belongs to that day, not the next one. */
  it('keeps late-evening sessions on their own day', () => {
    expect(localDayKey(at(2026, 8, 23, 23))).toBe('2026-08-23');
    expect(localDayKey(at(2026, 8, 24, 0))).toBe('2026-08-24');
  });

  it('rejects a non-finite timestamp', () => {
    expect(() => localDayKey(Number.NaN)).toThrow(RangeError);
  });
});

describe('secondsOnDay', () => {
  it('sums only sessions from the given day', () => {
    const sessions = [
      session(at(2026, 8, 23, 9), 1800),
      session(at(2026, 8, 23, 20), 900),
      session(at(2026, 8, 22, 20), 3600),
    ];

    expect(secondsOnDay(sessions, TODAY)).toBe(2700);
  });

  it('is zero when nothing was studied that day', () => {
    expect(secondsOnDay([session(at(2026, 8, 20), 3600)], TODAY)).toBe(0);
  });

  it('is zero for an empty history', () => {
    expect(secondsOnDay([], TODAY)).toBe(0);
  });

  it('ignores a negative duration rather than subtracting it', () => {
    expect(secondsOnDay([session(at(2026, 8, 23), -500)], TODAY)).toBe(0);
  });
});

describe('totalSeconds', () => {
  it('sums every session', () => {
    expect(totalSeconds([session(TODAY, 600), session(TODAY, 300)])).toBe(900);
  });

  it('is zero for no sessions', () => {
    expect(totalSeconds([])).toBe(0);
  });
});

describe('dailyTotals', () => {
  it('returns the requested number of days, oldest first', () => {
    const totals = dailyTotals([], TODAY, 7);

    expect(totals).toHaveLength(7);
    expect(totals[0]?.day).toBe('2026-08-17');
    expect(totals[6]?.day).toBe('2026-08-23');
  });

  /**
   * Days without study are included as zero. Collapsing them would compress the
   * axis and make a broken streak look continuous.
   */
  it('includes empty days as zero', () => {
    const totals = dailyTotals([session(at(2026, 8, 23), 1800)], TODAY, 3);

    expect(totals).toEqual([
      { day: '2026-08-21', seconds: 0 },
      { day: '2026-08-22', seconds: 0 },
      { day: '2026-08-23', seconds: 1800 },
    ]);
  });

  it('sums several sessions on the same day', () => {
    const totals = dailyTotals(
      [session(at(2026, 8, 23, 9), 600), session(at(2026, 8, 23, 18), 900)],
      TODAY,
      1,
    );

    expect(totals[0]?.seconds).toBe(1500);
  });

  it('ignores sessions outside the window', () => {
    const totals = dailyTotals([session(at(2026, 7, 1), 9999)], TODAY, 7);

    expect(totals.every((entry) => entry.seconds === 0)).toBe(true);
  });

  /** Subtracting fixed milliseconds would break here; setDate does not. */
  it('crosses a month boundary correctly', () => {
    const totals = dailyTotals([], at(2026, 9, 2), 4);

    expect(totals.map((entry) => entry.day)).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
  });

  it('rejects an invalid window', () => {
    expect(() => dailyTotals([], TODAY, 0)).toThrow(RangeError);
    expect(() => dailyTotals([], TODAY, -1)).toThrow(RangeError);
  });
});

describe('totalsBySubject', () => {
  it('groups by subject, largest first', () => {
    const sessions = [
      session(TODAY, 600, { subjectId: 'math', subjectName: 'Mathematics' }),
      session(TODAY, 1800, { subjectId: 'sci', subjectName: 'Science' }),
      session(TODAY, 300, { subjectId: 'math', subjectName: 'Mathematics' }),
    ];

    expect(totalsBySubject(sessions)).toEqual([
      { subjectId: 'sci', subjectName: 'Science', seconds: 1800 },
      { subjectId: 'math', subjectName: 'Mathematics', seconds: 900 },
    ]);
  });

  /**
   * Unattached sessions are real study time but belong to no subject; inventing
   * one would misattribute them.
   */
  it('omits sessions with no subject', () => {
    const sessions = [
      session(TODAY, 600, { subjectId: null }),
      session(TODAY, 300, { subjectId: 'math', subjectName: 'Mathematics' }),
    ];

    expect(totalsBySubject(sessions)).toHaveLength(1);
  });

  it('prefers the most recent name snapshot after a rename', () => {
    const sessions = [
      session(at(2026, 8, 20), 600, { subjectId: 'math', subjectName: 'Maths' }),
      session(at(2026, 8, 23), 600, { subjectId: 'math', subjectName: 'Mathematics' }),
    ];

    expect(totalsBySubject(sessions)[0]?.subjectName).toBe('Mathematics');
  });

  it('falls back when no name was ever recorded', () => {
    expect(totalsBySubject([session(TODAY, 60, { subjectId: 'x' })])[0]?.subjectName).toBe(
      'Untitled subject',
    );
  });

  it('is empty for no sessions', () => {
    expect(totalsBySubject([])).toEqual([]);
  });
});

describe('currentStreakDays', () => {
  it('counts consecutive days ending today', () => {
    const sessions = [
      session(at(2026, 8, 23), 600),
      session(at(2026, 8, 22), 600),
      session(at(2026, 8, 21), 600),
    ];

    expect(currentStreakDays(sessions, TODAY)).toBe(3);
  });

  it('stops at the first missed day', () => {
    const sessions = [session(at(2026, 8, 23), 600), session(at(2026, 8, 21), 600)];

    expect(currentStreakDays(sessions, TODAY)).toBe(1);
  });

  /**
   * Checking the dashboard at breakfast must not report the streak already
   * broken — yesterday's study still counts.
   */
  it('keeps yesterday’s streak alive before today’s first session', () => {
    const sessions = [session(at(2026, 8, 22), 600), session(at(2026, 8, 21), 600)];

    expect(currentStreakDays(sessions, TODAY)).toBe(2);
  });

  it('is zero when nothing was ever studied', () => {
    expect(currentStreakDays([], TODAY)).toBe(0);
  });

  it('ignores zero-length sessions', () => {
    expect(currentStreakDays([session(at(2026, 8, 23), 0)], TODAY)).toBe(0);
  });

  it('is zero when the last study was days ago', () => {
    expect(currentStreakDays([session(at(2026, 8, 10), 600)], TODAY)).toBe(0);
  });
});
