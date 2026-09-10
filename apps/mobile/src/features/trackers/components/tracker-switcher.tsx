import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, PressableScale, Sheet, Text } from '../../../components/ui';
import type { TrackerRow } from '../../../db/schema';
import { ariaState } from '../../../components/ui/aria';
import { useTheme } from '../../../theme/theme-context';
import { useTrackersStore } from '../trackers-store';

/**
 * Which course you are looking at, and how to change it.
 *
 * Sits on every screen because everything below it is scoped to one tracker: the
 * syllabus, the notes, the cards, the sessions. Without it on screen, a student
 * switching exams has no way to tell whose progress they are reading.
 */
export function TrackerSwitcher() {
  const theme = useTheme();
  const { trackers, activeId, select, remove, error, clearError } = useTrackersStore();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<TrackerRow | null>(null);
  // Held separately so the sheet still names the course while it fades out.
  // Clearing the target alone left the dialog reading “Remove ""?” for the
  // length of the animation.
  const [removingName, setRemovingName] = useState('');

  const active = trackers.find((tracker) => tracker.id === activeId);
  if (active === undefined) return null;

  return (
    <>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Course: ${active.name}. Change course`}
        accessibilityState={{ expanded: open }}
        {...ariaState({ expanded: open })}
        testID="tracker-switcher"
        onPress={() => setOpen(true)}
        style={[
          styles.pill,
          {
            backgroundColor: theme.colors.accent,
            borderRadius: theme.radius.pill,
            paddingHorizontal: theme.spacing.md,
            minHeight: 36,
          },
        ]}
      >
        <Text variant="small" weight="semibold" color={theme.colors.textOnAccent} numberOfLines={1}>
          {active.name}
        </Text>
        <Text variant="small" color={theme.colors.textOnAccent}>
          ▾
        </Text>
      </PressableScale>

      <Sheet
        visible={open && removing === null}
        onDismiss={() => {
          setOpen(false);
          clearError();
        }}
        label="Choose a course"
      >
        <Text variant="title">Your courses</Text>

        {error !== null && (
          <Text variant="small" tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        )}

        <View style={{ gap: theme.spacing.sm }}>
          {trackers.map((tracker) => {
            const current = tracker.id === activeId;

            return (
              <PressableScale
                key={tracker.id}
                accessibilityRole="button"
                accessibilityLabel={tracker.name}
                accessibilityState={{ selected: current }}
                {...ariaState({ selected: current })}
                testID={`tracker-${tracker.id}`}
                onPress={() => {
                  void select(tracker.id);
                  setOpen(false);
                }}
              >
                <Card>
                  <View style={styles.row}>
                    <View style={styles.rowText}>
                      <Text variant="bodyLarge" weight="semibold" numberOfLines={1}>
                        {tracker.name}
                      </Text>
                      {tracker.templateId !== null && (
                        <Text variant="caption" tone="muted">
                          From a course template
                        </Text>
                      )}
                    </View>
                    {current && (
                      <Text variant="small" tone="accent" weight="semibold">
                        Showing
                      </Text>
                    )}
                    {/*
                      Hidden on the last course: removing it would leave nowhere
                      to put a subject, and a button that always refuses is
                      worse than one that is not there.
                    */}
                    {trackers.length > 1 && (
                      <Button
                        label="Remove"
                        size="small"
                        variant="ghost"
                        testID={`remove-tracker-${tracker.id}`}
                        onPress={() => {
                          clearError();
                          setRemovingName(tracker.name);
                          setRemoving(tracker);
                        }}
                      />
                    )}
                  </View>
                </Card>
              </PressableScale>
            );
          })}
        </View>

        <Button
          label="Add a course"
          fullWidth
          testID="add-course"
          onPress={() => {
            setOpen(false);
            router.push('/templates');
          }}
        />
      </Sheet>

      {/*
        Removing a course takes its whole syllabus, notes and cards with it, and
        nothing else in the app keeps a copy. It says exactly what will go
        before it goes, and names the course so it cannot be the wrong one.
      */}
      <Sheet
        visible={removing !== null}
        onDismiss={() => setRemoving(null)}
        label="Remove a course"
      >
        <Text variant="title">Remove “{removingName}”?</Text>
        <Text variant="small" tone="secondary">
          Its syllabus, notes and flashcards go with it. Your study time is kept — you really did
          spend it.
        </Text>

        <View style={styles.confirm}>
          <Button
            label="Keep it"
            variant="secondary"
            testID="remove-tracker-cancel"
            onPress={() => setRemoving(null)}
          />
          <Button
            label="Remove course"
            variant="danger"
            testID="remove-tracker-confirm"
            onPress={() => {
              const target = removing;
              setRemoving(null);
              if (target !== null) void remove(target.id);
            }}
          />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  confirm: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: { flex: 1 },
});
