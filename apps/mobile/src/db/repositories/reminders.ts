import { uuidV7, type RepeatRule } from '@preppilot/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { reminders, type ReminderRow } from '../schema';
import { systemClock, type Clock, type Database } from '../types';
import { scopedToTracker } from './tracker-scope';

export interface CreateReminderInput {
  /** The tracker this belongs to. Everything a student owns lives in one. */
  readonly trackerId?: string | null;
  readonly userId: string;
  readonly title: string;
  readonly scheduledAt: number;
  readonly repeatRule: RepeatRule;
  readonly subjectId?: string | null;
  readonly chapterId?: string | null;
  readonly topicId?: string | null;
  readonly relatedName?: string | null;
}

export interface UpdateReminderInput {
  readonly title?: string;
  readonly scheduledAt?: number;
  readonly repeatRule?: RepeatRule;
  readonly enabled?: boolean;
}

export class ReminderRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  /** A tracker's reminders. See {@link scopedToTracker}. */
  async listByUser(userId: string, trackerId?: string | null): Promise<ReminderRow[]> {
    return this.db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.userId, userId),
          isNull(reminders.deletedAt),
          ...scopedToTracker(reminders.trackerId, trackerId),
        ),
      )
      .orderBy(asc(reminders.scheduledAt));
  }

  async findById(id: string): Promise<ReminderRow | null> {
    const rows = await this.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.id, id), isNull(reminders.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async create(input: CreateReminderInput): Promise<ReminderRow> {
    const now = this.clock.now();
    const row: ReminderRow = {
      id: uuidV7(),
      userId: input.userId,
      trackerId: input.trackerId ?? null,
      title: input.title.trim(),
      scheduledAt: input.scheduledAt,
      repeatRule: input.repeatRule,
      subjectId: input.subjectId ?? null,
      chapterId: input.chapterId ?? null,
      topicId: input.topicId ?? null,
      relatedName: input.relatedName ?? null,
      enabled: true,
      notificationId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending',
    };

    await this.db.insert(reminders).values(row);
    return row;
  }

  async update(id: string, changes: UpdateReminderInput): Promise<void> {
    const patch: Partial<ReminderRow> = { updatedAt: this.clock.now(), syncStatus: 'pending' };
    if (changes.title !== undefined) patch.title = changes.title.trim();
    if (changes.scheduledAt !== undefined) patch.scheduledAt = changes.scheduledAt;
    if (changes.repeatRule !== undefined) patch.repeatRule = changes.repeatRule;
    if (changes.enabled !== undefined) patch.enabled = changes.enabled;

    await this.db.update(reminders).set(patch).where(eq(reminders.id, id));
  }

  /**
   * Records which platform notification currently backs this reminder.
   *
   * Stored separately from `update` because it is bookkeeping rather than a
   * change the student made — it must not mark the row pending for sync, since
   * a notification id is meaningless on another device.
   */
  async setNotificationId(id: string, notificationId: string | null): Promise<void> {
    await this.db.update(reminders).set({ notificationId }).where(eq(reminders.id, id));
  }

  async softDelete(id: string): Promise<void> {
    const now = this.clock.now();
    await this.db
      .update(reminders)
      .set({ deletedAt: now, updatedAt: now, syncStatus: 'pending' })
      .where(eq(reminders.id, id));
  }

  /**
   * Enabled, undeleted reminders — the set that should hold a scheduled notification.
   *
   * Deliberately spans every tracker. An alarm the student set is an alarm they
   * expect to hear, whether or not that course happens to be the one on screen
   * when it fires.
   */
  async listSchedulable(userId: string): Promise<ReminderRow[]> {
    return this.db
      .select()
      .from(reminders)
      .where(
        and(eq(reminders.userId, userId), isNull(reminders.deletedAt), eq(reminders.enabled, true)),
      )
      .orderBy(asc(reminders.scheduledAt));
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
  async listAllForSync(userId: string): Promise<ReminderRow[]> {
    return this.db.select().from(reminders).where(eq(reminders.userId, userId));
  }

  /** Writes a row that arrived from the server, replacing any local copy. */
  async upsertFromSync(row: Record<string, unknown>): Promise<void> {
    await this.db
      .insert(reminders)
      .values(row as never)
      .onConflictDoUpdate({ target: reminders.id, set: row as never });
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
      .update(reminders)
      .set({ syncStatus: 'synced' })
      .where(inArray(reminders.id, [...ids]));
  }
}
