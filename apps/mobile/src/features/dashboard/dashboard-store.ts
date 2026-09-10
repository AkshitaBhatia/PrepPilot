import {
  calculateSyllabusProgress,
  currentStreakDays,
  dailyTotals,
  secondsOnDay,
  totalSeconds,
  totalsBySubject,
  type DayTotal,
  type Progress,
  type SubjectTotal,
} from '@preppilot/shared';
import { create } from 'zustand';
import type { Repositories } from '../../db/client';
import type { StudySessionRow } from '../../db/schema';
import { activeTrackerId } from '../trackers/trackers-store';

export interface SubjectProgress {
  readonly subjectId: string;
  readonly name: string;
  readonly progress: Progress;
}

export interface DashboardState {
  readonly overall: Progress;
  readonly todaySeconds: number;
  readonly totalSeconds: number;
  readonly streakDays: number;
  readonly recentSessions: readonly StudySessionRow[];
  readonly bySubject: readonly SubjectTotal[];
  /**
   * Completion per subject, which PRD §12 asks for alongside time.
   *
   * Time spent and progress made are different questions — an hour on a subject
   * says nothing about how much of it is left — so the dashboard answers both.
   */
  readonly subjectProgress: readonly SubjectProgress[];
  readonly lastSevenDays: readonly DayTotal[];
  readonly loading: boolean;
  readonly error: string | null;
}

export interface DashboardActions {
  load: (userId: string, repositories: Repositories, now?: number) => Promise<void>;
}

const initialState: DashboardState = {
  overall: calculateSyllabusProgress([]).overall,
  todaySeconds: 0,
  totalSeconds: 0,
  streakDays: 0,
  recentSessions: [],
  bySubject: [],
  subjectProgress: [],
  lastSevenDays: [],
  loading: false,
  error: null,
};

export const useDashboardStore = create<DashboardState & DashboardActions>((set) => ({
  ...initialState,

  /**
   * Reads the syllabus and the session history, then derives every figure the
   * dashboard shows from that one snapshot.
   *
   * Deriving them together is what keeps the dashboard consistent with the
   * Tracker: both compute progress with the same engine over the same rows, so
   * the two screens cannot disagree about a percentage (PRD §10).
   */
  async load(userId, repositories, now = Date.now()) {
    set({ loading: true, error: null });

    try {
      const subjects = await repositories.subjects.listByUser(userId, activeTrackerId());
      const tree = await Promise.all(
        subjects.map(async (subject) => {
          const chapters = await repositories.chapters.listBySubject(subject.id);
          return {
            id: subject.id,
            chapters: await Promise.all(
              chapters.map(async (chapter) => ({
                id: chapter.id,
                topics: await repositories.topics.listByChapter(chapter.id),
              })),
            ),
          };
        }),
      );

      // The same engine the Tracker uses, over the same rows, so the two screens
      // cannot report different percentages for one subject.
      const syllabus = calculateSyllabusProgress(tree);
      const subjectProgress = subjects.map((subject) => ({
        subjectId: subject.id,
        name: subject.name,
        progress: syllabus.bySubject.get(subject.id) ?? syllabus.overall,
      }));

      const sessions = await repositories.sessions.listByUser(userId, 500, activeTrackerId());
      // Sessions still running have no final duration yet, so they would make
      // today's total jump around as the timer advances.
      const settled = sessions.filter((session) => session.status !== 'running');

      set({
        overall: syllabus.overall,
        subjectProgress,
        todaySeconds: secondsOnDay(settled, now),
        totalSeconds: totalSeconds(settled),
        streakDays: currentStreakDays(settled, now),
        recentSessions: settled.slice(0, 10),
        bySubject: totalsBySubject(settled),
        lastSevenDays: dailyTotals(settled, now, 7),
      });
    } catch {
      set({ error: 'We could not load your dashboard. Pull down to try again.' });
    } finally {
      set({ loading: false });
    }
  },
}));

/** Test seam: returns the store to its initial state. */
export function resetDashboardStore(): void {
  useDashboardStore.setState({ ...initialState });
}
