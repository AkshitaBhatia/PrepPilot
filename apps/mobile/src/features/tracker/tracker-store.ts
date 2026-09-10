import {
  calculateSyllabusProgress,
  isTopicComplete,
  type Progress,
  type SyllabusProgress,
} from '@preppilot/shared';
import { create } from 'zustand';
import type { Repositories } from '../../db/client';
import { activeTrackerId } from '../trackers/trackers-store';
import type { ChapterRow, SubjectRow, SubtopicRow, TopicRow } from '../../db/schema';

/**
 * A topic with whatever sub-topics it has.
 *
 * `subtopics` is always an array, empty when the student has not broken the
 * topic down. The progress engine treats empty and absent the same way, and one
 * shape here means the UI never has to.
 */
export interface TopicNode extends TopicRow {
  readonly subtopics: readonly SubtopicRow[];
}

/** A subject with its chapters, topics and sub-topics, as the tracker renders it. */
export interface ChapterNode extends ChapterRow {
  readonly topics: readonly TopicNode[];
}

export interface SubjectNode extends SubjectRow {
  readonly chapters: readonly ChapterNode[];
}

export interface TrackerState {
  readonly subjects: readonly SubjectNode[];
  readonly progress: SyllabusProgress;
  readonly loading: boolean;
  /** A student-facing message, never a raw database error. */
  readonly error: string | null;
  /** Ids of expanded subjects and chapters. Collapsed by default (UI spec). */
  readonly expanded: ReadonlySet<string>;
}

export interface TrackerActions {
  load: (userId: string, repositories: Repositories) => Promise<void>;
  addSubject: (name: string) => Promise<void>;
  addChapter: (subjectId: string, name: string) => Promise<void>;
  addTopic: (chapterId: string, name: string) => Promise<void>;
  toggleTopic: (topicId: string) => Promise<void>;
  addSubtopic: (topicId: string, name: string) => Promise<void>;
  toggleSubtopic: (subtopicId: string) => Promise<void>;
  renameSubtopic: (subtopicId: string, name: string) => Promise<void>;
  deleteSubtopic: (subtopicId: string) => Promise<void>;
  moveSubtopic: (topicId: string, subtopicId: string, direction: 'up' | 'down') => Promise<void>;
  setSubtopicNote: (subtopicId: string, note: string | null) => Promise<void>;
  setTopicNote: (topicId: string, note: string | null) => Promise<void>;
  renameSubject: (subjectId: string, name: string) => Promise<void>;
  renameChapter: (chapterId: string, name: string) => Promise<void>;
  renameTopic: (topicId: string, name: string) => Promise<void>;
  setSubjectDescription: (subjectId: string, description: string | null) => Promise<void>;
  moveSubject: (subjectId: string, direction: 'up' | 'down') => Promise<void>;
  moveChapter: (subjectId: string, chapterId: string, direction: 'up' | 'down') => Promise<void>;
  moveTopic: (chapterId: string, topicId: string, direction: 'up' | 'down') => Promise<void>;
  deleteSubject: (subjectId: string) => Promise<void>;
  deleteChapter: (chapterId: string) => Promise<void>;
  deleteTopic: (topicId: string) => Promise<void>;
  toggleExpanded: (id: string) => void;
  clearError: () => void;
}

const EMPTY_PROGRESS = calculateSyllabusProgress([]);

const initialState: TrackerState = {
  subjects: [],
  progress: EMPTY_PROGRESS,
  loading: false,
  error: null,
  expanded: new Set<string>(),
};

interface Context {
  readonly userId: string;
  readonly repositories: Repositories;
}

let context: Context | null = null;

function requireContext(): Context {
  if (context === null) {
    throw new Error('Tracker used before load() — call load(userId, repositories) first.');
  }
  return context;
}

/** Rebuilds the tree from storage. Progress is always derived, never stored. */
async function readTree(ctx: Context): Promise<SubjectNode[]> {
  // Scoped to the tracker being shown: two exams' subjects interleaved is not a
  // syllabus, and progress across both is not progress towards either.
  const subjects = await ctx.repositories.subjects.listByUser(ctx.userId, activeTrackerId());

  return Promise.all(
    subjects.map(async (subject) => {
      const chapters = await ctx.repositories.chapters.listBySubject(subject.id);
      const withTopics = await Promise.all(
        chapters.map(async (chapter) => {
          const topics = await ctx.repositories.topics.listByChapter(chapter.id);

          return {
            ...chapter,
            topics: await Promise.all(
              topics.map(async (topic) => ({
                ...topic,
                subtopics: await ctx.repositories.subtopics.listByTopic(topic.id),
              })),
            ),
          };
        }),
      );

      return { ...subject, chapters: withTopics };
    }),
  );
}

export const useTrackerStore = create<TrackerState & TrackerActions>((set, get) => {
  /**
   * Re-reads the tree and recomputes every level of progress together.
   *
   * PRD §10 requires topic, chapter, subject, overall and dashboard figures to
   * update as one. Deriving all of them from a single traversal of freshly read
   * data makes disagreement between them impossible by construction.
   */
  const refresh = async () => {
    const ctx = requireContext();
    const subjects = await readTree(ctx);
    set({ subjects, progress: calculateSyllabusProgress(subjects) });
  };

  /** Runs a write, refreshes, and turns any failure into a student-facing message. */
  const mutate = async (action: () => Promise<unknown>, failureMessage: string) => {
    try {
      await action();
      await refresh();
    } catch {
      set({ error: failureMessage });
    }
  };

  return {
    ...initialState,

    async load(userId, repositories) {
      context = { userId, repositories };
      set({ loading: true, error: null });

      try {
        await refresh();
      } catch {
        set({ error: 'We could not open your syllabus. Try restarting PrepPilot.' });
      } finally {
        set({ loading: false });
      }
    },

    async addSubject(name) {
      const ctx = requireContext();
      await mutate(
        () =>
          ctx.repositories.subjects.create({
            userId: ctx.userId,
            name,
            trackerId: activeTrackerId(),
          }),
        'We could not add that subject. Try again.',
      );
    },

    async addChapter(subjectId, name) {
      const ctx = requireContext();
      await mutate(
        () => ctx.repositories.chapters.create({ userId: ctx.userId, subjectId, name }),
        'We could not add that chapter. Try again.',
      );
    },

    async addTopic(chapterId, name) {
      const ctx = requireContext();
      await mutate(
        () => ctx.repositories.topics.create({ userId: ctx.userId, chapterId, name }),
        'We could not add that topic. Try again.',
      );
    },

    async toggleTopic(topicId) {
      const ctx = requireContext();
      const current = findTopic(get().subjects, topicId);
      // The topic may have been deleted between render and tap.
      if (current === null) return;

      const next = !isTopicComplete(current);

      await mutate(async () => {
        // A topic with sub-topics is only as done as they are, so ticking it has
        // to tick them — otherwise the parent and its parts contradict each
        // other and the tick appears to do nothing.
        if (current.subtopics.length > 0) {
          await ctx.repositories.subtopics.setCompletedForTopic(topicId, next);
        }
        await ctx.repositories.topics.setCompleted(topicId, next);
      }, 'We could not save that change. Try again.');
    },

    /**
     * Ticking a topic that has sub-topics ticks all of them.
     *
     * The topic's completion is derived from its sub-topics, so setting the
     * parent flag alone would leave the two disagreeing and the change would
     * appear not to have happened.
     */
    async toggleSubtopic(subtopicId) {
      const ctx = requireContext();
      const found = findSubtopic(get().subjects, subtopicId);
      if (found === null) return;

      await mutate(async () => {
        await ctx.repositories.subtopics.setCompleted(subtopicId, !found.subtopic.completed);
        await syncTopicCompletion(ctx, found.topic.id);
      }, 'We could not save that change. Try again.');
    },

    async addSubtopic(topicId, name) {
      const ctx = requireContext();
      await mutate(async () => {
        await ctx.repositories.subtopics.create({ userId: ctx.userId, topicId, name });
        // A topic that was ticked stops being finished the moment an unfinished
        // part is added to it.
        await syncTopicCompletion(ctx, topicId);
      }, 'We could not add that sub-topic. Try again.');
    },

    async renameSubtopic(subtopicId, name) {
      const ctx = requireContext();
      await mutate(
        () => ctx.repositories.subtopics.rename(subtopicId, name),
        'We could not rename that sub-topic. Try again.',
      );
    },

    async deleteSubtopic(subtopicId) {
      const ctx = requireContext();
      const found = findSubtopic(get().subjects, subtopicId);
      if (found === null) return;

      await mutate(async () => {
        await ctx.repositories.subtopics.softDelete(subtopicId);
        // Deleting the last unfinished part can complete the topic, and deleting
        // every part hands completion back to the topic's own flag.
        await syncTopicCompletion(ctx, found.topic.id);
      }, 'We could not delete that sub-topic. Try again.');
    },

    async moveSubtopic(topicId, subtopicId, direction) {
      const ctx = requireContext();
      const topic = findTopic(get().subjects, topicId);
      if (topic === null) return;

      const ordered = reorderIds(
        topic.subtopics.map((subtopic) => subtopic.id),
        subtopicId,
        direction,
      );
      if (ordered === null) return;

      await mutate(
        () => ctx.repositories.subtopics.reorder(topicId, ordered),
        'We could not reorder those sub-topics. Try again.',
      );
    },

    async setSubtopicNote(subtopicId, note) {
      const ctx = requireContext();
      await mutate(
        () => ctx.repositories.subtopics.setNote(subtopicId, note),
        'We could not save that note. Try again.',
      );
    },

    async setTopicNote(topicId, note) {
      const ctx = requireContext();
      await mutate(
        () => ctx.repositories.topics.setNote(topicId, note),
        'We could not save that note. Try again.',
      );
    },

    async renameSubject(subjectId, name) {
      const ctx = requireContext();
      await mutate(
        () => ctx.repositories.subjects.update(subjectId, { name }),
        'We could not rename that subject. Try again.',
      );
    },

    async renameChapter(chapterId, name) {
      const ctx = requireContext();
      await mutate(
        () => ctx.repositories.chapters.rename(chapterId, name),
        'We could not rename that chapter. Try again.',
      );
    },

    async renameTopic(topicId, name) {
      const ctx = requireContext();
      await mutate(
        () => ctx.repositories.topics.rename(topicId, name),
        'We could not rename that topic. Try again.',
      );
    },

    async setSubjectDescription(subjectId, description) {
      const ctx = requireContext();
      await mutate(
        () => ctx.repositories.subjects.update(subjectId, { description }),
        'We could not save that description. Try again.',
      );
    },

    async moveSubject(subjectId, direction) {
      const ctx = requireContext();
      const ordered = reorderIds(
        get().subjects.map((subject) => subject.id),
        subjectId,
        direction,
      );
      if (ordered === null) return;

      await mutate(
        () => ctx.repositories.subjects.reorder(ctx.userId, ordered),
        'We could not reorder your subjects. Try again.',
      );
    },

    async moveChapter(subjectId, chapterId, direction) {
      const ctx = requireContext();
      const subject = get().subjects.find((entry) => entry.id === subjectId);
      if (subject === undefined) return;

      const ordered = reorderIds(
        subject.chapters.map((chapter) => chapter.id),
        chapterId,
        direction,
      );
      if (ordered === null) return;

      await mutate(
        () => ctx.repositories.chapters.reorder(subjectId, ordered),
        'We could not reorder those chapters. Try again.',
      );
    },

    async moveTopic(chapterId, topicId, direction) {
      const ctx = requireContext();
      const chapter = get()
        .subjects.flatMap((subject) => subject.chapters)
        .find((entry) => entry.id === chapterId);
      if (chapter === undefined) return;

      const ordered = reorderIds(
        chapter.topics.map((topic) => topic.id),
        topicId,
        direction,
      );
      if (ordered === null) return;

      await mutate(
        () => ctx.repositories.topics.reorder(chapterId, ordered),
        'We could not reorder those topics. Try again.',
      );
    },

    async deleteSubject(subjectId) {
      const ctx = requireContext();
      await mutate(
        () => ctx.repositories.subjects.softDelete(subjectId),
        'We could not delete that subject. Try again.',
      );
    },

    async deleteChapter(chapterId) {
      const ctx = requireContext();
      await mutate(
        () => ctx.repositories.chapters.softDelete(chapterId),
        'We could not delete that chapter. Try again.',
      );
    },

    async deleteTopic(topicId) {
      const ctx = requireContext();
      await mutate(
        () => ctx.repositories.topics.softDelete(topicId),
        'We could not delete that topic. Try again.',
      );
    },

    toggleExpanded(id) {
      const expanded = new Set(get().expanded);
      if (expanded.has(id)) {
        expanded.delete(id);
      } else {
        expanded.add(id);
      }
      set({ expanded });
    },

    clearError() {
      set({ error: null });
    },
  };
});

/**
 * Moves one id one place up or down.
 *
 * Returns null when the move is impossible — the item is already at the end, or
 * is not in the list — so the caller can skip a pointless write rather than
 * reordering everything to the same order it already had.
 */
export function reorderIds(
  ids: readonly string[],
  id: string,
  direction: 'up' | 'down',
): string[] | null {
  const index = ids.indexOf(id);
  if (index === -1) return null;

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return null;

  const next = [...ids];
  const moved = next[index] as string;
  next[index] = next[target] as string;
  next[target] = moved;
  return next;
}

function findTopic(subjects: readonly SubjectNode[], topicId: string): TopicNode | null {
  for (const subject of subjects) {
    for (const chapter of subject.chapters) {
      for (const topic of chapter.topics) {
        if (topic.id === topicId) return topic;
      }
    }
  }
  return null;
}

/** A sub-topic and the topic that holds it, which the caller needs to re-derive. */
function findSubtopic(
  subjects: readonly SubjectNode[],
  subtopicId: string,
): { subtopic: SubtopicRow; topic: TopicNode } | null {
  for (const subject of subjects) {
    for (const chapter of subject.chapters) {
      for (const topic of chapter.topics) {
        for (const subtopic of topic.subtopics) {
          if (subtopic.id === subtopicId) return { subtopic, topic };
        }
      }
    }
  }
  return null;
}

/**
 * Re-derives a topic's stored completion from its sub-topics.
 *
 * The flag is kept in step rather than computed on read because sync, the
 * dashboard and history all read the row directly and would otherwise each need
 * to know the rule. A topic with no sub-topics keeps whatever the student set.
 */
async function syncTopicCompletion(ctx: Context, topicId: string): Promise<void> {
  const subtopics = await ctx.repositories.subtopics.listByTopic(topicId);
  if (subtopics.length === 0) return;

  const shouldBeComplete = subtopics.every((subtopic) => subtopic.completed);
  const topic = await ctx.repositories.topics.findById(topicId);
  if (topic === null || topic.completed === shouldBeComplete) return;

  await ctx.repositories.topics.setCompleted(topicId, shouldBeComplete);
}

/** Progress for one subject, or empty progress when it is not loaded. */
export function subjectProgress(state: TrackerState, subjectId: string): Progress {
  return state.progress.bySubject.get(subjectId) ?? EMPTY_PROGRESS.overall;
}

export function chapterProgress(state: TrackerState, chapterId: string): Progress {
  return state.progress.byChapter.get(chapterId) ?? EMPTY_PROGRESS.overall;
}

/** Test seam: clears both the store data and the captured context. */
export function resetTrackerStore(): void {
  context = null;
  useTrackerStore.setState({ ...initialState, expanded: new Set<string>() });
}
