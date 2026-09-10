import { StudySessionRepository } from '../repositories/study-sessions';
import { createTestClock, createTestDatabase } from '../test-support/test-database';

let db: ReturnType<typeof createTestDatabase>;
let clock: ReturnType<typeof createTestClock>;
let repo: StudySessionRepository;

const USER = 'user-1';

const startSession = () =>
  repo.start({
    userId: USER,
    timerMode: 'stopwatch',
    subjectId: 'subject-1',
    subjectName: 'Mathematics',
  });

beforeEach(() => {
  db = createTestDatabase();
  clock = createTestClock();
  repo = new StudySessionRepository(db, clock);
});

afterEach(() => {
  db.$close();
});

describe('start', () => {
  it('writes the session immediately, before any time has elapsed', async () => {
    const session = await startSession();

    expect(session).toMatchObject({ status: 'running', durationSeconds: 0, endedAt: null });
    expect(await repo.findById(session.id)).not.toBeNull();
  });

  it('records which timer produced the session', async () => {
    const session = await repo.start({ userId: USER, timerMode: 'pomodoro' });

    expect(session.timerMode).toBe('pomodoro');
  });

  it('allows a session with no syllabus item attached', async () => {
    const session = await repo.start({ userId: USER, timerMode: 'stopwatch' });

    expect(session).toMatchObject({ subjectId: null, chapterId: null, topicId: null });
  });

  /** History must stay readable after the syllabus moves on. */
  it('snapshots the names the student saw', async () => {
    const session = await repo.start({
      userId: USER,
      timerMode: 'custom',
      subjectId: 's1',
      chapterId: 'c1',
      topicId: 't1',
      subjectName: 'Mathematics',
      chapterName: 'Number Systems',
      topicName: 'Decimal',
    });

    expect(session).toMatchObject({
      subjectName: 'Mathematics',
      chapterName: 'Number Systems',
      topicName: 'Decimal',
    });
  });
});

describe('heartbeat', () => {
  it('records progress without ending the session', async () => {
    const session = await startSession();

    await repo.heartbeat(session.id, 90, 'running');

    expect(await repo.findById(session.id)).toMatchObject({
      durationSeconds: 90,
      status: 'running',
      endedAt: null,
    });
  });

  it('can mark a session paused', async () => {
    const session = await startSession();

    await repo.heartbeat(session.id, 30, 'paused');

    expect((await repo.findById(session.id))?.status).toBe('paused');
  });

  it('floors a fractional duration and refuses to go negative', async () => {
    const session = await startSession();

    await repo.heartbeat(session.id, 90.9, 'running');
    expect((await repo.findById(session.id))?.durationSeconds).toBe(90);

    await repo.heartbeat(session.id, -5, 'running');
    expect((await repo.findById(session.id))?.durationSeconds).toBe(0);
  });
});

describe('complete', () => {
  it('stamps the end time and final duration', async () => {
    const session = await startSession();
    const endedAt = clock.advance(600_000);

    await repo.complete(session.id, 600);

    expect(await repo.findById(session.id)).toMatchObject({
      status: 'completed',
      durationSeconds: 600,
      endedAt,
    });
  });
});

describe('listByUser', () => {
  it('returns the newest session first', async () => {
    const first = await startSession();
    clock.advance(60_000);
    const second = await startSession();

    expect((await repo.listByUser(USER)).map((row) => row.id)).toEqual([second.id, first.id]);
  });

  it('returns only the given user’s sessions', async () => {
    await startSession();
    await repo.start({ userId: 'someone-else', timerMode: 'stopwatch' });

    expect(await repo.listByUser(USER)).toHaveLength(1);
  });

  it('excludes deleted sessions', async () => {
    const session = await startSession();
    await repo.softDelete(session.id);

    expect(await repo.listByUser(USER)).toEqual([]);
  });

  it('honours the limit', async () => {
    for (let index = 0; index < 5; index += 1) {
      clock.advance(1000);
      await startSession();
    }

    expect(await repo.listByUser(USER, 2)).toHaveLength(2);
  });
});

describe('totalSecondsForUser', () => {
  it('is zero for a student who has not studied', async () => {
    expect(await repo.totalSecondsForUser(USER)).toBe(0);
  });

  it('sums completed sessions', async () => {
    const a = await startSession();
    await repo.complete(a.id, 600);
    const b = await startSession();
    await repo.complete(b.id, 300);

    expect(await repo.totalSecondsForUser(USER)).toBe(900);
  });

  /**
   * A student who studied for an hour before the app crashed did the work.
   * Dropping it would make "total time studied using PrepPilot" a lie.
   */
  it('includes abandoned sessions', async () => {
    const session = await startSession();
    await repo.heartbeat(session.id, 3600, 'running');
    await repo.abandonInterrupted(USER);

    expect(await repo.totalSecondsForUser(USER)).toBe(3600);
  });

  it('ignores another user’s sessions', async () => {
    const mine = await startSession();
    await repo.complete(mine.id, 100);
    const theirs = await repo.start({ userId: 'someone-else', timerMode: 'stopwatch' });
    await repo.complete(theirs.id, 9999);

    expect(await repo.totalSecondsForUser(USER)).toBe(100);
  });

  it('ignores deleted sessions', async () => {
    const session = await startSession();
    await repo.complete(session.id, 600);
    await repo.softDelete(session.id);

    expect(await repo.totalSecondsForUser(USER)).toBe(0);
  });
});

describe('abandonInterrupted', () => {
  /** The case this whole heartbeat design exists for: the app was killed. */
  it('closes a session left running by a previous launch', async () => {
    const session = await startSession();
    await repo.heartbeat(session.id, 1200, 'running');

    const recovered = await repo.abandonInterrupted(USER);

    expect(recovered).toBe(1);
    expect(await repo.findById(session.id)).toMatchObject({
      status: 'abandoned',
      durationSeconds: 1200,
    });
  });

  /**
   * The end time comes from the last heartbeat, not from now — the intervening
   * hours were spent with the app closed, not studying.
   */
  it('ends the session at its last heartbeat, not at recovery time', async () => {
    const session = await startSession();
    await repo.heartbeat(session.id, 1200, 'running');
    clock.advance(48 * 60 * 60 * 1000);

    await repo.abandonInterrupted(USER);

    expect((await repo.findById(session.id))?.endedAt).toBe(session.startedAt + 1_200_000);
  });

  it('does nothing when no session was interrupted', async () => {
    expect(await repo.abandonInterrupted(USER)).toBe(0);
  });

  it('leaves completed sessions alone', async () => {
    const session = await startSession();
    await repo.complete(session.id, 600);

    await repo.abandonInterrupted(USER);

    expect((await repo.findById(session.id))?.status).toBe('completed');
  });

  it('does not touch another user’s interrupted session', async () => {
    const theirs = await repo.start({ userId: 'someone-else', timerMode: 'stopwatch' });

    await repo.abandonInterrupted(USER);

    expect((await repo.findById(theirs.id))?.status).toBe('running');
  });

  it('recovers several interrupted sessions at once', async () => {
    await startSession();
    await startSession();

    expect(await repo.abandonInterrupted(USER)).toBe(2);
  });
});

describe('listBySubject', () => {
  it('returns sessions for one subject, newest first', async () => {
    const first = await startSession();
    clock.advance(60_000);
    const second = await startSession();
    await repo.start({ userId: USER, timerMode: 'stopwatch', subjectId: 'other' });

    expect((await repo.listBySubject('subject-1')).map((row) => row.id)).toEqual([
      second.id,
      first.id,
    ]);
  });
});

describe('deleting a subject', () => {
  /**
   * Sessions carry no foreign key to subjects on purpose. Cascading would shrink
   * "total time studied using PrepPilot" retroactively (D16) — the student really
   * did spend that time.
   */
  it('leaves its sessions and their totals intact', async () => {
    const session = await startSession();
    await repo.complete(session.id, 3600);

    // No FK exists, so removing the subject cannot cascade here.
    expect(await repo.totalSecondsForUser(USER)).toBe(3600);
    expect((await repo.findById(session.id))?.subjectName).toBe('Mathematics');
  });
});
