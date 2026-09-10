import { motion, radius as radiusTokens } from '@preppilot/shared';
import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/theme-context';

export interface SkeletonProps {
  readonly width?: number | `${number}%`;
  readonly height?: number;
  readonly radius?: number;
  readonly style?: ViewStyle;
  /**
   * Hides this placeholder from screen readers.
   *
   * Set for skeletons inside a group, where the group announces "Loading" once
   * rather than each line announcing it separately.
   */
  readonly decorative?: boolean;
}

/**
 * A shimmering placeholder for content that is loading.
 *
 * Preferred over a spinner wherever the eventual shape is known: it holds the
 * layout still, so nothing jumps when real content arrives, and it communicates
 * *what* is coming rather than only that something is.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius,
  style,
  decorative = false,
}: SkeletonProps) {
  const theme = useTheme();
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: motion.slow * 2 }),
        withTiming(0.5, { duration: motion.slow * 2 }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      {...(decorative
        ? {
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants' as const,
          }
        : {
            accessible: true,
            accessibilityRole: 'progressbar' as const,
            accessibilityLabel: 'Loading',
          })}
      style={[
        {
          width,
          height,
          borderRadius: radius ?? radiusTokens.sm,
          backgroundColor: theme.colors.progressTrack,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** A card-shaped group of skeleton lines, matching the tracker's subject rows. */
export function SkeletonCard() {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.base,
        gap: theme.spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Skeleton width={44} height={44} radius={22} decorative />
        <View style={{ flex: 1, gap: theme.spacing.sm }}>
          <Skeleton width="55%" height={15} decorative />
          <Skeleton width="30%" height={11} decorative />
        </View>
        <Skeleton width={48} height={48} radius={24} decorative />
      </View>
    </View>
  );
}
