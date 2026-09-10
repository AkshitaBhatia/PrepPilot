import { StyleSheet, View } from 'react-native';
import { PressableScale, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';
import { ariaState, ariaValue } from '../../../components/ui/aria';

export interface StepperProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly unit?: string;
  readonly onChange: (next: number) => void;
  readonly testID?: string;
}

/**
 * A plus/minus control for a bounded number.
 *
 * Preferred over a free text field for durations: there is no invalid state to
 * validate, no keyboard to dismiss, and the bounds are enforced by the control
 * rather than reported after the fact.
 */
export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  testID,
}: StepperProps) {
  const theme = useTheme();

  const button = (delta: number, symbol: string, action: string, disabled: boolean) => (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${action} ${label}`}
      accessibilityState={{ disabled }}
      {...ariaState({ disabled })}
      disabled={disabled}
      onPress={() => onChange(Math.min(max, Math.max(min, value + delta)))}
      style={[
        styles.button,
        {
          minWidth: theme.minTouchTarget,
          minHeight: theme.minTouchTarget,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surfaceElevated,
          borderColor: theme.colors.border,
          opacity: disabled ? 0.35 : 1,
        },
      ]}
    >
      <Text variant="bodyLarge" weight="semibold">
        {symbol}
      </Text>
    </PressableScale>
  );

  return (
    <View
      testID={testID}
      // One announced control rather than three: "Work interval, 25 minutes",
      // with the buttons as its actions.
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: `${value}${unit}` }}
      {...ariaValue({ min, max, now: value, text: `${value}${unit}` })}
      style={styles.row}
    >
      <Text variant="body" style={styles.label}>
        {label}
      </Text>

      <View style={[styles.controls, { gap: theme.spacing.sm }]}>
        {button(-step, '−', 'Decrease', value <= min)}
        <Text variant="body" weight="semibold" style={styles.value}>
          {value}
          {unit}
        </Text>
        {button(step, '+', 'Increase', value >= max)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { flex: 1 },
  controls: { flexDirection: 'row', alignItems: 'center' },
  button: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  // Tabular figures stop the number shifting the buttons as it changes width.
  value: { minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
