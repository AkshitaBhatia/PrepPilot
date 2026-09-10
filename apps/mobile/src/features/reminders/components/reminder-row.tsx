import { describeRepeat, isReminderExpired } from '@preppilot/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, Text } from '../../../components/ui';
import type { ReminderRow as ReminderRecord } from '../../../db/schema';
import { useTheme } from '../../../theme/theme-context';
import { ariaState } from '../../../components/ui/aria';

export interface ReminderRowProps {
  readonly reminder: ReminderRecord;
  readonly onToggle: (id: string, enabled: boolean) => void;
  readonly onDelete: (id: string) => void;
}

export function ReminderRow({ reminder, onToggle, onDelete }: ReminderRowProps) {
  const theme = useTheme();
  const expired = isReminderExpired(
    { scheduledAt: reminder.scheduledAt, repeat: reminder.repeatRule },
    Date.now(),
  );

  return (
    <Card testID={`reminder-${reminder.id}`}>
      <View style={styles.row}>
        <View style={styles.details}>
          <Text variant="body" weight="medium" numberOfLines={1}>
            {reminder.title}
          </Text>
          <Text variant="caption" tone="muted">
            {formatReminderTime(reminder.scheduledAt)} · {describeRepeat(reminder.repeatRule)}
            {reminder.relatedName !== null ? ` · ${reminder.relatedName}` : ''}
          </Text>
          {expired && (
            // A past one-off will never fire again. Leaving it looking active
            // would be a promise the app cannot keep.
            <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xxs }}>
              This reminder has already passed.
            </Text>
          )}
        </View>

        <View style={[styles.actions, { gap: theme.spacing.md }]}>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={reminder.title}
            accessibilityState={{ checked: reminder.enabled }}
            {...ariaState({ checked: reminder.enabled })}
            hitSlop={10}
            onPress={() => onToggle(reminder.id, !reminder.enabled)}
            style={({ pressed }) => [
              styles.toggle,
              {
                backgroundColor: reminder.enabled
                  ? theme.colors.accent
                  : theme.colors.progressTrack,
                borderRadius: theme.radius.pill,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.knob,
                {
                  backgroundColor: theme.colors.textOnAccent,
                  // Position doubles as the state cue, so it is not colour alone.
                  alignSelf: reminder.enabled ? 'flex-end' : 'flex-start',
                },
              ]}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${reminder.title}`}
            hitSlop={10}
            onPress={() => onDelete(reminder.id)}
          >
            <Text variant="small" tone="danger">
              Delete
            </Text>
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

/** "Mon 25 Aug, 07:00" — day name included, because a reminder is about when. */
export function formatReminderTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  const weekday = date.toLocaleString(undefined, { weekday: 'short' });
  const month = date.toLocaleString(undefined, { month: 'short' });
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${weekday} ${date.getDate()} ${month}, ${hours}:${minutes}`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  details: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  toggle: { width: 44, height: 26, padding: 3, justifyContent: 'center' },
  knob: { width: 20, height: 20, borderRadius: 10 },
});
