/**
 * Spaced repetition, SM-2.
 *
 * The algorithm behind Anki and SuperMemo: each card carries an *ease factor*
 * and an *interval*, the interval grows by the ease each time the card is
 * recalled, and a lapse sends it back to the start. Getting a card right early
 * and often is what pushes it far into the future; that is the whole mechanism.
 *
 * Kept here, pure and separate from storage, because the scheduling is the part
 * that has to be right — a wrong interval is invisible for weeks and then shows
 * up as a card a student never saw again.
 */

/** What the student said when the answer was revealed. */
export const CARD_RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type CardRating = (typeof CARD_RATINGS)[number];

/** SM-2 grades. Below 3 is a lapse. */
const GRADE: Record<CardRating, number> = { again: 0, hard: 3, good: 4, easy: 5 };

/**
 * The floor SM-2 puts on the ease factor.
 *
 * Without it a repeatedly failed card drives its own ease toward zero and its
 * interval with it, so it returns every few seconds forever.
 */
export const MINIMUM_EASE = 1.3;
export const DEFAULT_EASE = 2.5;

/** The first two intervals are fixed by SM-2 rather than derived from the ease. */
const FIRST_INTERVAL_DAYS = 1;
const SECOND_INTERVAL_DAYS = 6;

/**
 * Learning steps, before a card graduates to day-scale intervals.
 *
 * SM-2 as published jumps straight to one day, which makes "hard", "good" and
 * "easy" produce an identical first interval — three buttons that look like a
 * choice and are not. Every implementation people actually use adds sub-day
 * steps, so a card you just failed comes back in this sitting and a card you
 * found hard comes back within the hour.
 */
export const RELEARN_DELAY_MS = 60_000;
export const HARD_STEP_MS = 6 * 60_000;
/** A card answered "easy" first time skips ahead rather than waiting a day. */
export const EASY_FIRST_INTERVAL_DAYS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CardSchedule {
  /** SM-2 ease factor. Higher means the interval grows faster. */
  readonly easeFactor: number;
  /** Days until the next review. Zero while the card is still being learned. */
  readonly intervalDays: number;
  /** Consecutive successful recalls. Reset to zero by a lapse. */
  readonly repetitions: number;
  /** When the card is next due, in epoch milliseconds. */
  readonly dueAt: number;
  /** How many times this card has ever lapsed, for surfacing troublesome cards. */
  readonly lapses: number;
}

/** A card that has never been reviewed is due immediately. */
export function newSchedule(now: number): CardSchedule {
  return {
    easeFactor: DEFAULT_EASE,
    intervalDays: 0,
    repetitions: 0,
    dueAt: now,
    lapses: 0,
  };
}

/**
 * Applies one review.
 *
 * @throws {RangeError} if `now` is not a finite timestamp. A bad clock would
 * schedule every card to an unreachable date, which is silent and unrecoverable.
 */
export function reviewCard(schedule: CardSchedule, rating: CardRating, now: number): CardSchedule {
  if (!Number.isFinite(now)) {
    throw new RangeError(`now must be a finite timestamp, received ${now}`);
  }

  const grade = GRADE[rating];
  const ease = nextEase(schedule.easeFactor, grade);

  // A lapse: back to the beginning, and shown again in this sitting.
  if (grade < 3) {
    return {
      easeFactor: ease,
      intervalDays: 0,
      repetitions: 0,
      dueAt: now + RELEARN_DELAY_MS,
      lapses: schedule.lapses + 1,
    };
  }

  // Still learning: "hard" repeats the step within the hour rather than
  // graduating, so the four buttons stay four distinct answers.
  if (rating === 'hard' && schedule.repetitions === 0) {
    return {
      easeFactor: ease,
      intervalDays: 0,
      repetitions: 0,
      dueAt: now + HARD_STEP_MS,
      lapses: schedule.lapses,
    };
  }

  const repetitions = schedule.repetitions + 1;
  const intervalDays =
    repetitions === 1
      ? rating === 'easy'
        ? EASY_FIRST_INTERVAL_DAYS
        : FIRST_INTERVAL_DAYS
      : repetitions === 2
        ? SECOND_INTERVAL_DAYS
        : Math.max(1, Math.round(schedule.intervalDays * ease));

  return {
    easeFactor: ease,
    intervalDays,
    repetitions,
    dueAt: now + intervalDays * DAY_MS,
    lapses: schedule.lapses,
  };
}

/**
 * SM-2's ease adjustment.
 *
 * `EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))`, floored. A perfect recall
 * nudges the ease up, a hard one pulls it down, and "good" leaves it alone.
 */
function nextEase(current: number, grade: number): number {
  const delta = 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02);
  return Math.max(MINIMUM_EASE, roundEase(current + delta));
}

/** Two decimals, so an ease stored and reloaded is the same number it was. */
function roundEase(value: number): number {
  return Math.round(value * 100) / 100;
}

/** What each button will do, for labelling them honestly before they are pressed. */
export function previewIntervals(schedule: CardSchedule, now: number): Record<CardRating, number> {
  const preview = {} as Record<CardRating, number>;
  for (const rating of CARD_RATINGS) {
    preview[rating] = reviewCard(schedule, rating, now).dueAt - now;
  }
  return preview;
}

/** A short human form of a delay: "1m", "6d", "2mo". */
export function formatInterval(ms: number): string {
  if (ms < 60 * 60 * 1000) return `${Math.max(1, Math.round(ms / 60_000))}m`;

  const hours = Math.round(ms / (60 * 60 * 1000));
  // A card scheduled a day out is a few milliseconds short of one by the time it
  // is rendered, which rounded to "24h" while the button that set it said "1d".
  // The same card must not describe itself two ways.
  if (hours < 24) return `${hours}h`;

  const days = Math.round(ms / DAY_MS);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

/** Cards due at or before `now`, soonest first. */
export function dueCards<T extends { readonly dueAt: number }>(
  cards: readonly T[],
  now: number,
): T[] {
  return cards.filter((card) => card.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
}

// ---------------------------------------------------------------------------
// Choosing when a card comes back
// ---------------------------------------------------------------------------

/**
 * The four delays a student picks from after seeing the answer.
 *
 * Fixed rather than computed. SM-2 grows an interval as a card is remembered,
 * which is better spacing but means the button labels change every review — the
 * student cannot learn what "1d" does because on a mature card it is not a day.
 * These four say exactly what they do, which is what makes the choice a
 * judgement about the card rather than a guess about the algorithm.
 */
export const REVIEW_DELAYS = [
  { key: '5m', label: '5m', description: 'in 5 minutes', ms: 5 * 60_000 },
  { key: '1d', label: '1d', description: 'in 1 day', ms: 24 * 60 * 60_000 },
  { key: '2d', label: '2d', description: 'in 2 days', ms: 2 * 24 * 60 * 60_000 },
  { key: '4d', label: '4d', description: 'in 4 days', ms: 4 * 24 * 60 * 60_000 },
] as const;

export type ReviewDelayKey = (typeof REVIEW_DELAYS)[number]['key'];

/**
 * Applies a chosen delay to a card.
 *
 * The SM-2 bookkeeping is kept up to date underneath — repetitions, lapses and
 * ease still move — so the record of how a card has gone is not lost, and a
 * future change of scheduler has something to work from. Only `dueAt` comes
 * from the student's choice.
 */
export function scheduleWithDelay(
  schedule: CardSchedule,
  key: ReviewDelayKey,
  now: number,
): CardSchedule {
  const delay = REVIEW_DELAYS.find((option) => option.key === key);
  if (delay === undefined) return schedule;

  // Choosing the shortest delay is the student saying they did not know it.
  const forgotten = key === '5m';

  return {
    dueAt: now + delay.ms,
    intervalDays: delay.ms / (24 * 60 * 60_000),
    repetitions: forgotten ? 0 : schedule.repetitions + 1,
    lapses: forgotten ? schedule.lapses + 1 : schedule.lapses,
    easeFactor: forgotten ? Math.max(MINIMUM_EASE, schedule.easeFactor - 0.2) : schedule.easeFactor,
  };
}

/** The soonest a card comes back, or null when the deck is empty. */
export function nextDueAt<T extends { readonly dueAt: number }>(
  cards: readonly T[],
): number | null {
  if (cards.length === 0) return null;
  return cards.reduce((soonest, card) => Math.min(soonest, card.dueAt), Number.POSITIVE_INFINITY);
}

/**
 * How long until the next card, in the words a person would use.
 *
 * "Nothing due right now" reads as "there is nothing here", which is the
 * opposite of what a full deck on a schedule means. A countdown says the work
 * is waiting, and when.
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'now';

  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}
