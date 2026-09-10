import { DEFAULT_TRACKER_NAME } from '../repositories/trackers';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../test-support/test-database';

const USER = 'user-1';
const OTHER = 'user-2';

let db: ReturnType<typeof createTestDatabase>;
let repositories: ReturnType<typeof createTestRepositories>;

beforeEach(() => {
  db = createTestDatabase();
  repositories = createTestRepositories(db, createTestClock());
});

afterEach(() => {
  db.$close();
});

const trackers = () => repositories.trackers;

describe('keeping courses apart', () => {
  it('lists a student’s own courses only', async () => {
    await trackers().create({ userId: USER, name: 'UPSC CSE' });
    await trackers().create({ userId: OTHER, name: 'Theirs' });

    expect((await trackers().listByUser(USER)).map((row) => row.name)).toEqual(['UPSC CSE']);
  });

  it('keeps them in the order they were added', async () => {
    await trackers().create({ userId: USER, name: 'First' });
    await trackers().create({ userId: USER, name: 'Second' });

    expect((await trackers().listByUser(USER)).map((row) => row.name)).toEqual(['First', 'Second']);
  });

  it('remembers which template a course came from', async () => {
    const tracker = await trackers().create({
      userId: USER,
      name: 'JEE Main 2026',
      templateId: 'jee-main-2026',
    });

    expect(tracker.templateId).toBe('jee-main-2026');
  });

  it('renames one', async () => {
    const tracker = await trackers().create({ userId: USER, name: 'Typo' });

    await trackers().rename(tracker.id, 'Fixed');

    expect((await trackers().findById(tracker.id))?.name).toBe('Fixed');
  });
});

describe('removing a course', () => {
  const seed = async () => {
    const tracker = await trackers().create({ userId: USER, name: 'Doomed' });
    const subject = await repositories.subjects.create({
      userId: USER,
      name: 'Physics',
      trackerId: tracker.id,
    });
    await repositories.flashcards.create({
      userId: USER,
      front: 'Q',
      back: 'A',
      trackerId: tracker.id,
    });
    await repositories.reminders.create({
      userId: USER,
      title: 'Revise',
      scheduledAt: Date.now(),
      repeatRule: 'none',
      trackerId: tracker.id,
    });
    return { tracker, subject };
  };

  it('takes its syllabus with it', async () => {
    const { tracker } = await seed();

    await trackers().softDelete(tracker.id);

    expect(await repositories.subjects.listByUser(USER, tracker.id)).toEqual([]);
  });

  it('takes its cards and reminders too', async () => {
    const { tracker } = await seed();

    await trackers().softDelete(tracker.id);

    expect(await repositories.flashcards.listByUser(USER)).toEqual([]);
    expect(await repositories.reminders.listByUser(USER)).toEqual([]);
  });

  /**
   * Sessions carry no foreign key to a syllabus (D16). The student really did
   * spend that time, and it still counts towards their total.
   */
  it('leaves study time alone', async () => {
    const { tracker } = await seed();
    const session = await repositories.sessions.start({
      userId: USER,
      timerMode: 'stopwatch',
      trackerId: tracker.id,
    });
    await repositories.sessions.complete(session.id, 900);

    await trackers().softDelete(tracker.id);

    expect(await repositories.sessions.totalSecondsForUser(USER)).toBe(900);
  });

  it('tombstones rather than erasing, so the removal can travel', async () => {
    const { tracker } = await seed();

    await trackers().softDelete(tracker.id);

    expect(await trackers().findById(tracker.id)).toBeNull();
    expect(await trackers().listAllForSync(USER)).toHaveLength(1);
  });
});

/**
 * A student who had a syllabus before trackers existed has rows belonging to
 * none. Without this they would be invisible in every course rather than merely
 * in the wrong one.
 */
describe('claiming rows written before courses existed', () => {
  it('creates a course for them and moves them into it', async () => {
    await repositories.subjects.create({ userId: USER, name: 'Old subject' });

    const adopted = await trackers().adoptOrphans(USER);

    expect(adopted?.name).toBe(DEFAULT_TRACKER_NAME);
    expect(await repositories.subjects.listByUser(USER, adopted?.id)).toHaveLength(1);
  });

  it('claims sessions, reminders and cards as well', async () => {
    await repositories.subjects.create({ userId: USER, name: 'Old subject' });
    await repositories.sessions.start({ userId: USER, timerMode: 'stopwatch' });
    await repositories.reminders.create({
      userId: USER,
      title: 'Old',
      scheduledAt: Date.now(),
      repeatRule: 'none',
    });
    await repositories.flashcards.create({ userId: USER, front: 'Q', back: 'A' });

    const adopted = await trackers().adoptOrphans(USER);
    if (adopted === null) throw new Error('expected a tracker');

    const cards = await repositories.flashcards.listByUser(USER);
    expect(cards[0]?.trackerId).toBe(adopted.id);
  });

  it('puts them in the existing course rather than making a second one', async () => {
    const existing = await trackers().create({ userId: USER, name: 'Already here' });
    await repositories.subjects.create({ userId: USER, name: 'Unscoped' });

    const adopted = await trackers().adoptOrphans(USER);

    expect(adopted?.id).toBe(existing.id);
    expect(await trackers().listByUser(USER)).toHaveLength(1);
  });

  it('never steals rows that already belong to another course', async () => {
    const first = await trackers().create({ userId: USER, name: 'First' });
    const second = await trackers().create({ userId: USER, name: 'Second' });
    await repositories.subjects.create({ userId: USER, name: 'Theirs', trackerId: second.id });

    await trackers().adoptOrphans(USER);

    expect(await repositories.subjects.listByUser(USER, first.id)).toEqual([]);
    expect(await repositories.subjects.listByUser(USER, second.id)).toHaveLength(1);
  });

  /**
   * A brand-new account still gets one: a subject has to belong to a course, so
   * the app is never in a state where there is nowhere to put one.
   */
  it('gives a brand-new account somewhere to put its first subject', async () => {
    const adopted = await trackers().adoptOrphans(USER);

    expect(adopted?.name).toBe(DEFAULT_TRACKER_NAME);
    expect(await trackers().listByUser(USER)).toHaveLength(1);
  });

  it('does not keep making courses on every launch', async () => {
    await trackers().adoptOrphans(USER);
    await trackers().adoptOrphans(USER);
    await trackers().adoptOrphans(USER);

    expect(await trackers().listByUser(USER)).toHaveLength(1);
  });

  it('leaves another account’s unscoped rows alone', async () => {
    await repositories.subjects.create({ userId: OTHER, name: 'Not mine' });
    await repositories.subjects.create({ userId: USER, name: 'Mine' });

    const adopted = await trackers().adoptOrphans(USER);

    expect(await repositories.subjects.listByUser(USER, adopted?.id)).toHaveLength(1);
  });
});
