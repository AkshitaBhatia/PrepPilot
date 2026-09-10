import { letterSpacing } from '@preppilot/shared';
import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { fontFamilyForWeight } from '../../theme/fonts';
import { useTheme } from '../../theme/theme-context';

export type TextVariant =
  'display' | 'heading' | 'title' | 'bodyLarge' | 'body' | 'small' | 'caption';

export type TextTone =
  'primary' | 'secondary' | 'muted' | 'accent' | 'onAccent' | 'danger' | 'success';

export interface TextProps extends RNTextProps {
  readonly variant?: TextVariant;
  readonly tone?: TextTone;
  readonly weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  /** Overrides `tone`; used for per-subject accent colours. */
  readonly color?: string;
  /**
   * Renders a caption as a section label: uppercase, widely tracked.
   * The pattern appears throughout the app, so it belongs in the primitive
   * rather than being re-approximated at each call site.
   */
  readonly overline?: boolean;
}

/**
 * Caps how far each variant grows with the OS font-size setting.
 *
 * Text must scale for readability, but the larger variants are what establish
 * the Subject -> Chapter -> Topic hierarchy. Letting a 32pt heading grow by the
 * full system multiplier collapses that hierarchy and pushes the tracker rows
 * off screen, so headings are capped tighter than body copy.
 */
const maxScale: Record<TextVariant, number> = {
  display: 1.3,
  heading: 1.3,
  title: 1.4,
  bodyLarge: 1.6,
  body: 1.6,
  small: 1.8,
  caption: 1.8,
};

export function Text({
  variant = 'body',
  tone = 'primary',
  weight,
  color,
  overline = false,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();

  const sizes: Record<TextVariant, number> = {
    display: theme.fontSize.display,
    heading: theme.fontSize.heading,
    title: theme.fontSize.title,
    bodyLarge: theme.fontSize.bodyLarge,
    body: theme.fontSize.body,
    small: theme.fontSize.small,
    caption: theme.fontSize.caption,
  };

  const tones: Record<TextTone, string> = {
    primary: theme.colors.textPrimary,
    secondary: theme.colors.textSecondary,
    muted: theme.colors.textMuted,
    accent: theme.colors.accent,
    onAccent: theme.colors.textOnAccent,
    danger: theme.colors.danger,
    success: theme.colors.success,
  };

  // Headings default to semibold; body copy defaults to regular.
  const defaultWeight =
    variant === 'display' || variant === 'heading' || variant === 'title' ? 'semibold' : 'regular';

  const fontSize = sizes[variant];

  /*
    Tracking, not decoration. Large type set at default spacing reads loose, and
    the small uppercase labels used as section headings read cramped without
    extra space. Tightening one and opening the other is most of the difference
    between considered and default typography.
  */
  const resolvedWeight = theme.fontWeight[weight ?? (overline ? 'semibold' : defaultWeight)];

  const tracking: Record<TextVariant, number> = {
    display: letterSpacing.display,
    heading: letterSpacing.heading,
    title: letterSpacing.title,
    bodyLarge: letterSpacing.body,
    body: letterSpacing.body,
    small: letterSpacing.body,
    caption: overline ? letterSpacing.overline : letterSpacing.body,
  };

  return (
    <RNText
      maxFontSizeMultiplier={maxScale[variant]}
      style={[
        styles.base,
        {
          fontSize,
          lineHeight: fontSize * theme.lineHeight.normal,
          /*
            The family carries the weight. React Native cannot synthesise a
            bold from a regular face, so asking for fontWeight alone gives the
            platform default typeface at that weight instead of Inter.
          */
          fontFamily: fontFamilyForWeight[resolvedWeight] ?? undefined,
          fontWeight: resolvedWeight,
          letterSpacing: tracking[variant],
          textTransform: overline ? 'uppercase' : 'none',
          color: color ?? tones[tone],
        },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});
