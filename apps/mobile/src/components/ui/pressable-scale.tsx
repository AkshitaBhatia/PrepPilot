import { motion } from '@preppilot/shared';
import type { ReactNode } from 'react';
import { Platform, Pressable, type PressableProps, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  readonly children: ReactNode;
  readonly style?: ViewStyle | ViewStyle[];
  /** Adds a light haptic tap. Reserved for consequential actions. */
  readonly haptic?: boolean;
}

/**
 * A pressable that shrinks slightly under a finger.
 *
 * The scale is the cheapest honest signal that a tap registered — it responds on
 * touch-down rather than after the handler runs, so the interface feels
 * immediate even when the work behind it is not.
 *
 * Opacity animates alongside it because scale alone is invisible to anyone who
 * has reduced motion enabled at the OS level, where the platform flattens the
 * transform but keeps the fade.
 */
export function PressableScale({
  children,
  style,
  haptic = false,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={(event) => {
        scale.value = withSpring(motion.pressScale, motion.spring);
        opacity.value = withTiming(0.9, { duration: motion.instant });
        // Haptics do not exist on web and throw if called there.
        if (haptic && Platform.OS !== 'web') {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, motion.spring);
        opacity.value = withTiming(1, { duration: motion.fast });
        onPressOut?.(event);
      }}
      style={[animatedStyle, style]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
