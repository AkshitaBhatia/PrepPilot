/**
 * Syllabus templates.
 *
 * A template is plain data: a named syllabus with chapters and topics, which a
 * student imports into their own tracker and then edits freely (PRD §13).
 *
 * The shape is defined here, separately from the content, so adding a real
 * curriculum is a data change with no code behind it. The bundled set is
 * deliberately small until verified syllabus data is available — a template that
 * claims to be the JEE syllabus and is not would be worse than no template.
 */

import { isValidName } from '../domain/types';

export interface TemplateTopic {
  readonly name: string;
}

export interface TemplateChapter {
  readonly name: string;
  readonly topics: readonly TemplateTopic[];
}

export interface TemplateSubject {
  readonly name: string;
  readonly chapters: readonly TemplateChapter[];
}

export const TEMPLATE_CATEGORIES = ['exam', 'school', 'custom'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export interface SyllabusTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: TemplateCategory;
  /**
   * Where the content came from, shown on the preview.
   *
   * A student deciding whether to trust a syllabus should be able to see whether
   * it was transcribed from an official source or assembled as an example.
   */
  readonly source: string;
  /** False while the content has not been checked against an official syllabus. */
  readonly verified: boolean;
  readonly subjects: readonly TemplateSubject[];
}

export interface TemplateCounts {
  readonly subjects: number;
  readonly chapters: number;
  readonly topics: number;
}

/** What the preview shows before a student commits to importing. */
export function countTemplate(template: SyllabusTemplate): TemplateCounts {
  let chapters = 0;
  let topics = 0;

  for (const subject of template.subjects) {
    chapters += subject.chapters.length;
    for (const chapter of subject.chapters) {
      topics += chapter.topics.length;
    }
  }

  return { subjects: template.subjects.length, chapters, topics };
}

/**
 * Checks a template is coherent before it can be imported.
 *
 * Templates are data, and data can be edited by hand. Importing a malformed one
 * would create a syllabus a student then has to clean up by hand, so it is
 * rejected with a reason instead.
 */
export function validateTemplate(
  template: SyllabusTemplate,
): { valid: true } | { valid: false; message: string } {
  if (template.name.trim().length === 0) {
    return { valid: false, message: 'A template needs a name.' };
  }
  if (template.subjects.length === 0) {
    return { valid: false, message: 'A template needs at least one subject.' };
  }

  for (const subject of template.subjects) {
    if (!isValidName(subject.name)) {
      return { valid: false, message: 'Every subject in a template needs a name.' };
    }
    for (const chapter of subject.chapters) {
      if (!isValidName(chapter.name)) {
        return { valid: false, message: `Every chapter in ${subject.name} needs a name.` };
      }
      for (const topic of chapter.topics) {
        if (!isValidName(topic.name)) {
          return { valid: false, message: `Every topic in ${chapter.name} needs a name.` };
        }
      }
    }
  }

  return { valid: true };
}

/** Templates matching a category, or all of them. */
export function templatesInCategory(
  templates: readonly SyllabusTemplate[],
  category: TemplateCategory | 'all',
): readonly SyllabusTemplate[] {
  return category === 'all'
    ? templates
    : templates.filter((template) => template.category === category);
}

/**
 * Finds templates by name, description or the subjects inside them.
 *
 * Subjects are searched because that is often all a student knows to type: they
 * are looking for "accountancy", not for "CBSE Class 12 — Commerce", and a
 * library that only matches titles hides the very template they need behind a
 * name they have not learnt yet.
 *
 * Every term must match somewhere, so typing more words narrows rather than
 * widens — which is what a second word is nearly always meant to do.
 */
export function searchTemplates(
  templates: readonly SyllabusTemplate[],
  query: string,
): readonly SyllabusTemplate[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return templates;

  return templates.filter((template) => {
    const haystack = [
      template.name,
      template.description,
      ...template.subjects.map((subject) => subject.name),
    ]
      .join(' ')
      .toLowerCase();

    return terms.every((term) => haystack.includes(term));
  });
}
