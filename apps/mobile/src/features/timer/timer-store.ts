import {
  advancePomodoro,
  createTimer,
  elapsedSeconds,
  finish,
  isExpired,
  isStudyPhase,
  pause,
  resume,
  start,
  type PomodoroConfig,
  type TimerMode,
  type TimerState,
} from '@preppilot/shared';
import { create } from 'zustand';
import type { StudySessionRepository } from '../../db/repositories/study-sessions';
import { activeTrackerId } from '../trackers/trackers-store';
import { announceTimerFinished, armTimerAlert, disarmTimerAlert } from './timer-alert';

/** How often a running session records its progress. */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** What the timer is studying. Every field is optional: a session may be unattached. */
export interface TimerTarget {
  readonly subjectId?: string | null;
  readonly chapterId?: string | null;
  readonly topicId?: string | null;
  readonly subjectName?: string | null;
  readonly chapterName?: string | null;
  readonly topicName?: string | null;
  /** Accent colour of the owning subject, for the timer's ring. */
  readonly accent?: string | null;
}

export interface TimerStoreState {
  readonly timer: TimerState | null;
  readonly target: TimerTarget | null;
  /** Id of the row backing the current run, or null when nothing is recording. */
  readonly sessionId: string | null;
  readonly error: string | null;
  /** Bumped on every tick so subscribers re-render; time itself is derived. */
  readonly tick: number;
}

export interface TimerStoreActions {
  configure: (
    mode: TimerMode,
    target: TimerTarget,
    options?: { targetSeconds?: number; pomodoro?: PomodoroConfig },
  ) => void;
  startTimer: () => Promise<void>;
  pauseTimer: () => Promise<void>;
  resumeTimer: () => Promise<void>;
  stopTimer: () => Promise<void>;
  nextPomodoroPhase: () => Promise<void>;
  /** Records progress on the live session. Driven by an interval in the screen. */
  beat: () => Promise<void>;
  /** Re-renders the display without touching storage. */
  refreshDisplay: () => void;
  clearError: () => void;
  reset: () => void;
}

const initialState: TimerStoreState = {
  timer: null,
  target: null,
  sessionId: null,
  error: null,
  tick: 0,
};

interface Context {
  readonly userId: string;
  readonly sessions: StudySessionRepository;
  readonly now: () => number;
}

let context: Context | null = null;

/** Supplies the store its user, storage and clock. Called once, after sign-in. */
export function configureTimerContext(ctx: Context): void {
  context = ctx;
}

/**
 * The clock the timer runs on.
 *
 * The screen derives its readout from the same source the store banks time
 * against. Reading `Date.now()` directly in the UI would give the display and the
 * recorded session two independent clocks that agree only by coincidence.
 */
export function timerNow(): number {
  return context?.now() ?? Date.now();
}

function requireContext(): Context {
  if (context === null) {
    throw new Error('Timer used before configureTimerContext() was called.');
  }
  return context;
}

export const useTimerStore = create<TimerStoreState & TimerStoreActions>((set, get) => {
  /**
   * Study time excludes Pomodoro breaks: counting them would inflate "total time
   * studied using PrepPilot" (PRD §12) and make the figure meaningless.
   */
  const studySeconds = (timer: TimerState, now: number): number =>
    isStudyPhase(timer) ? elapsedSeconds(timer, now) : 0;

  return {
    ...initialState,

    configure(mode, target, options = {}) {
      const timer = createTimer({
        mode,
        ...(options.targetSeconds !== undefined ? { targetSeconds: options.targetSeconds } : {}),
        ...(options.pomodoro !== undefined ? { pomodoro: options.pomodoro } : {}),
      });

      set({ timer, target, sessionId: null, error: null, tick: 0 });
    },

    async startTimer() {
      const ctx = requireContext();
      const { timer, target } = get();
      if (timer === null || timer.status === 'running') return;

      const now = ctx.now();
      const running = start(timer, now);
      set({ timer: running });

      // Armed for the end of the countdown, so a student who puts the phone
      // down still hears it. Not awaited: the timer should start on the tap,
      // not once the OS has accepted a notification.
      void armTimerAlert(running, now);

      // Only study phases produce a session; a break is not recorded.
      if (!isStudyPhase(timer)) return;

      try {
        const session = await ctx.sessions.start({
          userId: ctx.userId,
          trackerId: activeTrackerId(),
          timerMode: timer.mode,
          subjectId: target?.subjectId ?? null,
          chapterId: target?.chapterId ?? null,
          topicId: target?.topicId ?? null,
          subjectName: target?.subjectName ?? null,
          chapterName: target?.chapterName ?? null,
          topicName: target?.topicName ?? null,
        });
        set({ sessionId: session.id });
      } catch {
        // The timer keeps running: losing the recording is bad, but stopping a
        // student's timer because of a write failure is worse.
        set({ error: 'We could not start recording this session. Your timer is still running.' });
      }
    },

    async pauseTimer() {
      const ctx = requireContext();
      const { timer, sessionId } = get();
      if (timer === null || timer.status !== 'running') return;

      const paused = pause(timer, ctx.now());
      set({ timer: paused });
      void disarmTimerAlert();

      if (sessionId === null) return;
      try {
        await ctx.sessions.heartbeat(sessionId, studySeconds(paused, ctx.now()), 'paused');
      } catch {
        set({ error: 'We could not save your progress just now. It will retry.' });
      }
    },

    async resumeTimer() {
      const ctx = requireContext();
      const { timer, sessionId } = get();
      if (timer === null || timer.status !== 'paused') return;

      const resumed = resume(timer, ctx.now());
      set({ timer: resumed });
      // Re-armed against the new end time, which is later than the original by
      // however long the student was paused.
      void armTimerAlert(resumed, ctx.now());

      if (sessionId === null) return;
      try {
        await ctx.sessions.heartbeat(sessionId, studySeconds(resumed, ctx.now()), 'running');
      } catch {
        set({ error: 'We could not save your progress just now. It will retry.' });
      }
    },

    async stopTimer() {
      const ctx = requireContext();
      const { timer, sessionId } = get();
      if (timer === null) return;

      const now = ctx.now();
      const finished = finish(timer, now);
      set({ timer: finished });

      // The scheduled chime is cancelled either way; whether one is due now is
      // what tells us to buzz. A timer stopped early should not congratulate
      // the student on finishing it.
      void disarmTimerAlert();
      if (isExpired(timer, now)) void announceTimerFinished();

      if (sessionId === null) return;
      try {
        await ctx.sessions.complete(sessionId, studySeconds(finished, now));
        set({ sessionId: null });
      } catch {
        set({ error: 'We could not save this session. Your study time may be incomplete.' });
      }
    },

    async nextPomodoroPhase() {
      const ctx = requireContext();
      const { timer } = get();
      if (timer === null || timer.mode !== 'pomodoro') return;

      // Close out the interval that just ended before moving on.
      await get().stopTimer();

      const next = advancePomodoro(get().timer ?? timer, ctx.now());
      set({ timer: next, sessionId: null });

      // A work phase that auto-starts needs its own session row.
      if (next.status === 'running' && isStudyPhase(next)) {
        set({ timer: { ...next, status: 'idle', startedAt: null } });
        await get().startTimer();
      }
    },

    async beat() {
      const ctx = requireContext();
      const { timer, sessionId } = get();
      if (timer === null || sessionId === null || timer.status !== 'running') return;

      try {
        await ctx.sessions.heartbeat(sessionId, studySeconds(timer, ctx.now()), 'running');
      } catch {
        // Heartbeats are best-effort; the next one will catch up. Surfacing a
        // message every 30 seconds would be worse than the missed write.
      }
    },

    refreshDisplay() {
      set({ tick: get().tick + 1 });
    },

    clearError() {
      set({ error: null });
    },

    reset() {
      set({ ...initialState });
    },
  };
});

/** Test seam: clears the store and its captured context. */
export function resetTimerStore(): void {
  context = null;
  useTimerStore.setState({ ...initialState });
}
