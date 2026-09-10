import { and, desc, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import { chapters, subjects, subtopics, topics } from '../schema';
import type { Database } from '../types';
import { scopedToTracker } from './tracker-scope';

/** Which level a note was written against. Both are edited the same way. */
export type NoteLevel = 'topic' | 'subtopic';

export interface NoteEntry {
  /** The topic or sub-topic the note belongs to. */
  readonly id: string;
  readonly level: NoteLevel;
  readonly topicId: string;
  readonly topicName: string;
  readonly chapterName: string;
  readonly subjectName: string;
  readonly subjectId: string;
  readonly note: string;
  readonly updatedAt: number;
}

/**
 * Every note a student has written, newest first.
 *
 * A read model rather than a table: notes live on their topics and sub-topics,
 * and duplicating them somewhere else would give two answers to "what does this
 * note say". The subject and chapter names come along because a note is
 * meaningless without knowing what it is about.
 *
 * Sub-topic notes are included. A student who writes one there is writing a
 * note, and a list that quietly omitted half of them would be worse than no
 * list at all — they would stop trusting the ones it did show.
 */
export class NoteRepository {
  constructor(private readonly db: Database) {}

  /**
   * A tracker's notes. Scoped through the subject the note hangs from, since a
   * note has no tracker of its own — see {@link scopedToTracker}.
   */
  async listByUser(userId: string, trackerId?: string | null): Promise<NoteEntry[]> {
    const [topicNotes, subtopicNotes] = await Promise.all([
      this.topicNotes(userId, trackerId),
      this.subtopicNotes(userId, trackerId),
    ]);

    return [...topicNotes, ...subtopicNotes].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private async topicNotes(userId: string, trackerId?: string | null): Promise<NoteEntry[]> {
    const rows = await this.db
      .select({
        id: topics.id,
        topicId: topics.id,
        topicName: topics.name,
        note: topics.note,
        updatedAt: topics.updatedAt,
        chapterName: chapters.name,
        subjectName: subjects.name,
        subjectId: subjects.id,
      })
      .from(topics)
      .innerJoin(chapters, eq(topics.chapterId, chapters.id))
      .innerJoin(subjects, eq(chapters.subjectId, subjects.id))
      .where(
        and(
          eq(topics.userId, userId),
          isNotNull(topics.note),
          // An emptied note is stored as null, but a row written before that rule
          // existed could hold an empty string; neither is a note.
          ne(topics.note, ''),
          isNull(topics.deletedAt),
          isNull(chapters.deletedAt),
          isNull(subjects.deletedAt),
          ...scopedToTracker(subjects.trackerId, trackerId),
        ),
      )
      .orderBy(desc(topics.updatedAt));

    // The query already excludes null and empty notes, so narrowing here is
    // what makes that guarantee visible to the type — rather than a `?? ''`
    // fallback standing in for a case the database cannot return.
    return rows
      .filter((row): row is typeof row & { note: string } => row.note !== null)
      .map((row) => ({ ...row, level: 'topic' as const }));
  }

  /**
   * Notes written on a sub-topic.
   *
   * The sub-topic's own name is reported as the topic, with the topic above it
   * standing in as the chapter — the same substitution the assistant makes, so
   * "Refraction, under Light" reads the same wherever a student meets it.
   */
  private async subtopicNotes(userId: string, trackerId?: string | null): Promise<NoteEntry[]> {
    const rows = await this.db
      .select({
        id: subtopics.id,
        topicId: topics.id,
        topicName: subtopics.name,
        note: subtopics.note,
        updatedAt: subtopics.updatedAt,
        chapterName: topics.name,
        subjectName: subjects.name,
        subjectId: subjects.id,
      })
      .from(subtopics)
      .innerJoin(topics, eq(subtopics.topicId, topics.id))
      .innerJoin(chapters, eq(topics.chapterId, chapters.id))
      .innerJoin(subjects, eq(chapters.subjectId, subjects.id))
      .where(
        and(
          eq(subtopics.userId, userId),
          isNotNull(subtopics.note),
          ne(subtopics.note, ''),
          isNull(subtopics.deletedAt),
          isNull(topics.deletedAt),
          isNull(chapters.deletedAt),
          isNull(subjects.deletedAt),
          ...scopedToTracker(subjects.trackerId, trackerId),
        ),
      )
      .orderBy(desc(subtopics.updatedAt));

    return rows
      .filter((row): row is typeof row & { note: string } => row.note !== null)
      .map((row) => ({ ...row, level: 'subtopic' as const }));
  }
}
