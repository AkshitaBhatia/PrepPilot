import { motion } from '@preppilot/shared';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Logo, Screen, Text } from '../../components/ui';
import { useTheme } from '../../theme/theme-context';

export interface SplashScreenProps {
  /** Announced while the app prepares itself. */
  readonly message?: string;
}

/**
 * The launch screen (PRD §20, screen 1).
 *
 * Shown while the database opens and any stored session is restored — real work,
 * not an artificial delay. The mark animates in so the wait reads as the app
 * starting rather than as a frozen frame.
 */
export function SplashScreen({ message = 'Starting PrepPilot' }: SplashScreenProps) {
  const theme = useTheme();
  const scale = useSharedValue(0.85);
  const opacity = useSharedValue(0);
  const wordmark = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: motion.base });
    scale.value = withSpring(1, motion.spring);
    wordmark.value = withDelay(motion.fast, withTiming(1, { duration: motion.base }));
  }, [opacity, scale, wordmark]);

  const markStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmark.value,
    transform: [{ translateY: (1 - wordmark.value) * 6 }],
  }));

  return (
    <Screen>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={message}
        testID="splash"
        style={styles.centre}
      >
        <Animated.View style={markStyle}>
          <Logo size={96} />
        </Animated.View>

        <Animated.View style={[wordmarkStyle, { marginTop: theme.spacing.lg }]}>
          <Text variant="heading" weight="bold" style={styles.centred}>
            PrepPilot
          </Text>
          <Text
            variant="small"
            tone="muted"
            style={[styles.centred, { marginTop: theme.spacing.xs }]}
          >
            Tracker first, AI second
          </Text>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centred: { textAlign: 'center' },
});
