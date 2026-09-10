import { motion } from '@preppilot/shared';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import type { ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

export interface FadeInProps {
  readonly children: ReactNode;
  /** Stagger, in milliseconds. Used to cascade a list rather than pop it in at once. */
  readonly delay?: number;
  readonly style?: ViewStyle;
}

/**
 * Fades and lifts content into place.
 *
 * Used with a small per-item delay so a list arrives as a sequence rather than a
 * single flash. The movement is deliberately tiny — 8 points — because a large
 * entrance animation is charming once and irritating every time after.
 */
export function FadeIn({ children, delay = 0, style }: FadeInProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: motion.base }));
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 8 }],
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}
