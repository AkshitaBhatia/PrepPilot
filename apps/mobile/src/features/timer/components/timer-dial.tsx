import {
  formatClock,
  progressFraction,
  remainingSeconds,
  elapsedSeconds,
  type TimerState,
} from '@preppilot/shared';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';
import { ariaValue } from '../../../components/ui/aria';

export interface TimerDialProps {
  readonly timer: TimerState;
  readonly now: number;
  readonly accent: string;
  readonly size?: number;
}

/**
 * The large arc-and-digits display.
 *
 * A stopwatch counts up and fills nothing, because it has no end to fill toward.
 * A countdown shows time remaining and drains its arc.
 */
export function TimerDial({ timer, now, accent, size = 260 }: TimerDialProps) {
  const theme = useTheme();

  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const remaining = remainingSeconds(timer, now);
  const isCountdown = remaining !== null;
  const displaySeconds = isCountdown ? remaining : elapsedSeconds(timer, now);
  const fraction = progressFraction(timer, now) ?? 0;
  const dashOffset = circumference * fraction;

  const phaseLabel =
    timer.mode === 'pomodoro'
      ? { work: 'focus', shortBreak: 'short break', longBreak: 'long break' }[timer.phase]
      : timer.mode;

  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`${phaseLabel} timer`}
      accessibilityValue={{
        text: `${formatClock(displaySeconds)} ${isCountdown ? 'remaining' : 'elapsed'}`,
      }}
      {...ariaValue({
        text: `${formatClock(displaySeconds)} ${isCountdown ? 'remaining' : 'elapsed'}`,
      })}
      style={[styles.container, { width: size, height: size }]}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.progressTrack}
          strokeWidth={stroke}
          fill="none"
        />
        {isCountdown && fraction > 0 && (
          <Circle
            testID="timer-dial-arc"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={accent}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>

      <View style={styles.readout} pointerEvents="none">
        <Text variant="small" tone="muted">
          {phaseLabel}
        </Text>
        <Text variant="display" weight="semibold" style={styles.digits} testID="timer-readout">
          {formatClock(displaySeconds)}
        </Text>
        {isCountdown && (
          <Text variant="caption" tone="muted">
            {formatClock(elapsedSeconds(timer, now))} elapsed
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  readout: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Tabular figures stop the digits jittering as they change.
  digits: { fontVariant: ['tabular-nums'] },
});
