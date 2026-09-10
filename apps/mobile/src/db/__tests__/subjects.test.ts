import { isUuidV7 } from '@preppilot/shared';
import { SubjectRepository, pendingSubjects } from '../repositories/subjects';
import { subjects } from '../schema';
import { createTestClock, createTestDatabase } from '../test-support/test-database';

type Db = ReturnType<typeof createTestDatabase>;

let db: Db;
let clock: ReturnType<typeof createTestClock>;
let repo: SubjectRepository;

const USER = 'user-1';
const OTHER_USER = 'user-2';

beforeEach(() => {
  db = createTestDatabase();
  clock = createTestClock();
  repo = new SubjectRepository(db, clock);
});

afterEach(() => {
  db.$close();
});

describe('create', () => {
  it('stores a subject with a client-generated UUIDv7', async () => {
    const subject = await repo.create({ userId: USER, name: 'Mathematics' });

    expect(isUuidV7(subject.id)).toBe(true);
    expect(await repo.findById(subject.id)).toMatchObject({ name: 'Mathematics', userId: USER });
  });

  it('trims surrounding whitespace from the name', async () => {
    const subject = await repo.create({ userId: USER, name: '  Mathematics  ' });

    expect(subject.name).toBe('Mathematics');
  });

  /** Every new row must be visible to the sync layer without the caller opting in. */
  it('marks a new subject as pending sync', async () => {
    const subject = await repo.create({ userId: USER, name: 'Mathematics' });

    expect(subject.syncStatus).toBe('pending');
    expect(await pendingSubjects(db)).toHaveLength(1);
  });

  it('appends each subject after the last', async () => {
    const first = await repo.create({ userId: USER, name: 'Mathematics' });
    const second = await repo.create({ userId: USER, name: 'Science' });
    const third = await repo.create({ userId: USER, name: 'English' });

    expect([first.position, second.position, third.position]).toEqual([0, 1, 2]);
  });

  /**
   * Positions must not be reused after a delete: a resurrected position would
   * make two subjects sort identically and flicker between renders.
   */
  it('does not reuse the position of a deleted subject', async () => {
    const first = await repo.create({ userId: USER, name: 'Mathematics' });
    await repo.softDelete(first.id);

    const second = await repo.create({ userId: USER, name: 'Science' });

    expect(second.position).toBe(1);
  });

  it('numbers each user independently', async () => {
    await repo.create({ userId: USER, name: 'Mathematics' });
    const other = await repo.create({ userId: OTHER_USER, name: 'Physics' });

    expect(other.position).toBe(0);
  });
});

describe('listByUser', () => {
  it('returns only the given user’s subjects', async () => {
    await repo.create({ userId: USER, name: 'Mathematics' });
    await repo.create({ userId: OTHER_USER, name: 'Physics' });

    const listed = await repo.listByUser(USER);

    expect(listed.map((row) => row.name)).toEqual(['Mathematics']);
  });

  it('orders by position', async () => {
    const a = await repo.create({ userId: USER, name: 'A' });
    const b = await repo.create({ userId: USER, name: 'B' });
    const c = await repo.create({ userId: USER, name: 'C' });
    await repo.reorder(USER, [c.id, a.id, b.id]);

    expect((await repo.listByUser(USER)).map((row) => row.name)).toEqual(['C', 'A', 'B']);
  });

  it('excludes tombstoned subjects', async () => {
    const subject = await repo.create({ userId: USER, name: 'Mathematics' });
    await repo.softDelete(subject.id);

    expect(await repo.listByUser(USER)).toEqual([]);
  });

  it('returns an empty list for a user with no subjects', async () => {
    expect(await repo.listByUser('nobody')).toEqual([]);
  });
});

describe('update', () => {
  it('changes the name and advances updatedAt', async () => {
    const subject = await repo.create({ userId: USER, name: 'Maths' });
    clock.advance(5_000);

    await repo.update(subject.id, { name: 'Mathematics' });
    const updated = await repo.findById(subject.id);

    expect(updated?.name).toBe('Mathematics');
    expect(updated?.updatedAt).toBe(subject.updatedAt + 5_000);
  });

  it('can clear a description', async () => {
    const subject = await repo.create({ userId: USER, name: 'Maths', description: 'Class 10' });

    await repo.update(subject.id, { description: null });

    expect((await repo.findById(subject.id))?.description).toBeNull();
  });

  it('leaves untouched fields alone', async () => {
    const subject = await repo.create({ userId: USER, name: 'Maths', description: 'Class 10' });

    await repo.update(subject.id, { name: 'Mathematics' });

    expect((await repo.findById(subject.id))?.description).toBe('Class 10');
  });

  /** An edit made offline has to be re-sent, so it must go back to pending. */
  it('marks an edited subject pending again', async () => {
    const subject = await repo.create({ userId: USER, name: 'Maths' });
    await db.update(subjects).set({ syncStatus: 'synced' });

    await repo.update(subject.id, { name: 'Mathematics' });

    expect((await repo.findById(subject.id))?.syncStatus).toBe('pending');
  });
});

describe('softDelete', () => {
  /**
   * A hard delete would be undone by the next sync pull, which cannot tell a
   * row deleted here from one it has simply not seen yet (D12).
   */
  it('tombstones rather than removing the row', async () => {
    const subject = await repo.create({ userId: USER, name: 'Mathematics' });

    await repo.softDelete(subject.id);

    expect(await repo.findById(subject.id)).toBeNull();
    const raw = await pendingSubjects(db);
    expect(raw).toHaveLength(1);
    expect(raw[0]?.deletedAt).not.toBeNull();
  });

  it('is harmless when the subject does not exist', async () => {
    await expect(repo.softDelete('missing')).resolves.toBeUndefined();
  });
});

describe('reorder', () => {
  it('assigns positions in the given order', async () => {
    const a = await repo.create({ userId: USER, name: 'A' });
    const b = await repo.create({ userId: USER, name: 'B' });

    await repo.reorder(USER, [b.id, a.id]);

    expect((await repo.listByUser(USER)).map((row) => row.name)).toEqual(['B', 'A']);
  });

  /** A crafted id list must not let one user reorder another user's syllabus. */
  it('ignores ids belonging to another user', async () => {
    const mine = await repo.create({ userId: USER, name: 'Mine' });
    const theirs = await repo.create({ userId: OTHER_USER, name: 'Theirs' });

    await repo.reorder(USER, [theirs.id, mine.id]);

    expect((await repo.findById(theirs.id))?.position).toBe(0);
  });
});
