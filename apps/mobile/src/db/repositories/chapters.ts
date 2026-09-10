import { uuidV7 } from '@preppilot/shared';
import { and, eq, inArray, isNull, max } from 'drizzle-orm';
import { chapters, type ChapterRow } from '../schema';
import { systemClock, type Clock, type Database } from '../types';

export interface CreateChapterInput {
  readonly userId: string;
  readonly subjectId: string;
  readonly name: string;
}

export class ChapterRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async listBySubject(subjectId: string): Promise<ChapterRow[]> {
    return this.db
      .select()
      .from(chapters)
      .where(and(eq(chapters.subjectId, subjectId), isNull(chapters.deletedAt)))
      .orderBy(chapters.position, chapters.createdAt);
  }

  async listByUser(userId: string): Promise<ChapterRow[]> {
    return this.db
      .select()
      .from(chapters)
      .where(and(eq(chapters.userId, userId), isNull(chapters.deletedAt)))
      .orderBy(chapters.position, chapters.createdAt);
  }

  async findById(id: string): Promise<ChapterRow | null> {
    const rows = await this.db
      .select()
      .from(chapters)
      .where(and(eq(chapters.id, id), isNull(chapters.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async create({ userId, subjectId, name }: CreateChapterInput): Promise<ChapterRow> {
    const now = this.clock.now();
    const row = {
      id: uuidV7(),
      userId,
      subjectId,
      name: name.trim(),
      position: await this.nextPosition(subjectId),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending' as const,
    };

    await this.db.insert(chapters).values(row);
    return row;
  }

  async rename(id: string, name: string): Promise<void> {
    await this.db
      .update(chapters)
      .set({ name: name.trim(), updatedAt: this.clock.now(), syncStatus: 'pending' })
      .where(eq(chapters.id, id));
  }

  async softDelete(id: string): Promise<void> {
    const now = this.clock.now();
    await this.db
      .update(chapters)
      .set({ deletedAt: now, updatedAt: now, syncStatus: 'pending' })
      .where(eq(chapters.id, id));
  }

  async reorder(subjectId: string, orderedIds: readonly string[]): Promise<void> {
    const now = this.clock.now();

    for (const [position, id] of orderedIds.entries()) {
      await this.db
        .update(chapters)
        .set({ position, updatedAt: now, syncStatus: 'pending' })
        .where(and(eq(chapters.id, id), eq(chapters.subjectId, subjectId)));
    }
  }

  private async nextPosition(subjectId: string): Promise<number> {
    const [row] = await this.db
      .select({ highest: max(chapters.position) })
      .from(chapters)
      .where(eq(chapters.subjectId, subjectId));

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
  async listAllForSync(userId: string): Promise<ChapterRow[]> {
    return this.db.select().from(chapters).where(eq(chapters.userId, userId));
  }

  /** Writes a row that arrived from the server, replacing any local copy. */
  async upsertFromSync(row: Record<string, unknown>): Promise<void> {
    await this.db
      .insert(chapters)
      .values(row as never)
      .onConflictDoUpdate({ target: chapters.id, set: row as never });
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
      .update(chapters)
      .set({ syncStatus: 'synced' })
      .where(inArray(chapters.id, [...ids]));
  }
}
