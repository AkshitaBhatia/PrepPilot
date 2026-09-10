import { formatPercent } from '@preppilot/shared';
import { StyleSheet, View } from 'react-native';
import { Button, Card, ProgressBar, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';
import type { ContinuePoint } from '../continue-tracking';

export interface WelcomeCardProps {
  readonly name: string;
  /** Null when there is nothing to continue — a first run, or a finished course. */
  readonly continuing: ContinuePoint | null;
  readonly onContinue: (point: ContinuePoint) => void;
}

/**
 * The greeting, and the way back to whatever was last being studied.
 *
 * The continue card appears only when there is a real session behind it. An
 * empty one, or one showing invented progress, would teach the student to stop
 * reading this part of the screen.
 */
export function WelcomeCard({ name, continuing, onContinue }: WelcomeCardProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.base }}>
      <Text variant="heading" numberOfLines={2} testID="welcome-greeting">
        Welcome, {name}
      </Text>

      {continuing !== null && (
        <Card testID="continue-tracking">
          <Text variant="caption" tone="muted" overline>
            Continue tracking
          </Text>

          <Text
            variant="bodyLarge"
            weight="semibold"
            numberOfLines={2}
            style={{ marginTop: theme.spacing.xxs }}
          >
            {continuing.subjectName}
          </Text>

          {continuing.detail !== null && (
            <Text variant="small" tone="secondary" numberOfLines={2}>
              {continuing.detail}
            </Text>
          )}

          <View style={[styles.meter, { marginTop: theme.spacing.sm, gap: theme.spacing.sm }]}>
            <ProgressBar
              progress={continuing.progress}
              label={continuing.subjectName}
              style={styles.bar}
            />
            <Text variant="caption" tone="muted">
              {formatPercent(continuing.progress)}
            </Text>
          </View>

          <View style={{ marginTop: theme.spacing.base }}>
            <Button
              label="Continue"
              fullWidth
              testID="continue-tracking-action"
              onPress={() => onContinue(continuing)}
            />
          </View>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Row on wide screens, but the bar keeps its own width so a long percentage
  // cannot squeeze it to nothing.
  meter: { flexDirection: 'row', alignItems: 'center' },
  bar: { flex: 1 },
});
