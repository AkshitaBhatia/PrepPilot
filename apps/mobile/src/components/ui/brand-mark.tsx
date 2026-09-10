import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../../theme/theme-context';
import { Platform } from 'react-native';
export interface BrandMarkProps {
  readonly size?: number;
  /** Fraction of the ring that is filled, 0..1. */
  readonly progress?: number;
  readonly label?: string;
}

/**
 * The PrepPilot mark: a progress ring around a checkmark.
 *
 * Drawn from the two shapes the product is actually about — a ring that fills
 * and a topic that gets ticked — rather than an arbitrary logo. It reuses the
 * tracker's own geometry, so the splash screen is a promise the app then keeps.
 */
export function BrandMark({ size = 96, progress = 0.68, label }: BrandMarkProps) {
  const theme = useTheme();

  const stroke = size * 0.08;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      accessibilityRole={label === undefined ? 'none' : 'image'}
      {...(label === undefined
        ? { ...(Platform.OS !== 'web' ? { accessibilityElementsHidden: true } : {}) }
        : { accessibilityLabel: label })}
    >
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={theme.colors.progressTrack}
        strokeWidth={stroke}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={theme.colors.accent}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        // Start at 12 o'clock, as the tracker's rings do.
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <Path
        d={`M${size * 0.33} ${size * 0.5} L${size * 0.45} ${size * 0.62} L${size * 0.68} ${size * 0.39}`}
        stroke={theme.colors.textPrimary}
        strokeWidth={stroke * 0.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
