import {
  CUSTOM_TIMER_LIMITS,
  DEFAULT_POMODORO,
  TIMER_MODES,
  formatHoursMinutes,
  isExpired,
  isStudyPhase,
  parsePomodoro,
  serialisePomodoro,
  type PomodoroConfig,
  type TimerMode,
} from '@preppilot/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Screen, StatChip, Text } from '../../components/ui';
import { useTheme } from '../../theme/theme-context';
import { getRepositories } from '../../db/client';
import { useAuthStore } from '../auth/auth-store';
import { PomodoroSettings } from './components/pomodoro-settings';
import { Stepper } from './components/stepper';
import { TimerDial } from './components/timer-dial';
import { HEARTBEAT_INTERVAL_MS, timerNow, useTimerStore } from './timer-store';

/** How often the readout refreshes. Display only — elapsed time is derived. */
const DISPLAY_INTERVAL_MS = 1000;

const CUSTOM_PRESETS = [15, 30, 45, 60];

/** Where a student's Pomodoro configuration is kept, per device. */
const POMODORO_PREFERENCE = 'timer.pomodoro';

export interface TimerScreenParams {
  readonly subjectId?: string;
  readonly chapterId?: string;
  readonly topicId?: string;
  readonly subjectName?: string;
  readonly chapterName?: string;
  readonly topicName?: string;
  readonly accent?: string;
}

/**
 * The timer screen.
 *
 * The two intervals below do different jobs and must not be conflated: one
 * refreshes the display every second, the other persists progress every thirty.
 * Writing to the database once a second would be wasteful, and refreshing the
 * display once every thirty would look broken.
 */
export function TimerScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams() as Partial<TimerScreenParams>;
  const store = useTimerStore();
  const [mode, setMode] = useState<TimerMode>('stopwatch');
  const [customMinutes, setCustomMinutes] = useState(25);
  const [pomodoro, setPomodoro] = useState<PomodoroConfig>(DEFAULT_POMODORO);
  const [editingPomodoro, setEditingPomodoro] = useState(false);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [now, setNow] = useState(() => timerNow());

  const accent = params.accent ?? theme.colors.accent;
  const label = params.topicName ?? params.chapterName ?? params.subjectName ?? 'General study';

  const configure = store.configure;
  const applyMode = useCallback(
    (next: TimerMode, minutes: number) => {
      setMode(next);
      configure(
        next,
        {
          subjectId: params.subjectId ?? null,
          chapterId: params.chapterId ?? null,
          topicId: params.topicId ?? null,
          subjectName: params.subjectName ?? null,
          chapterName: params.chapterName ?? null,
          topicName: params.topicName ?? null,
          accent,
        },
        next === 'custom' ? { targetSeconds: minutes * 60 } : { pomodoro: pomodoroRef.current },
      );
    },
    // Params are stable for the life of the screen, and the config is read
    // through a ref so changing it does not rebuild this callback mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configure, accent],
  );

  // Read through a ref so applyMode stays stable while the config can change.
  const pomodoroRef = useRef(pomodoro);
  pomodoroRef.current = pomodoro;

  useEffect(() => {
    applyMode('stopwatch', 25);
  }, [applyMode]);

  // Load the student's saved Pomodoro settings, if they have any.
  useEffect(() => {
    if (userId === null) return;

    void (async () => {
      try {
        const stored = await getRepositories().preferences.get(userId, POMODORO_PREFERENCE);
        setPomodoro(parsePomodoro(stored));
      } catch {
        // Unreadable settings are not worth an error; the defaults are sound.
      }
    })();
  }, [userId]);

  const savePomodoro = async (next: PomodoroConfig) => {
    setPomodoro(next);
    setEditingPomodoro(false);
    pomodoroRef.current = next;
    if (mode === 'pomodoro') applyMode('pomodoro', customMinutes);

    if (userId === null) return;
    try {
      await getRepositories().preferences.set(userId, POMODORO_PREFERENCE, serialisePomodoro(next));
    } catch {
      // The session still uses the new values; only persistence failed.
    }
  };

  const timer = store.timer;
  const running = timer?.status === 'running';

  // Display refresh.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(timerNow()), DISPLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [running]);

  // Persistence heartbeat.
  const beat = store.beat;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [running, beat]);

  // A finished countdown must stop recording, or a Pomodoro left on screen would
  // keep banking time the student is not spending.
  const stopTimer = store.stopTimer;
  const expiredRef = useRef(false);
  useEffect(() => {
    if (timer === null || !running) {
      expiredRef.current = false;
      return;
    }
    if (isExpired(timer, now) && !expiredRef.current) {
      expiredRef.current = true;
      void stopTimer();
    }
  }, [timer, now, running, stopTimer]);

  if (timer === null) {
    return (
      <Screen>
        <Text>Preparing timer…</Text>
      </Screen>
    );
  }

  const finished = timer.status === 'finished';
  const idle = timer.status === 'idle';

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.base, gap: theme.spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text variant="title" color={accent} numberOfLines={2}>
            {label}
          </Text>
          <Button label="Close" variant="ghost" size="small" onPress={() => router.back()} />
        </View>

        {store.error !== null && (
          <Card>
            <Text variant="small" tone="danger" accessibilityRole="alert">
              {store.error}
            </Text>
            <View style={{ marginTop: theme.spacing.sm }}>
              <Button label="Dismiss" variant="ghost" size="small" onPress={store.clearError} />
            </View>
          </Card>
        )}

        <View style={styles.dial}>
          <TimerDial timer={timer} now={now} accent={accent} />
        </View>

        <View style={[styles.controls, { gap: theme.spacing.md }]}>
          {idle && <Button label="Start" fullWidth onPress={() => void store.startTimer()} />}
          {running && (
            <>
              <Button label="Pause" variant="secondary" onPress={() => void store.pauseTimer()} />
              <Button label="Stop" variant="danger" onPress={() => void store.stopTimer()} />
            </>
          )}
          {timer.status === 'paused' && (
            <>
              <Button label="Resume" onPress={() => void store.resumeTimer()} />
              <Button label="Stop" variant="danger" onPress={() => void store.stopTimer()} />
            </>
          )}
          {finished && (
            <>
              {timer.mode === 'pomodoro' ? (
                <Button
                  label={isStudyPhase(timer) ? 'Take a break' : 'Back to work'}
                  onPress={() => void store.nextPomodoroPhase()}
                />
              ) : null}
              <Button
                label="New session"
                variant="secondary"
                onPress={() => applyMode(mode, customMinutes)}
              />
            </>
          )}
        </View>

        {finished && (
          <Card>
            <Text variant="body" weight="semibold">
              Session saved
            </Text>
            <Text variant="small" tone="secondary" style={{ marginTop: theme.spacing.xs }}>
              You studied {formatHoursMinutes(timer.bankedSeconds)}.
            </Text>
          </Card>
        )}

        {idle && (
          <>
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="caption" tone="muted" overline>
                Mode
              </Text>
              <View style={[styles.modes, { gap: theme.spacing.sm }]}>
                {TIMER_MODES.map((option) => (
                  <Button
                    key={option}
                    label={modeLabel(option)}
                    size="small"
                    variant={option === mode ? 'primary' : 'secondary'}
                    onPress={() => applyMode(option, customMinutes)}
                  />
                ))}
              </View>
            </View>

            {mode === 'custom' && (
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="caption" tone="muted" overline>
                  Length
                </Text>
                <View style={[styles.modes, { gap: theme.spacing.sm }]}>
                  {CUSTOM_PRESETS.map((minutes) => (
                    <Button
                      key={minutes}
                      label={`${minutes} min`}
                      size="small"
                      variant={minutes === customMinutes ? 'primary' : 'secondary'}
                      onPress={() => {
                        setCustomMinutes(minutes);
                        applyMode('custom', minutes);
                      }}
                    />
                  ))}
                </View>
                {/*
                  The presets are shortcuts, not the whole choice. PRD §11 calls
                  this mode Custom, so any length within a sane range is allowed.
                */}
                <Stepper
                  label="Or choose a length"
                  value={customMinutes}
                  min={CUSTOM_TIMER_LIMITS.min}
                  max={CUSTOM_TIMER_LIMITS.max}
                  step={5}
                  unit=" min"
                  testID="stepper-custom"
                  onChange={(minutes) => {
                    setCustomMinutes(minutes);
                    applyMode('custom', minutes);
                  }}
                />
              </View>
            )}

            {mode === 'pomodoro' && (
              <Button
                label="Pomodoro settings"
                size="small"
                variant="ghost"
                onPress={() => setEditingPomodoro(true)}
              />
            )}
          </>
        )}

        {timer.mode === 'pomodoro' && (
          <View style={styles.stats}>
            <StatChip
              label="Intervals done"
              value={String(timer.completedWorkIntervals)}
              testID="pomodoro-intervals"
            />
          </View>
        )}
      </ScrollView>

      <PomodoroSettings
        visible={editingPomodoro}
        config={pomodoro}
        onCancel={() => setEditingPomodoro(false)}
        onSave={(next) => void savePomodoro(next)}
      />
    </Screen>
  );
}

function modeLabel(mode: TimerMode): string {
  switch (mode) {
    case 'stopwatch':
      return 'Stopwatch';
    case 'pomodoro':
      return 'Pomodoro';
    case 'custom':
      return 'Custom';
  }
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dial: { alignItems: 'center' },
  controls: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  modes: { flexDirection: 'row', flexWrap: 'wrap' },
  stats: { flexDirection: 'row' },
});
