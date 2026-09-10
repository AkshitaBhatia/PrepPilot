import { formatPercent, type Progress } from '@preppilot/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, PlayButton, ProgressRing, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';
import { ariaState } from '../../../components/ui/aria';
import type { TimerTarget } from '../../timer/timer-store';
import type { SubjectNode } from '../tracker-store';
import { ChapterSection } from './chapter-section';
import { RowMenu } from './row-menu';

export interface SubjectCardProps {
  readonly subject: SubjectNode;
  readonly accent: string;
  readonly progress: Progress;
  readonly chapterProgressFor: (chapterId: string) => Progress;
  readonly expandedIds: ReadonlySet<string>;
  readonly onToggleExpanded: (id: string) => void;
  readonly onToggleTopic: (topicId: string) => void;
  readonly onAddChapter: (subjectId: string) => void;
  readonly onAddTopic: (chapterId: string) => void;
  readonly onRenameSubject: (subjectId: string) => void;
  readonly onDeleteSubject: (subjectId: string) => void;
  readonly onDeleteChapter: (chapterId: string) => void;
  readonly onDeleteTopic: (topicId: string) => void;
  readonly onStartTimer: (target: TimerTarget) => void;
  readonly onEditDescription: (subjectId: string, current: string) => void;
  readonly onMoveSubject: (subjectId: string, direction: 'up' | 'down') => void;
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
}

export function SubjectCard({
  subject,
  accent,
  progress,
  chapterProgressFor,
  expandedIds,
  onToggleExpanded,
  onToggleTopic,
  onAddChapter,
  onAddTopic,
  onRenameSubject,
  onDeleteSubject,
  onDeleteChapter,
  onDeleteTopic,
  onStartTimer,
  onEditDescription,
  onMoveSubject,
  onRenameChapter,
  onMoveChapter,
  onRenameTopic,
  onMoveTopic,
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
}: SubjectCardProps) {
  const theme = useTheme();
  const expanded = expandedIds.has(subject.id);

  return (
    <Card>
      <View style={styles.header}>
        <ProgressRing progress={progress} color={accent} label={subject.name} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={subject.name}
          accessibilityState={{ expanded }}
          {...ariaState({ expanded })}
          accessibilityHint={expanded ? 'Hides the chapters' : 'Shows the chapters'}
          onPress={() => onToggleExpanded(subject.id)}
          style={({ pressed }) => [
            styles.identity,
            { minHeight: theme.minTouchTarget, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text variant="bodyLarge" weight="semibold" numberOfLines={2}>
            {subject.name}
          </Text>
          {subject.description !== null && subject.description.length > 0 && (
            <Text variant="small" tone="secondary" numberOfLines={1}>
              {subject.description}
            </Text>
          )}
          <Text variant="small" tone="muted">
            {expanded ? 'Hide Details' : 'See Details'}
          </Text>
        </Pressable>

        <PlayButton
          label={subject.name}
          color={accent}
          onPress={() => onStartTimer({ subjectId: subject.id, subjectName: subject.name, accent })}
        />

        <RowMenu
          label={subject.name}
          actions={[
            { label: 'Add chapter', onPress: () => onAddChapter(subject.id) },
            { label: 'Rename subject', onPress: () => onRenameSubject(subject.id) },
            {
              label: 'Edit description',
              onPress: () => onEditDescription(subject.id, subject.description ?? ''),
            },
            { label: 'Move up', onPress: () => onMoveSubject(subject.id, 'up') },
            { label: 'Move down', onPress: () => onMoveSubject(subject.id, 'down') },
            {
              label: 'Delete subject',
              destructive: true,
              onPress: () => onDeleteSubject(subject.id),
            },
          ]}
        />
      </View>

      {expanded && (
        <View style={{ marginTop: theme.spacing.md }}>
          <View style={styles.summary}>
            <Text variant="small" tone="secondary">
              {progress.completed} of {progress.total} topics
            </Text>
            <Text variant="small" tone={progress.isEmpty ? 'muted' : 'secondary'}>
              {formatPercent(progress, { precision: 1 })}
            </Text>
          </View>

          {subject.chapters.length === 0 ? (
            <Text variant="small" tone="muted" style={{ paddingVertical: theme.spacing.sm }}>
              No chapters yet. Add one to start building this subject.
            </Text>
          ) : (
            subject.chapters.map((chapter) => (
              <ChapterSection
                key={chapter.id}
                chapter={chapter}
                progress={chapterProgressFor(chapter.id)}
                accent={accent}
                expanded={expandedIds.has(chapter.id)}
                onToggleExpanded={onToggleExpanded}
                onToggleTopic={onToggleTopic}
                onAddTopic={onAddTopic}
                onDeleteChapter={onDeleteChapter}
                onDeleteTopic={onDeleteTopic}
                onStartTimer={onStartTimer}
                onRenameChapter={onRenameChapter}
                onMoveChapter={onMoveChapter}
                onRenameTopic={onRenameTopic}
                onMoveTopic={onMoveTopic}
                expandedTopics={expandedTopics}
                onToggleTopicExpanded={onToggleTopicExpanded}
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
                subjectName={subject.name}
                subjectId={subject.id}
              />
            ))
          )}

          <View style={{ marginTop: theme.spacing.sm }}>
            <Button
              label="Add New Chapter"
              variant="outline"
              fullWidth
              onPress={() => onAddChapter(subject.id)}
            />
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identity: { flex: 1, justifyContent: 'center' },
  summary: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
});
