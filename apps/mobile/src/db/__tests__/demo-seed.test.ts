import type { Repositories } from '../client';
import { ChapterRepository } from '../repositories/chapters';
import { StudySessionRepository } from '../repositories/study-sessions';
import { SubjectRepository } from '../repositories/subjects';
import { TopicRepository } from '../repositories/topics';
import { seedDemoData } from '../demo-seed';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../test-support/test-database';

const USER = 'demo-local-user';

let db: ReturnType<typeof createTestDatabase>;
let repositories: Repositories;

beforeEach(() => {
  db = createTestDatabase();
  const clock = createTestClock();
  repositories = createTestRepositories(db, clock);
});

afterEach(() => {
  db.$close();
});

describe('seedDemoData', () => {
  it('creates a syllabus to explore', async () => {
    expect(await seedDemoData(USER, repositories)).toBe(true);

    const subjects = await repositories.subjects.listByUser(USER);
    expect(subjects.map((row) => row.name)).toEqual(['Mathematics', 'Science', 'English']);
  });

  it('builds all three levels of the hierarchy', async () => {
    await seedDemoData(USER, repositories);

    const [mathematics] = await repositories.subjects.listByUser(USER);
    const chapters = await repositories.chapters.listBySubject(mathematics!.id);
    expect(chapters.length).toBeGreaterThan(1);

    const topics = await repositories.topics.listByChapter(chapters[0]!.id);
    expect(topics.length).toBeGreaterThan(1);
  });

  /** Shows the "—" empty state rather than a misleading 0%. */
  it('includes a chapter with no topics', async () => {
    await seedDemoData(USER, repositories);

    const [mathematics] = await repositories.subjects.listByUser(USER);
    const chapters = await repositories.chapters.listBySubject(mathematics!.id);
    const empty = chapters.find((chapter) => chapter.name.includes('Coordinate Geometry'));

    expect(await repositories.topics.listByChapter(empty!.id)).toEqual([]);
  });

  it('leaves progress partly complete, so it is visibly non-zero', async () => {
    await seedDemoData(USER, repositories);

    const topics = await repositories.topics.listByUser(USER);
    const completed = topics.filter((topic) => topic.completed);

    expect(completed.length).toBeGreaterThan(0);
    expect(completed.length).toBeLessThan(topics.length);
  });

  /**
   * Seeding on every launch would overwrite whatever a reviewer had just done,
   * so it runs only for an account with no subjects at all.
   */
  it('does nothing when the account already has subjects', async () => {
    await seedDemoData(USER, repositories);
    const before = await repositories.subjects.listByUser(USER);

    expect(await seedDemoData(USER, repositories)).toBe(false);

    expect(await repositories.subjects.listByUser(USER)).toHaveLength(before.length);
  });

  it('seeds only the given account', async () => {
    await seedDemoData(USER, repositories);

    expect(await repositories.subjects.listByUser('someone-else')).toEqual([]);
  });
});
