import type { TemplateChapter, TemplateSubject } from '../template';

/**
 * Shorthand for writing curated syllabi.
 *
 * The templates below are content, and content written as nested object
 * literals is content nobody proof-reads. These helpers let a chapter read as
 * one line — its name, then its topics — so a wrong chapter is visible in a
 * diff rather than buried in punctuation.
 */
export function chapter(name: string, ...topics: readonly string[]): TemplateChapter {
  return { name, topics: topics.map((topic) => ({ name: topic })) };
}

export function subject(name: string, ...chapters: readonly TemplateChapter[]): TemplateSubject {
  return { name, chapters };
}
