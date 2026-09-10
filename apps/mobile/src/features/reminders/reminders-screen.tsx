import {
  REPEAT_RULES,
  describeDelay,
  describeRepeat,
  nextTimeOfDay,
  parseClockTime,
  parseDelayMinutes,
  validateReminderTitle,
  type RepeatRule,
} from '@preppilot/shared';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Screen,
  Sheet,
  Text,
  TextField,
} from '../../components/ui';
import { getRepositories } from '../../db/client';
import { useAuthStore } from '../auth/auth-store';
import { useTheme } from '../../theme/theme-context';
import { ReminderRow } from './components/reminder-row';
import { remindersSurviveClosing } from './notifications';
import { useRemindersStore } from './reminders-store';
import { useActiveTrackerId } from '../trackers/trackers-store';

/**
 * How the student is choosing the time.
 *
 * The quick picks stay, because most reminders really are "this evening" — but
 * they are now shortcuts beside a free-form entry rather than the only choice.
 * A reminder that cannot be set for 25 minutes is not an alarm.
 */
type WhenMode = 'quick' | 'in' | 'at';

const WHEN_MODES: readonly { mode: WhenMode; label: string }[] = [
  { mode: 'quick', label: 'Quick pick' },
  { mode: 'in', label: 'In…' },
  { mode: 'at', label: 'At a time' },
];

/** Offsets a student is likely to want, relative to now. */
const QUICK_TIMES = [
  { label: 'In 1 hour', minutes: 60 },
  { label: 'This evening', minutes: null as number | null },
  { label: 'Tomorrow morning', minutes: null as number | null },
];

/** Reminders — student-created only (PRD §16). */
export function RemindersScreen() {
  const theme = useTheme();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const state = useRemindersStore();
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [repeat, setRepeat] = useState<RepeatRule>('none');
  const [whenIndex, setWhenIndex] = useState(0);
  const [mode, setMode] = useState<WhenMode>('quick');
  const [delayText, setDelayText] = useState('');
  const [timeText, setTimeText] = useState('');
  const [whenError, setWhenError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);

  const activeTracker = useActiveTrackerId();
  const load = useCallback(async () => {
    if (userId === null) return;
    await useRemindersStore.getState().load(userId, getRepositories());
    // Re-reads when the courses finish loading and whenever the student switches
    // between them: a read taken before the active course was known would sit on
    // an empty result forever.
  }, [userId, activeTracker]);

  useEffect(() => {
    void load();
  }, [load]);

  const openComposer = async () => {
    setTitle('');
    setRepeat('none');
    setWhenIndex(0);
    setMode('quick');
    setDelayText('');
    setTimeText('');
    setWhenError(null);
    setTitleError(null);
    setComposing(true);
    // Ask at the point the student first wants a reminder, not on app launch,
    // so the request has obvious context.
    await useRemindersStore.getState().requestPermission();
  };

  const save = async () => {
    const result = validateReminderTitle(title);
    if (!result.valid) {
      setTitleError(result.message);
      return;
    }

    // Resolved before the sheet closes: a student who typed something the app
    // cannot read needs to see that while their text is still on screen.
    const when = resolveScheduledAt(mode, whenIndex, delayText, timeText);
    if (when === null) {
      setWhenError(
        mode === 'in' ? 'Try something like 25, 45m or 1h 30m.' : 'Try a time like 07:30 or 19:45.',
      );
      return;
    }

    setComposing(false);
    await state.addReminder({ title, scheduledAt: when, repeatRule: repeat });
  };

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.base, gap: theme.spacing.base }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text variant="heading">Reminders</Text>
          <Button label="New reminder" size="small" onPress={() => void openComposer()} />
        </View>

        {state.error !== null && (
          <ErrorState message={state.error} onRetry={() => void load()} retryLabel="Reload" />
        )}

        {state.permissionGranted === false && (
          <Card testID="permission-warning">
            <Text variant="small" tone="danger" accessibilityRole="alert">
              Notifications are turned off for PrepPilot, so these reminders will not alert you. You
              can still see them here.
            </Text>
          </Card>
        )}

        {/*
          A browser has no OS scheduler to hand a reminder to, so one set here
          lives in the tab. Said plainly: a student who trusts an alarm that
          cannot sound has been failed by the app, not by their phone.
        */}
        {!remindersSurviveClosing && (
          <Card testID="web-reminder-notice">
            <Text variant="small" tone="secondary">
              In the browser, reminders only fire while this tab is open. Install the Android app
              for alarms that work with PrepPilot closed.
            </Text>
          </Card>
        )}

        {state.reminders.length === 0 ? (
          <EmptyState
            title="No reminders yet"
            description="Create a reminder to nudge yourself at a time you choose."
            actionLabel="Create a reminder"
            onAction={() => void openComposer()}
            testID="reminders-empty"
          />
        ) : (
          state.reminders.map((reminder) => (
            <ReminderRow
              key={reminder.id}
              reminder={reminder}
              onToggle={(id, enabled) => void state.setEnabled(id, enabled)}
              onDelete={(id) => void state.deleteReminder(id)}
            />
          ))
        )}
      </ScrollView>

      <Sheet visible={composing} onDismiss={() => setComposing(false)} label="New reminder">
        <Text variant="title">New reminder</Text>

        <TextField
          label="Title"
          value={title}
          onChangeText={(next) => {
            setTitle(next);
            if (titleError !== null) setTitleError(null);
          }}
          placeholder="e.g. Revise polynomials"
          autoFocus
          {...(titleError !== null ? { error: titleError } : {})}
        />

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="caption" tone="muted" overline>
            When
          </Text>

          <View style={styles.options}>
            {WHEN_MODES.map((option) => (
              <Button
                key={option.mode}
                label={option.label}
                size="small"
                testID={`when-mode-${option.mode}`}
                variant={option.mode === mode ? 'primary' : 'secondary'}
                onPress={() => {
                  setMode(option.mode);
                  setWhenError(null);
                }}
              />
            ))}
          </View>

          {mode === 'quick' && (
            <View style={styles.options}>
              {QUICK_TIMES.map((option, index) => (
                <Button
                  key={option.label}
                  label={option.label}
                  size="small"
                  testID={`quick-time-${index}`}
                  variant={index === whenIndex ? 'primary' : 'secondary'}
                  onPress={() => setWhenIndex(index)}
                />
              ))}
            </View>
          )}

          {mode === 'in' && (
            <TextField
              label="Remind me in"
              value={delayText}
              onChangeText={(next) => {
                setDelayText(next);
                if (whenError !== null) setWhenError(null);
              }}
              placeholder="25, 45m, 1h 30m"
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              testID="reminder-delay"
              hint={delayHint(delayText)}
              {...(whenError !== null ? { error: whenError } : {})}
            />
          )}

          {mode === 'at' && (
            <TextField
              label="Remind me at"
              value={timeText}
              onChangeText={(next) => {
                setTimeText(next);
                if (whenError !== null) setWhenError(null);
              }}
              placeholder="07:30"
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
              testID="reminder-time"
              hint={timeHint(timeText)}
              {...(whenError !== null ? { error: whenError } : {})}
            />
          )}
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="caption" tone="muted" overline>
            Repeat
          </Text>
          <View style={styles.options}>
            {REPEAT_RULES.map((rule) => (
              <Button
                key={rule}
                label={describeRepeat(rule)}
                size="small"
                variant={rule === repeat ? 'primary' : 'secondary'}
                onPress={() => setRepeat(rule)}
              />
            ))}
          </View>
          {repeat === 'weekdays' && (
            <Text variant="caption" tone="muted">
              Weekday reminders are rescheduled each time you open PrepPilot.
            </Text>
          )}
        </View>

        <View style={styles.actions}>
          <Button label="Cancel" variant="ghost" onPress={() => setComposing(false)} />
          <Button label="Create" onPress={() => void save()} />
        </View>
      </Sheet>
    </Screen>
  );
}

/**
 * Turns whatever the student chose into an absolute moment.
 *
 * Returns null when the text is not a time the app can read, so the composer
 * can say so instead of scheduling something the student did not ask for.
 */
export function resolveScheduledAt(
  mode: WhenMode,
  quickIndex: number,
  delayText: string,
  timeText: string,
  now: number = Date.now(),
): number | null {
  if (mode === 'quick') return resolveWhen(quickIndex, now);

  if (mode === 'in') {
    const minutes = parseDelayMinutes(delayText);
    return minutes === null ? null : now + minutes * 60_000;
  }

  const minutesSinceMidnight = parseClockTime(timeText);
  return minutesSinceMidnight === null ? null : nextTimeOfDay(minutesSinceMidnight, now);
}

/** Confirms back what the app understood, before the student commits to it. */
function delayHint(text: string): string | undefined {
  const minutes = parseDelayMinutes(text);
  return minutes === null ? undefined : `Fires in ${describeDelay(minutes)}`;
}

function timeHint(text: string, now: number = Date.now()): string | undefined {
  const minutesSinceMidnight = parseClockTime(text);
  if (minutesSinceMidnight === null) return undefined;

  const at = nextTimeOfDay(minutesSinceMidnight, now);
  const today = new Date(at).getDate() === new Date(now).getDate();
  return today ? 'Fires later today' : 'Fires tomorrow';
}

/** Turns a quick-pick into an absolute time. */
export function resolveWhen(index: number, now: number = Date.now()): number {
  const date = new Date(now);

  if (index === 1) {
    // This evening: 19:00 today, or tomorrow if that has already passed.
    date.setHours(19, 0, 0, 0);
    if (date.getTime() <= now) date.setDate(date.getDate() + 1);
    return date.getTime();
  }

  if (index === 2) {
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    return date.getTime();
  }

  return now + 60 * 60 * 1000;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
