import { describe, expect, it } from 'vitest';
import { secondsBetween, formatClock, formatCompactDuration, formatHoursMinutes } from './duration';

const HOUR = 3600;
const DAY = 86_400;

describe('formatHoursMinutes', () => {
  it.each([
    [0, '0h 00m'],
    [59, '0h 00m'],
    [60, '0h 01m'],
    [4 * HOUR, '4h 00m'],
    [20 * HOUR + 11 * 60, '20h 11m'],
    [2 * HOUR + 20 * 60, '2h 20m'],
    [5 * HOUR + 30 * 60, '5h 30m'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatHoursMinutes(seconds)).toBe(expected);
  });

  it('does not roll over to days', () => {
    expect(formatHoursMinutes(30 * HOUR)).toBe('30h 00m');
  });

  it('clamps negative input to zero rather than throwing', () => {
    expect(formatHoursMinutes(-5)).toBe('0h 00m');
  });

  it('rejects non-finite input', () => {
    expect(() => formatHoursMinutes(Number.NaN)).toThrow(RangeError);
  });
});

describe('formatCompactDuration', () => {
  it('stays in hours below a day', () => {
    expect(formatCompactDuration(13 * HOUR + 4 * 60)).toBe('13h 04m');
  });

  it('rolls over to days at and beyond 24 hours', () => {
    expect(formatCompactDuration(DAY)).toBe('1d 00h');
    expect(formatCompactDuration(2 * DAY + 7 * HOUR)).toBe('2d 07h');
  });

  it('switches format exactly at the day boundary', () => {
    expect(formatCompactDuration(DAY - 1)).toBe('23h 59m');
    expect(formatCompactDuration(DAY)).toBe('1d 00h');
  });
});

describe('formatClock', () => {
  it.each([
    [0, '00:00:00'],
    [21 * 60 + 25, '00:21:25'],
    [24 * 60 + 27, '00:24:27'],
    [HOUR, '01:00:00'],
    [3 * HOUR + 5 * 60 + 9, '03:05:09'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected);
  });

  it('keeps counting past 24 hours without wrapping', () => {
    expect(formatClock(25 * HOUR)).toBe('25:00:00');
  });
});

describe('secondsBetween', () => {
  it('returns whole seconds between two timestamps', () => {
    expect(secondsBetween(1000, 6000)).toBe(5);
  });

  it('truncates partial seconds', () => {
    expect(secondsBetween(0, 1999)).toBe(1);
  });

  /**
   * A device clock can move backwards (NTP correction, manual change). A study
   * session must render 0 rather than a negative duration.
   */
  it('never returns a negative duration when the clock moves backwards', () => {
    expect(secondsBetween(10_000, 5000)).toBe(0);
  });

  it('rejects non-finite timestamps', () => {
    expect(() => secondsBetween(Number.NaN, 0)).toThrow(RangeError);
    expect(() => secondsBetween(0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
