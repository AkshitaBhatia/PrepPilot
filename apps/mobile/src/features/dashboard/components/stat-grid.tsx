import { StyleSheet, View } from 'react-native';
import { Card, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';

export interface Stat {
  readonly label: string;
  readonly value: string;
  readonly testID?: string;
  /** Optional accent for the value, used to make one figure the headline. */
  readonly tone?: 'primary' | 'accent';
}

export interface StatGridProps {
  readonly stats: readonly Stat[];
}

/**
 * A grid of figures.
 *
 * Loose chips read as metadata clinging to a heading; giving each figure a card
 * of its own, with the label above and the number large, makes them the content.
 */
export function StatGrid({ stats }: StatGridProps) {
  const theme = useTheme();

  return (
    <View style={[styles.grid, { gap: theme.spacing.md }]}>
      {stats.map((stat) => (
        <Card key={stat.label} testID={stat.testID} style={styles.cell}>
          <Text variant="caption" tone="muted" overline>
            {stat.label}
          </Text>
          <Text
            variant="title"
            weight="bold"
            tone={stat.tone === 'accent' ? 'accent' : 'primary'}
            style={[styles.value, { marginTop: theme.spacing.xs }]}
          >
            {stat.value}
          </Text>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // Two per row on a phone, growing to four once there is room.
  cell: { flexGrow: 1, flexBasis: '45%', minWidth: 140 },
  value: { fontVariant: ['tabular-nums'] },
});
