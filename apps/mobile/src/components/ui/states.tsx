import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/theme-context';
import { Button } from './button';
import { Text } from './text';

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly testID?: string;
}

/**
 * Shown when a list has no content. Copy for each screen is defined in
 * UI_UX_SPECIFICATION.md, "Empty States".
 */
export function EmptyState({ title, description, actionLabel, onAction, testID }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View testID={testID} style={[styles.container, { padding: theme.spacing.xl }]}>
      <Text variant="bodyLarge" weight="semibold" style={styles.centered}>
        {title}
      </Text>

      {description !== undefined && (
        <Text
          variant="body"
          tone="secondary"
          style={[styles.centered, { marginTop: theme.spacing.sm }]}
        >
          {description}
        </Text>
      )}

      {actionLabel !== undefined && onAction !== undefined && (
        <View style={{ marginTop: theme.spacing.lg }}>
          <Button label={actionLabel} onPress={onAction} variant="primary" />
        </View>
      )}
    </View>
  );
}

export interface LoadingStateProps {
  /** Announced to screen readers while the spinner is visible. */
  readonly label?: string;
  readonly testID?: string;
}

export function LoadingState({ label = 'Loading', testID }: LoadingStateProps) {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={[styles.container, { padding: theme.spacing.xl }]}
    >
      <ActivityIndicator color={theme.colors.accent} />
      <Text variant="small" tone="muted" style={{ marginTop: theme.spacing.md }}>
        {label}
      </Text>
    </View>
  );
}

export interface ErrorStateProps {
  readonly title?: string;
  /**
   * A message written for a student. Never pass a raw exception or status code —
   * UI_UX_SPECIFICATION.md requires that technical errors are not exposed.
   */
  readonly message: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly testID?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  testID,
}: ErrorStateProps) {
  const theme = useTheme();

  return (
    <View testID={testID} style={[styles.container, { padding: theme.spacing.xl }]}>
      <Text variant="bodyLarge" weight="semibold" tone="danger" style={styles.centered}>
        {title}
      </Text>
      <Text
        variant="body"
        tone="secondary"
        style={[styles.centered, { marginTop: theme.spacing.sm }]}
      >
        {message}
      </Text>

      {onRetry !== undefined && (
        <View style={{ marginTop: theme.spacing.lg }}>
          <Button label={retryLabel} onPress={onRetry} variant="secondary" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    textAlign: 'center',
  },
});
