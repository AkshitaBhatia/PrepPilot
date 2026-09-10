import { StyleSheet, View, type ViewProps } from 'react-native';
import { useTheme } from '../../theme/theme-context';
import { PressableScale } from './pressable-scale';

export interface CardProps extends ViewProps {
  /** Uses the raised surface colour, for a card nested inside another card. */
  readonly elevated?: boolean;
  readonly padded?: boolean;
  /** Makes the whole card a single target, with the same press motion as a button. */
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
}

export function Card({
  elevated = false,
  padded = true,
  onPress,
  accessibilityLabel,
  style,
  children,
  ...rest
}: CardProps) {
  const theme = useTheme();

  const surface = [
    styles.base,
    {
      backgroundColor: elevated ? theme.colors.surfaceElevated : theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.lg,
      padding: padded ? theme.spacing.base : 0,
    },
    // Depth is restrained: on a dark surface a heavy shadow reads as grime, so
    // separation comes mostly from colour and only nested cards lift at all.
    elevated ? theme.elevation.none : theme.elevation.card,
    style,
  ];

  if (onPress !== undefined) {
    return (
      <PressableScale
        accessibilityRole="button"
        {...(accessibilityLabel !== undefined ? { accessibilityLabel } : {})}
        onPress={onPress}
        style={surface as never}
      >
        {children}
      </PressableScale>
    );
  }

  return (
    <View style={surface} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
