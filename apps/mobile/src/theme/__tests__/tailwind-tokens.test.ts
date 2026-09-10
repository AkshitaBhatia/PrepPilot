import { darkColors, fontSize, lightColors, radius, spacing } from '@preppilot/shared';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const tailwind = require('../../../tailwind.config.js') as {
  theme: {
    extend: {
      colors: Record<string, string>;
      spacing: Record<string, string>;
      borderRadius: Record<string, string>;
      fontSize: Record<string, string>;
    };
  };
};

const { colors, spacing: twSpacing, borderRadius, fontSize: twFontSize } = tailwind.theme.extend;
const px = (value: string) => Number.parseInt(value, 10);

/**
 * The Tailwind config restates the design tokens rather than importing them: a
 * Tailwind config is plain JavaScript loaded by the build, and reaching into a
 * TypeScript module from it only works while the toolchain happens to strip
 * types.
 *
 * These assertions are what make that restatement safe. Two sources of truth for
 * one colour is how a design system drifts; here drift fails a test instead.
 */
describe('the Tailwind config matches the design tokens', () => {
  it.each([
    ['canvas', darkColors.background],
    ['surface', darkColors.surface],
    ['raised', darkColors.surfaceElevated],
    ['hairline', darkColors.border],
    ['track', darkColors.progressTrack],
    ['ink', darkColors.textPrimary],
    ['ink-muted', darkColors.textSecondary],
    ['ink-faint', darkColors.textMuted],
    ['ink-inverse', darkColors.textOnAccent],
    ['accent', darkColors.accent],
    ['success', darkColors.success],
    ['warning', darkColors.warning],
    ['danger', darkColors.danger],
  ])('dark colour %s', (name, expected) => {
    expect(colors[name]?.toUpperCase()).toBe(expected.toUpperCase());
  });

  it.each([
    ['light-canvas', lightColors.background],
    ['light-surface', lightColors.surface],
    ['light-raised', lightColors.surfaceElevated],
    ['light-hairline', lightColors.border],
    ['light-track', lightColors.progressTrack],
    ['light-ink', lightColors.textPrimary],
    ['light-ink-muted', lightColors.textSecondary],
    ['light-ink-faint', lightColors.textMuted],
    ['light-accent', lightColors.accent],
  ])('light colour %s', (name, expected) => {
    expect(colors[name]?.toUpperCase()).toBe(expected.toUpperCase());
  });

  it.each(Object.entries(spacing).filter(([name]) => name !== 'none'))(
    'spacing %s',
    (name, value) => {
      expect(px(twSpacing[name] ?? '')).toBe(value);
    },
  );

  it.each(Object.entries(radius).filter(([name]) => name !== 'none'))(
    'radius %s',
    (name, value) => {
      expect(px(borderRadius[name] ?? '')).toBe(value);
    },
  );

  it.each([
    ['caption', fontSize.caption],
    ['small', fontSize.small],
    ['body', fontSize.body],
    ['body-lg', fontSize.bodyLarge],
    ['title', fontSize.title],
    ['heading', fontSize.heading],
    ['display', fontSize.display],
    ['timer', fontSize.timer],
  ])('font size %s', (name, value) => {
    expect(px(twFontSize[name] ?? '')).toBe(value);
  });
});
