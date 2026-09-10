import { describe, expect, it } from 'vitest';
import { EMPTY_PERCENT_PLACEHOLDER, formatPercent, formatProgressRatio } from './format';
import { makeProgress } from './progress';

describe('formatPercent', () => {
  it('formats a whole percentage with no decimals by default', () => {
    expect(formatPercent(makeProgress(3, 10))).toBe('30%');
  });

  it('honours the requested precision', () => {
    // The dashboard "Completed" figure in the design reference shows two decimals.
    expect(formatPercent(39.5714, { precision: 2 })).toBe('39.57%');
    expect(formatPercent(makeProgress(1, 2), { precision: 1 })).toBe('50.0%');
  });

  it('renders the empty placeholder when progress is unmeasurable', () => {
    expect(formatPercent(makeProgress(0, 0))).toBe(EMPTY_PERCENT_PLACEHOLDER);
    expect(formatPercent(null)).toBe(EMPTY_PERCENT_PLACEHOLDER);
  });

  it('accepts a custom empty placeholder', () => {
    expect(formatPercent(null, { emptyPlaceholder: 'n/a' })).toBe('n/a');
  });

  it('can omit the percent symbol', () => {
    expect(formatPercent(42, { withSymbol: false })).toBe('42');
  });

  it('accepts a bare number as well as a Progress', () => {
    expect(formatPercent(75)).toBe('75%');
  });

  describe('rounding honesty', () => {
    it('never rounds up to 100% when work remains', () => {
      // 9999/10000 = 99.99%, which toFixed(0) would render as a false "100%".
      expect(formatPercent(makeProgress(9999, 10_000))).toBe('99%');
    });

    it('never rounds down to 0% once work has started', () => {
      // 1/10000 = 0.01%, which toFixed(0) would render as a discouraging "0%".
      expect(formatPercent(makeProgress(1, 10_000))).toBe('1%');
    });

    it('still shows exactly 100% when genuinely complete', () => {
      expect(formatPercent(makeProgress(10, 10))).toBe('100%');
    });

    it('still shows exactly 0% when genuinely untouched', () => {
      expect(formatPercent(makeProgress(0, 10))).toBe('0%');
    });

    it('applies the same guard at higher precision', () => {
      expect(formatPercent(99.9999, { precision: 2 })).toBe('99.99%');
      expect(formatPercent(0.0001, { precision: 2 })).toBe('0.01%');
    });
  });

  describe('defensive input handling', () => {
    it('clamps values outside 0..100', () => {
      expect(formatPercent(140)).toBe('100%');
      expect(formatPercent(-20)).toBe('0%');
    });

    it('renders the placeholder for non-finite values', () => {
      expect(formatPercent(Number.NaN)).toBe(EMPTY_PERCENT_PLACEHOLDER);
      expect(formatPercent(Number.POSITIVE_INFINITY)).toBe(EMPTY_PERCENT_PLACEHOLDER);
    });

    it.each([-1, 1.5, 21])('rejects invalid precision %s', (precision) => {
      expect(() => formatPercent(50, { precision })).toThrow(RangeError);
    });
  });
});

describe('formatProgressRatio', () => {
  it('renders the completed/total pair', () => {
    expect(formatProgressRatio(makeProgress(20, 73))).toBe('20/73');
  });

  it('renders zeroes for an empty scope', () => {
    expect(formatProgressRatio(makeProgress(0, 0))).toBe('0/0');
  });
});
