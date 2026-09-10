import { Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../theme/theme-context';
import { ariaState } from './aria';

export interface PlayButtonProps {
  readonly onPress: () => void;
  /** What starting the timer will study, e.g. "Mathematics". */
  readonly label: string;
  readonly color?: string;
  readonly size?: number;
  readonly disabled?: boolean;
}

/** The filled circular control that opens a timer for a subject, chapter or topic. */
export function PlayButton({ onPress, label, color, size, disabled = false }: PlayButtonProps) {
  const theme = useTheme();
  const diameter = size ?? 48;
  const accent = color ?? theme.colors.accent;
  const slop = Math.max(0, (theme.minTouchTarget - diameter) / 2);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Start timer for ${label}`}
      accessibilityState={{ disabled }}
      {...ariaState({ disabled })}
      hitSlop={slop}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: accent,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <Svg width={diameter * 0.4} height={diameter * 0.4} viewBox="0 0 24 24">
        {/* Nudged right so the triangle looks optically centred in the circle. */}
        <Path d="M8 5v14l11-7z" fill={theme.colors.textOnAccent} />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
  },
});
