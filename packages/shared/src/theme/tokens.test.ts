import { describe, expect, it } from 'vitest';
import {
  accentForIndex,
  colorsFor,
  darkColors,
  lightColors,
  minTouchTarget,
  subjectAccents,
} from './tokens';

describe('accentForIndex', () => {
  it('is deterministic for the same index', () => {
    expect(accentForIndex(3)).toBe(accentForIndex(3));
  });

  it('wraps around the palette', () => {
    expect(accentForIndex(subjectAccents.length)).toBe(accentForIndex(0));
  });

  it('rejects invalid indices', () => {
    expect(() => accentForIndex(-1)).toThrow(RangeError);
    expect(() => accentForIndex(1.5)).toThrow(RangeError);
  });
});

describe('colorsFor', () => {
  it('returns the matching scheme', () => {
    expect(colorsFor('dark')).toBe(darkColors);
    expect(colorsFor('light')).toBe(lightColors);
  });
});

describe('token integrity', () => {
  it('defines the same keys in both schemes, so no theme can be missing a colour', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it.each([...subjectAccents])('accent %s is a valid hex colour', (color) => {
    expect(color).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('uses unique subject accents so adjacent subjects stay distinguishable', () => {
    expect(new Set(subjectAccents).size).toBe(subjectAccents.length);
  });

  it('keeps touch targets at or above the accessibility minimum', () => {
    expect(minTouchTarget).toBeGreaterThanOrEqual(44);
  });
});
