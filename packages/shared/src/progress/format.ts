import type { Progress } from './progress';

/** Rendered when there is nothing to measure (see `Progress.percent === null`). */
export const EMPTY_PERCENT_PLACEHOLDER = '—';

export interface FormatPercentOptions {
  /** Decimal places to display. Defaults to 0 (`"30%"`). */
  readonly precision?: number;
  /** Text used when progress is unmeasurable. Defaults to an em dash. */
  readonly emptyPlaceholder?: string;
  /** Append a `%` sign. Defaults to true. */
  readonly withSymbol?: boolean;
}

/**
 * Formats progress for display.
 *
 * Guards against the two rounding lies that matter to a student trusting this
 * number: a syllabus at 99.96% must not render as "100%", and one at 0.02% must
 * not render as "0%". Only genuinely complete and genuinely untouched progress
 * is allowed to display those two values.
 */
export function formatPercent(
  input: Progress | number | null,
  options: FormatPercentOptions = {},
): string {
  const {
    precision = 0,
    emptyPlaceholder = EMPTY_PERCENT_PLACEHOLDER,
    withSymbol = true,
  } = options;

  if (!Number.isInteger(precision) || precision < 0 || precision > 20) {
    throw new RangeError(`precision must be an integer between 0 and 20, received ${precision}`);
  }

  const percent = typeof input === 'number' || input === null ? input : input.percent;
  if (percent === null || !Number.isFinite(percent)) return emptyPlaceholder;

  const clamped = Math.min(100, Math.max(0, percent));
  let text = clamped.toFixed(precision);

  // Rounding must never claim completion, or deny that work has started.
  if (Number.parseFloat(text) === 100 && clamped < 100) {
    text = nextBelow(100, precision);
  } else if (Number.parseFloat(text) === 0 && clamped > 0) {
    text = nextAbove(0, precision);
  }

  return withSymbol ? `${text}%` : text;
}

/** The largest representable value strictly below `value` at the given precision. */
function nextBelow(value: number, precision: number): string {
  const step = 10 ** -precision;
  return (value - step).toFixed(precision);
}

/** The smallest representable value strictly above `value` at the given precision. */
function nextAbove(value: number, precision: number): string {
  const step = 10 ** -precision;
  return (value + step).toFixed(precision);
}

/**
 * Formats the completed/total pair shown beside progress bars,
 * e.g. `"20/73"` for the "Parts Done" statistic.
 */
export function formatProgressRatio(progress: Progress): string {
  return `${progress.completed}/${progress.total}`;
}
