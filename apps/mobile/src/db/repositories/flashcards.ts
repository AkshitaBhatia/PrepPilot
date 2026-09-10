import { newSchedule, uuidV7, type CardSchedule } from '@preppilot/shared';
import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { flashcards, type FlashcardRow } from '../schema';
import { systemClock, type Clock, type Database } from '../types';
import { scopedToTracker } from './tracker-scope';

export interface CreateFlashcardInput {
  /** The tracker this belongs to. Everything a student owns lives in one. */
  readonly trackerId?: string | null;
  readonly userId: string;
  readonly front: string;
  readonly back: string;
  readonly topicId?: string | null;
  readonly topicName?: string | null;
}

/**
 * Flashcards and their review schedule.
 *
 * The schedule itself lives in @preppilot/shared — this only stores what that
 * decided. Keeping the algorithm out of the repository means the intervals can
 * be tested without a database, which matters because a wrong interval is
 * invisible for weeks.
 */
export class FlashcardRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  /** A tracker's deck. See {@link scopedToTracker}. */
  async listByUser(userId: string, trackerId?: string | null): Promise<FlashcardRow[]> {
    return this.db
      .select()
      .from(flashcards)
      .where(
        and(
          eq(flashcards.userId, userId),
          isNull(flashcards.deletedAt),
          ...scopedToTracker(flashcards.trackerId, trackerId),
        ),
      )
      .orderBy(asc(flashcards.dueAt));
  }

  /** The review queue: live cards that are due, soonest first. */
  async listDue(
    userId: string,
    now = this.clock.now(),
    trackerId?: string | null,
  ): Promise<FlashcardRow[]> {
    return this.db
      .select()
      .from(flashcards)
      .where(
        and(
          eq(flashcards.userId, userId),
          isNull(flashcards.deletedAt),
          lte(flashcards.dueAt, now),
          ...scopedToTracker(flashcards.trackerId, trackerId),
        ),
      )
      .orderBy(asc(flashcards.dueAt));
  }

  async listByTopic(topicId: string): Promise<FlashcardRow[]> {
    return this.db
      .select()
      .from(flashcards)
      .where(and(eq(flashcards.topicId, topicId), isNull(flashcards.deletedAt)))
      .orderBy(asc(flashcards.createdAt));
  }

  async findById(id: string): Promise<FlashcardRow | null> {
    const rows = await this.db
      .select()
      .from(flashcards)
      .where(and(eq(flashcards.id, id), isNull(flashcards.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async create({
    userId,
    front,
    back,
    topicId = null,
    topicName = null,
    trackerId = null,
  }: CreateFlashcardInput): Promise<FlashcardRow> {
    const now = this.clock.now();
    const schedule = newSchedule(now);

    const row = {
      id: uuidV7(),
      userId,
      trackerId,
      topicId,
      topicName,
      front: front.trim(),
      back: back.trim(),
      easeFactor: schedule.easeFactor,
      intervalDays: schedule.intervalDays,
      repetitions: schedule.repetitions,
      lapses: schedule.lapses,
      dueAt: schedule.dueAt,
      lastReviewedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending' as const,
    };

    await this.db.insert(flashcards).values(row);
    return row;
  }

  async edit(id: string, front: string, back: string): Promise<void> {
    await this.db
      .update(flashcards)
      .set({
        front: front.trim(),
        back: back.trim(),
        updatedAt: this.clock.now(),
        syncStatus: 'pending',
      })
      .where(eq(flashcards.id, id));
  }

  /** Stores the outcome of one review. The schedule is decided by the caller. */
  async applySchedule(id: string, schedule: CardSchedule): Promise<void> {
    const now = this.clock.now();
    await this.db
      .update(flashcards)
      .set({
        easeFactor: schedule.easeFactor,
        intervalDays: schedule.intervalDays,
        repetitions: schedule.repetitions,
        lapses: schedule.lapses,
        dueAt: schedule.dueAt,
        lastReviewedAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      })
      .where(eq(flashcards.id, id));
  }

  async softDelete(id: string): Promise<void> {
    const now = this.clock.now();
    await this.db
      .update(flashcards)
      .set({ deletedAt: now, updatedAt: now, syncStatus: 'pending' })
      .where(eq(flashcards.id, id));
  }

  // ---------------------------------------------------------------------------
  // Synchronisation
  // ---------------------------------------------------------------------------

  async listAllForSync(userId: string): Promise<FlashcardRow[]> {
    return this.db.select().from(flashcards).where(eq(flashcards.userId, userId));
  }

  async upsertFromSync(row: Record<string, unknown>): Promise<void> {
    await this.db
      .insert(flashcards)
      .values(row as never)
      .onConflictDoUpdate({ target: flashcards.id, set: row as never });
  }

  async markSynced(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(flashcards)
      .set({ syncStatus: 'synced' })
      .where(inArray(flashcards.id, [...ids]));
  }
}
