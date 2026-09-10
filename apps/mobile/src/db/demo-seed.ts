import type { Repositories } from './client';

/**
 * Seeds a small syllabus so demo mode has something to explore.
 *
 * Runs only when the account has no subjects at all, so a reviewer's own edits
 * are never overwritten on the next launch. Deliberately small: enough to show
 * every level of the hierarchy and a partly-complete chapter, not a full
 * curriculum that would obscure the interactions being reviewed.
 */
export async function seedDemoData(userId: string, repositories: Repositories): Promise<boolean> {
  const existing = await repositories.subjects.listByUser(userId);
  if (existing.length > 0) return false;

  const plan = [
    {
      subject: 'Mathematics',
      chapters: [
        {
          name: 'Chapter 1: Number Systems',
          topics: ['Decimal', 'Real Number', 'Irrational Number'],
        },
        { name: 'Chapter 2: Polynomials', topics: ['Degree', 'Zeroes of a Polynomial'] },
        // Left empty on purpose: shows the "—" empty state rather than 0%.
        { name: 'Chapter 3: Coordinate Geometry', topics: [] },
      ],
    },
    {
      subject: 'Science',
      chapters: [
        { name: 'Chapter 1: Motion', topics: ['Distance and Displacement', 'Acceleration'] },
        { name: 'Chapter 2: Force and Laws', topics: ['Newton’s First Law'] },
      ],
    },
    {
      subject: 'English',
      chapters: [{ name: 'Prose', topics: ['The Fun They Had', 'The Sound of Music'] }],
    },
  ];

  for (const entry of plan) {
    const subject = await repositories.subjects.create({ userId, name: entry.subject });

    for (const chapterPlan of entry.chapters) {
      const chapter = await repositories.chapters.create({
        userId,
        subjectId: subject.id,
        name: chapterPlan.name,
      });

      for (const topicName of chapterPlan.topics) {
        await repositories.topics.create({ userId, chapterId: chapter.id, name: topicName });
      }
    }
  }

  // Complete a couple of topics so progress is visibly non-zero and partial.
  const [mathematics] = await repositories.subjects.listByUser(userId);
  if (mathematics !== undefined) {
    const chapters = await repositories.chapters.listBySubject(mathematics.id);
    const firstChapter = chapters[0];
    if (firstChapter !== undefined) {
      const topics = await repositories.topics.listByChapter(firstChapter.id);
      if (topics[0] !== undefined) await repositories.topics.setCompleted(topics[0].id, true);
    }
  }

  return true;
}
