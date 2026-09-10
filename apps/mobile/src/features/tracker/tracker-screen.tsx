import { accentForIndex } from '@preppilot/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppHeader,
  Button,
  EmptyState,
  ErrorState,
  FadeIn,
  NamePrompt,
  Screen,
  SkeletonCard,
  Text,
  Sheet,
} from '../../components/ui';
import { getRepositories } from '../../db/client';
import { emptyStateCopy } from '../../constants/copy';
import type { SyllabusTemplate, TemplateSubject } from '@preppilot/shared';
import { importTemplate } from '../templates/import-template';
import type { Quiz } from '@preppilot/shared';
import { quizTopic, summariseTopic, type TopicContext } from '../ai/ai-client';
import { AddSubjectSheet } from './components/add-subject-sheet';
import { WelcomeCard } from './components/welcome-card';
import { continuePoint, type ContinuePoint } from './continue-tracking';
import { displayNameFor } from '../auth/display-name';
import { isDemoMode } from '../../config/env';
import { SubjectPicker } from '../templates/components/subject-picker';
import { GenerateSubjectSheet } from '../ai/components/generate-subject-sheet';
import { importSubjects } from '../templates/import-template';
import { useAiStore } from '../ai/ai-store';
import { UNAVAILABLE_COPY } from '../ai/ai-client';
import { ExamPicker } from './components/exam-picker';
import { TopicQuiz } from './components/topic-quiz';
import { useAuthStore } from '../auth/auth-store';
import { useActiveTrackerId, useTrackersStore } from '../trackers/trackers-store';
import { useTheme } from '../../theme/theme-context';
import type { TimerTarget } from '../timer/timer-store';
import { SyllabusSummary } from './components/syllabus-summary';
import { SubjectCard } from './components/subject-card';
import { chapterProgress, subjectProgress, useTrackerStore } from './tracker-store';

/** Which prompt is open, and what it will act on. */
type Prompt =
  | { readonly kind: 'addSubject' }
  | { readonly kind: 'addChapter'; readonly subjectId: string }
  | { readonly kind: 'addTopic'; readonly chapterId: string }
  | { readonly kind: 'renameSubject'; readonly subjectId: string; readonly current: string }
  | { readonly kind: 'renameChapter'; readonly chapterId: string; readonly current: string }
  | { readonly kind: 'renameTopic'; readonly topicId: string; readonly current: string }
  | { readonly kind: 'addSubtopic'; readonly topicId: string }
  | { readonly kind: 'renameSubtopic'; readonly subtopicId: string; readonly current: string }
  | { readonly kind: 'editNote'; readonly topicId: string; readonly current: string }
  | { readonly kind: 'editSubtopicNote'; readonly subtopicId: string; readonly current: string }
  | { readonly kind: 'editDescription'; readonly subjectId: string; readonly current: string }
  | null;

/**
 * The Tracker — the primary screen (PRD §19).
 *
 * Renders the Subject → Chapter → Topic → Sub-topic hierarchy with the visual
 * weighting the specification calls for: a circular meter for subjects, a bar
 * for chapters and topics, and a checkbox at the leaf.
 *
 * Sub-topics are optional and a student adds them themselves, so a topic without
 * any looks exactly as it always did — the fourth level costs nothing until it
 * is used.
 */
export function TrackerScreen() {
  const theme = useTheme();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const state = useTrackerStore();
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Kept on the screen rather than in the store: which rows a student has opened
  // is a view concern, and it should not survive a reload the way data does.
  const [expandedTopics, setExpandedTopics] = useState<ReadonlySet<string>>(new Set());
  /** The exam currently being imported, so its card can say so. */
  const [importing, setImporting] = useState<string | null>(null);
  /** The topic whose summary or questions are being fetched. */
  const [askingAbout, setAskingAbout] = useState<string | null>(null);
  /** Whether the thing being asked about is a topic or one of its sub-topics. */
  const [askingLevel, setAskingLevel] = useState<'topic' | 'subtopic'>('topic');
  const [summary, setSummary] = useState<{ topicName: string; text: string } | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const isGuest = useAuthStore((store) => store.isGuest);

  /**
   * Says no once, with a reason and a way past it.
   *
   * A guest pressing Summarise used to get a failed request; the assistant needs
   * an account to charge the call to, and that is worth saying before the wait
   * rather than after it.
   */
  const refuseAiForGuest = (): boolean => {
    if (!isGuest) return false;
    setAiError(UNAVAILABLE_COPY.guest);
    return true;
  };
  const [quizTopicId, setQuizTopicId] = useState<string | null>(null);
  const [quizLevel, setQuizLevel] = useState<'topic' | 'subtopic'>('topic');
  const [addingSubject, setAddingSubject] = useState(false);
  const [pickingSubjects, setPickingSubjects] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [addingFromTemplate, setAddingFromTemplate] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const user = useAuthStore((store) => store.user);
  const [continuing, setContinuing] = useState<ContinuePoint | null>(null);
  const activeTracker = useActiveTrackerId();
  const activeTrackerName =
    useTrackersStore((store) => store.trackers.find((row) => row.id === store.activeId)?.name) ??
    'your course';
  const load = useCallback(async () => {
    if (userId === null) return;
    await state.load(userId, getRepositories());

    // Read after the syllabus, because where to continue is only meaningful
    // against the subjects that are actually there.
    try {
      const sessions = await getRepositories().sessions.listByUser(userId, 25, activeTracker);
      setContinuing(continuePoint(sessions, useTrackerStore.getState()));
    } catch {
      // The card is a convenience; the syllabus below it is the screen.
      setContinuing(null);
    }
    // Re-reads when the courses finish loading and whenever the student switches
    // between them: a read taken before the active course was known would sit on
    // an empty result forever.
    // `state.load` is stable on the store; depending on the whole store object
    // would re-run this on every keystroke elsewhere in the tree.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeTracker]);

  /**
   * Re-reads whenever this screen comes back into view.
   *
   * A plain effect runs once, and tab screens stay mounted — so importing a
   * template from the library and returning here left the old, empty tracker on
   * screen. The import had written to the database; nothing had looked again,
   * which read exactly like the button doing nothing.
   */
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  /** Subject colour follows creation order, so a subject keeps its colour. */
  const accents = useMemo(
    () => new Map(state.subjects.map((subject, index) => [subject.id, accentForIndex(index)])),
    [state.subjects],
  );

  /**
   * Opens the timer for the tapped item.
   *
   * Names travel as route params alongside the ids so the timer can label itself
   * and snapshot them onto the session without a second database read.
   */
  const openTimer = (target: TimerTarget) => {
    router.push({
      pathname: '/timer',
      params: Object.fromEntries(
        Object.entries(target).filter(([, value]) => typeof value === 'string'),
      ) as Record<string, string>,
    });
  };

  /**
   * Imports the chosen exam's syllabus straight into the tracker.
   *
   * No preview step: the student answered "which exam", and interrupting that
   * with a confirmation of something they already chose adds a tap without
   * adding a decision. Everything imported is editable, and the template library
   * — which does preview, because there the choice is still open — is one tap
   * away in the header.
   */
  const chooseExam = async (template: SyllabusTemplate) => {
    if (userId === null || importing !== null) return;

    setImporting(template.id);
    try {
      // The first course a student picks becomes the tracker they are in, rather
      // than a second one sitting empty beside it. The picker only appears while
      // that course is still empty, so nothing can be merged into.
      const active = useTrackersStore.getState().activeId;
      await importTemplate(userId, template, getRepositories(), active);
      if (active !== null) await useTrackersStore.getState().rename(active, template.name);
      await load();
    } catch {
      useTrackerStore.setState({
        error: 'We could not add that syllabus. Try again.',
      });
    } finally {
      setImporting(null);
    }
  };

  /**
   * Adds chosen template subjects into the course already on screen.
   *
   * Additive: it appends and touches nothing that is there, which is the whole
   * difference between this and importing a template as a new course.
   */
  const addFromTemplate = async (subjects: readonly TemplateSubject[]) => {
    if (userId === null || addingFromTemplate) return;

    setAddingFromTemplate(true);
    try {
      await importSubjects(userId, subjects, getRepositories(), activeTracker);
      setPickingSubjects(false);
      await load();
    } catch {
      setAddError('We could not add those subjects. Try again.');
    } finally {
      setAddingFromTemplate(false);
    }
  };

  /**
   * Where something sits, which is all a summary or a quiz has to work from.
   *
   * A sub-topic reports its own name with the topic above it as the chapter, so
   * the model is told "Refraction, under Light" rather than losing the part that
   * makes the name mean anything.
   */
  const contextFor = (id: string): TopicContext | null => {
    for (const subject of state.subjects) {
      for (const chapter of subject.chapters) {
        for (const topic of chapter.topics) {
          if (topic.id === id) {
            return {
              topicName: topic.name,
              chapterName: chapter.name,
              subjectName: subject.name,
            };
          }

          const subtopic = topic.subtopics.find((entry) => entry.id === id);
          if (subtopic !== undefined) {
            return {
              topicName: subtopic.name,
              chapterName: topic.name,
              subjectName: `${subject.name} · ${chapter.name}`,
            };
          }
        }
      }
    }
    return null;
  };

  const summariseTopicById = async (topicId: string, level: 'topic' | 'subtopic' = 'topic') => {
    const context = contextFor(topicId);
    if (context === null || askingAbout !== null || refuseAiForGuest()) return;

    setAskingLevel(level);
    setAskingAbout(topicId);
    setAiError(null);
    try {
      const result = await summariseTopic(context);
      if (result.ok) setSummary({ topicName: context.topicName, text: result.summary });
      else setAiError(result.message);
    } finally {
      setAskingAbout(null);
    }
  };

  const testMeOn = async (topicId: string, level: 'topic' | 'subtopic' = 'topic') => {
    if (refuseAiForGuest()) return;
    const context = contextFor(topicId);
    if (context === null || askingAbout !== null) return;

    setAskingLevel(level);
    setAskingAbout(topicId);
    setAiError(null);
    try {
      const result = await quizTopic(context);
      if (result.ok) {
        setQuiz(result.quiz);
        setQuizTopicId(topicId);
        setQuizLevel(level);
      } else {
        setAiError(result.message);
      }
    } finally {
      setAskingAbout(null);
    }
  };

  const confirmPrompt = async (name: string) => {
    const pending = prompt;
    setPrompt(null);
    if (pending === null) return;

    switch (pending.kind) {
      case 'addSubject':
        await state.addSubject(name);
        break;
      case 'addChapter':
        await state.addChapter(pending.subjectId, name);
        break;
      case 'addTopic':
        await state.addTopic(pending.chapterId, name);
        break;
      case 'renameSubject':
        await state.renameSubject(pending.subjectId, name);
        break;
      case 'renameChapter':
        await state.renameChapter(pending.chapterId, name);
        break;
      case 'renameTopic':
        await state.renameTopic(pending.topicId, name);
        break;
      case 'addSubtopic':
        await state.addSubtopic(pending.topicId, name);
        // Opening the topic is the only way the student sees what they added.
        setExpandedTopics((current) => new Set(current).add(pending.topicId));
        break;
      case 'renameSubtopic':
        await state.renameSubtopic(pending.subtopicId, name);
        break;
      case 'editNote':
        await state.setTopicNote(pending.topicId, name);
        break;
      case 'editSubtopicNote':
        await state.setSubtopicNote(pending.subtopicId, name);
        break;
      case 'editDescription':
        await state.setSubjectDescription(pending.subjectId, name);
        break;
    }
  };

  if (state.loading && state.subjects.length === 0) {
    return (
      <Screen>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Loading your syllabus"
          style={{ gap: theme.spacing.md, paddingTop: theme.spacing.base }}
        >
          {/* The eventual shape is known, so hold the layout still rather than
              spinning and then reflowing when content lands. */}
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.base, gap: theme.spacing.base }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
        }
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          overline="Your syllabus"
          title="Tracker"
          action={
            <Button
              label="Add subject"
              size="small"
              testID="add-subject"
              onPress={() => setAddingSubject(true)}
            />
          }
        />

        <WelcomeCard
          // Demo mode is signed in to a local stand-in account, not to anyone:
          // the banner says "not signed in", so the greeting must agree.
          name={displayNameFor(user, isGuest || isDemoMode())}
          continuing={continuing}
          onContinue={(point) =>
            openTimer({ subjectId: point.subjectId, subjectName: point.subjectName })
          }
        />

        <SyllabusSummary progress={state.progress.overall} subjectCount={state.subjects.length} />

        {state.error !== null && (
          <ErrorState message={state.error} onRetry={() => void load()} retryLabel="Reload" />
        )}

        {state.subjects.length === 0 ? (
          <View testID="tracker-empty">
            <ExamPicker
              busyId={importing}
              onChoose={(template) => void chooseExam(template)}
              onOwnSubject={() => setPrompt({ kind: 'addSubject' })}
              onBrowseAll={() => router.push('/templates')}
            />
          </View>
        ) : (
          state.subjects.map((subject, index) => (
            <FadeIn
              key={subject.id}
              // Capped so a long syllabus does not take a second to appear.
              delay={Math.min(index, 6) * 45}
            >
              <SubjectCard
                subject={subject}
                accent={accents.get(subject.id) ?? theme.colors.accent}
                progress={subjectProgress(state, subject.id)}
                chapterProgressFor={(chapterId) => chapterProgress(state, chapterId)}
                expandedIds={state.expanded}
                onToggleExpanded={state.toggleExpanded}
                onToggleTopic={(topicId) => void state.toggleTopic(topicId)}
                onAddChapter={(subjectId) => setPrompt({ kind: 'addChapter', subjectId })}
                onAddTopic={(chapterId) => setPrompt({ kind: 'addTopic', chapterId })}
                onRenameSubject={(subjectId) =>
                  setPrompt({ kind: 'renameSubject', subjectId, current: subject.name })
                }
                onDeleteSubject={(subjectId) => void state.deleteSubject(subjectId)}
                onDeleteChapter={(chapterId) => void state.deleteChapter(chapterId)}
                onDeleteTopic={(topicId) => void state.deleteTopic(topicId)}
                onStartTimer={openTimer}
                onEditDescription={(subjectId, current) =>
                  setPrompt({ kind: 'editDescription', subjectId, current })
                }
                onMoveSubject={(subjectId, direction) =>
                  void state.moveSubject(subjectId, direction)
                }
                onRenameChapter={(chapterId, current) =>
                  setPrompt({ kind: 'renameChapter', chapterId, current })
                }
                onMoveChapter={(chapterId, direction) =>
                  void state.moveChapter(subject.id, chapterId, direction)
                }
                onRenameTopic={(topicId, current) =>
                  setPrompt({ kind: 'renameTopic', topicId, current })
                }
                expandedTopics={expandedTopics}
                onToggleTopicExpanded={(topicId) =>
                  setExpandedTopics((current) => {
                    const next = new Set(current);
                    if (next.has(topicId)) next.delete(topicId);
                    else next.add(topicId);
                    return next;
                  })
                }
                onAddSubtopic={(topicId) => setPrompt({ kind: 'addSubtopic', topicId })}
                onToggleSubtopic={(subtopicId) => void state.toggleSubtopic(subtopicId)}
                onRenameSubtopic={(subtopicId, current) =>
                  setPrompt({ kind: 'renameSubtopic', subtopicId, current })
                }
                onDeleteSubtopic={(subtopicId) => void state.deleteSubtopic(subtopicId)}
                onSummarise={(topicId) => void summariseTopicById(topicId)}
                onTestMe={(topicId) => void testMeOn(topicId)}
                busyTopicId={askingLevel === 'topic' ? askingAbout : null}
                onMoveSubtopic={(topicId, subtopicId, direction) =>
                  void state.moveSubtopic(topicId, subtopicId, direction)
                }
                onEditSubtopicNote={(subtopicId, current) =>
                  setPrompt({ kind: 'editSubtopicNote', subtopicId, current: current ?? '' })
                }
                onSummariseSubtopic={(subtopicId) =>
                  void summariseTopicById(subtopicId, 'subtopic')
                }
                onTestMeSubtopic={(subtopicId) => void testMeOn(subtopicId, 'subtopic')}
                busySubtopicId={askingLevel === 'subtopic' ? askingAbout : null}
                onEditNote={(topicId, current) =>
                  setPrompt({ kind: 'editNote', topicId, current: current ?? '' })
                }
                onDeleteNote={(topicId) => void state.setTopicNote(topicId, null)}
                onDeleteSubtopicNote={(subtopicId) => void state.setSubtopicNote(subtopicId, null)}
                onMoveTopic={(chapterId, topicId, direction) =>
                  void state.moveTopic(chapterId, topicId, direction)
                }
              />
            </FadeIn>
          ))
        )}
      </ScrollView>

      {/*
        A summary is read, not acted on, so it closes with one tap and changes
        nothing. Nothing here marks a topic complete.
      */}
      <Sheet visible={summary !== null} onDismiss={() => setSummary(null)} label="Topic summary">
        {summary !== null && (
          <>
            <View>
              <Text variant="caption" tone="muted" overline>
                Summary
              </Text>
              <Text variant="title">{summary.topicName}</Text>
            </View>
            <Text variant="body" tone="secondary" testID="topic-summary">
              {summary.text}
            </Text>
            <View style={styles.sheetActions}>
              <Button label="Close" onPress={() => setSummary(null)} />
            </View>
          </>
        )}
      </Sheet>

      {quiz !== null && (
        <TopicQuiz
          visible
          quiz={quiz}
          onDismiss={() => {
            setQuiz(null);
            setQuizTopicId(null);
          }}
          onFinish={(passed) => {
            const topicId = quizTopicId;
            setQuiz(null);
            setQuizTopicId(null);
            // Passing offers to tick the topic; failing simply closes. Neither
            // path can stop a student ticking it themselves (D55).
            if (passed && topicId !== null) {
              if (quizLevel === 'subtopic') void state.toggleSubtopic(topicId);
              else void state.toggleTopic(topicId);
            }
          }}
        />
      )}

      <Sheet visible={aiError !== null} onDismiss={() => setAiError(null)} label="Assistant">
        <Text variant="title">The assistant could not help</Text>
        <Text variant="small" tone="secondary" testID="ai-error">
          {aiError}
        </Text>
        <View style={styles.sheetActions}>
          <Button label="Close" onPress={() => setAiError(null)} />
        </View>
      </Sheet>

      <AddSubjectSheet
        visible={addingSubject}
        onDismiss={() => setAddingSubject(false)}
        // Adds particular subjects into the course the student is already in.
        onSearchTemplates={() => {
          setAddError(null);
          setPickingSubjects(true);
        }}
        // Starts a separate course from a whole template — a different act, and
        // the only one of the four that creates a course.
        onImportTemplate={() => router.push('/templates')}
        onGenerateWithAi={() => {
          if (refuseAiForGuest()) return;
          setGenerating(true);
        }}
        onAddCustom={() => setPrompt({ kind: 'addSubject' })}
      />

      <SubjectPicker
        visible={pickingSubjects}
        trackerName={activeTrackerName}
        busy={addingFromTemplate}
        error={addError}
        onDismiss={() => setPickingSubjects(false)}
        onAdd={(subjects) => void addFromTemplate(subjects)}
      />

      <GenerateSubjectSheet
        visible={generating}
        trackerName={activeTrackerName}
        existingSubjects={state.subjects.map((subject) => subject.name)}
        onDismiss={() => setGenerating(false)}
        onAdd={async (proposal) => {
          const ai = useAiStore.getState();
          ai.reviewProposal(proposal);
          await ai.applyProposal(userId ?? '', getRepositories());
          setGenerating(false);
          await load();
        }}
      />

      <NamePrompt
        visible={prompt !== null}
        title={promptTitle(prompt)}
        placeholder={promptPlaceholder(prompt)}
        confirmLabel={confirmLabel(prompt)}
        initialValue={prompt !== null && 'current' in prompt ? prompt.current : ''}
        allowEmpty={
          prompt?.kind === 'editDescription' ||
          prompt?.kind === 'editNote' ||
          prompt?.kind === 'editSubtopicNote'
        }
        onCancel={() => setPrompt(null)}
        onConfirm={(name) => void confirmPrompt(name)}
      />
    </Screen>
  );
}

function promptTitle(prompt: Prompt): string {
  switch (prompt?.kind) {
    case 'addSubject':
      return 'New subject';
    case 'addChapter':
      return 'New chapter';
    case 'addTopic':
      return 'New topic';
    case 'renameSubject':
      return 'Rename subject';
    case 'renameChapter':
      return 'Rename chapter';
    case 'renameTopic':
      return 'Rename topic';
    case 'addSubtopic':
      return 'New sub-topic';
    case 'renameSubtopic':
      return 'Rename sub-topic';
    case 'editNote':
    case 'editSubtopicNote':
      return 'Note';
    case 'editDescription':
      return 'Subject description';
    default:
      return '';
  }
}

function confirmLabel(prompt: Prompt): string {
  switch (prompt?.kind) {
    case 'renameSubject':
    case 'renameChapter':
    case 'renameTopic':
    case 'renameSubtopic':
      return 'Rename';
    case 'editNote':
    case 'editSubtopicNote':
    case 'editDescription':
      return 'Save';
    default:
      return 'Add';
  }
}

function promptPlaceholder(prompt: Prompt): string {
  switch (prompt?.kind) {
    case 'addSubject':
      return 'e.g. Mathematics';
    case 'addChapter':
      return 'e.g. Chapter 1: Number Systems';
    case 'addTopic':
      return 'e.g. Decimal';
    case 'addSubtopic':
      return 'e.g. Recurring decimals';
    case 'editNote':
    case 'editSubtopicNote':
      return 'Anything worth remembering about this';
    case 'editDescription':
      return 'e.g. NCERT Class 10';
    default:
      return '';
  }
}

const styles = StyleSheet.create({
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  heading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
});
