import { formatClock, formatHoursMinutes, remainingSeconds } from '@preppilot/shared';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Screen, StatChip, Text } from '../../components/ui';
import { useTheme } from '../../theme/theme-context';
import { focusCapabilities } from './capabilities';
import { focusNow, useFocusStore, watchForDistractions } from './focus-store';

const DURATIONS = [25, 45, 60, 90];

/**
 * Focus Mode (PRD §17).
 *
 * Deliberately modest about what it does. Android does not let one app block
 * another, so this does not pretend to: it gives a distraction-free screen,
 * keeps PrepPilot quiet, and counts the times the student leaves. The
 * capabilities panel states plainly what is not possible, which §17 requires.
 */
export function FocusScreen() {
  const theme = useTheme();
  const state = useFocusStore();
  const [minutes, setMinutes] = useState(25);
  const [now, setNow] = useState(() => focusNow());

  const running = state.timer?.status === 'running';

  // Keeping the screen awake is one of the few things Focus Mode genuinely does,
  // and only while a session is actually running.
  useKeepAwake(running ? 'preppilot-focus' : undefined);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(focusNow()), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    return watchForDistractions();
  }, [running]);

  // A finished countdown must stop recording, or the session keeps banking time
  // the student is no longer spending.
  const end = state.end;
  useEffect(() => {
    if (state.timer === null || !running) return;
    if (remainingSeconds(state.timer, now) === 0) void end();
  }, [state.timer, now, running, end]);

  if (running && state.timer !== null) {
    return <RunningSession now={now} />;
  }

  if (state.timer?.status === 'finished') {
    return <SessionSummary />;
  }

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.base, gap: theme.spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="heading">Focus Mode</Text>
        <Text variant="body" tone="secondary">
          A single screen, no PrepPilot interruptions, for as long as you choose.
        </Text>

        {state.error !== null && (
          <Card>
            <Text variant="small" tone="danger" accessibilityRole="alert">
              {state.error}
            </Text>
          </Card>
        )}

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="caption" tone="muted" overline>
            How Long
          </Text>
          <View style={styles.options}>
            {DURATIONS.map((option) => (
              <Button
                key={option}
                label={`${option} min`}
                size="small"
                variant={option === minutes ? 'primary' : 'secondary'}
                onPress={() => setMinutes(option)}
              />
            ))}
          </View>
        </View>

        <Button
          label="Start focus session"
          fullWidth
          onPress={() => void state.begin({ minutes })}
        />

        <Card>
          <Text variant="caption" tone="muted" overline>
            What This Does
          </Text>
          <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.md }}>
            {focusCapabilities().map((capability) => (
              <View key={capability.id} style={styles.capability}>
                <Text
                  variant="body"
                  // The tick and cross carry the meaning; colour only reinforces
                  // it, so the list stays readable without colour perception.
                  color={capability.supported ? theme.colors.success : theme.colors.textMuted}
                  accessibilityLabel={capability.supported ? 'Supported' : 'Not supported'}
                >
                  {capability.supported ? '✓' : '✗'}
                </Text>
                <View style={styles.capabilityText}>
                  <Text variant="body">{capability.label}</Text>
                  <Text variant="caption" tone="muted">
                    {capability.detail}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function RunningSession({ now }: { readonly now: number }) {
  const theme = useTheme();
  const state = useFocusStore();
  const remaining = remainingSeconds(state.timer!, now) ?? 0;

  return (
    <Screen>
      <View style={styles.running}>
        <Text variant="small" tone="muted">
          {state.subjectName ?? 'Focus session'}
        </Text>

        <Text
          variant="display"
          weight="semibold"
          testID="focus-readout"
          style={[styles.clock, { fontSize: 64, marginVertical: theme.spacing.xl }]}
          accessibilityLabel={`${formatClock(remaining)} remaining`}
        >
          {formatClock(remaining)}
        </Text>

        {state.timesLeft > 0 && (
          <Text variant="small" tone="muted" testID="focus-distractions">
            You have left PrepPilot {state.timesLeft} {state.timesLeft === 1 ? 'time' : 'times'}
          </Text>
        )}

        <View style={{ marginTop: theme.spacing.xxl }}>
          <Button label="End session" variant="secondary" onPress={() => void state.end()} />
        </View>
      </View>
    </Screen>
  );
}

function SessionSummary() {
  const theme = useTheme();
  const state = useFocusStore();

  return (
    <Screen>
      <View style={[styles.running, { gap: theme.spacing.base }]}>
        <Text variant="heading">Session finished</Text>

        <View style={[styles.options, { justifyContent: 'center' }]}>
          <StatChip
            label="Focused for"
            value={formatHoursMinutes(state.lastSessionSeconds ?? 0)}
            testID="focus-summary-time"
          />
          <StatChip
            label="Times you left"
            value={String(state.timesLeft)}
            testID="focus-summary-left"
          />
        </View>

        <View style={[styles.options, { marginTop: theme.spacing.lg }]}>
          <Button label="Start another" onPress={state.reset} />
          <Button label="Back to tracker" variant="ghost" onPress={() => router.push('/')} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  capability: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  capabilityText: { flex: 1 },
  running: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  clock: { fontVariant: ['tabular-nums'] },
});
