import { Pressable, StyleSheet, View } from 'react-native';
import { Checkbox, Text } from '../../../components/ui';
import type { SubtopicRow as SubtopicRecord } from '../../../db/schema';
import { useTheme } from '../../../theme/theme-context';
import { RowMenu, type RowMenuAction } from './row-menu';

export interface SubtopicRowProps {
  readonly subtopic: SubtopicRecord;
  readonly accent: string;
  readonly onToggle: (subtopicId: string) => void;
  readonly onRename: (subtopicId: string, current: string) => void;
  readonly onDelete: (subtopicId: string) => void;
  readonly onMove: (subtopicId: string, direction: 'up' | 'down') => void;
  readonly onEditNote: (subtopicId: string, current: string | null) => void;
  readonly onDeleteNote: (subtopicId: string) => void;
  readonly onSummarise: (subtopicId: string) => void;
  readonly onTestMe: (subtopicId: string) => void;
  readonly busy?: boolean;
}

/**
 * The deepest level a student can add.
 *
 * Carries the same menu as a topic — rename, move, note, summarise, test —
 * because a sub-topic is the same kind of thing one level down, and a student
 * who has broken a topic into parts is working at this level. Offering less here
 * would push them back up to a level they deliberately moved past.
 *
 * Visually lighter than a topic: no progress bar, because a sub-topic is either
 * done or not and a bar would only ever read 0% or 100%.
 */
export function SubtopicRow({
  subtopic,
  accent,
  onToggle,
  onRename,
  onDelete,
  onMove,
  onEditNote,
  onDeleteNote,
  onSummarise,
  onTestMe,
  busy = false,
}: SubtopicRowProps) {
  const theme = useTheme();
  const hasNote = subtopic.note !== null && subtopic.note.trim().length > 0;

  const actions: RowMenuAction[] = [
    { label: 'Rename sub-topic', onPress: () => onRename(subtopic.id, subtopic.name) },
    { label: 'Summarise', onPress: () => onSummarise(subtopic.id) },
    { label: 'Test me on this', onPress: () => onTestMe(subtopic.id) },
    {
      label: hasNote ? 'Edit note' : 'Add note',
      onPress: () => onEditNote(subtopic.id, subtopic.note),
    },
    ...(hasNote
      ? [{ label: 'Delete note', destructive: true, onPress: () => onDeleteNote(subtopic.id) }]
      : []),
    { label: 'Move up', onPress: () => onMove(subtopic.id, 'up') },
    { label: 'Move down', onPress: () => onMove(subtopic.id, 'down') },
    { label: 'Delete sub-topic', destructive: true, onPress: () => onDelete(subtopic.id) },
  ];

  return (
    <View testID={`subtopic-${subtopic.id}`}>
      <View style={[styles.row, { paddingVertical: theme.spacing.xs, gap: theme.spacing.sm }]}>
        <Checkbox
          checked={subtopic.completed}
          onToggle={() => onToggle(subtopic.id)}
          label={subtopic.name}
          color={accent}
          size={20}
        />

        <Text
          variant="small"
          tone={subtopic.completed ? 'muted' : 'secondary'}
          numberOfLines={2}
          style={styles.name}
        >
          {subtopic.name}
        </Text>

        <RowMenu actions={actions} label={subtopic.name} />
      </View>

      {busy && (
        <Text variant="caption" tone="accent" testID={`subtopic-busy-${subtopic.id}`}>
          Asking the assistant…
        </Text>
      )}

      {hasNote && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit note on ${subtopic.name}`}
          onPress={() => onEditNote(subtopic.id, subtopic.note)}
          style={[
            styles.note,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderRadius: theme.radius.md,
              padding: theme.spacing.sm,
              marginBottom: theme.spacing.xs,
              borderLeftColor: accent,
            },
          ]}
        >
          <Text variant="caption" tone="secondary">
            {subtopic.note}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  name: { flex: 1 },
  note: { borderLeftWidth: 3, marginLeft: 28 },
});
