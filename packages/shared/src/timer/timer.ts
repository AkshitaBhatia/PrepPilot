/**
 * The timer engine.
 *
 * Elapsed time is **derived from timestamps**, never accumulated by a ticking
 * counter (DECISIONS.md, D21). A counter stops when Android suspends the process
 * and would quietly under-report a session the moment a student locked their
 * screen; deriving from `startedAt` survives backgrounding and process death
 * without a foreground service.
 *
 * Every function here is pure. `now` is a parameter rather than a call to
 * `Date.now()`, so the UI can re-render on its own cadence and tests can step
 * through time deliberately.
 */

export const TIMER_MODES = ['stopwatch', 'pomodoro', 'custom'] as const;
export type TimerMode = (typeof TIMER_MODES)[number];

export const TIMER_STATUSES = ['idle', 'running', 'paused', 'finished'] as const;
export type TimerStatus = (typeof TIMER_STATUSES)[number];

/** Which part of the Pomodoro cycle is active. Only meaningful in `pomodoro` mode. */
export const POMODORO_PHASES = ['work', 'shortBreak', 'longBreak'] as const;
export type PomodoroPhase = (typeof POMODORO_PHASES)[number];

export interface PomodoroConfig {
  readonly workSeconds: number;
  readonly shortBreakSeconds: number;
  readonly longBreakSeconds: number;
  /** Work intervals completed before a long break. */
  readonly cyclesBeforeLongBreak: number;
  /** When false, the student starts each phase themselves (D23). */
  readonly autoStartNextPhase: boolean;
}

/** Standard Pomodoro, per D23. */
export const DEFAULT_POMODORO: PomodoroConfig = {
  workSeconds: 25 * 60,
  shortBreakSeconds: 5 * 60,
  longBreakSeconds: 15 * 60,
  cyclesBeforeLongBreak: 4,
  autoStartNextPhase: false,
};

export interface TimerState {
  readonly mode: TimerMode;
  readonly status: TimerStatus;
  /**
   * When the current run segment began, in epoch milliseconds. Null whenever the
   * timer is not running.
   */
  readonly startedAt: number | null;
  /** Seconds banked by previously completed run segments, across pauses. */
  readonly bankedSeconds: number;
  /** Countdown target. Null for stopwatch, which counts up without a limit. */
  readonly targetSeconds: number | null;
  readonly pomodoro: PomodoroConfig;
  readonly phase: PomodoroPhase;
  /** Work intervals finished in this sitting, used to place the long break. */
  readonly completedWorkIntervals: number;
}

function assertFiniteSeconds(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number, received ${value}`);
  }
}

export interface CreateTimerOptions {
  readonly mode: TimerMode;
  /** Required for `custom`; ignored otherwise. */
  readonly targetSeconds?: number;
  readonly pomodoro?: PomodoroConfig;
}

/**
 * Builds an idle timer.
 *
 * @throws {RangeError} for a custom timer without a positive duration — a
 * zero-length countdown would finish the instant it started.
 */
export function createTimer({
  mode,
  targetSeconds,
  pomodoro = DEFAULT_POMODORO,
}: CreateTimerOptions): TimerState {
  let target: number | null = null;

  if (mode === 'custom') {
    if (targetSeconds === undefined || targetSeconds <= 0) {
      throw new RangeError('A custom timer needs a duration greater than zero.');
    }
    assertFiniteSeconds(targetSeconds, 'targetSeconds');
    target = Math.floor(targetSeconds);
  } else if (mode === 'pomodoro') {
    target = pomodoro.workSeconds;
  }

  return {
    mode,
    status: 'idle',
    startedAt: null,
    bankedSeconds: 0,
    targetSeconds: target,
    pomodoro,
    phase: 'work',
    completedWorkIntervals: 0,
  };
}

/** Seconds elapsed in the current phase, including time banked before a pause. */
export function elapsedSeconds(state: TimerState, now: number): number {
  if (state.status !== 'running' || state.startedAt === null) {
    return state.bankedSeconds;
  }

  // A device clock can jump backwards (NTP correction, manual change); the
  // segment must never contribute a negative amount.
  const segment = Math.max(0, Math.floor((now - state.startedAt) / 1000));
  return state.bankedSeconds + segment;
}

/** Seconds left on a countdown, or null for a stopwatch. Never negative. */
export function remainingSeconds(state: TimerState, now: number): number | null {
  if (state.targetSeconds === null) return null;
  return Math.max(0, state.targetSeconds - elapsedSeconds(state, now));
}

/** True once a countdown has run out. Always false for a stopwatch. */
export function isExpired(state: TimerState, now: number): boolean {
  const remaining = remainingSeconds(state, now);
  return remaining !== null && remaining === 0;
}

export function start(state: TimerState, now: number): TimerState {
  // Starting an already-running timer would reset its segment and lose time.
  if (state.status === 'running') return state;
  return { ...state, status: 'running', startedAt: now };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== 'running') return state;
  return {
    ...state,
    status: 'paused',
    // Bank the segment before dropping startedAt, or it is lost.
    bankedSeconds: elapsedSeconds(state, now),
    startedAt: null,
  };
}

export function resume(state: TimerState, now: number): TimerState {
  if (state.status !== 'paused') return state;
  return { ...state, status: 'running', startedAt: now };
}

/** Stops the timer, banking the final elapsed time. */
export function finish(state: TimerState, now: number): TimerState {
  if (state.status === 'finished') return state;
  return {
    ...state,
    status: 'finished',
    bankedSeconds: elapsedSeconds(state, now),
    startedAt: null,
  };
}

/** Returns the timer to idle, discarding elapsed time but keeping its configuration. */
export function reset(state: TimerState): TimerState {
  return {
    ...state,
    status: 'idle',
    startedAt: null,
    bankedSeconds: 0,
    targetSeconds: state.mode === 'pomodoro' ? state.pomodoro.workSeconds : state.targetSeconds,
    phase: state.mode === 'pomodoro' ? 'work' : state.phase,
    completedWorkIntervals: 0,
  };
}

/**
 * Moves a Pomodoro to its next phase.
 *
 * Work is followed by a long break every `cyclesBeforeLongBreak` intervals, and a
 * short break otherwise. Breaks are always followed by work. The returned timer
 * is idle unless the configuration opts into starting the next phase
 * automatically.
 */
export function advancePomodoro(state: TimerState, now: number): TimerState {
  if (state.mode !== 'pomodoro') return state;

  const wasWork = state.phase === 'work';
  const completedWorkIntervals = wasWork
    ? state.completedWorkIntervals + 1
    : state.completedWorkIntervals;

  let phase: PomodoroPhase;
  if (!wasWork) {
    phase = 'work';
  } else {
    phase =
      completedWorkIntervals % state.pomodoro.cyclesBeforeLongBreak === 0
        ? 'longBreak'
        : 'shortBreak';
  }

  const targetSeconds = phaseDuration(phase, state.pomodoro);
  const autoStart = state.pomodoro.autoStartNextPhase;

  return {
    ...state,
    phase,
    completedWorkIntervals,
    targetSeconds,
    bankedSeconds: 0,
    status: autoStart ? 'running' : 'idle',
    startedAt: autoStart ? now : null,
  };
}

export function phaseDuration(phase: PomodoroPhase, config: PomodoroConfig): number {
  switch (phase) {
    case 'work':
      return config.workSeconds;
    case 'shortBreak':
      return config.shortBreakSeconds;
    case 'longBreak':
      return config.longBreakSeconds;
  }
}

/**
 * Whether elapsed time in this phase should be recorded as study time.
 *
 * Breaks are not studying. Counting them would inflate "total time studied using
 * PrepPilot" (PRD §12) and make the figure meaningless.
 */
export function isStudyPhase(state: TimerState): boolean {
  return state.mode !== 'pomodoro' || state.phase === 'work';
}

/** Fraction of a countdown completed, 0..1. Null for a stopwatch, which has no end. */
export function progressFraction(state: TimerState, now: number): number | null {
  if (state.targetSeconds === null || state.targetSeconds === 0) return null;
  return Math.min(1, elapsedSeconds(state, now) / state.targetSeconds);
}

/**
 * Bounds on a configurable Pomodoro.
 *
 * Wide enough not to argue with how someone studies, narrow enough that a typo
 * cannot produce a nine-hour "focus interval" that silently never ends.
 */
export const POMODORO_LIMITS = {
  workMinutes: { min: 5, max: 120 },
  shortBreakMinutes: { min: 1, max: 60 },
  longBreakMinutes: { min: 5, max: 120 },
  cyclesBeforeLongBreak: { min: 2, max: 8 },
} as const;

/** A custom countdown, in minutes. */
export const CUSTOM_TIMER_LIMITS = { min: 1, max: 480 } as const;

export function clampToRange(value: number, range: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return range.min;
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

/** Builds a valid config from arbitrary input, clamping anything out of range. */
export function makePomodoroConfig(input: {
  workMinutes?: number;
  shortBreakMinutes?: number;
  longBreakMinutes?: number;
  cyclesBeforeLongBreak?: number;
  autoStartNextPhase?: boolean;
}): PomodoroConfig {
  const work = clampToRange(input.workMinutes ?? 25, POMODORO_LIMITS.workMinutes);
  const shortBreak = clampToRange(input.shortBreakMinutes ?? 5, POMODORO_LIMITS.shortBreakMinutes);
  const longBreak = clampToRange(input.longBreakMinutes ?? 15, POMODORO_LIMITS.longBreakMinutes);
  const cycles = clampToRange(
    input.cyclesBeforeLongBreak ?? 4,
    POMODORO_LIMITS.cyclesBeforeLongBreak,
  );

  return {
    workSeconds: work * 60,
    shortBreakSeconds: shortBreak * 60,
    longBreakSeconds: longBreak * 60,
    cyclesBeforeLongBreak: cycles,
    autoStartNextPhase: input.autoStartNextPhase ?? false,
  };
}

/** The inverse, for rendering the settings form. */
export function pomodoroConfigToMinutes(config: PomodoroConfig): {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  autoStartNextPhase: boolean;
} {
  return {
    workMinutes: Math.round(config.workSeconds / 60),
    shortBreakMinutes: Math.round(config.shortBreakSeconds / 60),
    longBreakMinutes: Math.round(config.longBreakSeconds / 60),
    cyclesBeforeLongBreak: config.cyclesBeforeLongBreak,
    autoStartNextPhase: config.autoStartNextPhase,
  };
}

/** Serialises a config for the preferences table. */
export function serialisePomodoro(config: PomodoroConfig): string {
  return JSON.stringify(pomodoroConfigToMinutes(config));
}

/**
 * Reads a stored config, falling back to the default.
 *
 * A corrupted or hand-edited value must not stop the timer working, so anything
 * unparseable yields the standard Pomodoro rather than an error.
 */
export function parsePomodoro(stored: string | null): PomodoroConfig {
  if (stored === null) return DEFAULT_POMODORO;

  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_POMODORO;
    return makePomodoroConfig(parsed as Record<string, number | boolean>);
  } catch {
    return DEFAULT_POMODORO;
  }
}
