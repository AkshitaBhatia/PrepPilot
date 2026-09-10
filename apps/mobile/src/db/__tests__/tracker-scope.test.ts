import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../test-support/test-database';

const USER = 'user-1';

let db: ReturnType<typeof createTestDatabase>;
let repositories: ReturnType<typeof createTestRepositories>;
let neet: string;
let upsc: string;

beforeEach(async () => {
  db = createTestDatabase();
  repositories = createTestRepositories(db, createTestClock());
  neet = (await repositories.trackers.create({ userId: USER, name: 'NEET PG' })).id;
  upsc = (await repositories.trackers.create({ userId: USER, name: 'UPSC CSE' })).id;
});

afterEach(() => {
  db.$close();
});

/**
 * Two courses on one account must not see each other's work. A student
 * switching from NEET to UPSC should find the UPSC syllabus, not both at once.
 */
describe('keeping two courses apart', () => {
  it('shows only the showing course’s syllabus', async () => {
    await repositories.subjects.create({ userId: USER, name: 'Anatomy', trackerId: neet });
    await repositories.subjects.create({ userId: USER, name: 'Polity', trackerId: upsc });

    expect((await repositories.subjects.listByUser(USER, neet)).map((s) => s.name)).toEqual([
      'Anatomy',
    ]);
  });

  it('shows only its cards', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'A', back: 'a', trackerId: neet });
    await repositories.flashcards.create({ userId: USER, front: 'B', back: 'b', trackerId: upsc });

    expect((await repositories.flashcards.listByUser(USER, upsc)).map((c) => c.front)).toEqual([
      'B',
    ]);
  });

  it('shows only its due cards', async () => {
    const clock = createTestClock();
    await repositories.flashcards.create({ userId: USER, front: 'A', back: 'a', trackerId: neet });
    await repositories.flashcards.create({ userId: USER, front: 'B', back: 'b', trackerId: upsc });

    const due = await repositories.flashcards.listDue(USER, clock.now() + 1, neet);

    expect(due.map((c) => c.front)).toEqual(['A']);
  });

  it('shows only its reminders', async () => {
    await repositories.reminders.create({
      userId: USER,
      title: 'Anatomy revision',
      scheduledAt: Date.now(),
      repeatRule: 'none',
      trackerId: neet,
    });
    await repositories.reminders.create({
      userId: USER,
      title: 'Polity revision',
      scheduledAt: Date.now(),
      repeatRule: 'none',
      trackerId: upsc,
    });

    expect((await repositories.reminders.listByUser(USER, neet)).map((r) => r.title)).toEqual([
      'Anatomy revision',
    ]);
  });

  /**
   * An alarm the student set is an alarm they expect to hear, whatever course
   * happens to be on screen when it fires.
   */
  it('still fires reminders belonging to a course that is not showing', async () => {
    await repositories.reminders.create({
      userId: USER,
      title: 'Polity revision',
      scheduledAt: Date.now(),
      repeatRule: 'none',
      trackerId: upsc,
    });

    expect(await repositories.reminders.listSchedulable(USER)).toHaveLength(1);
  });

  it('counts only its study time', async () => {
    const first = await repositories.sessions.start({
      userId: USER,
      timerMode: 'stopwatch',
      trackerId: neet,
    });
    await repositories.sessions.complete(first.id, 600);
    const second = await repositories.sessions.start({
      userId: USER,
      timerMode: 'stopwatch',
      trackerId: upsc,
    });
    await repositories.sessions.complete(second.id, 900);

    expect(await repositories.sessions.totalSecondsForUser(USER, neet)).toBe(600);
    expect(await repositories.sessions.totalSecondsForUser(USER)).toBe(1500);
  });

  it('lists only its sessions', async () => {
    await repositories.sessions.start({ userId: USER, timerMode: 'stopwatch', trackerId: neet });
    await repositories.sessions.start({ userId: USER, timerMode: 'stopwatch', trackerId: upsc });

    expect(await repositories.sessions.listByUser(USER, 100, upsc)).toHaveLength(1);
  });

  it('shows only notes written under its subjects', async () => {
    const write = async (trackerId: string, subjectName: string, note: string) => {
      const subject = await repositories.subjects.create({
        userId: USER,
        name: subjectName,
        trackerId,
      });
      const chapter = await repositories.chapters.create({
        userId: USER,
        subjectId: subject.id,
        name: 'Chapter',
      });
      const topic = await repositories.topics.create({
        userId: USER,
        chapterId: chapter.id,
        name: 'Topic',
      });
      await repositories.topics.setNote(topic.id, note);
    };
    await write(neet, 'Anatomy', 'Brachial plexus');
    await write(upsc, 'Polity', 'Article 32');

    expect((await repositories.notes.listByUser(USER, upsc)).map((n) => n.note)).toEqual([
      'Article 32',
    ]);
  });
});

/**
 * Sync and the orphan repair need every row regardless of course; passing no
 * tracker is how they ask for that.
 */
describe('reading across every course', () => {
  it('returns both courses’ rows when no course is named', async () => {
    await repositories.subjects.create({ userId: USER, name: 'Anatomy', trackerId: neet });
    await repositories.subjects.create({ userId: USER, name: 'Polity', trackerId: upsc });

    expect(await repositories.subjects.listByUser(USER)).toHaveLength(2);
  });
});
