import type { Repositories } from '../../../db/client';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../../../db/test-support/test-database';
import { toRemote } from '../mappers';
import { synchronise } from '../sync-engine';
import { SYNCED_TABLES } from '../remote';
import { createFakeRemote } from '../test-support/fake-remote';

const USER = 'user-1';
const T = 1_700_000_000_000;

let db: ReturnType<typeof createTestDatabase>;
let clock: ReturnType<typeof createTestClock>;
let repositories: Repositories;
let fake: ReturnType<typeof createFakeRemote>;

beforeEach(() => {
  db = createTestDatabase();
  clock = createTestClock(T);
  repositories = createTestRepositories(db, clock);
  fake = createFakeRemote();
});

afterEach(() => {
  db.$close();
});

const run = (since: number | null = null) =>
  synchronise({ userId: USER, repositories, remote: fake.remote, since });

describe('pushing local work', () => {
  it('sends rows the server has not seen', async () => {
    const subject = await repositories.subjects.create({ userId: USER, name: 'Mathematics' });

    const result = await run();

    expect(result.pushed).toBeGreaterThanOrEqual(1);
    expect(fake.rows('subjects').map((row) => row.id)).toContain(subject.id);
  });

  it('marks them synced so a second pass sends nothing', async () => {
    await repositories.subjects.create({ userId: USER, name: 'Mathematics' });
    await run();

    const second = await run();

    expect(second.pushed).toBe(0);
  });

  it('sends the whole hierarchy', async () => {
    const subject = await repositories.subjects.create({ userId: USER, name: 'Mathematics' });
    const chapter = await repositories.chapters.create({
      userId: USER,
      subjectId: subject.id,
      name: 'Number Systems',
    });
    await repositories.topics.create({ userId: USER, chapterId: chapter.id, name: 'Decimal' });

    await run();

    expect(fake.rows('subjects')).toHaveLength(1);
    expect(fake.rows('chapters')).toHaveLength(1);
    expect(fake.rows('topics')).toHaveLength(1);
  });

  /** A deletion travels as a tombstone, so it must be pushed like any other row. */
  it('sends tombstones', async () => {
    const subject = await repositories.subjects.create({ userId: USER, name: 'Mathematics' });
    await run();
    await repositories.subjects.softDelete(subject.id);

    await run();

    expect(fake.rows('subjects')[0]?.deleted_at).not.toBeNull();
  });

  it('converts timestamps to the server format', async () => {
    await repositories.subjects.create({ userId: USER, name: 'Mathematics' });

    await run();

    expect(fake.rows('subjects')[0]?.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  /** Local bookkeeping has no meaning on another device (D45). */
  it('does not send local-only columns', async () => {
    await repositories.reminders.create({
      userId: USER,
      title: 'Revise',
      scheduledAt: T + 3_600_000,
      repeatRule: 'none',
    });

    await run();

    const row = fake.rows('reminders')[0]!;
    expect(row).not.toHaveProperty('notification_id');
    expect(row).not.toHaveProperty('sync_status');
  });
});

describe('pulling remote work', () => {
  const remoteSubject = (over: Record<string, unknown> = {}) =>
    toRemote({
      id: '01a00000-0000-7000-8000-000000000001',
      userId: USER,
      name: 'From another device',
      description: null,
      position: 0,
      createdAt: T,
      updatedAt: T,
      deletedAt: null,
      ...over,
    });

  it('inserts rows this device has never seen', async () => {
    fake.seed('subjects', remoteSubject());

    const result = await run();

    expect(result.pulled).toBeGreaterThanOrEqual(1);
    expect((await repositories.subjects.listByUser(USER)).map((row) => row.name)).toEqual([
      'From another device',
    ]);
  });

  it('applies a remote tombstone', async () => {
    fake.seed('subjects', remoteSubject({ deletedAt: T + 1000 }));

    await run();

    expect(await repositories.subjects.listByUser(USER)).toEqual([]);
  });

  it('pulls only what changed when given a watermark', async () => {
    fake.seed(
      'subjects',
      remoteSubject({ id: '01a00000-0000-7000-8000-00000000000a', updatedAt: T }),
    );
    fake.seed(
      'subjects',
      remoteSubject({
        id: '01a00000-0000-7000-8000-00000000000b',
        updatedAt: T + 60_000,
        name: 'Newer',
      }),
    );

    await run(T + 1000);

    expect((await repositories.subjects.listByUser(USER)).map((row) => row.name)).toEqual([
      'Newer',
    ]);
  });
});

describe('conflicts', () => {
  const CONFLICT_ID = '01a00000-0000-7000-8000-0000000000ff';

  it('takes the newer remote edit', async () => {
    const subject = await repositories.subjects.create({ userId: USER, name: 'Local name' });
    await run();

    fake.seed(
      'subjects',
      toRemote({
        id: subject.id,
        userId: USER,
        name: 'Remote name',
        description: null,
        position: 0,
        createdAt: T,
        updatedAt: T + 60_000,
        deletedAt: null,
      }),
    );

    const result = await run();

    expect((await repositories.subjects.findById(subject.id))?.name).toBe('Remote name');
    expect(result.conflicts).toBe(1);
  });

  it('keeps a newer local edit', async () => {
    const subject = await repositories.subjects.create({ userId: USER, name: 'Local' });
    await run();
    clock.advance(60_000);
    await repositories.subjects.update(subject.id, { name: 'Local, edited' });
    await run();

    expect((await repositories.subjects.findById(subject.id))?.name).toBe('Local, edited');
  });

  /**
   * The case the separate completion timestamp exists for: a rename on one
   * device must not revert a tick made on another.
   */
  it('keeps a remote tick alongside a newer local rename', async () => {
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
    await run();

    // Another device ticked it a moment ago.
    fake.seed(
      'topics',
      toRemote({
        id: topic.id,
        userId: USER,
        chapterId: chapter.id,
        name: 'Decimal',
        completed: true,
        completedChangedAt: T + 1000,
        position: 0,
        createdAt: T,
        updatedAt: T + 1000,
        deletedAt: null,
      }),
    );

    // This device renamed it later, without touching completion.
    clock.advance(60_000);
    await repositories.topics.rename(topic.id, 'Decimals');

    await run();

    const merged = await repositories.topics.findById(topic.id);
    expect(merged?.completed).toBe(true);
    expect(merged?.name).toBe('Decimals');
  });

  it('pushes a merged row back, since it exists nowhere else', async () => {
    const subject = await repositories.subjects.create({ userId: USER, name: 'Mathematics' });
    const chapter = await repositories.chapters.create({
      userId: USER,
      subjectId: subject.id,
      name: 'Chapter',
    });
    const topic = await repositories.topics.create({
      userId: USER,
      chapterId: chapter.id,
      name: 'Decimal',
    });
    await run();

    fake.seed(
      'topics',
      toRemote({
        id: topic.id,
        userId: USER,
        chapterId: chapter.id,
        name: 'Decimal',
        completed: true,
        completedChangedAt: T + 1000,
        position: 0,
        createdAt: T,
        updatedAt: T + 1000,
        deletedAt: null,
      }),
    );
    clock.advance(60_000);
    await repositories.topics.rename(topic.id, 'Decimals');

    await run();

    const onServer = fake.rows('topics')[0]!;
    expect(onServer.completed).toBe(true);
    expect(onServer.name).toBe('Decimals');
    expect(CONFLICT_ID).toBeDefined();
  });

  /** Deleting anywhere sticks; resurrecting a removed row is the worse error. */
  it('lets a tombstone beat a newer edit', async () => {
    const subject = await repositories.subjects.create({ userId: USER, name: 'Mathematics' });
    await run();
    await repositories.subjects.softDelete(subject.id);

    fake.seed(
      'subjects',
      toRemote({
        id: subject.id,
        userId: USER,
        name: 'Edited elsewhere',
        description: null,
        position: 0,
        createdAt: T,
        updatedAt: T + 600_000,
        deletedAt: null,
      }),
    );

    await run();

    expect(await repositories.subjects.findById(subject.id)).toBeNull();
  });
});

describe('avoiding duplicates', () => {
  /**
   * PRD §22 forbids duplicates. Stable client-generated ids are what make that
   * possible: the same row pushed twice updates rather than inserting again.
   */
  it('does not duplicate a row across repeated passes', async () => {
    await repositories.subjects.create({ userId: USER, name: 'Mathematics' });

    await run();
    await run();
    await run();

    expect(fake.rows('subjects')).toHaveLength(1);
    expect(await repositories.subjects.listByUser(USER)).toHaveLength(1);
  });

  it('does not re-insert a row it just pulled', async () => {
    fake.seed(
      'subjects',
      toRemote({
        id: '01a00000-0000-7000-8000-000000000009',
        userId: USER,
        name: 'Remote',
        description: null,
        position: 0,
        createdAt: T,
        updatedAt: T,
        deletedAt: null,
      }),
    );

    await run();
    await run();

    expect(await repositories.subjects.listByUser(USER)).toHaveLength(1);
  });
});

describe('failures', () => {
  /**
   * A partial pass is safe to repeat, because every write is an upsert on a
   * stable id. The engine therefore surfaces the error rather than swallowing it.
   */
  it('propagates a failure instead of reporting success', async () => {
    await repositories.subjects.create({ userId: USER, name: 'Mathematics' });
    fake.failOn('subjects', 'network unreachable');

    await expect(run()).rejects.toThrow(/network unreachable/);
  });

  it('leaves unsent rows pending so a retry picks them up', async () => {
    await repositories.subjects.create({ userId: USER, name: 'Mathematics' });
    fake.failOn('subjects', 'network unreachable');
    await expect(run()).rejects.toThrow();

    fake.clearFailures();
    const result = await run();

    expect(result.pushed).toBeGreaterThanOrEqual(1);
    expect(fake.rows('subjects')).toHaveLength(1);
  });
});

/**
 * Sub-topics carry completion exactly as topics do, so they need the same
 * conflict rule: completion resolves on its own timestamp, or a rename made on
 * one device silently reverts a tick made on another (D14).
 */
describe('sub-topics', () => {
  it('pushes one a student created offline', async () => {
    const subject = await repositories.subjects.create({ userId: USER, name: 'Physics' });
    const chapter = await repositories.chapters.create({
      userId: USER,
      subjectId: subject.id,
      name: 'Electricity',
    });
    const topic = await repositories.topics.create({
      userId: USER,
      chapterId: chapter.id,
      name: "Ohm's law",
    });
    await repositories.subtopics.create({ userId: USER, topicId: topic.id, name: 'Statement' });

    await run();

    expect(fake.rows('subtopics').map((row) => row.name)).toEqual(['Statement']);
  });

  it('pushes parents before children, so the foreign key holds', async () => {
    const subject = await repositories.subjects.create({ userId: USER, name: 'Physics' });
    const chapter = await repositories.chapters.create({
      userId: USER,
      subjectId: subject.id,
      name: 'Electricity',
    });
    const topic = await repositories.topics.create({
      userId: USER,
      chapterId: chapter.id,
      name: "Ohm's law",
    });
    await repositories.subtopics.create({ userId: USER, topicId: topic.id, name: 'Statement' });

    await run();

    // A sub-topic arriving before its topic would be rejected by the server.
    const order = SYNCED_TABLES.indexOf('subtopics') > SYNCED_TABLES.indexOf('topics');
    expect(order).toBe(true);
    expect(fake.rows('topics')).toHaveLength(1);
    expect(fake.rows('subtopics')).toHaveLength(1);
  });

  it('keeps a remote tick over a local rename', async () => {
    const subject = await repositories.subjects.create({ userId: USER, name: 'Physics' });
    const chapter = await repositories.chapters.create({
      userId: USER,
      subjectId: subject.id,
      name: 'Electricity',
    });
    const topic = await repositories.topics.create({
      userId: USER,
      chapterId: chapter.id,
      name: "Ohm's law",
    });
    const subtopic = await repositories.subtopics.create({
      userId: USER,
      topicId: topic.id,
      name: 'Statement',
    });

    // Another device ticked it. This device renamed it afterwards, so the newer
    // name must survive while the tick it never saw still lands.
    fake.seed(
      'subtopics',
      toRemote({
        ...subtopic,
        completed: true,
        completedChangedAt: T + 5_000,
        updatedAt: T + 5_000,
      }) as never,
    );
    clock.advance(10_000);
    await repositories.subtopics.rename(subtopic.id, 'Statement of the law');

    await run();

    const merged = await repositories.subtopics.findById(subtopic.id);
    expect(merged?.completed).toBe(true);
    expect(merged?.name).toBe('Statement of the law');
  });
});

/**
 * Flashcards sync like everything else, but their scheduling state is what makes
 * them worth syncing: a card reviewed on one device must not come back due on
 * another.
 */
describe('flashcards', () => {
  it('pushes a card made offline', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'Ohm', back: 'V = IR' });

    await run();

    expect(fake.rows('flashcards').map((row) => row.front)).toEqual(['Ohm']);
  });

  it('carries the schedule, not just the text', async () => {
    const card = await repositories.flashcards.create({
      userId: USER,
      front: 'Ohm',
      back: 'V = IR',
    });
    await repositories.flashcards.applySchedule(card.id, {
      easeFactor: 2.36,
      intervalDays: 6,
      repetitions: 2,
      dueAt: T + 6 * 24 * 60 * 60 * 1000,
      lapses: 1,
    });

    await run();

    const pushed = fake.rows('flashcards')[0];
    expect(pushed).toMatchObject({
      ease_factor: 2.36,
      interval_days: 6,
      repetitions: 2,
      lapses: 1,
    });
    expect(typeof pushed?.due_at).toBe('string');
  });

  it('accepts a card from another device', async () => {
    fake.seed(
      'flashcards',
      toRemote({
        id: '01a00000-0000-7000-8000-0000000000f1',
        userId: USER,
        topicId: null,
        topicName: null,
        front: 'From elsewhere',
        back: 'x',
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        lapses: 0,
        dueAt: T,
        lastReviewedAt: T,
        createdAt: T,
        updatedAt: T,
        deletedAt: null,
      }) as never,
    );

    await run();

    expect((await repositories.flashcards.listByUser(USER)).map((row) => row.front)).toEqual([
      'From elsewhere',
    ]);
  });
});

describe('carrying courses between devices', () => {
  it('sends a course the server has not seen', async () => {
    await repositories.trackers.create({ userId: USER, name: 'NEET PG', templateId: 'neet-pg' });

    await run();

    const [row] = fake.rows('trackers');
    expect(row?.name).toBe('NEET PG');
    expect(row?.template_id).toBe('neet-pg');
  });

  /** A subject landing before its course would point at one the server has never heard of. */
  it('sends the course before the subjects that belong to it', async () => {
    const tracker = await repositories.trackers.create({ userId: USER, name: 'NEET PG' });
    await repositories.subjects.create({
      userId: USER,
      name: 'Anatomy',
      trackerId: tracker.id,
    });

    await run();

    expect(SYNCED_TABLES.indexOf('trackers')).toBeLessThan(SYNCED_TABLES.indexOf('subjects'));
    expect(fake.rows('trackers')).toHaveLength(1);
    expect(fake.rows('subjects')[0]?.tracker_id).toBe(tracker.id);
  });

  it('brings down a course made on another device', async () => {
    fake.seed(
      'trackers',
      toRemote({
        id: '01930000-0000-7000-8000-000000000001',
        userId: USER,
        name: 'UPSC CSE',
        templateId: null,
        position: 0,
        createdAt: T,
        updatedAt: T,
        deletedAt: null,
      }),
    );

    await run();

    expect((await repositories.trackers.listByUser(USER)).map((row) => row.name)).toEqual([
      'UPSC CSE',
    ]);
  });

  it('brings down which course a subject belongs to', async () => {
    const trackerId = '01930000-0000-7000-8000-000000000002';
    fake.seed(
      'trackers',
      toRemote({
        id: trackerId,
        userId: USER,
        name: 'UPSC CSE',
        templateId: null,
        position: 0,
        createdAt: T,
        updatedAt: T,
        deletedAt: null,
      }),
    );
    fake.seed(
      'subjects',
      toRemote({
        id: '01930000-0000-7000-8000-000000000003',
        userId: USER,
        trackerId,
        name: 'Polity',
        description: null,
        position: 0,
        createdAt: T,
        updatedAt: T,
        deletedAt: null,
      }),
    );

    await run();

    expect(await repositories.subjects.listByUser(USER, trackerId)).toHaveLength(1);
  });

  it('carries a removal to the other device', async () => {
    const tracker = await repositories.trackers.create({ userId: USER, name: 'Abandoned' });
    await run();

    await repositories.trackers.softDelete(tracker.id);
    await run();

    expect(fake.rows('trackers')[0]?.deleted_at).not.toBeNull();
  });
});
