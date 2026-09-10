import type { Progress } from '@preppilot/shared';
import type { StudySessionRow } from '../../db/schema';
import type { TrackerState } from './tracker-store';
import { subjectProgress } from './tracker-store';

export interface ContinuePoint {
  readonly subjectId: string;
  readonly subjectName: string;
  /** The chapter or topic last studied, when the session recorded one. */
  readonly detail: string | null;
  readonly progress: Progress;
}

/**
 * Where the student left off.
 *
 * Taken from the sessions they have already recorded rather than a new
 * "recently viewed" list: a session is the app's existing record of sitting
 * down to study something, and inventing a second history would give two
 * answers to the same question.
 *
 * Returns null when there is nothing honest to show — no sessions, or none
 * whose subject is still in the syllabus. A card offering to continue a subject
 * that has been deleted is worse than no card.
 */
export function continuePoint(
  sessions: readonly StudySessionRow[],
  state: TrackerState,
): ContinuePoint | null {
  // Newest first. A session still running is the strongest possible signal
  // about what they are studying, so it is not excluded.
  const ordered = [...sessions].sort((a, b) => b.startedAt - a.startedAt);

  for (const session of ordered) {
    if (session.subjectId === null) continue;

    const subject = state.subjects.find((candidate) => candidate.id === session.subjectId);
    if (subject === undefined) continue;

    const progress = subjectProgress(state, subject.id);
    // Nothing left to continue. Offering it would send them somewhere finished.
    if (progress.total > 0 && progress.completed >= progress.total) continue;

    return {
      subjectId: subject.id,
      subjectName: subject.name,
      detail: session.topicName ?? session.chapterName ?? null,
      progress,
    };
  }

  return null;
}
