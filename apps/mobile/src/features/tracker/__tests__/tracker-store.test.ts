import { formatPercent } from '@preppilot/shared';
import type { Repositories } from '../../../db/client';
import { SubjectRepository } from '../../../db/repositories/subjects';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../../../db/test-support/test-database';
import {
  chapterProgress,
  reorderIds,
  resetTrackerStore,
  subjectProgress,
  useTrackerStore,
} from '../tracker-store';

const USER = 'user-1';

let db: ReturnType<typeof createTestDatabase>;
let repositories: Repositories;

const state = () => useTrackerStore.getState();

beforeEach(async () => {
  db = createTestDatabase();
  const clock = createTestClock();
  repositories = createTestRepositories(db, clock);
  resetTrackerStore();
  await state().load(USER, repositories);
});

afterEach(() => {
  db.$close();
});

/** Builds Mathematics with one chapter of two topics. */
async function seed() {
  await state().addSubject('Mathematics');
  const subject = state().subjects[0]!;

  await state().addChapter(subject.id, 'Number Systems');
  const chapter = state().subjects[0]!.chapters[0]!;

  await state().addTopic(chapter.id, 'Decimal');
  await state().addTopic(chapter.id, 'Real Number');

  return {
    subjectId: subject.id,
    chapterId: chapter.id,
    topicIds: state().subjects[0]!.chapters[0]!.topics.map((topic) => topic.id),
  };
}

describe('load', () => {
  it('starts empty for a new student', () => {
    expect(state().subjects).toEqual([]);
    expect(state().progress.overall.isEmpty).toBe(true);
  });

  it('clears the loading flag when finished', () => {
    expect(state().loading).toBe(false);
  });

  it('reads only the signed-in student’s syllabus', async () => {
    await repositories.subjects.create({ userId: 'someone-else', name: 'Not Mine' });
    await state().load(USER, repositories);

    expect(state().subjects).toEqual([]);
  });

  it('reports a student-facing message when the syllabus cannot be read', async () => {
    const broken = {
      ...repositories,
      subjects: {
        listByUser: () => Promise.reject(new Error('database is locked')),
      } as unknown as SubjectRepository,
    };

    await state().load(USER, broken);

    expect(state().error).toBe('We could not open your syllabus. Try restarting PrepPilot.');
    expect(state().loading).toBe(false);
  });
});

describe('building a syllabus', () => {
  it('nests subject, chapter and topic', async () => {
    await seed();

    const subject = state().subjects[0]!;
    expect(subject.name).toBe('Mathematics');
    expect(subject.chapters[0]?.name).toBe('Number Systems');
    expect(subject.chapters[0]?.topics.map((topic) => topic.name)).toEqual([
      'Decimal',
      'Real Number',
    ]);
  });

  it('survives a reload, because the data is on disk', async () => {
    const { subjectId } = await seed();

    resetTrackerStore();
    await state().load(USER, repositories);

    expect(state().subjects[0]?.id).toBe(subjectId);
    expect(state().subjects[0]?.chapters[0]?.topics).toHaveLength(2);
  });
});

describe('progress', () => {
  /**
   * PRD §10's worked example, end to end: ticking one of two topics must move
   * chapter, subject and overall together, all derived from the same read.
   */
  it('updates chapter, subject and overall together when a topic is ticked', async () => {
    const { subjectId, chapterId, topicIds } = await seed();

    expect(formatPercent(chapterProgress(state(), chapterId))).toBe('0%');

    await state().toggleTopic(topicIds[0]!);

    expect(formatPercent(chapterProgress(state(), chapterId))).toBe('50%');
    expect(formatPercent(subjectProgress(state(), subjectId))).toBe('50%');
    expect(formatPercent(state().progress.overall)).toBe('50%');
  });

  it('reaches 100% when every topic is ticked', async () => {
    const { chapterId, topicIds } = await seed();

    await state().toggleTopic(topicIds[0]!);
    await state().toggleTopic(topicIds[1]!);

    expect(formatPercent(chapterProgress(state(), chapterId))).toBe('100%');
  });

  it('unticking a topic moves progress back down', async () => {
    const { chapterId, topicIds } = await seed();
    await state().toggleTopic(topicIds[0]!);

    await state().toggleTopic(topicIds[0]!);

    expect(formatPercent(chapterProgress(state(), chapterId))).toBe('0%');
  });

  /** An empty chapter is unmeasured, not 0% (PRD §10). */
  it('reports an empty chapter as unmeasurable', async () => {
    await state().addSubject('Mathematics');
    const subjectId = state().subjects[0]!.id;
    await state().addChapter(subjectId, 'Lines and Angles');
    const chapterId = state().subjects[0]!.chapters[0]!.id;

    expect(chapterProgress(state(), chapterId).isEmpty).toBe(true);
    expect(formatPercent(chapterProgress(state(), chapterId))).toBe('—');
  });

  /**
   * The regression the progress engine exists to prevent, exercised through real
   * storage: subject progress is topic-weighted, not the mean of its chapters.
   */
  it('weights subject progress by topic count, not by chapter', async () => {
    await state().addSubject('Mathematics');
    const subjectId = state().subjects[0]!.id;

    await state().addChapter(subjectId, 'Small');
    await state().addChapter(subjectId, 'Large');
    const [small, large] = state().subjects[0]!.chapters;

    await state().addTopic(small!.id, 'Only topic');
    for (let index = 0; index < 9; index += 1) {
      await state().addTopic(large!.id, `Topic ${index}`);
    }

    const onlyTopic = state().subjects[0]!.chapters[0]!.topics[0]!;
    await state().toggleTopic(onlyTopic.id);

    // Averaging the chapters would report 50%; the truth is 1 of 10.
    expect(formatPercent(subjectProgress(state(), subjectId))).toBe('10%');
  });

  it('excludes a deleted chapter’s topics from subject progress', async () => {
    const { subjectId, chapterId, topicIds } = await seed();
    await state().toggleTopic(topicIds[0]!);
    expect(formatPercent(subjectProgress(state(), subjectId))).toBe('50%');

    await state().deleteChapter(chapterId);

    expect(subjectProgress(state(), subjectId).isEmpty).toBe(true);
  });
});

describe('deleting', () => {
  it('removes a subject from the tracker', async () => {
    const { subjectId } = await seed();

    await state().deleteSubject(subjectId);

    expect(state().subjects).toEqual([]);
    expect(state().progress.overall.isEmpty).toBe(true);
  });

  it('removes a topic and recomputes progress', async () => {
    const { chapterId, topicIds } = await seed();
    await state().toggleTopic(topicIds[0]!);

    await state().deleteTopic(topicIds[1]!);

    // One topic left, and it is complete.
    expect(formatPercent(chapterProgress(state(), chapterId))).toBe('100%');
  });
});

describe('toggleTopic', () => {
  it('does nothing for a topic that no longer exists', async () => {
    await seed();
    const before = state().progress.overall;

    await state().toggleTopic('missing-id');

    expect(state().progress.overall).toEqual(before);
    expect(state().error).toBeNull();
  });

  it('reports a student-facing message when the write fails', async () => {
    const { topicIds } = await seed();
    jest
      .spyOn(repositories.topics, 'setCompleted')
      .mockRejectedValue(new Error('SQLITE_BUSY: database is locked'));

    await state().toggleTopic(topicIds[0]!);

    expect(state().error).toBe('We could not save that change. Try again.');
  });
});

describe('expand and collapse', () => {
  it('starts collapsed, so a large syllabus is not overwhelming', async () => {
    const { subjectId } = await seed();

    expect(state().expanded.has(subjectId)).toBe(false);
  });

  it('toggles a node open and closed', async () => {
    const { subjectId } = await seed();

    state().toggleExpanded(subjectId);
    expect(state().expanded.has(subjectId)).toBe(true);

    state().toggleExpanded(subjectId);
    expect(state().expanded.has(subjectId)).toBe(false);
  });

  it('tracks several nodes independently', async () => {
    const { subjectId, chapterId } = await seed();

    state().toggleExpanded(subjectId);
    state().toggleExpanded(chapterId);

    expect(state().expanded.has(subjectId)).toBe(true);
    expect(state().expanded.has(chapterId)).toBe(true);
  });
});

describe('reorderIds', () => {
  it('moves an id one place up', () => {
    expect(reorderIds(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c']);
  });

  it('moves an id one place down', () => {
    expect(reorderIds(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b']);
  });

  /** Returning null lets the caller skip a write that would change nothing. */
  it('returns null at the ends', () => {
    expect(reorderIds(['a', 'b'], 'a', 'up')).toBeNull();
    expect(reorderIds(['a', 'b'], 'b', 'down')).toBeNull();
  });

  it('returns null for an id that is not there', () => {
    expect(reorderIds(['a', 'b'], 'z', 'up')).toBeNull();
  });
});

describe('renaming', () => {
  it('renames a chapter', async () => {
    const { chapterId } = await seed();

    await state().renameChapter(chapterId, 'Chapter 1: Number Systems');

    expect(state().subjects[0]?.chapters[0]?.name).toBe('Chapter 1: Number Systems');
  });

  it('renames a topic', async () => {
    const { topicIds } = await seed();

    await state().renameTopic(topicIds[0]!, 'Decimals');

    expect(state().subjects[0]?.chapters[0]?.topics[0]?.name).toBe('Decimals');
  });

  it('sets and clears a subject description', async () => {
    const { subjectId } = await seed();

    await state().setSubjectDescription(subjectId, 'NCERT Class 10');
    expect(state().subjects[0]?.description).toBe('NCERT Class 10');

    await state().setSubjectDescription(subjectId, null);
    expect(state().subjects[0]?.description).toBeNull();
  });

  it('reports a failure without changing anything', async () => {
    const { chapterId } = await seed();
    jest.spyOn(repositories.chapters, 'rename').mockRejectedValue(new Error('locked'));

    await state().renameChapter(chapterId, 'New name');

    expect(state().error).toBe('We could not rename that chapter. Try again.');
  });
});

describe('reordering', () => {
  it('moves a subject down and back', async () => {
    await state().addSubject('First');
    await state().addSubject('Second');
    const [first] = state().subjects;

    await state().moveSubject(first!.id, 'down');
    expect(state().subjects.map((s) => s.name)).toEqual(['Second', 'First']);

    await state().moveSubject(first!.id, 'up');
    expect(state().subjects.map((s) => s.name)).toEqual(['First', 'Second']);
  });

  it('moves a chapter within its subject', async () => {
    const { subjectId } = await seed();
    await state().addChapter(subjectId, 'Polynomials');
    const [first] = state().subjects[0]!.chapters;

    await state().moveChapter(subjectId, first!.id, 'down');

    expect(state().subjects[0]?.chapters.map((c) => c.name)).toEqual([
      'Polynomials',
      'Number Systems',
    ]);
  });

  it('moves a topic within its chapter', async () => {
    const { chapterId, topicIds } = await seed();

    await state().moveTopic(chapterId, topicIds[0]!, 'down');

    expect(state().subjects[0]?.chapters[0]?.topics.map((t) => t.name)).toEqual([
      'Real Number',
      'Decimal',
    ]);
  });

  it('does nothing at the ends', async () => {
    const { subjectId } = await seed();
    const reorder = jest.spyOn(repositories.subjects, 'reorder');

    await state().moveSubject(subjectId, 'up');

    expect(reorder).not.toHaveBeenCalled();
  });

  it('ignores an unknown subject or chapter', async () => {
    await seed();

    await expect(state().moveChapter('missing', 'also-missing', 'up')).resolves.toBeUndefined();
    await expect(state().moveTopic('missing', 'also-missing', 'up')).resolves.toBeUndefined();
  });
});

describe('using the store before load()', () => {
  /**
   * Every action needs a user id and repositories. Failing with a clear message
   * beats a confusing "cannot read property of null" from deep inside a query.
   */
  it('fails with an actionable message', async () => {
    resetTrackerStore();

    await expect(state().addSubject('Mathematics')).rejects.toThrow(/call load/);
  });
});

describe('clearError', () => {
  it('dismisses a message', async () => {
    const { topicIds } = await seed();
    jest.spyOn(repositories.topics, 'setCompleted').mockRejectedValue(new Error('boom'));
    await state().toggleTopic(topicIds[0]!);

    state().clearError();

    expect(state().error).toBeNull();
  });
});

/**
 * Sub-topics are the optional fourth level. A student adds them themselves; a
 * topic without any behaves exactly as it always did.
 */
describe('sub-topics', () => {
  const seedTopic = async () => {
    await state().addSubject('Physics');
    const subject = state().subjects[0]!;
    await state().addChapter(subject.id, 'Electricity');
    const chapter = state().subjects[0]!.chapters[0]!;
    await state().addTopic(chapter.id, "Ohm's law");
    return state().subjects[0]!.chapters[0]!.topics[0]!;
  };

  const topicNow = () => state().subjects[0]!.chapters[0]!.topics[0]!;

  it('adds one under its topic', async () => {
    const topic = await seedTopic();

    await state().addSubtopic(topic.id, 'Statement');

    expect(topicNow().subtopics.map((s) => s.name)).toEqual(['Statement']);
  });

  it('makes sub-topics the counted unit once they exist', async () => {
    // Four parts, one done, is 25% — not the 0% the bare topic would report.
    const topic = await seedTopic();
    for (const name of ['A', 'B', 'C', 'D']) await state().addSubtopic(topic.id, name);

    await state().toggleSubtopic(topicNow().subtopics[0]!.id);

    expect(state().progress.overall).toMatchObject({ completed: 1, total: 4 });
  });

  it('completes the topic once every part is done', async () => {
    const topic = await seedTopic();
    await state().addSubtopic(topic.id, 'A');
    await state().addSubtopic(topic.id, 'B');

    for (const subtopic of topicNow().subtopics) await state().toggleSubtopic(subtopic.id);

    expect(topicNow().completed).toBe(true);
    expect(state().progress.overall.percent).toBe(100);
  });

  /** A topic cannot stay finished when an unfinished part is added to it. */
  it('un-completes a finished topic when a new part is added', async () => {
    const topic = await seedTopic();
    await state().toggleTopic(topic.id);
    expect(topicNow().completed).toBe(true);

    await state().addSubtopic(topic.id, 'Something left to do');

    expect(topicNow().completed).toBe(false);
  });

  it('ticks every part when the topic itself is ticked', async () => {
    // Otherwise the parent and its parts contradict each other on screen.
    const topic = await seedTopic();
    await state().addSubtopic(topic.id, 'A');
    await state().addSubtopic(topic.id, 'B');

    await state().toggleTopic(topic.id);

    expect(topicNow().subtopics.every((s) => s.completed)).toBe(true);
    expect(topicNow().completed).toBe(true);
  });

  it('unticks every part when a completed topic is unticked', async () => {
    const topic = await seedTopic();
    await state().addSubtopic(topic.id, 'A');
    await state().toggleSubtopic(topicNow().subtopics[0]!.id);
    expect(topicNow().completed).toBe(true);

    await state().toggleTopic(topic.id);

    expect(topicNow().subtopics.every((s) => !s.completed)).toBe(true);
  });

  it('hands completion back to the topic when the last part is deleted', async () => {
    const topic = await seedTopic();
    await state().addSubtopic(topic.id, 'A');

    await state().deleteSubtopic(topicNow().subtopics[0]!.id);

    expect(topicNow().subtopics).toEqual([]);
    // One unit again, not zero: the topic is measurable on its own.
    expect(state().progress.overall).toMatchObject({ completed: 0, total: 1 });
  });

  it('completes the topic when the last unfinished part is deleted', async () => {
    const topic = await seedTopic();
    await state().addSubtopic(topic.id, 'Done');
    await state().addSubtopic(topic.id, 'Not done');
    await state().toggleSubtopic(topicNow().subtopics[0]!.id);

    await state().deleteSubtopic(topicNow().subtopics[1]!.id);

    expect(topicNow().completed).toBe(true);
  });

  it('renames one', async () => {
    const topic = await seedTopic();
    await state().addSubtopic(topic.id, 'Typo');

    await state().renameSubtopic(topicNow().subtopics[0]!.id, 'Fixed');

    expect(topicNow().subtopics[0]!.name).toBe('Fixed');
  });

  it('weights a broken-down topic above a plain one', async () => {
    const topic = await seedTopic();
    for (const name of ['A', 'B', 'C']) await state().addSubtopic(topic.id, name);
    const chapter = state().subjects[0]!.chapters[0]!;
    await state().addTopic(chapter.id, 'Circuits');

    // Three sub-topics plus one plain topic = four units, none done.
    expect(state().progress.overall).toMatchObject({ completed: 0, total: 4 });
  });
});

describe('topic notes', () => {
  const seedTopic = async () => {
    await state().addSubject('Physics');
    await state().addChapter(state().subjects[0]!.id, 'Electricity');
    await state().addTopic(state().subjects[0]!.chapters[0]!.id, "Ohm's law");
    return state().subjects[0]!.chapters[0]!.topics[0]!;
  };

  const topicNow = () => state().subjects[0]!.chapters[0]!.topics[0]!;

  it('starts with no note', async () => {
    const topic = await seedTopic();

    expect(topic.note).toBeNull();
  });

  it('saves one', async () => {
    const topic = await seedTopic();

    await state().setTopicNote(topic.id, 'V = IR. Remember the triangle.');

    expect(topicNow().note).toBe('V = IR. Remember the triangle.');
  });

  /** "No note" must have one representation, not two. */
  it('stores an emptied note as absent rather than blank', async () => {
    const topic = await seedTopic();
    await state().setTopicNote(topic.id, 'Something');

    await state().setTopicNote(topic.id, '   ');

    expect(topicNow().note).toBeNull();
  });

  it('does not disturb completion or progress', async () => {
    const topic = await seedTopic();
    await state().toggleTopic(topic.id);

    await state().setTopicNote(topic.id, 'A note');

    expect(topicNow().completed).toBe(true);
    expect(state().progress.overall.percent).toBe(100);
  });
});
