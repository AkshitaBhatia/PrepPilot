import { uuidV7 } from '@preppilot/shared';
import { and, eq, inArray, isNull, max } from 'drizzle-orm';
import { chapters, topics, type TopicRow } from '../schema';
import { systemClock, type Clock, type Database } from '../types';

export interface CreateTopicInput {
  readonly userId: string;
  readonly chapterId: string;
  readonly name: string;
}

export class TopicRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async listByChapter(chapterId: string): Promise<TopicRow[]> {
    return this.db
      .select()
      .from(topics)
      .where(and(eq(topics.chapterId, chapterId), isNull(topics.deletedAt)))
      .orderBy(topics.position, topics.createdAt);
  }

  /**
   * Every live topic belonging to a subject, for progress calculation.
   *
   * Joins through chapters and excludes tombstoned chapters as well as
   * tombstoned topics: a topic whose chapter was deleted is no longer part of
   * the syllabus, and counting it would understate the student's progress.
   */
  async listBySubject(subjectId: string): Promise<TopicRow[]> {
    const rows = await this.db
      .select({ topic: topics })
      .from(topics)
      .innerJoin(chapters, eq(topics.chapterId, chapters.id))
      .where(
        and(
          eq(chapters.subjectId, subjectId),
          isNull(chapters.deletedAt),
          isNull(topics.deletedAt),
        ),
      )
      .orderBy(chapters.position, topics.position);

    return rows.map((row) => row.topic);
  }

  async listByUser(userId: string): Promise<TopicRow[]> {
    return this.db
      .select()
      .from(topics)
      .where(and(eq(topics.userId, userId), isNull(topics.deletedAt)))
      .orderBy(topics.position, topics.createdAt);
  }

  async findById(id: string): Promise<TopicRow | null> {
    const rows = await this.db
      .select()
      .from(topics)
      .where(and(eq(topics.id, id), isNull(topics.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async create({ userId, chapterId, name }: CreateTopicInput): Promise<TopicRow> {
    const now = this.clock.now();
    const row = {
      id: uuidV7(),
      userId,
      chapterId,
      name: name.trim(),
      completed: false,
      completedChangedAt: null,
      note: null,
      position: await this.nextPosition(chapterId),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending' as const,
    };

    await this.db.insert(topics).values(row);
    return row;
  }

  async rename(id: string, name: string): Promise<void> {
    await this.db
      .update(topics)
      .set({ name: name.trim(), updatedAt: this.clock.now(), syncStatus: 'pending' })
      .where(eq(topics.id, id));
  }

  /**
   * Sets completion, stamping `completedChangedAt` separately from `updatedAt`.
   *
   * Conflict resolution treats completion independently of the rest of the row
   * (D14). Without its own timestamp, renaming a topic on one device would be
   * indistinguishable from ticking it on another, and one change would silently
   * revert the other.
   */
  async setCompleted(id: string, completed: boolean): Promise<void> {
    const now = this.clock.now();
    await this.db
      .update(topics)
      .set({ completed, completedChangedAt: now, updatedAt: now, syncStatus: 'pending' })
      .where(eq(topics.id, id));
  }

  /**
   * Stores a student's note against a topic.
   *
   * An empty note is stored as null rather than an empty string, so "no note"
   * has one representation instead of two — rows written before this column
   * existed carry null, and both must render the same.
   */
  async setNote(id: string, note: string | null): Promise<void> {
    const trimmed = note === null ? null : note.trim();
    await this.db
      .update(topics)
      .set({
        note: trimmed === null || trimmed.length === 0 ? null : trimmed,
        updatedAt: this.clock.now(),
        syncStatus: 'pending',
      })
      .where(eq(topics.id, id));
  }

  async softDelete(id: string): Promise<void> {
    const now = this.clock.now();
    await this.db
      .update(topics)
      .set({ deletedAt: now, updatedAt: now, syncStatus: 'pending' })
      .where(eq(topics.id, id));
  }

  async reorder(chapterId: string, orderedIds: readonly string[]): Promise<void> {
    const now = this.clock.now();

    for (const [position, id] of orderedIds.entries()) {
      await this.db
        .update(topics)
        .set({ position, updatedAt: now, syncStatus: 'pending' })
        .where(and(eq(topics.id, id), eq(topics.chapterId, chapterId)));
    }
  }

  /** Bulk completion, used when a student ticks a whole chapter. */
  async setCompletedForChapter(chapterId: string, completed: boolean): Promise<void> {
    const now = this.clock.now();
    await this.db
      .update(topics)
      .set({ completed, completedChangedAt: now, updatedAt: now, syncStatus: 'pending' })
      .where(and(eq(topics.chapterId, chapterId), isNull(topics.deletedAt)));
  }

  /** Inserts many topics at once, used by template import. */
  async createMany(inputs: readonly CreateTopicInput[]): Promise<TopicRow[]> {
    if (inputs.length === 0) return [];

    const now = this.clock.now();
    // Positions are resolved per chapter up front, so a batch spanning several
    // chapters does not restart numbering or collide within one of them.
    const nextByChapter = new Map<string, number>();
    for (const chapterId of new Set(inputs.map((input) => input.chapterId))) {
      nextByChapter.set(chapterId, await this.nextPosition(chapterId));
    }

    const rows = inputs.map((input) => {
      const position = nextByChapter.get(input.chapterId) ?? 0;
      nextByChapter.set(input.chapterId, position + 1);

      return {
        id: uuidV7(),
        userId: input.userId,
        chapterId: input.chapterId,
        name: input.name.trim(),
        completed: false,
        completedChangedAt: null,
        note: null,
        position,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending' as const,
      };
    });

    await this.db.insert(topics).values(rows);
    return rows;
  }

  /** Tombstones many topics at once. */
  async softDeleteMany(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;

    const now = this.clock.now();
    await this.db
      .update(topics)
      .set({ deletedAt: now, updatedAt: now, syncStatus: 'pending' })
      .where(inArray(topics.id, [...ids]));
  }

  private async nextPosition(chapterId: string): Promise<number> {
    const [row] = await this.db
      .select({ highest: max(topics.position) })
      .from(topics)
      .where(eq(topics.chapterId, chapterId));

    return (row?.highest ?? -1) + 1;
  }

  // ---------------------------------------------------------------------------
  // Synchronisation
  // ---------------------------------------------------------------------------

  /**
   * Every row for this user, tombstones included.
   *
   * Sync needs the deleted ones: a tombstone is how a deletion travels, so
   * filtering them out here would leave rows resurrected on every other device.
   */
  async listAllForSync(userId: string): Promise<TopicRow[]> {
    return this.db.select().from(topics).where(eq(topics.userId, userId));
  }

  /** Writes a row that arrived from the server, replacing any local copy. */
  async upsertFromSync(row: Record<string, unknown>): Promise<void> {
    await this.db
      .insert(topics)
      .values(row as never)
      .onConflictDoUpdate({ target: topics.id, set: row as never });
  }

  /**
   * Marks rows as sent.
   *
   * Deliberately does not touch `updatedAt`: this records what the server has
   * seen, not a change the student made, and bumping the timestamp would make
   * the row look newer than the copy just accepted.
   */
  async markSynced(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(topics)
      .set({ syncStatus: 'synced' })
      .where(inArray(topics.id, [...ids]));
  }
}
