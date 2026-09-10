import {
  POMODORO_LIMITS,
  makePomodoroConfig,
  pomodoroConfigToMinutes,
  type PomodoroConfig,
} from '@preppilot/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, PressableScale, Sheet, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';
import { ariaState } from '../../../components/ui/aria';
import { Stepper } from './stepper';

export interface PomodoroSettingsProps {
  readonly visible: boolean;
  readonly config: PomodoroConfig;
  readonly onCancel: () => void;
  readonly onSave: (config: PomodoroConfig) => void;
}

/**
 * Pomodoro configuration.
 *
 * DECISIONS.md D23 said the defaults were "all configurable" from the start;
 * until now nothing let a student change them, which made the decision a
 * statement of intent rather than a fact.
 */
export function PomodoroSettings({ visible, config, onCancel, onSave }: PomodoroSettingsProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(() => pomodoroConfigToMinutes(config));

  return (
    <Sheet visible={visible} onDismiss={onCancel} label="Pomodoro settings">
      <Text variant="title">Pomodoro settings</Text>

      <View style={{ gap: theme.spacing.base }}>
        <Stepper
          label="Focus interval"
          value={draft.workMinutes}
          min={POMODORO_LIMITS.workMinutes.min}
          max={POMODORO_LIMITS.workMinutes.max}
          step={5}
          unit=" min"
          testID="stepper-work"
          onChange={(workMinutes) => setDraft({ ...draft, workMinutes })}
        />
        <Stepper
          label="Short break"
          value={draft.shortBreakMinutes}
          min={POMODORO_LIMITS.shortBreakMinutes.min}
          max={POMODORO_LIMITS.shortBreakMinutes.max}
          unit=" min"
          testID="stepper-short"
          onChange={(shortBreakMinutes) => setDraft({ ...draft, shortBreakMinutes })}
        />
        <Stepper
          label="Long break"
          value={draft.longBreakMinutes}
          min={POMODORO_LIMITS.longBreakMinutes.min}
          max={POMODORO_LIMITS.longBreakMinutes.max}
          step={5}
          unit=" min"
          testID="stepper-long"
          onChange={(longBreakMinutes) => setDraft({ ...draft, longBreakMinutes })}
        />
        <Stepper
          label="Intervals before a long break"
          value={draft.cyclesBeforeLongBreak}
          min={POMODORO_LIMITS.cyclesBeforeLongBreak.min}
          max={POMODORO_LIMITS.cyclesBeforeLongBreak.max}
          testID="stepper-cycles"
          onChange={(cyclesBeforeLongBreak) => setDraft({ ...draft, cyclesBeforeLongBreak })}
        />

        <PressableScale
          accessibilityRole="switch"
          accessibilityLabel="Start the next phase automatically"
          accessibilityState={{ checked: draft.autoStartNextPhase }}
          {...ariaState({ checked: draft.autoStartNextPhase })}
          onPress={() => setDraft({ ...draft, autoStartNextPhase: !draft.autoStartNextPhase })}
          style={styles.toggleRow}
        >
          <View style={styles.toggleText}>
            <Text variant="body">Start the next phase automatically</Text>
            <Text variant="caption" tone="muted">
              Off by default, so a break never begins without you.
            </Text>
          </View>
          <View
            style={[
              styles.toggle,
              {
                backgroundColor: draft.autoStartNextPhase
                  ? theme.colors.accent
                  : theme.colors.progressTrack,
                borderRadius: theme.radius.pill,
              },
            ]}
          >
            <View
              style={[
                styles.knob,
                {
                  backgroundColor: theme.colors.textOnAccent,
                  alignSelf: draft.autoStartNextPhase ? 'flex-end' : 'flex-start',
                },
              ]}
            />
          </View>
        </PressableScale>
      </View>

      <View style={styles.actions}>
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
        <Button label="Save" onPress={() => onSave(makePomodoroConfig(draft))} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleText: { flex: 1 },
  toggle: { width: 44, height: 26, padding: 3, justifyContent: 'center' },
  knob: { width: 20, height: 20, borderRadius: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
