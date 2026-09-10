import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POMODORO,
  POMODORO_LIMITS,
  advancePomodoro,
  clampToRange,
  makePomodoroConfig,
  parsePomodoro,
  pomodoroConfigToMinutes,
  serialisePomodoro,
  createTimer,
  elapsedSeconds,
  finish,
  isExpired,
  isStudyPhase,
  pause,
  phaseDuration,
  progressFraction,
  remainingSeconds,
  reset,
  resume,
  start,
  type TimerState,
} from './timer';

const T0 = 1_700_000_000_000;
const seconds = (n: number) => T0 + n * 1000;

const stopwatch = () => createTimer({ mode: 'stopwatch' });
const custom = (target: number) => createTimer({ mode: 'custom', targetSeconds: target });
const pomodoro = (config = DEFAULT_POMODORO) => createTimer({ mode: 'pomodoro', pomodoro: config });

describe('createTimer', () => {
  it('starts idle with nothing elapsed', () => {
    expect(stopwatch()).toMatchObject({ status: 'idle', bankedSeconds: 0, startedAt: null });
  });

  it('gives a stopwatch no target, so it counts up without a limit', () => {
    expect(stopwatch().targetSeconds).toBeNull();
  });

  it('gives a Pomodoro the work duration as its first target', () => {
    expect(pomodoro().targetSeconds).toBe(25 * 60);
    expect(pomodoro().phase).toBe('work');
  });

  it('takes a custom timer’s duration', () => {
    expect(custom(90).targetSeconds).toBe(90);
  });

  it.each([
    ['missing', undefined],
    ['zero', 0],
    ['negative', -60],
  ])('rejects a custom timer with a %s duration', (_label, targetSeconds) => {
    expect(() =>
      createTimer(
        targetSeconds === undefined ? { mode: 'custom' } : { mode: 'custom', targetSeconds },
      ),
    ).toThrow(RangeError);
  });

  it('floors a fractional custom duration', () => {
    expect(custom(90.7).targetSeconds).toBe(90);
  });
});

describe('elapsed time', () => {
  it('is zero while idle', () => {
    expect(elapsedSeconds(stopwatch(), seconds(500))).toBe(0);
  });

  it('grows with the clock while running', () => {
    const running = start(stopwatch(), T0);

    expect(elapsedSeconds(running, seconds(30))).toBe(30);
    expect(elapsedSeconds(running, seconds(90))).toBe(90);
  });

  it('truncates partial seconds rather than rounding up', () => {
    const running = start(stopwatch(), T0);

    expect(elapsedSeconds(running, T0 + 1999)).toBe(1);
  });

  /**
   * The reason elapsed time is derived from timestamps rather than a tick: the
   * process may be suspended for the entire interval and still owes the student
   * the time they spent.
   */
  it('accounts for time while the app was suspended', () => {
    const running = start(stopwatch(), T0);

    expect(elapsedSeconds(running, seconds(3600))).toBe(3600);
  });

  /** A device clock can move backwards; a session must never go negative. */
  it('never goes backwards when the clock does', () => {
    const running = start(stopwatch(), seconds(100));

    expect(elapsedSeconds(running, seconds(50))).toBe(0);
  });
});

describe('pause and resume', () => {
  it('banks elapsed time on pause and holds it steady', () => {
    const paused = pause(start(stopwatch(), T0), seconds(30));

    expect(paused).toMatchObject({ status: 'paused', bankedSeconds: 30, startedAt: null });
    // Time keeps passing, but a paused timer does not.
    expect(elapsedSeconds(paused, seconds(600))).toBe(30);
  });

  it('continues from the banked total on resume', () => {
    const paused = pause(start(stopwatch(), T0), seconds(30));
    const resumed = resume(paused, seconds(600));

    expect(elapsedSeconds(resumed, seconds(610))).toBe(40);
  });

  it('survives several pause and resume cycles', () => {
    let state = start(stopwatch(), T0);
    state = pause(state, seconds(10));
    state = resume(state, seconds(100));
    state = pause(state, seconds(115));
    state = resume(state, seconds(200));

    expect(elapsedSeconds(state, seconds(205))).toBe(30);
  });

  describe('ignoring impossible transitions', () => {
    it('does not restart a running timer, which would lose its segment', () => {
      const running = start(stopwatch(), T0);

      expect(start(running, seconds(60))).toBe(running);
      expect(elapsedSeconds(start(running, seconds(60)), seconds(90))).toBe(90);
    });

    it('does not pause an idle timer', () => {
      const idle = stopwatch();
      expect(pause(idle, seconds(10))).toBe(idle);
    });

    it('does not resume a running timer', () => {
      const running = start(stopwatch(), T0);
      expect(resume(running, seconds(10))).toBe(running);
    });

    it('does not resume an idle timer', () => {
      const idle = stopwatch();
      expect(resume(idle, seconds(10))).toBe(idle);
    });
  });
});

describe('finish', () => {
  it('banks the final elapsed time', () => {
    const finished = finish(start(stopwatch(), T0), seconds(45));

    expect(finished).toMatchObject({ status: 'finished', bankedSeconds: 45, startedAt: null });
  });

  it('finishes a paused timer without losing its banked time', () => {
    const paused = pause(start(stopwatch(), T0), seconds(30));

    expect(finish(paused, seconds(600)).bankedSeconds).toBe(30);
  });

  it('is idempotent', () => {
    const finished = finish(start(stopwatch(), T0), seconds(45));

    expect(finish(finished, seconds(900))).toBe(finished);
  });
});

describe('reset', () => {
  it('returns the timer to idle with nothing elapsed', () => {
    const state = reset(finish(start(stopwatch(), T0), seconds(45)));

    expect(state).toMatchObject({ status: 'idle', bankedSeconds: 0, startedAt: null });
  });

  it('returns a Pomodoro to its first work interval', () => {
    let state = pomodoro();
    state = advancePomodoro(state, T0);
    expect(state.phase).toBe('shortBreak');

    state = reset(state);

    expect(state).toMatchObject({ phase: 'work', completedWorkIntervals: 0, targetSeconds: 1500 });
  });

  it('keeps a custom timer’s duration', () => {
    expect(reset(finish(start(custom(90), T0), seconds(90))).targetSeconds).toBe(90);
  });
});

describe('countdowns', () => {
  it('reports the remaining time', () => {
    const running = start(custom(120), T0);

    expect(remainingSeconds(running, seconds(30))).toBe(90);
  });

  it('never reports negative time remaining', () => {
    const running = start(custom(60), T0);

    expect(remainingSeconds(running, seconds(600))).toBe(0);
  });

  it('has no remaining time for a stopwatch', () => {
    expect(remainingSeconds(start(stopwatch(), T0), seconds(30))).toBeNull();
  });

  it('expires exactly at the target, not before', () => {
    const running = start(custom(60), T0);

    expect(isExpired(running, seconds(59))).toBe(false);
    expect(isExpired(running, seconds(60))).toBe(true);
  });

  it('never expires a stopwatch', () => {
    expect(isExpired(start(stopwatch(), T0), seconds(100_000))).toBe(false);
  });
});

describe('progressFraction', () => {
  it('reports the fraction of a countdown completed', () => {
    expect(progressFraction(start(custom(100), T0), seconds(25))).toBe(0.25);
  });

  it('caps at 1 once the countdown is over', () => {
    expect(progressFraction(start(custom(100), T0), seconds(500))).toBe(1);
  });

  it('has no fraction for a stopwatch, which has no end', () => {
    expect(progressFraction(start(stopwatch(), T0), seconds(30))).toBeNull();
  });
});

describe('the Pomodoro cycle', () => {
  it('uses the standard durations by default', () => {
    expect(DEFAULT_POMODORO).toMatchObject({
      workSeconds: 1500,
      shortBreakSeconds: 300,
      longBreakSeconds: 900,
      cyclesBeforeLongBreak: 4,
      autoStartNextPhase: false,
    });
  });

  it('follows work with a short break', () => {
    const next = advancePomodoro(pomodoro(), T0);

    expect(next).toMatchObject({ phase: 'shortBreak', targetSeconds: 300 });
  });

  it('follows a break with work', () => {
    const afterBreak = advancePomodoro(advancePomodoro(pomodoro(), T0), T0);

    expect(afterBreak).toMatchObject({ phase: 'work', targetSeconds: 1500 });
  });

  it('takes a long break after the fourth work interval', () => {
    let state = pomodoro();
    const phases: string[] = [];

    // Eight transitions covers four work intervals and the breaks between them.
    for (let index = 0; index < 8; index += 1) {
      state = advancePomodoro(state, T0);
      phases.push(state.phase);
    }

    expect(phases).toEqual([
      'shortBreak',
      'work',
      'shortBreak',
      'work',
      'shortBreak',
      'work',
      'longBreak',
      'work',
    ]);
  });

  it('counts only completed work intervals', () => {
    let state = advancePomodoro(pomodoro(), T0);
    expect(state.completedWorkIntervals).toBe(1);

    state = advancePomodoro(state, T0);
    expect(state.completedWorkIntervals).toBe(1);
  });

  it('clears elapsed time when moving to a new phase', () => {
    const worked = pause(start(pomodoro(), T0), seconds(600));

    expect(advancePomodoro(worked, seconds(600)).bankedSeconds).toBe(0);
  });

  /** Auto-start is off by default so a break never begins without the student. */
  it('leaves the next phase idle by default', () => {
    expect(advancePomodoro(pomodoro(), T0).status).toBe('idle');
  });

  it('starts the next phase automatically when configured to', () => {
    const auto = pomodoro({ ...DEFAULT_POMODORO, autoStartNextPhase: true });

    expect(advancePomodoro(auto, T0)).toMatchObject({ status: 'running', startedAt: T0 });
  });

  it('respects a custom cycle length', () => {
    const short = pomodoro({ ...DEFAULT_POMODORO, cyclesBeforeLongBreak: 2 });
    let state = short;
    state = advancePomodoro(state, T0);
    state = advancePomodoro(state, T0);
    state = advancePomodoro(state, T0);

    expect(state.phase).toBe('longBreak');
  });

  it('does nothing for a non-Pomodoro timer', () => {
    const sw = stopwatch();
    expect(advancePomodoro(sw, T0)).toBe(sw);
  });
});

describe('phaseDuration', () => {
  it.each([
    ['work', 1500],
    ['shortBreak', 300],
    ['longBreak', 900],
  ] as const)('returns %s as %i seconds', (phase, expected) => {
    expect(phaseDuration(phase, DEFAULT_POMODORO)).toBe(expected);
  });
});

describe('isStudyPhase', () => {
  /**
   * Breaks are not studying. Recording them would inflate "total time studied
   * using PrepPilot" and make the figure meaningless.
   */
  it('excludes Pomodoro breaks', () => {
    const onBreak: TimerState = { ...pomodoro(), phase: 'shortBreak' };

    expect(isStudyPhase(onBreak)).toBe(false);
    expect(isStudyPhase({ ...pomodoro(), phase: 'longBreak' })).toBe(false);
  });

  it('includes Pomodoro work', () => {
    expect(isStudyPhase(pomodoro())).toBe(true);
  });

  it('includes every stopwatch and custom timer', () => {
    expect(isStudyPhase(stopwatch())).toBe(true);
    expect(isStudyPhase(custom(60))).toBe(true);
  });
});

describe('configuring a Pomodoro', () => {
  it('converts minutes to a usable config', () => {
    const config = makePomodoroConfig({
      workMinutes: 50,
      shortBreakMinutes: 10,
      longBreakMinutes: 30,
      cyclesBeforeLongBreak: 3,
      autoStartNextPhase: true,
    });

    expect(config).toEqual({
      workSeconds: 3000,
      shortBreakSeconds: 600,
      longBreakSeconds: 1800,
      cyclesBeforeLongBreak: 3,
      autoStartNextPhase: true,
    });
  });

  it('falls back to the standard values for anything omitted', () => {
    expect(makePomodoroConfig({})).toEqual(DEFAULT_POMODORO);
  });

  /**
   * Wide enough not to argue with how someone studies, narrow enough that a typo
   * cannot produce a nine-hour focus interval that silently never ends.
   */
  it.each([
    ['far too long', { workMinutes: 9999 }, 'workSeconds', POMODORO_LIMITS.workMinutes.max * 60],
    ['zero', { workMinutes: 0 }, 'workSeconds', POMODORO_LIMITS.workMinutes.min * 60],
    [
      'negative',
      { shortBreakMinutes: -5 },
      'shortBreakSeconds',
      POMODORO_LIMITS.shortBreakMinutes.min * 60,
    ],
    [
      'not a number',
      { workMinutes: Number.NaN },
      'workSeconds',
      POMODORO_LIMITS.workMinutes.min * 60,
    ],
  ])('clamps a %s value', (_label, input, key, expected) => {
    expect(makePomodoroConfig(input)[key as 'workSeconds']).toBe(expected);
  });

  it('rounds a fractional duration', () => {
    expect(makePomodoroConfig({ workMinutes: 25.6 }).workSeconds).toBe(26 * 60);
  });

  it('round-trips through minutes', () => {
    const original = makePomodoroConfig({ workMinutes: 45, cyclesBeforeLongBreak: 3 });

    expect(makePomodoroConfig(pomodoroConfigToMinutes(original))).toEqual(original);
  });
});

describe('storing a Pomodoro config', () => {
  it('round-trips through storage', () => {
    const config = makePomodoroConfig({ workMinutes: 45, shortBreakMinutes: 8 });

    expect(parsePomodoro(serialisePomodoro(config))).toEqual(config);
  });

  it('uses the standard config when nothing is stored', () => {
    expect(parsePomodoro(null)).toEqual(DEFAULT_POMODORO);
  });

  /** A hand-edited or corrupted value must not stop the timer working. */
  it.each(['not json', '"a string"', '[]', 'null', '{"workMinutes":"lots"}'])(
    'falls back for %s',
    (stored) => {
      const config = parsePomodoro(stored);

      expect(config.workSeconds).toBeGreaterThan(0);
      expect(config.cyclesBeforeLongBreak).toBeGreaterThanOrEqual(
        POMODORO_LIMITS.cyclesBeforeLongBreak.min,
      );
    },
  );
});

describe('clampToRange', () => {
  const range = { min: 1, max: 10 };

  it.each([
    [5, 5],
    [0, 1],
    [99, 10],
    [Number.NaN, 1],
    [4.6, 5],
  ])('clamps %p to %p', (value, expected) => {
    expect(clampToRange(value, range)).toBe(expected);
  });
});
