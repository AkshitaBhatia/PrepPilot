import { StyleSheet, View } from 'react-native';
import { Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';

export interface AuthErrorProps {
  readonly message: string | null;
}

/**
 * Announces an authentication failure.
 *
 * Uses `alert` so a screen reader speaks the message when it appears — a student
 * relying on one would otherwise submit the form and hear nothing back.
 */
export function AuthError({ message }: AuthErrorProps) {
  const theme = useTheme();
  if (message === null) return null;

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="auth-error"
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surfaceElevated,
          borderColor: theme.colors.danger,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
        },
      ]}
    >
      <Text variant="small" tone="danger">
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1 },
});
