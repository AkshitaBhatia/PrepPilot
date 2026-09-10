import { StyleSheet, View } from 'react-native';
import { isDemoMode } from '../../config/env';
import { useTheme } from '../../theme/theme-context';
import { Text } from './text';

/**
 * Marks a demo session unmistakably.
 *
 * Demo mode bypasses sign-in and stores everything locally (D40). Nothing about
 * the app would otherwise look different, and a reviewer could easily believe
 * they were seeing real, synced data.
 */
export function DemoBanner() {
  const theme = useTheme();
  if (!isDemoMode()) return null;

  return (
    <View
      accessible
      accessibilityRole="alert"
      testID="demo-banner"
      style={[
        styles.banner,
        {
          backgroundColor: theme.colors.warning,
          paddingVertical: theme.spacing.xs,
          paddingHorizontal: theme.spacing.base,
        },
      ]}
    >
      <Text variant="caption" weight="semibold" color="#1A1205">
        Demo mode · stored on this device only · not signed in
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { width: '100%', alignItems: 'center' },
});
