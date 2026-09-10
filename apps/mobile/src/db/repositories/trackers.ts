import { uuidV7 } from '@preppilot/shared';
import { and, eq, inArray, isNull, max } from 'drizzle-orm';
import {
  flashcards,
  reminders,
  studySessions,
  subjects,
  trackers,
  type TrackerRow,
} from '../schema';
import { systemClock, type Clock, type Database } from '../types';

export interface CreateTrackerInput {
  readonly userId: string;
  readonly name: string;
  readonly templateId?: string | null;
}

/** The name a student's own subjects end up under when trackers first appear. */
export const DEFAULT_TRACKER_NAME = 'My studies';

/**
 * Trackers: one per exam or course.
 *
 * Everything else is scoped to one of these, so this is also where the scoping
 * is repaired — `adoptOrphans` claims rows written before trackers existed, and
 * anything a bug leaves unscoped later. Without it those rows would be invisible
 * in every tracker rather than merely in the wrong one.
 */
export class TrackerRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async listByUser(userId: string): Promise<TrackerRow[]> {
    return this.db
      .select()
      .from(trackers)
      .where(and(eq(trackers.userId, userId), isNull(trackers.deletedAt)))
      .orderBy(trackers.position, trackers.createdAt);
  }

  async findById(id: string): Promise<TrackerRow | null> {
    const rows = await this.db
      .select()
      .from(trackers)
      .where(and(eq(trackers.id, id), isNull(trackers.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async create({ userId, name, templateId = null }: CreateTrackerInput): Promise<TrackerRow> {
    const now = this.clock.now();
    const row = {
      id: uuidV7(),
      userId,
      name: name.trim(),
      templateId,
      position: await this.nextPosition(userId),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending' as const,
    };

    await this.db.insert(trackers).values(row);
    return row;
  }

  async rename(id: string, name: string): Promise<void> {
    await this.db
      .update(trackers)
      .set({ name: name.trim(), updatedAt: this.clock.now(), syncStatus: 'pending' })
      .where(eq(trackers.id, id));
  }

  /**
   * Tombstones a tracker and everything under it.
   *
   * Its subjects go too, which takes their chapters, topics and sub-topics with
   * them by the same rule the tracker screen already reads by. Sessions are
   * deliberately left alone: the student really did spend that time, and it
   * still counts towards their total (D16).
   */
  async softDelete(id: string): Promise<void> {
    const now = this.clock.now();
    const stamp = { deletedAt: now, updatedAt: now, syncStatus: 'pending' as const };

    await this.db.update(trackers).set(stamp).where(eq(trackers.id, id));
    await this.db.update(subjects).set(stamp).where(eq(subjects.trackerId, id));
    await this.db.update(reminders).set(stamp).where(eq(reminders.trackerId, id));
    await this.db.update(flashcards).set(stamp).where(eq(flashcards.trackerId, id));
  }

  /**
   * Puts every unscoped row into one tracker, creating it if there is none.
   *
   * Runs on start-up. A student who had a syllabus before trackers existed keeps
   * it, under a tracker named for them rather than losing it to a scope it never
   * had. Returns the tracker that now owns them, or null when there was nothing
   * to claim and no tracker to make.
   */
  async adoptOrphans(userId: string): Promise<TrackerRow | null> {
    const orphanedSubjects = await this.db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.userId, userId), isNull(subjects.trackerId)))
      .limit(1);

    const existing = await this.listByUser(userId);
    if (orphanedSubjects.length === 0 && existing.length > 0) return existing[0] ?? null;

    const target = existing[0] ?? (await this.create({ userId, name: DEFAULT_TRACKER_NAME }));

    // Claim by user and null scope, so this cannot steal another tracker's rows.
    const claim = { trackerId: target.id };
    await this.db
      .update(subjects)
      .set(claim)
      .where(and(eq(subjects.userId, userId), isNull(subjects.trackerId)));
    await this.db
      .update(studySessions)
      .set(claim)
      .where(and(eq(studySessions.userId, userId), isNull(studySessions.trackerId)));
    await this.db
      .update(reminders)
      .set(claim)
      .where(and(eq(reminders.userId, userId), isNull(reminders.trackerId)));
    await this.db
      .update(flashcards)
      .set(claim)
      .where(and(eq(flashcards.userId, userId), isNull(flashcards.trackerId)));

    return target;
  }

  private async nextPosition(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ highest: max(trackers.position) })
      .from(trackers)
      .where(eq(trackers.userId, userId));

    return (row?.highest ?? -1) + 1;
  }

  // ---------------------------------------------------------------------------
  // Synchronisation
  // ---------------------------------------------------------------------------

  async listAllForSync(userId: string): Promise<TrackerRow[]> {
    return this.db.select().from(trackers).where(eq(trackers.userId, userId));
  }

  async upsertFromSync(row: Record<string, unknown>): Promise<void> {
    await this.db
      .insert(trackers)
      .values(row as never)
      .onConflictDoUpdate({ target: trackers.id, set: row as never });
  }

  async markSynced(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(trackers)
      .set({ syncStatus: 'synced' })
      .where(inArray(trackers.id, [...ids]));
  }
}
