import { describe, expect, it } from 'vitest';
import {
  describeDelay,
  describeRepeat,
  isReminderExpired,
  nextOccurrence,
  nextTimeOfDay,
  parseClockTime,
  parseDelayMinutes,
  validateReminderTitle,
  type RepeatRule,
} from './schedule';

/** Local wall-clock time, so a timezone offset cannot shift the day. */
const at = (year: number, month: number, day: number, hour = 7, minute = 0): number =>
  new Date(year, month - 1, day, hour, minute).getTime();

// 2026-08-24 is a Monday.
const MONDAY = at(2026, 8, 24);
const schedule = (scheduledAt: number, repeat: RepeatRule) => ({ scheduledAt, repeat });

describe('a reminder that has not fired yet', () => {
  it.each(['none', 'daily', 'weekly'] as const)('fires at its chosen time (%s)', (repeat) => {
    const future = at(2026, 8, 25, 9);

    expect(nextOccurrence(schedule(future, repeat), MONDAY)).toBe(future);
  });

  it('is not expired', () => {
    expect(isReminderExpired(schedule(at(2026, 8, 25), 'none'), MONDAY)).toBe(false);
  });
});

describe('a one-off reminder', () => {
  /** Nothing left to fire; scheduling it would notify about a past moment. */
  it('has no next occurrence once it has passed', () => {
    expect(nextOccurrence(schedule(at(2026, 8, 23), 'none'), MONDAY)).toBeNull();
  });

  it('is reported as expired', () => {
    expect(isReminderExpired(schedule(at(2026, 8, 23), 'none'), MONDAY)).toBe(true);
  });

  it('still fires when it is exactly now', () => {
    expect(nextOccurrence(schedule(MONDAY, 'none'), MONDAY)).toBe(MONDAY);
  });
});

describe('a daily reminder', () => {
  it('moves to tomorrow once today has passed', () => {
    const yesterdayMorning = at(2026, 8, 23, 7);

    expect(nextOccurrence(schedule(yesterdayMorning, 'daily'), MONDAY)).toBe(at(2026, 8, 24, 7));
  });

  it('keeps its time of day', () => {
    const next = nextOccurrence(schedule(at(2026, 8, 20, 6, 30), 'daily'), MONDAY);

    expect(new Date(next!).getHours()).toBe(6);
    expect(new Date(next!).getMinutes()).toBe(30);
  });

  /** A reminder untouched for years must not be advanced one day at a time. */
  it('catches up from long ago without looping day by day', () => {
    const next = nextOccurrence(schedule(at(2020, 1, 1, 8), 'daily'), MONDAY);

    expect(next).toBeGreaterThanOrEqual(MONDAY);
    expect(new Date(next!).getHours()).toBe(8);
  });

  it('crosses a month boundary', () => {
    const next = nextOccurrence(schedule(at(2026, 8, 31, 7), 'daily'), at(2026, 9, 1, 8));

    expect(next).toBe(at(2026, 9, 2, 7));
  });
});

describe('a weekly reminder', () => {
  it('moves forward a week', () => {
    expect(nextOccurrence(schedule(at(2026, 8, 17, 7), 'weekly'), MONDAY)).toBe(at(2026, 8, 24, 7));
  });

  it('lands on the same weekday', () => {
    const next = nextOccurrence(schedule(at(2026, 8, 19, 7), 'weekly'), MONDAY);

    expect(new Date(next!).getDay()).toBe(new Date(at(2026, 8, 19)).getDay());
  });
});

describe('a weekdays reminder', () => {
  it('skips Saturday and Sunday', () => {
    // Friday 21 Aug has passed; the next weekday is Monday 24.
    expect(nextOccurrence(schedule(at(2026, 8, 21, 7), 'weekdays'), at(2026, 8, 22, 8))).toBe(
      at(2026, 8, 24, 7),
    );
  });

  it('moves a Saturday reminder to the following Monday', () => {
    const saturday = at(2026, 8, 29, 7);

    expect(nextOccurrence(schedule(saturday, 'weekdays'), at(2026, 8, 28, 8))).toBe(
      at(2026, 8, 31, 7),
    );
  });

  it('fires the next day when that day is a weekday', () => {
    expect(nextOccurrence(schedule(at(2026, 8, 24, 7), 'weekdays'), at(2026, 8, 24, 8))).toBe(
      at(2026, 8, 25, 7),
    );
  });

  it('never returns a weekend', () => {
    for (let day = 20; day <= 31; day += 1) {
      const next = nextOccurrence(schedule(at(2026, 8, day, 7), 'weekdays'), at(2026, 8, 20, 8));
      const weekday = new Date(next!).getDay();

      expect(weekday).toBeGreaterThanOrEqual(1);
      expect(weekday).toBeLessThanOrEqual(5);
    }
  });
});

describe('input validation', () => {
  it('rejects a non-finite timestamp', () => {
    expect(() => nextOccurrence(schedule(Number.NaN, 'daily'), MONDAY)).toThrow(RangeError);
    expect(() => nextOccurrence(schedule(MONDAY, 'daily'), Number.NaN)).toThrow(RangeError);
  });
});

describe('describeRepeat', () => {
  it.each([
    ['none', 'Once'],
    ['daily', 'Every day'],
    ['weekdays', 'Weekdays'],
    ['weekly', 'Every week'],
  ] as const)('describes %s as %s', (repeat, expected) => {
    expect(describeRepeat(repeat)).toBe(expected);
  });
});

describe('validateReminderTitle', () => {
  it('accepts a normal title', () => {
    expect(validateReminderTitle('Revise polynomials').valid).toBe(true);
  });

  it('rejects a blank title', () => {
    const result = validateReminderTitle('   ');
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.message).toBe('Enter a title.');
  });

  it('rejects an excessively long title', () => {
    expect(validateReminderTitle('a'.repeat(101)).valid).toBe(false);
  });
});

/**
 * A reminder the student cannot set for 25 minutes is not an alarm. These
 * accept whatever a person types when they are thinking about time, rather
 * than teaching them a format first.
 */
describe('reading a delay a student typed', () => {
  it.each([
    ['25', 25],
    ['25m', 25],
    ['25 min', 25],
    ['25 minutes', 25],
    ['90', 90],
    ['1h', 60],
    ['1 hour', 60],
    ['2 hours', 120],
    ['1h 30m', 90],
    ['1h30', 90],
    ['1 hour 30 minutes', 90],
    ['  45  ', 45],
    ['1H', 60],
  ])('reads %s as %i minutes', (input, expected) => {
    expect(parseDelayMinutes(input)).toBe(expected);
  });

  it('allows a single minute', () => {
    expect(parseDelayMinutes('1')).toBe(1);
  });

  it.each([[''], ['   '], ['soon'], ['-5'], ['0'], ['abc'], ['1h 75m'], ['12:30']])(
    'refuses %s rather than guessing',
    (input) => {
      expect(parseDelayMinutes(input)).toBeNull();
    },
  );

  /** Beyond a year is a typo, not a revision plan. */
  it('refuses a delay longer than a year', () => {
    expect(parseDelayMinutes('600000')).toBeNull();
  });
});

describe('reading a clock time', () => {
  it.each([
    ['7:30', 450],
    ['07:30', 450],
    ['19:45', 1185],
    ['00:00', 0],
    ['23:59', 1439],
    ['7.30', 450],
  ])('reads %s', (input, expected) => {
    expect(parseClockTime(input)).toBe(expected);
  });

  it.each([['24:00'], ['7:60'], ['730'], ['7'], [''], ['half seven']])('refuses %s', (input) => {
    expect(parseClockTime(input)).toBeNull();
  });
});

describe('when a clock time next comes round', () => {
  const NINE_AM = new Date('2026-03-01T09:00:00').getTime();

  it('is later today when the time has not passed', () => {
    const at = nextTimeOfDay(19 * 60, NINE_AM);

    expect(new Date(at).getHours()).toBe(19);
    expect(new Date(at).getDate()).toBe(1);
  });

  /** "07:00" set at nine is a student planning tomorrow, not asking for nothing. */
  it('is tomorrow when the time has already gone', () => {
    const at = nextTimeOfDay(7 * 60, NINE_AM);

    expect(new Date(at).getHours()).toBe(7);
    expect(new Date(at).getDate()).toBe(2);
  });

  it('is tomorrow when the time is exactly now', () => {
    expect(nextTimeOfDay(9 * 60, NINE_AM)).toBeGreaterThan(NINE_AM);
  });

  it('lands on the minute, with no leftover seconds', () => {
    const at = nextTimeOfDay(19 * 60 + 45, NINE_AM);

    expect(new Date(at).getSeconds()).toBe(0);
    expect(new Date(at).getMilliseconds()).toBe(0);
  });
});

describe('saying how long until it fires', () => {
  it.each([
    [1, '1 minute'],
    [25, '25 minutes'],
    [60, '1 hour'],
    [120, '2 hours'],
    [90, '1 hour 30 minutes'],
    [61, '1 hour 1 minute'],
  ])('describes %i minutes as %s', (minutes, expected) => {
    expect(describeDelay(minutes)).toBe(expected);
  });
});
