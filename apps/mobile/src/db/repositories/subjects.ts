import { uuidV7 } from '@preppilot/shared';
import { and, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { subjects, type SubjectRow } from '../schema';
import { scopedToTracker } from './tracker-scope';
import { systemClock, type Clock, type Database } from '../types';

export interface CreateSubjectInput {
  /** The tracker this belongs to. Everything a student owns lives in one. */
  readonly trackerId?: string | null;
  readonly userId: string;
  readonly name: string;
  readonly description?: string | null;
}

export interface UpdateSubjectInput {
  readonly name?: string;
  readonly description?: string | null;
}

/**
 * Subject storage.
 *
 * Every read excludes tombstoned rows, and every write stamps `updatedAt` and
 * marks the row `pending` so the sync layer can find it later. Callers never
 * set those fields themselves — leaving it to each call site is how a row ends
 * up silently un-syncable.
 */
export class SubjectRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  /** The syllabus, scoped to one tracker. See {@link scopedToTracker}. */
  async listByUser(userId: string, trackerId?: string | null): Promise<SubjectRow[]> {
    return this.db
      .select()
      .from(subjects)
      .where(
        and(
          eq(subjects.userId, userId),
          isNull(subjects.deletedAt),
          ...scopedToTracker(subjects.trackerId, trackerId),
        ),
      )
      .orderBy(subjects.position, subjects.createdAt);
  }

  async findById(id: string): Promise<SubjectRow | null> {
    const rows = await this.db
      .select()
      .from(subjects)
      .where(and(eq(subjects.id, id), isNull(subjects.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async create({
    userId,
    name,
    description = null,
    trackerId = null,
  }: CreateSubjectInput): Promise<SubjectRow> {
    const now = this.clock.now();
    const row = {
      id: uuidV7(),
      userId,
      trackerId,
      name: name.trim(),
      description,
      position: await this.nextPosition(userId),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending' as const,
    };

    await this.db.insert(subjects).values(row);
    return row;
  }

  async update(id: string, changes: UpdateSubjectInput): Promise<void> {
    const patch: Partial<SubjectRow> = { updatedAt: this.clock.now(), syncStatus: 'pending' };
    if (changes.name !== undefined) patch.name = changes.name.trim();
    if (changes.description !== undefined) patch.description = changes.description;

    await this.db.update(subjects).set(patch).where(eq(subjects.id, id));
  }

  /**
   * Tombstones the subject.
   *
   * Chapters and topics are left untouched: they are reached only through their
   * subject, and tombstoning the whole tree would produce a large sync payload
   * for what the student experiences as deleting one thing. The reads below
   * filter by the subject, so the descendants become unreachable immediately.
   */
  async softDelete(id: string): Promise<void> {
    const now = this.clock.now();
    await this.db
      .update(subjects)
      .set({ deletedAt: now, updatedAt: now, syncStatus: 'pending' })
      .where(eq(subjects.id, id));
  }

  /** Applies an explicit ordering, used after drag-to-reorder. */
  async reorder(userId: string, orderedIds: readonly string[]): Promise<void> {
    const now = this.clock.now();

    for (const [position, id] of orderedIds.entries()) {
      await this.db
        .update(subjects)
        .set({ position, updatedAt: now, syncStatus: 'pending' })
        .where(and(eq(subjects.id, id), eq(subjects.userId, userId)));
    }
  }

  /** Appends after the last subject, counting tombstoned rows so positions stay unique. */
  private async nextPosition(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ highest: max(subjects.position) })
      .from(subjects)
      .where(eq(subjects.userId, userId));

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
  async listAllForSync(userId: string): Promise<SubjectRow[]> {
    return this.db.select().from(subjects).where(eq(subjects.userId, userId));
  }

  /** Writes a row that arrived from the server, replacing any local copy. */
  async upsertFromSync(row: Record<string, unknown>): Promise<void> {
    await this.db
      .insert(subjects)
      .values(row as never)
      .onConflictDoUpdate({ target: subjects.id, set: row as never });
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
      .update(subjects)
      .set({ syncStatus: 'synced' })
      .where(inArray(subjects.id, [...ids]));
  }
}

/** Rows with local changes the server has not seen yet. */
export async function pendingSubjects(db: Database): Promise<SubjectRow[]> {
  return db
    .select()
    .from(subjects)
    .where(sql`${subjects.syncStatus} = 'pending'`);
}
