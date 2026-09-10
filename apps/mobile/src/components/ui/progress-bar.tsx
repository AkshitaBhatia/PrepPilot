import { formatPercent, motion, type Progress } from '@preppilot/shared';
import { useEffect } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../theme/theme-context';
import { ariaValue } from './aria';

export interface ProgressBarProps extends Omit<ViewProps, 'accessibilityValue'> {
  /** Progress to display. A `null` percent renders an empty track (nothing to measure). */
  readonly progress: Progress;
  /** Fill colour. Defaults to the theme accent; chapters inherit their subject's accent. */
  readonly color?: string;
  readonly height?: number;
  /** Describes what this bar measures, e.g. "Chapter 1: Number Systems". */
  readonly label: string;
}

/**
 * The horizontal meter used for chapters and topics.
 *
 * Progress is never communicated by the bar alone — callers pair it with the
 * percentage text, so the information does not depend on colour or width
 * perception (UI_UX_SPECIFICATION.md, "Accessibility").
 */
export function ProgressBar({ progress, color, height, label, style, ...rest }: ProgressBarProps) {
  const theme = useTheme();
  const barHeight = height ?? theme.progressMetrics.barHeight;
  const percent = progress.percent ?? 0;

  /*
    The fill grows into place rather than jumping. Ticking a topic is the
    product's core interaction, and animating the consequence is what makes it
    feel like something happened rather than a number being replaced.
  */
  const width = useSharedValue(percent);

  useEffect(() => {
    width.value = withTiming(percent, { duration: motion.base });
  }, [percent, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

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
      style={[
        styles.track,
        {
          height: barHeight,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.progressTrack,
        },
        style,
      ]}
      {...rest}
    >
      {percent > 0 && (
        <Animated.View
          testID="progress-bar-fill"
          style={[
            styles.fill,
            fillStyle,
            {
              borderRadius: theme.radius.pill,
              backgroundColor: color ?? theme.colors.accent,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
