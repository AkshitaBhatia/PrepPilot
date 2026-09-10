import type { Repositories } from '../client';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../test-support/test-database';

/**
 * The synchronisation surface every repository shares.
 *
 * Tested uniformly because the engine calls these five identically — a
 * repository that quietly filtered tombstones, or bumped `updatedAt` when
 * marking a row synced, would break sync in a way no per-feature test would see.
 */

const USER = 'user-1';
const T = 1_700_000_000_000;

let db: ReturnType<typeof createTestDatabase>;
let clock: ReturnType<typeof createTestClock>;
let repositories: Repositories;

beforeEach(() => {
  db = createTestDatabase();
  clock = createTestClock(T);
  repositories = createTestRepositories(db, clock);
});

afterEach(() => {
  db.$close();
});

/** Creates one row per repository, returning its id and the accessor under test. */
async function seedEach() {
  const subject = await repositories.subjects.create({ userId: USER, name: 'Mathematics' });
  const chapter = await repositories.chapters.create({
    userId: USER,
    subjectId: subject.id,
    name: 'Number Systems',
  });
  const topic = await repositories.topics.create({
    userId: USER,
    chapterId: chapter.id,
    name: 'Decimal',
  });
  const session = await repositories.sessions.start({ userId: USER, timerMode: 'stopwatch' });
  const reminder = await repositories.reminders.create({
    userId: USER,
    title: 'Revise',
    scheduledAt: T + 3_600_000,
    repeatRule: 'none',
  });

  return [
    { name: 'subjects', repo: repositories.subjects, id: subject.id },
    { name: 'chapters', repo: repositories.chapters, id: chapter.id },
    { name: 'topics', repo: repositories.topics, id: topic.id },
    { name: 'sessions', repo: repositories.sessions, id: session.id },
    { name: 'reminders', repo: repositories.reminders, id: reminder.id },
  ] as const;
}

describe('listAllForSync', () => {
  it('returns rows for every repository', async () => {
    for (const entry of await seedEach()) {
      expect(await entry.repo.listAllForSync(USER)).toHaveLength(1);
    }
  });

  /**
   * A tombstone is how a deletion travels. Filtering them here would leave rows
   * resurrected on every other device.
   */
  it('includes tombstones', async () => {
    const entries = await seedEach();
    for (const entry of entries) await entry.repo.softDelete(entry.id);

    for (const entry of entries) {
      const rows = await entry.repo.listAllForSync(USER);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.deletedAt).not.toBeNull();
    }
  });

  it('never returns another account’s rows', async () => {
    await seedEach();

    for (const entry of await seedEach()) {
      expect(await entry.repo.listAllForSync('someone-else')).toEqual([]);
    }
  });
});

describe('markSynced', () => {
  it('clears the pending flag', async () => {
    for (const entry of await seedEach()) {
      await entry.repo.markSynced([entry.id]);

      const [row] = await entry.repo.listAllForSync(USER);
      expect(row?.syncStatus).toBe('synced');
    }
  });

  /**
   * This records what the server has seen, not a change the student made.
   * Bumping updatedAt would make the row look newer than the copy just accepted
   * and start a sync loop.
   */
  it('does not touch updatedAt', async () => {
    for (const entry of await seedEach()) {
      const [before] = await entry.repo.listAllForSync(USER);
      clock.advance(60_000);

      await entry.repo.markSynced([entry.id]);

      const [after] = await entry.repo.listAllForSync(USER);
      expect(after?.updatedAt).toBe(before?.updatedAt);
    }
  });

  it('is harmless for an empty list', async () => {
    for (const entry of await seedEach()) {
      await expect(entry.repo.markSynced([])).resolves.toBeUndefined();
    }
  });
});

describe('upsertFromSync', () => {
  it('inserts a row this device has never seen', async () => {
    await repositories.subjects.upsertFromSync({
      id: '01a00000-0000-7000-8000-0000000000aa',
      userId: USER,
      name: 'From elsewhere',
      description: null,
      position: 0,
      createdAt: T,
      updatedAt: T,
      deletedAt: null,
      syncStatus: 'synced',
    });

    expect((await repositories.subjects.listByUser(USER)).map((row) => row.name)).toEqual([
      'From elsewhere',
    ]);
  });

  it('replaces an existing row rather than duplicating it', async () => {
    const subject = await repositories.subjects.create({ userId: USER, name: 'Original' });

    await repositories.subjects.upsertFromSync({
      id: subject.id,
      userId: USER,
      name: 'Replaced',
      description: null,
      position: 0,
      createdAt: T,
      updatedAt: T + 1000,
      deletedAt: null,
      syncStatus: 'synced',
    });

    const rows = await repositories.subjects.listByUser(USER);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Replaced');
  });

  it('can apply a tombstone arriving from the server', async () => {
    const subject = await repositories.subjects.create({ userId: USER, name: 'Mathematics' });

    await repositories.subjects.upsertFromSync({
      id: subject.id,
      userId: USER,
      name: 'Mathematics',
      description: null,
      position: 0,
      createdAt: T,
      updatedAt: T + 1000,
      deletedAt: T + 1000,
      syncStatus: 'synced',
    });

    expect(await repositories.subjects.listByUser(USER)).toEqual([]);
  });
});

describe('preferences', () => {
  it('stores and reads a value', async () => {
    await repositories.preferences.set(USER, 'theme', 'dark');

    expect(await repositories.preferences.get(USER, 'theme')).toBe('dark');
  });

  it('overwrites rather than duplicating a key', async () => {
    await repositories.preferences.set(USER, 'theme', 'dark');
    await repositories.preferences.set(USER, 'theme', 'light');

    expect(await repositories.preferences.get(USER, 'theme')).toBe('light');
  });

  it('returns null for a key that was never set', async () => {
    expect(await repositories.preferences.get(USER, 'missing')).toBeNull();
  });

  it('keeps each account’s settings separate', async () => {
    await repositories.preferences.set(USER, 'theme', 'dark');

    expect(await repositories.preferences.get('someone-else', 'theme')).toBeNull();
  });
});
