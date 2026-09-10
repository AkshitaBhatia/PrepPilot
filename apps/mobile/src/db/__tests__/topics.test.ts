import { ChapterRepository } from '../repositories/chapters';
import { SubjectRepository } from '../repositories/subjects';
import { SubtopicRepository } from '../repositories/subtopics';
import { TopicRepository } from '../repositories/topics';
import {
  captureRejection,
  createTestClock,
  createTestDatabase,
} from '../test-support/test-database';

type Db = ReturnType<typeof createTestDatabase>;

let db: Db;
let clock: ReturnType<typeof createTestClock>;
let subjectRepo: SubjectRepository;
let chapterRepo: ChapterRepository;
let topicRepo: TopicRepository;
let subtopicRepo: SubtopicRepository;

const USER = 'user-1';

/** A subject with two chapters, as the tracker would build it. */
async function seedSyllabus() {
  const subject = await subjectRepo.create({ userId: USER, name: 'Mathematics' });
  const numbers = await chapterRepo.create({
    userId: USER,
    subjectId: subject.id,
    name: 'Number Systems',
  });
  const polynomials = await chapterRepo.create({
    userId: USER,
    subjectId: subject.id,
    name: 'Polynomials',
  });
  return { subject, numbers, polynomials };
}

beforeEach(() => {
  db = createTestDatabase();
  clock = createTestClock();
  subjectRepo = new SubjectRepository(db, clock);
  chapterRepo = new ChapterRepository(db, clock);
  topicRepo = new TopicRepository(db, clock);
  subtopicRepo = new SubtopicRepository(db, clock);
});

afterEach(() => {
  db.$close();
});

describe('chapters', () => {
  it('lists chapters of a subject in order', async () => {
    const { subject } = await seedSyllabus();

    expect((await chapterRepo.listBySubject(subject.id)).map((row) => row.name)).toEqual([
      'Number Systems',
      'Polynomials',
    ]);
  });

  it('numbers chapters per subject, not globally', async () => {
    const { subject } = await seedSyllabus();
    const other = await subjectRepo.create({ userId: USER, name: 'Science' });

    const chapter = await chapterRepo.create({
      userId: USER,
      subjectId: other.id,
      name: 'Motion',
    });

    expect(chapter.position).toBe(0);
    expect(await chapterRepo.listBySubject(subject.id)).toHaveLength(2);
  });

  it('excludes tombstoned chapters', async () => {
    const { subject, numbers } = await seedSyllabus();

    await chapterRepo.softDelete(numbers.id);

    expect((await chapterRepo.listBySubject(subject.id)).map((row) => row.name)).toEqual([
      'Polynomials',
    ]);
  });

  it('lists every chapter belonging to a user', async () => {
    await seedSyllabus();
    const other = await subjectRepo.create({ userId: 'someone-else', name: 'Theirs' });
    await chapterRepo.create({ userId: 'someone-else', subjectId: other.id, name: 'Not Mine' });

    expect((await chapterRepo.listByUser(USER)).map((row) => row.name)).toEqual([
      'Number Systems',
      'Polynomials',
    ]);
  });

  it('reorders chapters within their subject', async () => {
    const { subject, numbers, polynomials } = await seedSyllabus();

    await chapterRepo.reorder(subject.id, [polynomials.id, numbers.id]);

    expect((await chapterRepo.listBySubject(subject.id)).map((row) => row.name)).toEqual([
      'Polynomials',
      'Number Systems',
    ]);
  });

  it('ignores chapters from another subject when reordering', async () => {
    const { subject, numbers } = await seedSyllabus();
    const other = await subjectRepo.create({ userId: USER, name: 'Science' });
    const foreign = await chapterRepo.create({
      userId: USER,
      subjectId: other.id,
      name: 'Motion',
    });

    await chapterRepo.reorder(subject.id, [foreign.id, numbers.id]);

    expect((await chapterRepo.findById(foreign.id))?.position).toBe(0);
  });

  it('returns null for a chapter that was deleted', async () => {
    const { numbers } = await seedSyllabus();
    await chapterRepo.softDelete(numbers.id);

    expect(await chapterRepo.findById(numbers.id)).toBeNull();
  });

  it('renames a chapter and marks it pending', async () => {
    const { numbers } = await seedSyllabus();

    await chapterRepo.rename(numbers.id, '  Chapter 1: Number Systems  ');
    const renamed = await chapterRepo.findById(numbers.id);

    expect(renamed?.name).toBe('Chapter 1: Number Systems');
    expect(renamed?.syncStatus).toBe('pending');
  });
});

describe('topics', () => {
  it('creates a topic that starts incomplete', async () => {
    const { numbers } = await seedSyllabus();

    const topic = await topicRepo.create({ userId: USER, chapterId: numbers.id, name: 'Decimal' });

    expect(topic.completed).toBe(false);
    expect(topic.completedChangedAt).toBeNull();
  });

  it('appends topics within their chapter', async () => {
    const { numbers, polynomials } = await seedSyllabus();

    const a = await topicRepo.create({ userId: USER, chapterId: numbers.id, name: 'Decimal' });
    const b = await topicRepo.create({ userId: USER, chapterId: numbers.id, name: 'Real Number' });
    const c = await topicRepo.create({ userId: USER, chapterId: polynomials.id, name: 'Degree' });

    expect([a.position, b.position, c.position]).toEqual([0, 1, 0]);
  });

  describe('setCompleted', () => {
    it('marks a topic complete', async () => {
      const { numbers } = await seedSyllabus();
      const topic = await topicRepo.create({
        userId: USER,
        chapterId: numbers.id,
        name: 'Decimal',
      });

      await topicRepo.setCompleted(topic.id, true);

      expect((await topicRepo.findById(topic.id))?.completed).toBe(true);
    });

    it('can uncheck a completed topic', async () => {
      const { numbers } = await seedSyllabus();
      const topic = await topicRepo.create({
        userId: USER,
        chapterId: numbers.id,
        name: 'Decimal',
      });
      await topicRepo.setCompleted(topic.id, true);

      await topicRepo.setCompleted(topic.id, false);

      expect((await topicRepo.findById(topic.id))?.completed).toBe(false);
    });

    /**
     * Completion carries its own timestamp so sync can resolve it independently
     * of a rename (D14). Sharing updatedAt would make the two changes
     * indistinguishable, and one would silently revert the other.
     */
    it('stamps completedChangedAt separately from a rename', async () => {
      const { numbers } = await seedSyllabus();
      const topic = await topicRepo.create({
        userId: USER,
        chapterId: numbers.id,
        name: 'Decimal',
      });

      const tickedAt = clock.advance(1_000);
      await topicRepo.setCompleted(topic.id, true);

      const renamedAt = clock.advance(1_000);
      await topicRepo.rename(topic.id, 'Decimals');

      const row = await topicRepo.findById(topic.id);
      expect(row?.completedChangedAt).toBe(tickedAt);
      expect(row?.updatedAt).toBe(renamedAt);
    });
  });

  describe('listBySubject', () => {
    it('returns every live topic across the subject’s chapters', async () => {
      const { subject, numbers, polynomials } = await seedSyllabus();
      await topicRepo.create({ userId: USER, chapterId: numbers.id, name: 'Decimal' });
      await topicRepo.create({ userId: USER, chapterId: polynomials.id, name: 'Degree' });

      expect((await topicRepo.listBySubject(subject.id)).map((row) => row.name)).toEqual([
        'Decimal',
        'Degree',
      ]);
    });

    /**
     * A topic under a deleted chapter is no longer part of the syllabus.
     * Counting it would understate progress: the student cannot see it, cannot
     * tick it, and yet it would sit in the denominator forever.
     */
    it('excludes topics whose chapter was deleted', async () => {
      const { subject, numbers, polynomials } = await seedSyllabus();
      await topicRepo.create({ userId: USER, chapterId: numbers.id, name: 'Decimal' });
      await topicRepo.create({ userId: USER, chapterId: polynomials.id, name: 'Degree' });

      await chapterRepo.softDelete(numbers.id);

      expect((await topicRepo.listBySubject(subject.id)).map((row) => row.name)).toEqual([
        'Degree',
      ]);
    });

    it('excludes tombstoned topics', async () => {
      const { subject, numbers } = await seedSyllabus();
      const topic = await topicRepo.create({
        userId: USER,
        chapterId: numbers.id,
        name: 'Decimal',
      });
      await topicRepo.softDelete(topic.id);

      expect(await topicRepo.listBySubject(subject.id)).toEqual([]);
    });

    it('orders by chapter position then topic position', async () => {
      const { subject, numbers, polynomials } = await seedSyllabus();
      await topicRepo.create({ userId: USER, chapterId: polynomials.id, name: 'Degree' });
      await topicRepo.create({ userId: USER, chapterId: numbers.id, name: 'Decimal' });
      await topicRepo.create({ userId: USER, chapterId: numbers.id, name: 'Real Number' });

      expect((await topicRepo.listBySubject(subject.id)).map((row) => row.name)).toEqual([
        'Decimal',
        'Real Number',
        'Degree',
      ]);
    });
  });

  describe('setCompletedForChapter', () => {
    it('completes every live topic in the chapter', async () => {
      const { numbers } = await seedSyllabus();
      await topicRepo.create({ userId: USER, chapterId: numbers.id, name: 'Decimal' });
      await topicRepo.create({ userId: USER, chapterId: numbers.id, name: 'Real Number' });

      await topicRepo.setCompletedForChapter(numbers.id, true);

      expect((await topicRepo.listByChapter(numbers.id)).every((row) => row.completed)).toBe(true);
    });

    it('leaves other chapters untouched', async () => {
      const { numbers, polynomials } = await seedSyllabus();
      await topicRepo.create({ userId: USER, chapterId: numbers.id, name: 'Decimal' });
      const other = await topicRepo.create({
        userId: USER,
        chapterId: polynomials.id,
        name: 'Degree',
      });

      await topicRepo.setCompletedForChapter(numbers.id, true);

      expect((await topicRepo.findById(other.id))?.completed).toBe(false);
    });
  });

  describe('createMany', () => {
    it('inserts nothing for an empty batch', async () => {
      expect(await topicRepo.createMany([])).toEqual([]);
    });

    /** Template import inserts across several chapters in one call. */
    it('numbers positions per chapter within one batch', async () => {
      const { numbers, polynomials } = await seedSyllabus();

      const created = await topicRepo.createMany([
        { userId: USER, chapterId: numbers.id, name: 'Decimal' },
        { userId: USER, chapterId: polynomials.id, name: 'Degree' },
        { userId: USER, chapterId: numbers.id, name: 'Real Number' },
      ]);

      expect(
        created.map((row) => [row.chapterId === numbers.id ? 'n' : 'p', row.position]),
      ).toEqual([
        ['n', 0],
        ['p', 0],
        ['n', 1],
      ]);
    });

    it('continues numbering after topics that already exist', async () => {
      const { numbers } = await seedSyllabus();
      await topicRepo.create({ userId: USER, chapterId: numbers.id, name: 'Existing' });

      const [created] = await topicRepo.createMany([
        { userId: USER, chapterId: numbers.id, name: 'Decimal' },
      ]);

      expect(created?.position).toBe(1);
    });

    it('gives every row in a batch a distinct id', async () => {
      const { numbers } = await seedSyllabus();

      const created = await topicRepo.createMany(
        Array.from({ length: 50 }, (_, index) => ({
          userId: USER,
          chapterId: numbers.id,
          name: `Topic ${index}`,
        })),
      );

      expect(new Set(created.map((row) => row.id)).size).toBe(50);
    });
  });

  describe('softDeleteMany', () => {
    it('tombstones the given topics', async () => {
      const { numbers } = await seedSyllabus();
      const a = await topicRepo.create({ userId: USER, chapterId: numbers.id, name: 'A' });
      const b = await topicRepo.create({ userId: USER, chapterId: numbers.id, name: 'B' });

      await topicRepo.softDeleteMany([a.id]);

      expect((await topicRepo.listByChapter(numbers.id)).map((row) => row.id)).toEqual([b.id]);
    });

    it('is harmless for an empty list', async () => {
      await expect(topicRepo.softDeleteMany([])).resolves.toBeUndefined();
    });
  });

  describe('reorder', () => {
    it('applies the given order', async () => {
      const { numbers } = await seedSyllabus();
      const a = await topicRepo.create({ userId: USER, chapterId: numbers.id, name: 'A' });
      const b = await topicRepo.create({ userId: USER, chapterId: numbers.id, name: 'B' });

      await topicRepo.reorder(numbers.id, [b.id, a.id]);

      expect((await topicRepo.listByChapter(numbers.id)).map((row) => row.name)).toEqual([
        'B',
        'A',
      ]);
    });

    it('ignores topics from another chapter', async () => {
      const { numbers, polynomials } = await seedSyllabus();
      const mine = await topicRepo.create({ userId: USER, chapterId: numbers.id, name: 'Mine' });
      const other = await topicRepo.create({
        userId: USER,
        chapterId: polynomials.id,
        name: 'Other',
      });

      await topicRepo.reorder(numbers.id, [other.id, mine.id]);

      expect((await topicRepo.findById(other.id))?.position).toBe(0);
    });
  });
});

describe('referential integrity', () => {
  /** expo-sqlite enables foreign keys, so the tests must too or they prove nothing. */
  it('rejects a chapter pointing at a subject that does not exist', async () => {
    const error = await captureRejection(() =>
      chapterRepo.create({ userId: USER, subjectId: 'missing', name: 'Orphan' }),
    );

    expect(error.message).toMatch(/FOREIGN KEY/i);
  });

  it('rejects a topic pointing at a chapter that does not exist', async () => {
    const error = await captureRejection(() =>
      topicRepo.create({ userId: USER, chapterId: 'missing', name: 'Orphan' }),
    );

    expect(error.message).toMatch(/FOREIGN KEY/i);
  });
});

/**
 * Sub-topics under a subject, for progress. A sub-topic whose topic or chapter
 * was deleted is no longer part of the syllabus and counting it would understate
 * what the student has done.
 */
describe('sub-topics by subject', () => {
  it('collects them across chapters and topics', async () => {
    const subject = await subjectRepo.create({ userId: USER, name: 'Physics' });
    const chapter = await chapterRepo.create({
      userId: USER,
      subjectId: subject.id,
      name: 'Electricity',
    });
    const topic = await topicRepo.create({
      userId: USER,
      chapterId: chapter.id,
      name: "Ohm's law",
    });
    await subtopicRepo.create({ userId: USER, topicId: topic.id, name: 'Statement' });
    await subtopicRepo.create({ userId: USER, topicId: topic.id, name: 'Worked examples' });

    expect((await subtopicRepo.listBySubject(subject.id)).map((row) => row.name)).toEqual([
      'Statement',
      'Worked examples',
    ]);
  });

  it('leaves out those under a deleted topic', async () => {
    const subject = await subjectRepo.create({ userId: USER, name: 'Physics' });
    const chapter = await chapterRepo.create({
      userId: USER,
      subjectId: subject.id,
      name: 'Electricity',
    });
    const topic = await topicRepo.create({ userId: USER, chapterId: chapter.id, name: 'Gone' });
    await subtopicRepo.create({ userId: USER, topicId: topic.id, name: 'Orphan' });

    await topicRepo.softDelete(topic.id);

    expect(await subtopicRepo.listBySubject(subject.id)).toEqual([]);
  });

  it('leaves out those under a deleted chapter', async () => {
    const subject = await subjectRepo.create({ userId: USER, name: 'Physics' });
    const chapter = await chapterRepo.create({
      userId: USER,
      subjectId: subject.id,
      name: 'Doomed',
    });
    const topic = await topicRepo.create({
      userId: USER,
      chapterId: chapter.id,
      name: "Ohm's law",
    });
    await subtopicRepo.create({ userId: USER, topicId: topic.id, name: 'Orphan' });

    await chapterRepo.softDelete(chapter.id);

    expect(await subtopicRepo.listBySubject(subject.id)).toEqual([]);
  });

  it('lists every live one for a user', async () => {
    const subject = await subjectRepo.create({ userId: USER, name: 'Physics' });
    const chapter = await chapterRepo.create({
      userId: USER,
      subjectId: subject.id,
      name: 'Electricity',
    });
    const topic = await topicRepo.create({
      userId: USER,
      chapterId: chapter.id,
      name: "Ohm's law",
    });
    const kept = await subtopicRepo.create({ userId: USER, topicId: topic.id, name: 'Kept' });
    const gone = await subtopicRepo.create({ userId: USER, topicId: topic.id, name: 'Gone' });
    await subtopicRepo.softDelete(gone.id);

    expect((await subtopicRepo.listByUser(USER)).map((row) => row.id)).toEqual([kept.id]);
  });
});

describe('sub-topic notes and order', () => {
  const seedTwo = async () => {
    const subject = await subjectRepo.create({ userId: USER, name: 'Physics' });
    const chapter = await chapterRepo.create({
      userId: USER,
      subjectId: subject.id,
      name: 'Light',
    });
    const topic = await topicRepo.create({ userId: USER, chapterId: chapter.id, name: 'Optics' });
    const first = await subtopicRepo.create({ userId: USER, topicId: topic.id, name: 'First' });
    const second = await subtopicRepo.create({ userId: USER, topicId: topic.id, name: 'Second' });
    return { topic, first, second };
  };

  it('stores a note', async () => {
    const { first } = await seedTwo();

    await subtopicRepo.setNote(first.id, 'Worth remembering.');

    expect((await subtopicRepo.findById(first.id))?.note).toBe('Worth remembering.');
  });

  /** "No note" has one representation, as it does on a topic. */
  it('stores an emptied note as absent', async () => {
    const { first } = await seedTwo();
    await subtopicRepo.setNote(first.id, 'Something');

    await subtopicRepo.setNote(first.id, '   ');

    expect((await subtopicRepo.findById(first.id))?.note).toBeNull();
  });

  it('starts with no note', async () => {
    const { first } = await seedTwo();

    expect(first.note).toBeNull();
  });

  it('reorders within its topic', async () => {
    const { topic, first, second } = await seedTwo();

    await subtopicRepo.reorder(topic.id, [second.id, first.id]);

    expect((await subtopicRepo.listByTopic(topic.id)).map((row) => row.name)).toEqual([
      'Second',
      'First',
    ]);
  });

  it('will not reorder a sub-topic into a topic it does not belong to', async () => {
    // The id is scoped to the topic, so a stray id cannot move anything.
    const { topic, first, second } = await seedTwo();
    const other = await topicRepo.create({
      userId: USER,
      chapterId: (await chapterRepo.listBySubject((await subjectRepo.listByUser(USER))[0]!.id))[0]!
        .id,
      name: 'Elsewhere',
    });

    await subtopicRepo.reorder(other.id, [second.id, first.id]);

    expect((await subtopicRepo.listByTopic(topic.id)).map((row) => row.name)).toEqual([
      'First',
      'Second',
    ]);
  });

  it('marks a renamed or renoted sub-topic as needing to be sent', async () => {
    const { first } = await seedTwo();
    await subtopicRepo.markSynced([first.id]);

    await subtopicRepo.setNote(first.id, 'A note');

    expect((await subtopicRepo.findById(first.id))?.syncStatus).toBe('pending');
  });
});

describe('clearing a note', () => {
  const seedSubtopic = async () => {
    const subject = await subjectRepo.create({ userId: USER, name: 'Physics' });
    const chapter = await chapterRepo.create({
      userId: USER,
      subjectId: subject.id,
      name: 'Light',
    });
    const topic = await topicRepo.create({ userId: USER, chapterId: chapter.id, name: 'Optics' });
    const subtopic = await subtopicRepo.create({
      userId: USER,
      topicId: topic.id,
      name: 'Refraction',
    });
    return { topic, subtopic };
  };

  it('accepts null on a sub-topic as removing it', async () => {
    const { subtopic } = await seedSubtopic();
    await subtopicRepo.setNote(subtopic.id, 'Something');

    await subtopicRepo.setNote(subtopic.id, null);

    expect((await subtopicRepo.findById(subtopic.id))?.note).toBeNull();
  });

  it('accepts null on a topic as removing it', async () => {
    const { topic } = await seedSubtopic();
    await topicRepo.setNote(topic.id, 'Something');

    await topicRepo.setNote(topic.id, null);

    expect((await topicRepo.findById(topic.id))?.note).toBeNull();
  });

  it('trims a note rather than storing the padding', async () => {
    const { subtopic } = await seedSubtopic();

    await subtopicRepo.setNote(subtopic.id, '  Padded  ');

    expect((await subtopicRepo.findById(subtopic.id))?.note).toBe('Padded');
  });
});

describe('looking things up that are not there', () => {
  it('returns null for a sub-topic id that does not exist', async () => {
    expect(await subtopicRepo.findById('01a00000-0000-7000-8000-00000000dead')).toBeNull();
  });

  it('does nothing when asked to mark an empty list as synced', async () => {
    await expect(subtopicRepo.markSynced([])).resolves.toBeUndefined();
  });

  it('returns nothing for a topic with no sub-topics', async () => {
    const subject = await subjectRepo.create({ userId: USER, name: 'Physics' });
    const chapter = await chapterRepo.create({
      userId: USER,
      subjectId: subject.id,
      name: 'Light',
    });
    const topic = await topicRepo.create({ userId: USER, chapterId: chapter.id, name: 'Bare' });

    expect(await subtopicRepo.listByTopic(topic.id)).toEqual([]);
  });
});
