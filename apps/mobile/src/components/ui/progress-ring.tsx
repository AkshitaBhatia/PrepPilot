import { formatPercent, motion, type Progress } from '@preppilot/shared';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import { useTheme } from '../../theme/theme-context';
import { ariaValue } from './aria';
import { Text } from './text';

export interface ProgressRingProps {
  readonly progress: Progress;
  /** Ring colour. Defaults to the theme accent; subjects pass their own accent. */
  readonly color?: string;
  readonly size?: number;
  readonly strokeWidth?: number;
  /** Describes what this ring measures, e.g. "Mathematics". */
  readonly label: string;
  /** Hides the percentage in the centre, for very small renderings. */
  readonly hideValue?: boolean;
}

/**
 * The circular meter shown on subject cards.
 *
 * The percentage is rendered inside the ring rather than conveyed by arc length
 * alone, so the value is legible without colour or fine visual discrimination.
 */
export function ProgressRing({
  progress,
  color,
  size,
  strokeWidth,
  label,
  hideValue = false,
}: ProgressRingProps) {
  const theme = useTheme();

  const diameter = size ?? theme.progressMetrics.ringSize;
  const stroke = strokeWidth ?? theme.progressMetrics.ringStroke;
  const radius = (diameter - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = progress.percent ?? 0;

  /*
    The arc sweeps to its new value. A ring that snaps between percentages reads
    as a redraw; one that travels reads as progress being made.
  */
  const animatedPercent = useSharedValue(percent);

  useEffect(() => {
    animatedPercent.value = withTiming(percent, { duration: motion.slow });
  }, [percent, animatedPercent]);

  // A dash the length of the completed arc, followed by a gap covering the rest.
  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedPercent.value / 100),
  }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={
        progress.isEmpty
          ? { text: 'No topics yet' }
          : { min: 0, max: 100, now: Math.round(percent), text: formatPercent(progress) }
      }
      {...ariaValue(
        progress.isEmpty
          ? { text: 'No topics yet' }
          : { min: 0, max: 100, now: Math.round(percent), text: formatPercent(progress) },
      )}
      style={[styles.container, { width: diameter, height: diameter }]}
    >
      <Svg width={diameter} height={diameter}>
        <Circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          stroke={theme.colors.progressTrack}
          strokeWidth={stroke}
          fill="none"
        />
        {percent > 0 && (
          <AnimatedCircle
            testID="progress-ring-arc"
            animatedProps={arcProps}
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            stroke={color ?? theme.colors.accent}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            // Start the arc at 12 o'clock rather than 3 o'clock.
            transform={`rotate(-90 ${diameter / 2} ${diameter / 2})`}
          />
        )}
      </Svg>

      {!hideValue && (
        <View style={styles.value} pointerEvents="none">
          <Text variant="caption" tone="secondary" weight="semibold">
            {formatPercent(progress)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
