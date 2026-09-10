import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, PressableScale, Sheet, Text, TextField } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';
import type { NoteTarget } from '../notes-store';

export interface NoteTargetPickerProps {
  readonly visible: boolean;
  readonly targets: readonly NoteTarget[];
  readonly onPick: (target: NoteTarget) => void;
  readonly onDismiss: () => void;
}

/**
 * Choosing what a new note is about.
 *
 * Notes hang off a topic rather than floating free, so writing one from this tab
 * means naming the topic first. Searchable because a full syllabus runs to
 * hundreds of them, and scrolling to "Thermodynamics" past the whole of
 * mechanics is not choosing, it is hunting.
 */
export function NoteTargetPicker({ visible, targets, onPick, onDismiss }: NoteTargetPickerProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const visibleTargets = (
    needle.length === 0
      ? targets
      : targets.filter((target) =>
          [target.topicName, target.chapterName, target.subjectName]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        )
  ).slice(0, 40);

  return (
    <Sheet visible={visible} onDismiss={onDismiss} label="Choose a topic">
      <Text variant="title">What is the note about?</Text>

      <TextField
        label="Search topics"
        value={query}
        onChangeText={setQuery}
        placeholder="Search by topic, chapter or subject"
        autoCapitalize="none"
        autoCorrect={false}
        testID="note-target-search"
      />

      {targets.length === 0 ? (
        <Text variant="small" tone="secondary" testID="note-targets-empty">
          There are no topics in this course yet. Add a subject in the tracker first, and its topics
          will show up here.
        </Text>
      ) : visibleTargets.length === 0 ? (
        <Text variant="small" tone="secondary" testID="note-targets-no-match">
          No topic matches that.
        </Text>
      ) : (
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          <View style={{ gap: theme.spacing.sm }}>
            {visibleTargets.map((target) => (
              <PressableScale
                key={target.topicId}
                accessibilityRole="button"
                accessibilityLabel={target.topicName}
                accessibilityHint={`In ${target.subjectName}, ${target.chapterName}`}
                testID={`note-target-${target.topicId}`}
                onPress={() => onPick(target)}
              >
                <Card>
                  <Text variant="caption" tone="muted">
                    {target.subjectName} · {target.chapterName}
                  </Text>
                  <Text variant="body" weight="semibold">
                    {target.topicName}
                  </Text>
                  {target.hasNote && (
                    <Text variant="caption" tone="accent">
                      Already has a note — this will open it
                    </Text>
                  )}
                </Card>
              </PressableScale>
            ))}
          </View>
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 320 },
});
