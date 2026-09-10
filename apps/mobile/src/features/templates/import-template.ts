import { validateTemplate, type SyllabusTemplate, type TemplateSubject } from '@preppilot/shared';
import type { Repositories } from '../../db/client';

export interface ImportResult {
  readonly subjects: number;
  readonly chapters: number;
  readonly topics: number;
}

/**
 * Imports a whole template as the syllabus of a course.
 *
 * Nothing existing is touched: the caller creates the course this lands in.
 */
export async function importTemplate(
  userId: string,
  template: SyllabusTemplate,
  repositories: Repositories,
  /** The tracker to import into. Subjects belong to one. */
  trackerId?: string | null,
): Promise<ImportResult> {
  const validation = validateTemplate(template);

  if (!validation.valid) {
    throw new Error(validation.message);
  }

  // ---------------------------------------------------------------------------
  // Importing a course creates a new tracker rather than replacing the current
  // one. A student preparing for UPSC and GATE keeps both, and switching between
  // them switches the whole app — syllabus, notes, cards, sessions.
  //
  // Nothing existing is touched. That is the point: the previous behaviour
  // tombstoned the current syllabus, which lost every note written against it.
  // ---------------------------------------------------------------------------

  return importSubjects(userId, template.subjects, repositories, trackerId);
}

/**
 * Adds particular subjects from a template into a course the student already
 * has.
 *
 * The other half of importing. A student who wants Accountancy does not want
 * the four subjects that sit beside it in the same board stream, and making
 * them import the whole thing and delete the rest is not a way to add a
 * subject.
 *
 * Additive by design: it appends to the course and touches nothing already
 * there, so importing twice gives two copies rather than losing the first.
 */
export async function importSubjects(
  userId: string,
  subjects: readonly TemplateSubject[],
  repositories: Repositories,
  trackerId?: string | null,
): Promise<ImportResult> {
  let chapters = 0;
  let topics = 0;

  for (const templateSubject of subjects) {
    const subject = await repositories.subjects.create({
      userId,
      name: templateSubject.name,
      trackerId: trackerId ?? null,
    });

    for (const templateChapter of templateSubject.chapters) {
      const chapter = await repositories.chapters.create({
        userId,
        subjectId: subject.id,
        name: templateChapter.name,
      });

      chapters += 1;

      if (templateChapter.topics.length === 0) {
        continue;
      }

      const created = await repositories.topics.createMany(
        templateChapter.topics.map((topic) => ({
          userId,
          chapterId: chapter.id,
          name: topic.name,
        })),
      );

      topics += created.length;
    }
  }

  return { subjects: subjects.length, chapters, topics };
}
