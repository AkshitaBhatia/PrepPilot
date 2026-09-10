import {
  DEFAULT_THEME_MODE,
  colorsFor,
  elevation,
  fontSize,
  fontWeight,
  lineHeight,
  layout,
  letterSpacing,
  minTouchTarget,
  motion,
  progressMetrics,
  radius,
  spacing,
  subjectAccents,
  type ColorScheme,
  type ThemeMode,
} from '@preppilot/shared';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

export interface Theme {
  readonly mode: ThemeMode;
  readonly colors: ColorScheme;
  readonly spacing: typeof spacing;
  readonly radius: typeof radius;
  readonly fontSize: typeof fontSize;
  readonly fontWeight: typeof fontWeight;
  readonly lineHeight: typeof lineHeight;
  readonly letterSpacing: typeof letterSpacing;
  readonly elevation: typeof elevation;
  readonly motion: typeof motion;
  readonly layout: typeof layout;
  readonly minTouchTarget: typeof minTouchTarget;
  readonly progressMetrics: typeof progressMetrics;
  readonly subjectAccents: typeof subjectAccents;
}

interface ThemeContextValue {
  readonly theme: Theme;
  /** Overrides the device setting. Passing `null` returns to following the device. */
  readonly setMode: (mode: ThemeMode | null) => void;
  /** True when the theme follows the device setting rather than an explicit choice. */
  readonly followsDevice: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function buildTheme(mode: ThemeMode): Theme {
  return {
    mode,
    colors: colorsFor(mode),
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
  };
}

export interface ThemeProviderProps {
  readonly children: ReactNode;
  /**
   * Forces a mode regardless of the device setting. Used by tests and by the
   * settings screen's theme preview.
   */
  readonly initialMode?: ThemeMode | null;
}

export function ThemeProvider({ children, initialMode = null }: ThemeProviderProps) {
  const deviceScheme = useColorScheme();
  const [override, setOverride] = useState<ThemeMode | null>(initialMode);

  const value = useMemo<ThemeContextValue>(() => {
    // Precedence: explicit user choice, then the device setting, then our default.
    // `useColorScheme` reports 'unspecified' when the device has no preference,
    // which is why DEFAULT_THEME_MODE (dark) backstops it rather than light —
    // falling back to light would flash white on a dark-themed device.
    const resolved: ThemeMode =
      override ?? (deviceScheme === 'light' ? 'light' : DEFAULT_THEME_MODE);

    return {
      theme: buildTheme(resolved),
      setMode: setOverride,
      followsDevice: override === null,
    };
  }, [override, deviceScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** @throws if used outside a `ThemeProvider`. */
export function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
}

export function useTheme(): Theme {
  return useThemeContext().theme;
}
