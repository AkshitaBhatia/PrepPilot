/**
 * PrepPilot design tokens.
 *
 * Derived from the supplied UI reference screenshots: a dark-first, calm,
 * low-chrome study surface where the syllabus content — not the interface —
 * carries the colour. Per-subject accents are the single expressive element;
 * everything else stays near-neutral (UI_UX_SPECIFICATION.md, "Design Principles":
 * avoid excessive gradients, decoration and unnecessary cards).
 *
 * Values are plain primitives so the same tokens drive React Native StyleSheet
 * and the web demo's CSS custom properties without a shared runtime.
 */

/** 4pt spacing scale. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
} as const;

/** Corner radii. `pill` is deliberately large enough to fully round any control. */
export const radius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

export const fontSize = {
  caption: 11,
  small: 13,
  body: 15,
  bodyLarge: 17,
  title: 20,
  heading: 24,
  display: 32,
  timer: 48,
} as const;

/**
 * Letter spacing, in points.
 *
 * Large type set at its default tracking reads loose and unfocused; small
 * uppercase labels read cramped. Tightening headings and opening up overline
 * labels is most of what separates considered typography from default typography.
 */
export const letterSpacing = {
  display: -0.8,
  heading: -0.5,
  title: -0.3,
  body: 0,
  overline: 1.2,
} as const;

/**
 * Elevation, expressed as the shadow values React Native understands.
 *
 * Depth is deliberately restrained: a dark interface shows shadows poorly, so
 * separation comes mostly from surface colour, with shadow reserved for things
 * that genuinely float above the page.
 */
export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;

/**
 * Motion.
 *
 * Durations are short enough to feel immediate; anything past ~250ms on a tap
 * response reads as lag rather than polish. The spring is used for anything a
 * finger is directly manipulating, where a linear curve feels mechanical.
 */
export const motion = {
  instant: 90,
  fast: 150,
  base: 220,
  slow: 320,
  spring: { damping: 18, stiffness: 220, mass: 0.7 },
  /** How far a control shrinks when pressed. Small enough to feel, not to distract. */
  pressScale: 0.97,
} as const;

/**
 * Layout width ceilings.
 *
 * The app is phone-first, but it runs in a browser and on tablets. Text lines
 * beyond roughly 70 characters are measurably harder to read, so content stops
 * widening well before the viewport does.
 */
export const layout = {
  contentMaxWidth: 720,
  wideBreakpoint: 768,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const lineHeight = {
  tight: 1.2,
  normal: 1.45,
  relaxed: 1.6,
} as const;

/**
 * Minimum interactive target, in dp. Meets the WCAG 2.1 AA / Material
 * recommendation referenced by UI_UX_SPECIFICATION.md, "Accessibility".
 */
export const minTouchTarget = 44;

/** Progress indicator geometry, matching the reference screenshots. */
export const progressMetrics = {
  /** Diameter of the subject card's circular meter. */
  ringSize: 44,
  /** Stroke width of that meter. */
  ringStroke: 4,
  /** Height of the chapter/topic horizontal bar. */
  barHeight: 6,
  /** Diameter of the trailing completion check circle. */
  checkSize: 24,
} as const;

/**
 * Per-subject accent colours, assigned round-robin as subjects are created so
 * each subject stays visually distinct in the tracker list and on its timer screen.
 */
export const subjectAccents = [
  '#3B82F6', // blue
  '#10B981', // green
  '#A855F7', // purple
  '#F59E0B', // amber
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#EF4444', // red
  '#8B5CF6', // violet
] as const;

export type SubjectAccent = (typeof subjectAccents)[number];

/** Deterministically picks a subject accent, so a subject's colour never changes between renders. */
export function accentForIndex(index: number): SubjectAccent {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`index must be a non-negative integer, received ${index}`);
  }
  // Length is a non-zero literal tuple, so this index is always populated.
  return subjectAccents[index % subjectAccents.length] as SubjectAccent;
}

export interface ColorScheme {
  /** App background, behind everything. */
  readonly background: string;
  /** Default card / raised surface. */
  readonly surface: string;
  /** A surface sitting on top of another surface (nested rows, sheets). */
  readonly surfaceElevated: string;
  /** Hairline dividers and card outlines. */
  readonly border: string;
  /** Unfilled portion of any progress indicator. */
  readonly progressTrack: string;

  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  /** Text placed on top of a filled accent surface. */
  readonly textOnAccent: string;

  /** Default brand accent, used where no subject accent applies. */
  readonly accent: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  /** Indicates offline / queued-for-sync state. */
  readonly offline: string;
}

export const darkColors: ColorScheme = {
  background: '#0B0F14',
  surface: '#151B23',
  surfaceElevated: '#1C2430',
  border: '#232B36',
  progressTrack: '#232B36',

  textPrimary: '#E6EDF3',
  textSecondary: '#9BA7B4',
  textMuted: '#6B7684',
  textOnAccent: '#FFFFFF',

  accent: '#3B82F6',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  offline: '#F59E0B',
};

export const lightColors: ColorScheme = {
  background: '#F7F9FC',
  surface: '#FFFFFF',
  surfaceElevated: '#F0F3F8',
  border: '#DDE3EC',
  progressTrack: '#E4E9F1',

  textPrimary: '#0B0F14',
  textSecondary: '#4A5568',
  textMuted: '#7A8798',
  textOnAccent: '#FFFFFF',

  accent: '#2563EB',
  success: '#059669',
  warning: '#D97706',
  danger: '#DC2626',
  offline: '#D97706',
};

export type ThemeMode = 'dark' | 'light';

/**
 * Dark is the default: every supplied reference screenshot is dark, and a study
 * timer is frequently used at night.
 */
export const DEFAULT_THEME_MODE: ThemeMode = 'dark';

export function colorsFor(mode: ThemeMode): ColorScheme {
  return mode === 'light' ? lightColors : darkColors;
}

export const theme = {
  spacing,
  radius,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  elevation,
  motion,
  layout,
  minTouchTarget,
  progressMetrics,
  subjectAccents,
  dark: darkColors,
  light: lightColors,
} as const;
