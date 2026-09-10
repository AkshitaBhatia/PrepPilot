import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/theme-context';
import { Text } from './text';

export interface StatChipProps {
  /** Caption above the value, e.g. "Completed" or "Time Spent". */
  readonly label: string;
  readonly value: string;
  readonly color?: string;
  readonly testID?: string;
}

/** The labelled figure shown on the dashboard and timer headers. */
export function StatChip({ label, value, color, testID }: StatChipProps) {
  const theme = useTheme();

  return (
    <View testID={testID} style={styles.container}>
      <Text variant="caption" tone="muted" style={{ marginBottom: theme.spacing.xs }}>
        {label}
      </Text>
      <View
        style={[
          styles.pill,
          {
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.sm,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
          },
        ]}
      >
        <Text variant="body" weight="semibold" color={color}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
  },
  pill: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
