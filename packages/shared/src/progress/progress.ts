import type { ChapterLike, SubjectLike, TopicLike } from '../domain/types';

/**
 * The result of a progress calculation at any level of the hierarchy.
 *
 * `percent` is `null` — never `0` — when there is nothing to measure. A chapter
 * with no topics is not "0% complete"; it is unmeasured, and PRD §10 requires an
 * empty state rather than misleading progress. Callers render `null` as an em
 * dash (see `formatPercent`).
 */
export interface Progress {
  /** Number of completed units in scope. */
  readonly completed: number;
  /** Total number of units in scope. */
  readonly total: number;
  /** Completion in the range 0..100, or `null` when `total === 0`. */
  readonly percent: number | null;
  /** True when there is nothing to measure (`total === 0`). */
  readonly isEmpty: boolean;
}

/** Progress for every node of a syllabus, computed in a single traversal. */
export interface SyllabusProgress {
  /** Progress across every topic of every subject (PRD §10, "Overall"). */
  readonly overall: Progress;
  /** Subject id -> subject progress. */
  readonly bySubject: ReadonlyMap<string, Progress>;
  /** Chapter id -> chapter progress. */
  readonly byChapter: ReadonlyMap<string, Progress>;
}

/**
 * Builds a `Progress` from raw counts.
 *
 * @throws {RangeError} if the counts are not a coherent pair of non-negative
 * integers with `completed <= total`. These represent programming or data
 * corruption errors, not user input, so failing loudly is correct.
 */
export function makeProgress(completed: number, total: number): Progress {
  assertCount(completed, 'completed');
  assertCount(total, 'total');
  if (completed > total) {
    throw new RangeError(`completed (${completed}) cannot exceed total (${total})`);
  }

  return {
    completed,
    total,
    percent: total === 0 ? null : (completed / total) * 100,
    isEmpty: total === 0,
  };
}

function assertCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer, received ${value}`);
  }
}

/**
 * What a single topic contributes to any total above it.
 *
 * A topic broken into sub-topics contributes those sub-topics; one that is not
 * contributes itself. So a topic with four sub-topics weighs four times as much
 * as one with none — which is the point: it *is* four times as much work, and
 * counting both as one unit would make finishing a large topic look identical to
 * finishing a trivial one.
 *
 * This is the same rule that already makes subject progress topic-weighted
 * rather than a mean of its chapters, applied one level deeper.
 */
export function topicUnits(topic: TopicLike): { completed: number; total: number } {
  const subtopics = topic.subtopics;

  if (subtopics === undefined || subtopics.length === 0) {
    return { completed: topic.completed ? 1 : 0, total: 1 };
  }

  let completed = 0;
  for (const subtopic of subtopics) {
    if (subtopic.completed) completed += 1;
  }
  return { completed, total: subtopics.length };
}

/**
 * Whether a topic reads as done.
 *
 * Derived from its sub-topics when it has them: a topic cannot be finished while
 * part of it is not, and letting the stored flag disagree with its own children
 * would put two different answers on screen at once.
 */
export function isTopicComplete(topic: TopicLike): boolean {
  const subtopics = topic.subtopics;
  if (subtopics === undefined || subtopics.length === 0) return topic.completed;
  return subtopics.every((subtopic) => subtopic.completed);
}

/** Counts completed/total units across a flat list of topics. */
export function calculateTopicsProgress(topics: readonly TopicLike[]): Progress {
  let completed = 0;
  let total = 0;
  for (const topic of topics) {
    const units = topicUnits(topic);
    completed += units.completed;
    total += units.total;
  }
  return makeProgress(completed, total);
}

/** Progress within one topic's sub-topics. Empty when it has none. */
export function calculateSubtopicsProgress(topic: TopicLike): Progress {
  const subtopics = topic.subtopics ?? [];
  let completed = 0;
  for (const subtopic of subtopics) {
    if (subtopic.completed) completed += 1;
  }
  return makeProgress(completed, subtopics.length);
}

/**
 * Chapter progress: `completed topics / total topics * 100` (PRD §10).
 * A chapter with no topics yields `percent === null`.
 */
export function calculateChapterProgress(chapter: ChapterLike): Progress {
  return calculateTopicsProgress(chapter.topics);
}

/**
 * Subject progress: `all completed topics under subject / all topics under subject * 100`.
 *
 * This is **topic-weighted**, which PRD §10 calls out explicitly: it is *not* the
 * mean of the chapter percentages. A subject with a 1/1 chapter and a 0/99 chapter
 * is 1% complete, not 50%. Chapters with no topics contribute 0/0 and therefore
 * fall out of the calculation naturally rather than dragging the result toward zero.
 */
export function calculateSubjectProgress(subject: SubjectLike): Progress {
  let completed = 0;
  let total = 0;
  for (const chapter of subject.chapters) {
    for (const topic of chapter.topics) {
      const units = topicUnits(topic);
      completed += units.completed;
      total += units.total;
    }
  }
  return makeProgress(completed, total);
}

/** Overall progress: `all completed topics / all topics * 100` across every subject (PRD §10). */
export function calculateOverallProgress(subjects: readonly SubjectLike[]): Progress {
  let completed = 0;
  let total = 0;
  for (const subject of subjects) {
    for (const chapter of subject.chapters) {
      for (const topic of chapter.topics) {
        const units = topicUnits(topic);
        completed += units.completed;
        total += units.total;
      }
    }
  }
  return makeProgress(completed, total);
}

/**
 * Computes chapter, subject and overall progress in one pass.
 *
 * Checking a single topic must update topic, chapter, subject, overall and
 * dashboard figures together (PRD §10). Deriving them from one traversal keeps
 * those five numbers mutually consistent by construction, and keeps the cost
 * linear in the number of topics as required by PRD §24.
 */
export function calculateSyllabusProgress(subjects: readonly SubjectLike[]): SyllabusProgress {
  const bySubject = new Map<string, Progress>();
  const byChapter = new Map<string, Progress>();

  let overallCompleted = 0;
  let overallTotal = 0;

  for (const subject of subjects) {
    let subjectCompleted = 0;
    let subjectTotal = 0;

    for (const chapter of subject.chapters) {
      let chapterCompleted = 0;
      let chapterTotal = 0;

      for (const topic of chapter.topics) {
        const units = topicUnits(topic);
        chapterCompleted += units.completed;
        chapterTotal += units.total;
      }

      byChapter.set(chapter.id, makeProgress(chapterCompleted, chapterTotal));
      subjectCompleted += chapterCompleted;
      subjectTotal += chapterTotal;
    }

    bySubject.set(subject.id, makeProgress(subjectCompleted, subjectTotal));
    overallCompleted += subjectCompleted;
    overallTotal += subjectTotal;
  }

  return {
    overall: makeProgress(overallCompleted, overallTotal),
    bySubject,
    byChapter,
  };
}
