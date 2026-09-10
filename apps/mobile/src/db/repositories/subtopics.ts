import { uuidV7 } from '@preppilot/shared';
import { and, eq, inArray, isNull, max } from 'drizzle-orm';
import { chapters, subtopics, topics, type SubtopicRow } from '../schema';
import { systemClock, type Clock, type Database } from '../types';

export interface CreateSubtopicInput {
  readonly userId: string;
  readonly topicId: string;
  readonly name: string;
}

/**
 * Sub-topics: the optional fourth level.
 *
 * Mirrors `TopicRepository` deliberately — same tombstones, same per-field
 * completion timestamp, same sync bookkeeping — because a sub-topic is the same
 * kind of thing one level down, and a student adds them the same way.
 */
export class SubtopicRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async listByTopic(topicId: string): Promise<SubtopicRow[]> {
    return this.db
      .select()
      .from(subtopics)
      .where(and(eq(subtopics.topicId, topicId), isNull(subtopics.deletedAt)))
      .orderBy(subtopics.position, subtopics.createdAt);
  }

  /**
   * Every live sub-topic under a subject, for progress calculation.
   *
   * Excludes any whose topic or chapter has been tombstoned: a sub-topic under a
   * deleted topic is no longer part of the syllabus, and counting it would
   * understate the student's progress.
   */
  async listBySubject(subjectId: string): Promise<SubtopicRow[]> {
    const rows = await this.db
      .select({ subtopic: subtopics })
      .from(subtopics)
      .innerJoin(topics, eq(subtopics.topicId, topics.id))
      .innerJoin(chapters, eq(topics.chapterId, chapters.id))
      .where(
        and(
          eq(chapters.subjectId, subjectId),
          isNull(chapters.deletedAt),
          isNull(topics.deletedAt),
          isNull(subtopics.deletedAt),
        ),
      )
      .orderBy(chapters.position, topics.position, subtopics.position);

    return rows.map((row) => row.subtopic);
  }

  /** Every live sub-topic for a user, for whole-syllabus progress. */
  async listByUser(userId: string): Promise<SubtopicRow[]> {
    return this.db
      .select()
      .from(subtopics)
      .where(and(eq(subtopics.userId, userId), isNull(subtopics.deletedAt)))
      .orderBy(subtopics.position, subtopics.createdAt);
  }

  async findById(id: string): Promise<SubtopicRow | null> {
    const rows = await this.db
      .select()
      .from(subtopics)
      .where(and(eq(subtopics.id, id), isNull(subtopics.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async create({ userId, topicId, name }: CreateSubtopicInput): Promise<SubtopicRow> {
    const now = this.clock.now();
    const row = {
      id: uuidV7(),
      userId,
      topicId,
      name: name.trim(),
      completed: false,
      completedChangedAt: null,
      note: null,
      position: await this.nextPosition(topicId),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending' as const,
    };

    await this.db.insert(subtopics).values(row);
    return row;
  }

  async rename(id: string, name: string): Promise<void> {
    await this.db
      .update(subtopics)
      .set({ name: name.trim(), updatedAt: this.clock.now(), syncStatus: 'pending' })
      .where(eq(subtopics.id, id));
  }

  /** Completion carries its own timestamp, so a rename cannot revert a tick (D14). */
  async setCompleted(id: string, completed: boolean): Promise<void> {
    const now = this.clock.now();
    await this.db
      .update(subtopics)
      .set({ completed, completedChangedAt: now, updatedAt: now, syncStatus: 'pending' })
      .where(eq(subtopics.id, id));
  }

  /** Bulk completion, used when a student ticks a topic that has sub-topics. */
  async setCompletedForTopic(topicId: string, completed: boolean): Promise<void> {
    const now = this.clock.now();
    await this.db
      .update(subtopics)
      .set({ completed, completedChangedAt: now, updatedAt: now, syncStatus: 'pending' })
      .where(and(eq(subtopics.topicId, topicId), isNull(subtopics.deletedAt)));
  }

  /** Stores a note, with empty and null both meaning "no note" — as on a topic. */
  async setNote(id: string, note: string | null): Promise<void> {
    const trimmed = note === null ? null : note.trim();
    await this.db
      .update(subtopics)
      .set({
        note: trimmed === null || trimmed.length === 0 ? null : trimmed,
        updatedAt: this.clock.now(),
        syncStatus: 'pending',
      })
      .where(eq(subtopics.id, id));
  }

  /** Reorders within one topic, matching how topics reorder within a chapter. */
  async reorder(topicId: string, orderedIds: readonly string[]): Promise<void> {
    const now = this.clock.now();

    for (const [position, id] of orderedIds.entries()) {
      await this.db
        .update(subtopics)
        .set({ position, updatedAt: now, syncStatus: 'pending' })
        .where(and(eq(subtopics.id, id), eq(subtopics.topicId, topicId)));
    }
  }

  async softDelete(id: string): Promise<void> {
    const now = this.clock.now();
    await this.db
      .update(subtopics)
      .set({ deletedAt: now, updatedAt: now, syncStatus: 'pending' })
      .where(eq(subtopics.id, id));
  }

  private async nextPosition(topicId: string): Promise<number> {
    const [row] = await this.db
      .select({ highest: max(subtopics.position) })
      .from(subtopics)
      .where(eq(subtopics.topicId, topicId));

    return (row?.highest ?? -1) + 1;
  }

  // ---------------------------------------------------------------------------
  // Synchronisation
  // ---------------------------------------------------------------------------

  /** Every row for this user, tombstones included — a tombstone is how a deletion travels. */
  async listAllForSync(userId: string): Promise<SubtopicRow[]> {
    return this.db.select().from(subtopics).where(eq(subtopics.userId, userId));
  }

  async upsertFromSync(row: Record<string, unknown>): Promise<void> {
    await this.db
      .insert(subtopics)
      .values(row as never)
      .onConflictDoUpdate({ target: subtopics.id, set: row as never });
  }

  /** Records what the server has seen; deliberately does not touch `updatedAt`. */
  async markSynced(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(subtopics)
      .set({ syncStatus: 'synced' })
      .where(inArray(subtopics.id, [...ids]));
  }
}
