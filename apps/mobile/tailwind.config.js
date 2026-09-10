/**
 * Tailwind configuration, consumed by NativeWind.
 *
 * The values here mirror `@preppilot/shared`'s design tokens. They are written
 * out rather than imported because a Tailwind config is plain JavaScript loaded
 * by the build, and reaching into a TypeScript module from it only works while
 * the toolchain happens to strip types — a dependency that would break quietly
 * on a different Node version.
 *
 * `tailwind-tokens.test.ts` asserts the two agree, so drift fails a test rather
 * than shipping a palette that disagrees with itself.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Dark is the product's default, so the unprefixed names are the dark
        // palette and `light-*` is the exception.
        canvas: '#0B0F14',
        surface: '#151B23',
        raised: '#1C2430',
        hairline: '#232B36',
        track: '#232B36',

        ink: '#E6EDF3',
        'ink-muted': '#9BA7B4',
        'ink-faint': '#6B7684',
        'ink-inverse': '#FFFFFF',

        accent: '#3B82F6',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',

        'light-canvas': '#F7F9FC',
        'light-surface': '#FFFFFF',
        'light-raised': '#F0F3F8',
        'light-hairline': '#DDE3EC',
        'light-track': '#E4E9F1',
        'light-ink': '#0B0F14',
        'light-ink-muted': '#4A5568',
        'light-ink-faint': '#7A8798',
        'light-accent': '#2563EB',
      },
      spacing: {
        xxs: '2px',
        xs: '4px',
        sm: '8px',
        md: '12px',
        base: '16px',
        lg: '20px',
        xl: '24px',
        xxl: '32px',
        xxxl: '40px',
        huge: '48px',
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        xxl: '28px',
        pill: '999px',
      },
      fontSize: {
        caption: '11px',
        small: '13px',
        body: '15px',
        'body-lg': '17px',
        title: '20px',
        heading: '24px',
        display: '32px',
        timer: '48px',
      },
    },
  },
  plugins: [],
};
