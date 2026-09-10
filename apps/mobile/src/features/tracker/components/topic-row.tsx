import {
  calculateSubtopicsProgress,
  formatPercent,
  isTopicComplete,
  makeProgress,
} from '@preppilot/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Checkbox, PlayButton, ProgressBar, Text } from '../../../components/ui';
import { ariaState } from '../../../components/ui/aria';
import type { TopicNode } from '../tracker-store';
import type { TimerTarget } from '../../timer/timer-store';
import { useTheme } from '../../../theme/theme-context';
import { RowMenu, type RowMenuAction } from './row-menu';
import { SubtopicRow } from './subtopic-row';

export interface TopicRowProps {
  readonly topic: TopicNode;
  readonly accent: string;
  readonly onToggle: (topicId: string) => void;
  readonly onDelete: (topicId: string) => void;
  readonly onStartTimer: (target: TimerTarget) => void;
  readonly onRename: (topicId: string, current: string) => void;
  readonly onMove: (topicId: string, direction: 'up' | 'down') => void;
  readonly subjectId: string;
  readonly subjectName: string;
  readonly chapterName: string;
  readonly expanded: boolean;
  readonly onToggleExpanded: (topicId: string) => void;
  readonly onAddSubtopic: (topicId: string) => void;
  readonly onToggleSubtopic: (subtopicId: string) => void;
  readonly onRenameSubtopic: (subtopicId: string, current: string) => void;
  readonly onDeleteSubtopic: (subtopicId: string) => void;
  readonly onMoveSubtopic: (topicId: string, subtopicId: string, direction: 'up' | 'down') => void;
  readonly onEditSubtopicNote: (subtopicId: string, current: string | null) => void;
  readonly onSummariseSubtopic: (subtopicId: string) => void;
  readonly onTestMeSubtopic: (subtopicId: string) => void;
  /** The sub-topic whose summary or questions are being fetched, if any. */
  readonly busySubtopicId?: string | null;
  readonly onEditNote: (topicId: string, current: string | null) => void;
  readonly onDeleteNote: (topicId: string) => void;
  readonly onDeleteSubtopicNote: (subtopicId: string) => void;
  readonly onSummarise: (topicId: string) => void;
  readonly onTestMe: (topicId: string) => void;
  /** The topic whose summary or questions are being fetched, if any. */
  readonly busyTopicId?: string | null;
}

/**
 * The deepest level of the tracker: a checkbox, a name and its own full-or-empty
 * bar, matching the reference screenshots where a topic reads 100% or 0%.
 */
export function TopicRow({
  topic,
  accent,
  onToggle,
  onDelete,
  onStartTimer,
  onRename,
  onMove,
  subjectId,
  subjectName,
  chapterName,
  expanded,
  onToggleExpanded,
  onAddSubtopic,
  onToggleSubtopic,
  onRenameSubtopic,
  onDeleteSubtopic,
  onMoveSubtopic,
  onEditSubtopicNote,
  onSummariseSubtopic,
  onTestMeSubtopic,
  busySubtopicId,
  onEditNote,
  onDeleteNote,
  onDeleteSubtopicNote,
  onSummarise,
  onTestMe,
  busyTopicId,
}: TopicRowProps) {
  const theme = useTheme();
  const hasSubtopics = topic.subtopics.length > 0;
  const complete = isTopicComplete(topic);

  // A topic broken into parts shows how many of them are done; one that is not
  // still reads as the reference does, full or empty.
  const progress = hasSubtopics
    ? calculateSubtopicsProgress(topic)
    : makeProgress(complete ? 1 : 0, 1);

  const hasNote = topic.note !== null && topic.note.trim().length > 0;

  const actions: RowMenuAction[] = [
    { label: 'Rename topic', onPress: () => onRename(topic.id, topic.name) },
    { label: 'Summarise', onPress: () => onSummarise(topic.id) },
    { label: 'Test me on this', onPress: () => onTestMe(topic.id) },
    { label: 'Add sub-topic', onPress: () => onAddSubtopic(topic.id) },
    { label: hasNote ? 'Edit note' : 'Add note', onPress: () => onEditNote(topic.id, topic.note) },
    // Only offered when there is a note: an action that does nothing is worse
    // than one that is absent, because the student has to try it to find out.
    ...(hasNote
      ? [{ label: 'Delete note', destructive: true, onPress: () => onDeleteNote(topic.id) }]
      : []),
    { label: 'Move up', onPress: () => onMove(topic.id, 'up') },
    { label: 'Move down', onPress: () => onMove(topic.id, 'down') },
    { label: 'Delete topic', destructive: true, onPress: () => onDelete(topic.id) },
  ];

  return (
    <View>
      <View style={[styles.row, { paddingVertical: theme.spacing.sm }]}>
        <View style={styles.details}>
          <Text variant="body" numberOfLines={2}>
            {topic.name}
          </Text>
          <View style={[styles.meter, { marginTop: theme.spacing.xs, gap: theme.spacing.sm }]}>
            <ProgressBar progress={progress} color={accent} label={topic.name} style={styles.bar} />
            <Text variant="caption" tone="muted">
              {formatPercent(progress)}
            </Text>
          </View>
        </View>

        <View style={[styles.controls, { gap: theme.spacing.sm }]}>
          <PlayButton
            label={topic.name}
            color={accent}
            size={32}
            onPress={() =>
              onStartTimer({
                subjectId,
                subjectName,
                chapterId: topic.chapterId,
                chapterName,
                topicId: topic.id,
                topicName: topic.name,
                accent,
              })
            }
          />

          <Checkbox
            checked={complete}
            onToggle={() => onToggle(topic.id)}
            label={topic.name}
            color={accent}
          />
          <RowMenu actions={actions} label={topic.name} />
        </View>
      </View>

      {busyTopicId === topic.id && (
        <Text variant="caption" tone="accent" testID={`topic-busy-${topic.id}`}>
          Asking the assistant…
        </Text>
      )}

      {hasNote && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit note on ${topic.name}`}
          onPress={() => onEditNote(topic.id, topic.note)}
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
            {topic.note}
          </Text>
        </Pressable>
      )}

      {/*
        Only offered once a topic has parts, or from its menu. A disclosure on
        every topic would put a control on every row that does nothing for most
        of them.
      */}
      {hasSubtopics && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? 'Hide' : 'Show'} sub-topics of ${topic.name}`}
          accessibilityState={{ expanded }}
          {...ariaState({ expanded })}
          onPress={() => onToggleExpanded(topic.id)}
          style={styles.disclosure}
        >
          <Text variant="caption" tone="accent">
            {expanded
              ? 'Hide sub-topics'
              : `Show ${topic.subtopics.length} sub-topic${topic.subtopics.length === 1 ? '' : 's'}`}
          </Text>
        </Pressable>
      )}

      {hasSubtopics && expanded && (
        <View
          style={[
            styles.subtopics,
            { borderLeftColor: theme.colors.border, marginLeft: theme.spacing.sm },
          ]}
        >
          {topic.subtopics.map((subtopic) => (
            <SubtopicRow
              key={subtopic.id}
              subtopic={subtopic}
              accent={accent}
              onToggle={onToggleSubtopic}
              onRename={onRenameSubtopic}
              onDelete={onDeleteSubtopic}
              onMove={(subtopicId, direction) => onMoveSubtopic(topic.id, subtopicId, direction)}
              onEditNote={onEditSubtopicNote}
              onDeleteNote={onDeleteSubtopicNote}
              onSummarise={onSummariseSubtopic}
              onTestMe={onTestMeSubtopic}
              busy={busySubtopicId === subtopic.id}
            />
          ))}

          <Button
            label="Add sub-topic"
            variant="ghost"
            size="small"
            onPress={() => onAddSubtopic(topic.id)}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  note: { borderLeftWidth: 3 },
  disclosure: { paddingVertical: 4 },
  subtopics: { borderLeftWidth: 1, paddingLeft: 12 },
  details: { flex: 1 },
  meter: { flexDirection: 'row', alignItems: 'center' },
  bar: { flex: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', marginLeft: 12 },
});
