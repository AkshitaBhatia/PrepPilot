import { StyleSheet, View } from 'react-native';
import { FadeIn, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';
import { useNetworkStore } from '../network-store';

/**
 * Shown while the device is offline.
 *
 * Deliberately reassuring rather than alarming. Everything except the assistant
 * keeps working offline (PRD §6), so the message says what is still true instead
 * of implying something is broken.
 */
export function OfflineBanner() {
  const theme = useTheme();
  const { online, known } = useNetworkStore();

  // Nothing is shown until connectivity is actually known, so the banner never
  // flashes during start-up on a perfectly good connection.
  if (!known || online) return null;

  return (
    <FadeIn>
      <View
        accessible
        accessibilityRole="alert"
        testID="offline-banner"
        style={[
          styles.banner,
          {
            backgroundColor: theme.colors.surfaceElevated,
            borderBottomColor: theme.colors.border,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.base,
          },
        ]}
      >
        <Text variant="caption" tone="secondary">
          Offline · your work is saved on this device and will sync later
        </Text>
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  banner: { width: '100%', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
});
