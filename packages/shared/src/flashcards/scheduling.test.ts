import { describe, expect, it } from 'vitest';
import {
  CARD_RATINGS,
  DEFAULT_EASE,
  MINIMUM_EASE,
  RELEARN_DELAY_MS,
  REVIEW_DELAYS,
  dueCards,
  formatCountdown,
  formatInterval,
  newSchedule,
  nextDueAt,
  previewIntervals,
  reviewCard,
  scheduleWithDelay,
  type CardSchedule,
} from './scheduling';

const NOW = Date.UTC(2026, 7, 26, 9, 0);
const DAY = 24 * 60 * 60 * 1000;

const daysUntil = (schedule: CardSchedule, from = NOW) => Math.round((schedule.dueAt - from) / DAY);

describe('a card that has never been reviewed', () => {
  it('is due immediately', () => {
    expect(newSchedule(NOW).dueAt).toBe(NOW);
  });

  it('starts at the default ease with nothing learned', () => {
    expect(newSchedule(NOW)).toMatchObject({
      easeFactor: DEFAULT_EASE,
      intervalDays: 0,
      repetitions: 0,
      lapses: 0,
    });
  });
});

describe('the SM-2 interval ladder', () => {
  it('goes 1 day, then 6, then grows by the ease', () => {
    let schedule = newSchedule(NOW);

    schedule = reviewCard(schedule, 'good', NOW);
    expect(schedule.intervalDays).toBe(1);

    schedule = reviewCard(schedule, 'good', NOW);
    expect(schedule.intervalDays).toBe(6);

    schedule = reviewCard(schedule, 'good', NOW);
    // 6 * 2.5 = 15
    expect(schedule.intervalDays).toBe(15);
  });

  it('sets the due date the interval away', () => {
    const schedule = reviewCard(newSchedule(NOW), 'good', NOW);

    expect(daysUntil(schedule)).toBe(1);
  });

  it('never schedules a recalled card less than a day out', () => {
    // A card with a tiny interval and the minimum ease must still round up to a
    // day, or it returns forever.
    const stubborn: CardSchedule = {
      easeFactor: MINIMUM_EASE,
      intervalDays: 0,
      repetitions: 5,
      dueAt: NOW,
      lapses: 4,
    };

    expect(reviewCard(stubborn, 'good', NOW).intervalDays).toBeGreaterThanOrEqual(1);
  });
});

describe('ease', () => {
  it('rises on an easy recall and falls on a hard one', () => {
    const easy = reviewCard(newSchedule(NOW), 'easy', NOW).easeFactor;
    const hard = reviewCard(newSchedule(NOW), 'hard', NOW).easeFactor;

    expect(easy).toBeGreaterThan(DEFAULT_EASE);
    expect(hard).toBeLessThan(DEFAULT_EASE);
  });

  it('leaves the ease alone on a plain "good"', () => {
    expect(reviewCard(newSchedule(NOW), 'good', NOW).easeFactor).toBe(DEFAULT_EASE);
  });

  /**
   * Without a floor, a repeatedly failed card drives its own ease toward zero
   * and its interval with it — returning every few seconds, forever.
   */
  it('never falls below the floor however often the card is failed', () => {
    let schedule = newSchedule(NOW);
    for (let i = 0; i < 40; i += 1) schedule = reviewCard(schedule, 'again', NOW);

    expect(schedule.easeFactor).toBe(MINIMUM_EASE);
  });

  it('keeps the ease to two decimals so a stored value survives a round trip', () => {
    const schedule = reviewCard(newSchedule(NOW), 'hard', NOW);

    expect(schedule.easeFactor).toBe(Number(schedule.easeFactor.toFixed(2)));
  });
});

describe('a lapse', () => {
  it('sends the card back to the beginning', () => {
    let schedule = newSchedule(NOW);
    schedule = reviewCard(schedule, 'good', NOW);
    schedule = reviewCard(schedule, 'good', NOW);
    expect(schedule.repetitions).toBe(2);

    schedule = reviewCard(schedule, 'again', NOW);

    expect(schedule.repetitions).toBe(0);
    expect(schedule.intervalDays).toBe(0);
  });

  it('shows the card again in the same sitting, not tomorrow', () => {
    // The card you just failed is the one you most need to see again now.
    const schedule = reviewCard(newSchedule(NOW), 'again', NOW);

    expect(schedule.dueAt).toBe(NOW + RELEARN_DELAY_MS);
  });

  it('is counted, so a troublesome card can be found later', () => {
    let schedule = reviewCard(newSchedule(NOW), 'again', NOW);
    schedule = reviewCard(schedule, 'again', NOW);

    expect(schedule.lapses).toBe(2);
  });

  it('does not count a successful review as a lapse', () => {
    expect(reviewCard(newSchedule(NOW), 'good', NOW).lapses).toBe(0);
  });
});

describe('previewing the buttons', () => {
  it('offers a delay for every rating', () => {
    const preview = previewIntervals(newSchedule(NOW), NOW);

    expect(Object.keys(preview).sort()).toEqual([...CARD_RATINGS].sort());
  });

  it('orders them from soonest to furthest away', () => {
    // A student choosing between the buttons is choosing between these delays,
    // so "easy" must not come back sooner than "good".
    let schedule = newSchedule(NOW);
    schedule = reviewCard(schedule, 'good', NOW);
    schedule = reviewCard(schedule, 'good', NOW);
    schedule = reviewCard(schedule, 'good', NOW);

    const preview = previewIntervals(schedule, NOW);

    expect(preview.again).toBeLessThan(preview.hard);
    expect(preview.hard).toBeLessThanOrEqual(preview.good);
    expect(preview.good).toBeLessThanOrEqual(preview.easy);
  });

  it('does not change the card it previews', () => {
    const schedule = newSchedule(NOW);
    previewIntervals(schedule, NOW);

    expect(schedule).toEqual(newSchedule(NOW));
  });
});

describe('formatInterval', () => {
  it('reads in the unit that fits', () => {
    expect(formatInterval(60_000)).toBe('1m');
    expect(formatInterval(3 * 60 * 60 * 1000)).toBe('3h');
    expect(formatInterval(6 * DAY)).toBe('6d');
    expect(formatInterval(60 * DAY)).toBe('2mo');
    expect(formatInterval(547 * DAY)).toBe('1.5y');
  });

  it('never rounds a real delay down to nothing', () => {
    // "0m" would read as "immediately", which is not what happened.
    expect(formatInterval(1000)).toBe('1m');
  });
});

describe('dueCards', () => {
  it('takes only what is due, soonest first', () => {
    const cards = [
      { id: 'later', dueAt: NOW + DAY },
      { id: 'overdue', dueAt: NOW - 2 * DAY },
      { id: 'now', dueAt: NOW },
    ];

    expect(dueCards(cards, NOW).map((card) => card.id)).toEqual(['overdue', 'now']);
  });

  it('is empty when nothing is due', () => {
    expect(dueCards([{ id: 'a', dueAt: NOW + 1 }], NOW)).toEqual([]);
  });
});

describe('a bad clock', () => {
  /** A NaN would schedule every card to an unreachable date, silently. */
  it('is refused rather than scheduling into nowhere', () => {
    expect(() => reviewCard(newSchedule(NOW), 'good', Number.NaN)).toThrow(RangeError);
    expect(() => reviewCard(newSchedule(NOW), 'good', Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });
});

/**
 * Published SM-2 jumps straight to a one-day interval, which makes "hard",
 * "good" and "easy" produce the same first result — three buttons that look
 * like a choice and are not. Learning steps are what make them four answers.
 */
describe('learning steps on a new card', () => {
  const preview = () => previewIntervals(newSchedule(NOW), NOW);

  it('gives every button a different delay', () => {
    const p = preview();
    const distinct = new Set(Object.values(p));

    expect(distinct.size).toBe(4);
  });

  it('reads the way the buttons will be labelled', () => {
    const p = preview();

    expect(formatInterval(p.again)).toBe('1m');
    expect(formatInterval(p.hard)).toBe('6m');
    expect(formatInterval(p.good)).toBe('1d');
    expect(formatInterval(p.easy)).toBe('4d');
  });

  it('keeps a hard card in learning rather than graduating it', () => {
    const schedule = reviewCard(newSchedule(NOW), 'hard', NOW);

    expect(schedule.repetitions).toBe(0);
    expect(schedule.intervalDays).toBe(0);
  });

  it('does not count a hard answer as a lapse', () => {
    // The student did recall it, just with effort.
    expect(reviewCard(newSchedule(NOW), 'hard', NOW).lapses).toBe(0);
  });

  it('graduates a card answered easy straight past the first day', () => {
    const schedule = reviewCard(newSchedule(NOW), 'easy', NOW);

    expect(schedule.intervalDays).toBe(4);
    expect(schedule.repetitions).toBe(1);
  });

  it('still steps 1, 6, then by the ease once graduated', () => {
    let schedule = reviewCard(newSchedule(NOW), 'good', NOW);
    expect(schedule.intervalDays).toBe(1);

    schedule = reviewCard(schedule, 'good', NOW);
    expect(schedule.intervalDays).toBe(6);

    schedule = reviewCard(schedule, 'hard', NOW);
    // Graduated cards use the ease, so "hard" no longer repeats a step.
    expect(schedule.intervalDays).toBeGreaterThan(6);
  });
});

describe('the same card described twice', () => {
  /**
   * A card scheduled a day out is a few milliseconds short of one by the time
   * the list renders it. Rounding that to "24h" while the button that set it
   * said "1d" makes one card look like two different answers.
   */
  it('reads as a day whether it is measured before or after the click', () => {
    expect(formatInterval(24 * 60 * 60 * 1000)).toBe('1d');
    expect(formatInterval(24 * 60 * 60 * 1000 - 500)).toBe('1d');
  });

  it('still reads in hours below a day', () => {
    expect(formatInterval(23 * 60 * 60 * 1000)).toBe('23h');
  });
});

/**
 * The four buttons a student presses after seeing the answer. Fixed delays, so
 * the label always says what the button does.
 */
describe('scheduling a card with a chosen delay', () => {
  const NOW = 1_700_000_000_000;
  const card = (overrides: Partial<CardSchedule> = {}): CardSchedule => ({
    dueAt: NOW,
    intervalDays: 1,
    repetitions: 3,
    easeFactor: 2.5,
    lapses: 0,
    ...overrides,
  });

  it.each([
    ['5m' as const, 5 * 60_000],
    ['1d' as const, 24 * 60 * 60_000],
    ['2d' as const, 2 * 24 * 60 * 60_000],
    ['4d' as const, 4 * 24 * 60 * 60_000],
  ])('%s brings the card back after exactly that long', (key, ms) => {
    expect(scheduleWithDelay(card(), key, NOW).dueAt).toBe(NOW + ms);
  });

  it('offers exactly the four the student was promised', () => {
    expect(REVIEW_DELAYS.map((option) => option.key)).toEqual(['5m', '1d', '2d', '4d']);
  });

  /** The shortest delay is the student saying they did not know it. */
  it('counts the shortest delay as a lapse and resets the streak', () => {
    const after = scheduleWithDelay(card({ repetitions: 4, lapses: 1 }), '5m', NOW);

    expect(after.repetitions).toBe(0);
    expect(after.lapses).toBe(2);
  });

  it('lowers the ease when the card was forgotten', () => {
    expect(scheduleWithDelay(card({ easeFactor: 2.5 }), '5m', NOW).easeFactor).toBeCloseTo(2.3);
  });

  it('never drops the ease below the floor', () => {
    expect(scheduleWithDelay(card({ easeFactor: MINIMUM_EASE }), '5m', NOW).easeFactor).toBe(
      MINIMUM_EASE,
    );
  });

  it('counts a longer delay as another successful repetition', () => {
    const after = scheduleWithDelay(card({ repetitions: 3 }), '2d', NOW);

    expect(after.repetitions).toBe(4);
    expect(after.lapses).toBe(0);
  });

  it('leaves the ease alone when the card was remembered', () => {
    expect(scheduleWithDelay(card({ easeFactor: 2.5 }), '4d', NOW).easeFactor).toBe(2.5);
  });

  it('records the interval in days, so the history stays readable', () => {
    expect(scheduleWithDelay(card(), '2d', NOW).intervalDays).toBe(2);
  });
});

describe('when the next card is due', () => {
  it('is the soonest of them', () => {
    expect(nextDueAt([{ dueAt: 500 }, { dueAt: 100 }, { dueAt: 900 }])).toBe(100);
  });

  it('is null for an empty deck', () => {
    expect(nextDueAt([])).toBeNull();
  });
});

/**
 * "Nothing due right now" reads as "there is nothing here", which is the
 * opposite of what a full deck on a schedule means.
 */
describe('counting down to the next card', () => {
  it.each([
    [0, 'now'],
    [-5_000, 'now'],
    [60_000, '1m'],
    [25 * 60_000, '25m'],
    [59 * 60_000, '59m'],
    [60 * 60_000, '1h'],
    [(4 * 60 + 32) * 60_000, '4h 32m'],
    [23 * 60 * 60_000, '23h'],
    [24 * 60 * 60_000, '1d'],
    [(24 + 5) * 60 * 60_000, '1d 5h'],
    [4 * 24 * 60 * 60_000, '4d'],
  ])('describes %ims as %s', (ms, expected) => {
    expect(formatCountdown(ms)).toBe(expected);
  });

  /** Rounding down would say "0m" for a card that is not actually ready. */
  it('rounds part-minutes up, so it never claims a card is ready early', () => {
    expect(formatCountdown(30_000)).toBe('1m');
  });
});
