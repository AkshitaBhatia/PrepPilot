import { formatPercent, type Progress } from '@preppilot/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, PlayButton, ProgressBar, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';
import { ariaState } from '../../../components/ui/aria';
import type { TimerTarget } from '../../timer/timer-store';
import type { ChapterNode } from '../tracker-store';
import { RowMenu } from './row-menu';
import { TopicRow } from './topic-row';

export interface ChapterSectionProps {
  readonly chapter: ChapterNode;
  readonly progress: Progress;
  readonly accent: string;
  readonly expanded: boolean;
  readonly onToggleExpanded: (chapterId: string) => void;
  readonly onToggleTopic: (topicId: string) => void;
  readonly onAddTopic: (chapterId: string) => void;
  readonly onDeleteChapter: (chapterId: string) => void;
  readonly onDeleteTopic: (topicId: string) => void;
  readonly onStartTimer: (target: TimerTarget) => void;
  readonly onRenameChapter: (chapterId: string, current: string) => void;
  readonly onMoveChapter: (chapterId: string, direction: 'up' | 'down') => void;
  readonly onRenameTopic: (topicId: string, current: string) => void;
  readonly onMoveTopic: (chapterId: string, topicId: string, direction: 'up' | 'down') => void;
  readonly expandedTopics: ReadonlySet<string>;
  readonly onToggleTopicExpanded: (topicId: string) => void;
  readonly onAddSubtopic: (topicId: string) => void;
  readonly onToggleSubtopic: (subtopicId: string) => void;
  readonly onRenameSubtopic: (subtopicId: string, current: string) => void;
  readonly onDeleteSubtopic: (subtopicId: string) => void;
  readonly onMoveSubtopic: (topicId: string, subtopicId: string, direction: 'up' | 'down') => void;
  readonly onEditSubtopicNote: (subtopicId: string, current: string | null) => void;
  readonly onDeleteNote: (topicId: string) => void;
  readonly onDeleteSubtopicNote: (subtopicId: string) => void;
  readonly onSummariseSubtopic: (subtopicId: string) => void;
  readonly onTestMeSubtopic: (subtopicId: string) => void;
  readonly busySubtopicId?: string | null;
  readonly onEditNote: (topicId: string, current: string | null) => void;
  readonly onSummarise: (topicId: string) => void;
  readonly onTestMe: (topicId: string) => void;
  readonly busyTopicId?: string | null;
  readonly subjectId: string;
  readonly subjectName: string;
}

export function ChapterSection({
  chapter,
  progress,
  accent,
  expanded,
  onToggleExpanded,
  onToggleTopic,
  onAddTopic,
  onDeleteChapter,
  onDeleteTopic,
  onStartTimer,
  expandedTopics,
  onToggleTopicExpanded,
  onAddSubtopic,
  onToggleSubtopic,
  onRenameSubtopic,
  onDeleteSubtopic,
  onMoveSubtopic,
  onEditSubtopicNote,
  onDeleteNote,
  onDeleteSubtopicNote,
  onSummariseSubtopic,
  onTestMeSubtopic,
  busySubtopicId,
  onEditNote,
  onSummarise,
  onTestMe,
  busyTopicId,
  onRenameChapter,
  onMoveChapter,
  onRenameTopic,
  onMoveTopic,
  subjectId,
  subjectName,
}: ChapterSectionProps) {
  const theme = useTheme();

  return (
    <View style={{ paddingVertical: theme.spacing.sm }}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={chapter.name}
          accessibilityState={{ expanded }}
          {...ariaState({ expanded })}
          accessibilityHint={expanded ? 'Hides the topics' : 'Shows the topics'}
          onPress={() => onToggleExpanded(chapter.id)}
          style={({ pressed }) => [
            styles.headerPress,
            { minHeight: theme.minTouchTarget, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text variant="body" weight="medium" numberOfLines={2}>
            {chapter.name}
          </Text>
          <View style={[styles.meter, { marginTop: theme.spacing.xs, gap: theme.spacing.sm }]}>
            <ProgressBar
              progress={progress}
              color={accent}
              label={chapter.name}
              style={styles.bar}
            />
            <Text variant="small" tone={progress.isEmpty ? 'muted' : 'secondary'}>
              {formatPercent(progress, { precision: 1 })}
            </Text>
          </View>
        </Pressable>

        <PlayButton
          label={chapter.name}
          color={accent}
          size={36}
          onPress={() =>
            onStartTimer({
              subjectId,
              subjectName,
              chapterId: chapter.id,
              chapterName: chapter.name,
              accent,
            })
          }
        />

        <RowMenu
          label={chapter.name}
          actions={[
            { label: 'Add topic', onPress: () => onAddTopic(chapter.id) },
            { label: 'Rename chapter', onPress: () => onRenameChapter(chapter.id, chapter.name) },
            { label: 'Move up', onPress: () => onMoveChapter(chapter.id, 'up') },
            { label: 'Move down', onPress: () => onMoveChapter(chapter.id, 'down') },
            {
              label: 'Delete chapter',
              destructive: true,
              onPress: () => onDeleteChapter(chapter.id),
            },
          ]}
        />
      </View>

      {expanded && (
        <View style={{ paddingLeft: theme.spacing.base, marginTop: theme.spacing.xs }}>
          {chapter.topics.length === 0 ? (
            <Text variant="small" tone="muted" style={{ paddingVertical: theme.spacing.sm }}>
              No topics yet. Add one to start tracking this chapter.
            </Text>
          ) : (
            chapter.topics.map((topic) => (
              <TopicRow
                key={topic.id}
                topic={topic}
                accent={accent}
                onToggle={onToggleTopic}
                onDelete={onDeleteTopic}
                onStartTimer={onStartTimer}
                onRename={onRenameTopic}
                onMove={(topicId, direction) => onMoveTopic(chapter.id, topicId, direction)}
                subjectId={subjectId}
                subjectName={subjectName}
                chapterName={chapter.name}
                expanded={expandedTopics.has(topic.id)}
                onToggleExpanded={onToggleTopicExpanded}
                onAddSubtopic={onAddSubtopic}
                onToggleSubtopic={onToggleSubtopic}
                onRenameSubtopic={onRenameSubtopic}
                onDeleteSubtopic={onDeleteSubtopic}
                onMoveSubtopic={onMoveSubtopic}
                onEditSubtopicNote={onEditSubtopicNote}
                onDeleteNote={onDeleteNote}
                onDeleteSubtopicNote={onDeleteSubtopicNote}
                onSummariseSubtopic={onSummariseSubtopic}
                onTestMeSubtopic={onTestMeSubtopic}
                busySubtopicId={busySubtopicId}
                onEditNote={onEditNote}
                onSummarise={onSummarise}
                onTestMe={onTestMe}
                busyTopicId={busyTopicId}
              />
            ))
          )}

          <View style={{ marginTop: theme.spacing.sm }}>
            <Button
              label="Add New Topic"
              variant="outline"
              fullWidth
              onPress={() => onAddTopic(chapter.id)}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  headerPress: { flex: 1, justifyContent: 'center' },
  meter: { flexDirection: 'row', alignItems: 'center' },
  bar: { flex: 1 },
});
