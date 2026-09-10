import { formatHoursMinutes, motion, type DayTotal } from '@preppilot/shared';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Card, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';

export interface WeekChartProps {
  readonly days: readonly DayTotal[];
}

const CHART_HEIGHT = 96;

/**
 * A minimum scale of one hour.
 *
 * Scaling purely to the largest bar makes a twelve-second session fill the chart,
 * which reads as a full day of study. Anchoring the axis to at least an hour
 * keeps a small amount looking like a small amount.
 */
const MINIMUM_SCALE_SECONDS = 3600;

export function WeekChart({ days }: WeekChartProps) {
  const theme = useTheme();
  const peak = Math.max(MINIMUM_SCALE_SECONDS, ...days.map((day) => day.seconds));

  return (
    <Card>
      <Text variant="caption" tone="muted" overline>
        Last 7 days
      </Text>

      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Study time over the last seven days. ${days
          .map((day) => `${day.day}: ${formatHoursMinutes(day.seconds)}`)
          .join(', ')}`}
        style={[styles.chart, { marginTop: theme.spacing.base, gap: theme.spacing.sm }]}
      >
        {days.map((day, index) => (
          <Bar
            key={day.day}
            day={day}
            peak={peak}
            index={index}
            isToday={index === days.length - 1}
          />
        ))}
      </View>
    </Card>
  );
}

function Bar({
  day,
  peak,
  index,
  isToday,
}: {
  readonly day: DayTotal;
  readonly peak: number;
  readonly index: number;
  readonly isToday: boolean;
}) {
  const theme = useTheme();
  const studied = day.seconds > 0;

  // A studied day always shows at least a sliver, so "a little" never looks
  // identical to "none".
  const target = studied ? Math.max(6, (day.seconds / peak) * CHART_HEIGHT) : 3;
  const height = useSharedValue(0);

  useEffect(() => {
    height.value = withDelay(index * 40, withTiming(target, { duration: motion.slow }));
  }, [target, index, height]);

  const animatedStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <View style={styles.column}>
      <Animated.View
        testID={`day-bar-${index}`}
        style={[
          animatedStyle,
          styles.bar,
          {
            borderRadius: theme.radius.sm,
            backgroundColor: studied ? theme.colors.accent : theme.colors.progressTrack,
          },
        ]}
      />
      <Text
        variant="caption"
        tone={isToday ? 'secondary' : 'muted'}
        weight={isToday ? 'semibold' : 'regular'}
      >
        {day.day.slice(8)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: CHART_HEIGHT + 22 },
  column: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  bar: { width: '100%' },
});
