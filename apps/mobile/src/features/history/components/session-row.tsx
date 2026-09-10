import { formatHoursMinutes } from '@preppilot/shared';
import { StyleSheet, View } from 'react-native';
import { Card, PressableScale, Text } from '../../../components/ui';
import type { StudySessionRow } from '../../../db/schema';
import { useTheme } from '../../../theme/theme-context';

export interface SessionRowProps {
  readonly session: StudySessionRow;
  /** Omitted where the row is informational, as on the dashboard. */
  readonly onDelete?: (id: string) => void;
}

/** One entry in the study history: what was studied, when, and for how long. */
export function SessionRow({ session, onDelete }: SessionRowProps) {
  const theme = useTheme();

  const what = session.topicName ?? session.chapterName ?? session.subjectName ?? 'General study';
  const context =
    session.topicName !== null && session.subjectName !== null ? session.subjectName : null;

  return (
    <Card testID={`session-${session.id}`}>
      <View style={styles.row}>
        <View style={styles.details}>
          <Text variant="body" weight="medium" numberOfLines={1}>
            {what}
          </Text>
          <Text variant="caption" tone="muted">
            {context !== null ? `${context} · ` : ''}
            {formatSessionDate(session.startedAt)} · {modeLabel(session.timerMode)}
          </Text>
        </View>

        {onDelete !== undefined && (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Delete session: ${what}`}
            hitSlop={10}
            onPress={() => onDelete(session.id)}
          >
            <Text variant="small" tone="muted">
              ✕
            </Text>
          </PressableScale>
        )}

        <View style={styles.meta}>
          <Text variant="body" weight="semibold">
            {formatHoursMinutes(session.durationSeconds)}
          </Text>
          {session.status === 'abandoned' && (
            // The session was interrupted, so its duration is a lower bound.
            // Saying so is better than presenting a partial figure as complete.
            <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xxs }}>
              interrupted
            </Text>
          )}
        </View>
      </View>
    </Card>
  );
}

/** Short, local, and unambiguous: "23 Aug, 14:05". */
export function formatSessionDate(timestampMs: number): string {
  const date = new Date(timestampMs);
  const day = date.getDate();
  const month = date.toLocaleString(undefined, { month: 'short' });
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month}, ${hours}:${minutes}`;
}

function modeLabel(mode: string): string {
  switch (mode) {
    case 'stopwatch':
      return 'Stopwatch';
    case 'pomodoro':
      return 'Pomodoro';
    case 'custom':
      return 'Custom';
    default:
      return mode;
  }
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  details: { flex: 1 },
  meta: { alignItems: 'flex-end' },
});
