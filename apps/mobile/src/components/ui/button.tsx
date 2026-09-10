import { motion } from '@preppilot/shared';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeIn as RNFadeIn, FadeOut } from 'react-native-reanimated';
import { useTheme } from '../../theme/theme-context';
import { ariaState } from './aria';
import { PressableScale } from './pressable-scale';
import { Text } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly fullWidth?: boolean;
  /**
   * Rendered before the label. Decorative: the label alone must still say what
   * the button does, because an icon is not announced.
   */
  readonly icon?: ReactNode;
  /**
   * Marks this as the chosen option in a group of them. Colour alone cannot
   * carry that: a screen reader has no way to see it, so it is announced too.
   */
  readonly selected?: boolean;
  readonly testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  selected,
  testID,
}: ButtonProps) {
  const theme = useTheme();

  const heights: Record<ButtonSize, number> = { small: 38, medium: 48, large: 56 };

  const palettes: Record<
    ButtonVariant,
    { background: string; border: string; label: string; elevated: boolean }
  > = {
    primary: {
      background: theme.colors.accent,
      border: 'transparent',
      label: theme.colors.textOnAccent,
      // Only the primary action lifts off the page; if everything is elevated,
      // nothing reads as the main thing to do.
      elevated: true,
    },
    secondary: {
      background: theme.colors.surfaceElevated,
      border: theme.colors.border,
      label: theme.colors.textPrimary,
      elevated: false,
    },
    outline: {
      background: 'transparent',
      border: theme.colors.accent,
      label: theme.colors.accent,
      elevated: false,
    },
    ghost: {
      background: 'transparent',
      border: 'transparent',
      label: theme.colors.accent,
      elevated: false,
    },
    danger: {
      background: theme.colors.danger,
      border: 'transparent',
      label: theme.colors.textOnAccent,
      elevated: true,
    },
  };

  const palette = palettes[variant];
  // A button that is busy must not fire again, so loading implies disabled.
  const isInteractionBlocked = disabled || loading;

  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{
        disabled: isInteractionBlocked,
        busy: loading,
        ...(selected === undefined ? {} : { selected }),
      }}
      {...ariaState({
        disabled: isInteractionBlocked,
        busy: loading,
        ...(selected === undefined ? {} : { selected }),
      })}
      disabled={isInteractionBlocked}
      haptic={variant === 'primary' || variant === 'danger'}
      onPress={onPress}
      style={[
        styles.button,
        {
          minHeight: Math.max(heights[size], theme.minTouchTarget),
          paddingHorizontal: size === 'small' ? theme.spacing.base : theme.spacing.xl,
          borderRadius: theme.radius.md,
          backgroundColor: palette.background,
          borderColor: palette.border,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isInteractionBlocked ? 0.45 : 1,
        },
        palette.elevated && !isInteractionBlocked ? theme.elevation.card : theme.elevation.none,
      ]}
    >
      {loading ? (
        <Animated.View entering={RNFadeIn.duration(motion.fast)} exiting={FadeOut}>
          <ActivityIndicator color={palette.label} size="small" />
        </Animated.View>
      ) : (
        <View style={[styles.content, { gap: theme.spacing.sm }]}>
          {icon}
          <Text
            variant={size === 'small' ? 'small' : 'body'}
            weight="semibold"
            color={palette.label}
          >
            {label}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  content: { flexDirection: 'row', alignItems: 'center' },
});
