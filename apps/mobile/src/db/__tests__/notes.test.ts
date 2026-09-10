import { NoteRepository } from '../repositories/notes';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../test-support/test-database';

const USER = 'user-1';
const OTHER = 'user-2';

let db: ReturnType<typeof createTestDatabase>;
let repositories: ReturnType<typeof createTestRepositories>;
let notes: NoteRepository;

beforeEach(() => {
  db = createTestDatabase();
  const clock = createTestClock();
  repositories = createTestRepositories(db, clock);
  notes = repositories.notes;
});

afterEach(() => {
  db.$close();
});

async function topicWithNote(name: string, note: string | null, userId = USER) {
  const subject = await repositories.subjects.create({ userId, name: 'Physics' });
  const chapter = await repositories.chapters.create({
    userId,
    subjectId: subject.id,
    name: 'Electricity',
  });
  const topic = await repositories.topics.create({ userId, chapterId: chapter.id, name });
  if (note !== null) await repositories.topics.setNote(topic.id, note);
  return { subject, chapter, topic };
}

describe('reading notes', () => {
  it('carries the subject and chapter, so a note has context', async () => {
    await topicWithNote("Ohm's law", 'V = IR');

    const [entry] = await notes.listByUser(USER);

    expect(entry).toMatchObject({
      topicName: "Ohm's law",
      chapterName: 'Electricity',
      subjectName: 'Physics',
      note: 'V = IR',
    });
  });

  it('returns nothing for a topic with no note', async () => {
    await topicWithNote('Bare', null);

    expect(await notes.listByUser(USER)).toEqual([]);
  });

  /** An emptied note is stored as null, and neither form is a note. */
  it('treats a cleared note as absent', async () => {
    const { topic } = await topicWithNote('Cleared', 'Something');
    await repositories.topics.setNote(topic.id, '   ');

    expect(await notes.listByUser(USER)).toEqual([]);
  });

  it('belongs to one account only', async () => {
    await topicWithNote('Mine', 'My note');
    await topicWithNote('Theirs', 'Their note', OTHER);

    expect((await notes.listByUser(USER)).map((entry) => entry.note)).toEqual(['My note']);
  });

  it('drops a note whose topic was deleted', async () => {
    const { topic } = await topicWithNote('Doomed', 'Goes with it');
    await repositories.topics.softDelete(topic.id);

    expect(await notes.listByUser(USER)).toEqual([]);
  });

  it('drops a note whose chapter was deleted', async () => {
    const { chapter } = await topicWithNote('Orphan', 'Also goes');
    await repositories.chapters.softDelete(chapter.id);

    expect(await notes.listByUser(USER)).toEqual([]);
  });

  it('drops a note whose subject was deleted', async () => {
    const { subject } = await topicWithNote('Orphan', 'Also goes');
    await repositories.subjects.softDelete(subject.id);

    expect(await notes.listByUser(USER)).toEqual([]);
  });
});

describe('edge cases the query already excludes', () => {
  it('finds nothing for an account with no topics at all', async () => {
    expect(await notes.listByUser('nobody')).toEqual([]);
  });
});
