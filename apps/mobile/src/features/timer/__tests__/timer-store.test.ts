import { DEFAULT_POMODORO, elapsedSeconds } from '@preppilot/shared';
import { StudySessionRepository } from '../../../db/repositories/study-sessions';
import { createTestClock, createTestDatabase } from '../../../db/test-support/test-database';
import { configureTimerContext, resetTimerStore, useTimerStore } from '../timer-store';

// The alert is a platform seam: scheduling a real notification in a unit test
// would need the OS, and what matters here is when the timer asks for one.
jest.mock('../timer-alert', () => ({
  armTimerAlert: jest.fn(async () => undefined),
  disarmTimerAlert: jest.fn(async () => undefined),
  announceTimerFinished: jest.fn(async () => undefined),
}));

const USER = 'user-1';

let db: ReturnType<typeof createTestDatabase>;
let clock: ReturnType<typeof createTestClock>;
let sessions: StudySessionRepository;

const store = () => useTimerStore.getState();
const target = { subjectId: 's1', subjectName: 'Mathematics' };

beforeEach(() => {
  db = createTestDatabase();
  clock = createTestClock();
  sessions = new StudySessionRepository(db, clock);
  resetTimerStore();
  configureTimerContext({ userId: USER, sessions, now: clock.now });
});

afterEach(() => {
  db.$close();
});

describe('configure', () => {
  it('prepares an idle stopwatch', () => {
    store().configure('stopwatch', target);

    expect(store().timer).toMatchObject({ mode: 'stopwatch', status: 'idle' });
    expect(store().sessionId).toBeNull();
  });

  it('prepares a custom countdown of the requested length', () => {
    store().configure('custom', target, { targetSeconds: 900 });

    expect(store().timer?.targetSeconds).toBe(900);
  });

  it('prepares a Pomodoro on its work phase', () => {
    store().configure('pomodoro', target, { pomodoro: DEFAULT_POMODORO });

    expect(store().timer).toMatchObject({ phase: 'work', targetSeconds: 1500 });
  });
});

describe('starting', () => {
  it('records a session as soon as the timer starts', async () => {
    store().configure('stopwatch', target);

    await store().startTimer();

    const sessionId = store().sessionId;
    expect(sessionId).not.toBeNull();
    expect(await sessions.findById(sessionId!)).toMatchObject({
      status: 'running',
      subjectName: 'Mathematics',
      timerMode: 'stopwatch',
    });
  });

  it('does nothing when the timer is already running', async () => {
    store().configure('stopwatch', target);
    await store().startTimer();
    const first = store().sessionId;

    await store().startTimer();

    expect(store().sessionId).toBe(first);
  });

  /**
   * Failing to record is bad; stopping a student's timer because of a write
   * failure is worse. The timer keeps running and the message says so.
   */
  it('keeps the timer running when the session cannot be recorded', async () => {
    jest.spyOn(sessions, 'start').mockRejectedValue(new Error('SQLITE_BUSY'));
    store().configure('stopwatch', target);

    await store().startTimer();

    expect(store().timer?.status).toBe('running');
    expect(store().sessionId).toBeNull();
    expect(store().error).toMatch(/still running/);
  });
});

describe('pause, resume and stop', () => {
  it('banks time across a pause and resume', async () => {
    store().configure('stopwatch', target);
    await store().startTimer();

    clock.advance(30_000);
    await store().pauseTimer();
    clock.advance(600_000);
    await store().resumeTimer();
    clock.advance(10_000);

    expect(elapsedSeconds(store().timer!, clock.now())).toBe(40);
  });

  it('records the paused state on the session', async () => {
    store().configure('stopwatch', target);
    await store().startTimer();
    clock.advance(30_000);

    await store().pauseTimer();

    expect(await sessions.findById(store().sessionId!)).toMatchObject({
      status: 'paused',
      durationSeconds: 30,
    });
  });

  it('completes the session on stop', async () => {
    store().configure('stopwatch', target);
    await store().startTimer();
    clock.advance(125_000);

    const sessionId = store().sessionId!;
    await store().stopTimer();

    expect(await sessions.findById(sessionId)).toMatchObject({
      status: 'completed',
      durationSeconds: 125,
    });
    expect(store().sessionId).toBeNull();
  });

  it('reports a failure to save the finished session', async () => {
    store().configure('stopwatch', target);
    await store().startTimer();
    jest.spyOn(sessions, 'complete').mockRejectedValue(new Error('disk full'));

    await store().stopTimer();

    expect(store().error).toMatch(/could not save this session/);
  });

  it('ignores pause and resume when nothing is configured', async () => {
    await expect(store().pauseTimer()).resolves.toBeUndefined();
    await expect(store().resumeTimer()).resolves.toBeUndefined();
    await expect(store().stopTimer()).resolves.toBeUndefined();
  });
});

describe('heartbeats', () => {
  /** The whole point: a crash costs one interval, not the whole sitting. */
  it('persists progress while the timer runs', async () => {
    store().configure('stopwatch', target);
    await store().startTimer();
    clock.advance(45_000);

    await store().beat();

    expect(await sessions.findById(store().sessionId!)).toMatchObject({
      durationSeconds: 45,
      status: 'running',
    });
  });

  it('does nothing when the timer is paused', async () => {
    store().configure('stopwatch', target);
    await store().startTimer();
    clock.advance(30_000);
    await store().pauseTimer();
    const heartbeat = jest.spyOn(sessions, 'heartbeat');

    await store().beat();

    expect(heartbeat).not.toHaveBeenCalled();
  });

  /** A failed heartbeat must stay silent; a message every 30 seconds is worse. */
  it('swallows a failure rather than interrupting the student', async () => {
    store().configure('stopwatch', target);
    await store().startTimer();
    jest.spyOn(sessions, 'heartbeat').mockRejectedValue(new Error('SQLITE_BUSY'));

    await store().beat();

    expect(store().error).toBeNull();
  });
});

describe('Pomodoro', () => {
  /**
   * Breaks are not studying. Recording them would inflate "total time studied
   * using PrepPilot" (PRD §12).
   */
  it('does not record a session during a break', async () => {
    store().configure('pomodoro', target);
    await store().startTimer();
    clock.advance(1_500_000);

    await store().nextPomodoroPhase();
    expect(store().timer?.phase).toBe('shortBreak');

    await store().startTimer();

    expect(store().sessionId).toBeNull();
  });

  it('banks the work interval before moving to the break', async () => {
    store().configure('pomodoro', target);
    await store().startTimer();
    const sessionId = store().sessionId!;
    clock.advance(1_500_000);

    await store().nextPomodoroPhase();

    expect(await sessions.findById(sessionId)).toMatchObject({
      status: 'completed',
      durationSeconds: 1500,
    });
  });

  it('returns to work after a break', async () => {
    store().configure('pomodoro', target);
    await store().nextPomodoroPhase();
    await store().nextPomodoroPhase();

    expect(store().timer?.phase).toBe('work');
  });

  it('does nothing for a non-Pomodoro timer', async () => {
    store().configure('stopwatch', target);

    await store().nextPomodoroPhase();

    expect(store().timer?.mode).toBe('stopwatch');
  });
});

describe('housekeeping', () => {
  it('bumps the tick so subscribers re-render', () => {
    store().configure('stopwatch', target);
    const before = store().tick;

    store().refreshDisplay();

    expect(store().tick).toBe(before + 1);
  });

  it('clears an error', async () => {
    jest.spyOn(sessions, 'start').mockRejectedValue(new Error('boom'));
    store().configure('stopwatch', target);
    await store().startTimer();

    store().clearError();

    expect(store().error).toBeNull();
  });

  it('resets to an unconfigured state', async () => {
    store().configure('stopwatch', target);
    await store().startTimer();

    store().reset();

    expect(store()).toMatchObject({ timer: null, sessionId: null, target: null });
  });

  it('fails clearly when used before the context is supplied', async () => {
    resetTimerStore();
    useTimerStore.setState({ timer: { status: 'idle' } as never });

    await expect(store().startTimer()).rejects.toThrow(/configureTimerContext/);
  });
});

/**
 * A countdown that ends silently ends unnoticed — the student is meant to be
 * studying, not watching a number. The chime is a scheduled notification so it
 * arrives even when the app is not the thing they are looking at.
 */
describe('telling the student the timer has finished', () => {
  const alert = jest.requireMock('../timer-alert') as {
    armTimerAlert: jest.Mock;
    disarmTimerAlert: jest.Mock;
    announceTimerFinished: jest.Mock;
  };

  beforeEach(() => {
    alert.armTimerAlert.mockClear();
    alert.disarmTimerAlert.mockClear();
    alert.announceTimerFinished.mockClear();
  });

  it('arms the chime when a countdown starts', async () => {
    store().configure('custom', target, { targetSeconds: 1500 });

    await store().startTimer();

    expect(alert.armTimerAlert).toHaveBeenCalled();
  });

  /** Nothing to announce: a stopwatch has no end to arrive at. */
  it('arms nothing for a stopwatch', async () => {
    store().configure('stopwatch', target);

    await store().startTimer();

    const [timer] = alert.armTimerAlert.mock.calls[0] ?? [];
    expect(timer?.targetSeconds).toBeNull();
  });

  it('cancels the chime when the student pauses', async () => {
    store().configure('custom', target, { targetSeconds: 1500 });
    await store().startTimer();

    await store().pauseTimer();

    expect(alert.disarmTimerAlert).toHaveBeenCalled();
  });

  /** Resuming ends later than the original plan, by however long the pause was. */
  it('re-arms against the new end time on resume', async () => {
    store().configure('custom', target, { targetSeconds: 1500 });
    await store().startTimer();
    await store().pauseTimer();
    alert.armTimerAlert.mockClear();

    await store().resumeTimer();

    expect(alert.armTimerAlert).toHaveBeenCalled();
  });

  it('buzzes when the countdown actually ran out', async () => {
    store().configure('custom', target, { targetSeconds: 60 });
    await store().startTimer();
    clock.advance(61_000);

    await store().stopTimer();

    expect(alert.announceTimerFinished).toHaveBeenCalled();
  });

  /** Stopping early is not finishing; congratulating the student would be a lie. */
  it('stays quiet when the student stops it early', async () => {
    store().configure('custom', target, { targetSeconds: 1500 });
    await store().startTimer();
    clock.advance(30_000);

    await store().stopTimer();

    expect(alert.announceTimerFinished).not.toHaveBeenCalled();
    expect(alert.disarmTimerAlert).toHaveBeenCalled();
  });
});
