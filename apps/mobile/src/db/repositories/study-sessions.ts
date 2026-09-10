import { uuidV7, type TimerMode } from '@preppilot/shared';
import { and, desc, eq, inArray, isNull, sum } from 'drizzle-orm';
import { studySessions, type SessionStatus, type StudySessionRow } from '../schema';
import { systemClock, type Clock, type Database } from '../types';
import { scopedToTracker } from './tracker-scope';

export interface StartSessionInput {
  /** The tracker this belongs to. Everything a student owns lives in one. */
  readonly trackerId?: string | null;
  readonly userId: string;
  readonly timerMode: TimerMode;
  readonly subjectId?: string | null;
  readonly chapterId?: string | null;
  readonly topicId?: string | null;
  /** Names as the student saw them, kept so history survives a later rename. */
  readonly subjectName?: string | null;
  readonly chapterName?: string | null;
  readonly topicName?: string | null;
}

/**
 * Study session storage.
 *
 * A session row is written the moment the timer starts, then updated by
 * heartbeats while it runs. Writing only on stop would lose the entire sitting
 * if the app were killed, which is the case this design exists to survive.
 */
export class StudySessionRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async start(input: StartSessionInput): Promise<StudySessionRow> {
    const now = this.clock.now();
    const row: StudySessionRow = {
      id: uuidV7(),
      userId: input.userId,
      trackerId: input.trackerId ?? null,
      subjectId: input.subjectId ?? null,
      chapterId: input.chapterId ?? null,
      topicId: input.topicId ?? null,
      subjectName: input.subjectName ?? null,
      chapterName: input.chapterName ?? null,
      topicName: input.topicName ?? null,
      startedAt: now,
      endedAt: null,
      durationSeconds: 0,
      timerMode: input.timerMode,
      status: 'running',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending',
    };

    await this.db.insert(studySessions).values(row);
    return row;
  }

  /**
   * Records progress on a live session without ending it.
   *
   * Called periodically while the timer runs, so a crash costs at most one
   * heartbeat interval rather than the whole session.
   */
  async heartbeat(id: string, durationSeconds: number, status: SessionStatus): Promise<void> {
    await this.db
      .update(studySessions)
      .set({
        durationSeconds: Math.max(0, Math.floor(durationSeconds)),
        status,
        updatedAt: this.clock.now(),
        syncStatus: 'pending',
      })
      .where(eq(studySessions.id, id));
  }

  async complete(id: string, durationSeconds: number): Promise<void> {
    const now = this.clock.now();
    await this.db
      .update(studySessions)
      .set({
        durationSeconds: Math.max(0, Math.floor(durationSeconds)),
        endedAt: now,
        status: 'completed',
        updatedAt: now,
        syncStatus: 'pending',
      })
      .where(eq(studySessions.id, id));
  }

  async findById(id: string): Promise<StudySessionRow | null> {
    const rows = await this.db
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.id, id), isNull(studySessions.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  /** History, newest first. Scoped to one tracker — see {@link scopedToTracker}. */
  async listByUser(
    userId: string,
    limit = 100,
    trackerId?: string | null,
  ): Promise<StudySessionRow[]> {
    return this.db
      .select()
      .from(studySessions)
      .where(
        and(
          eq(studySessions.userId, userId),
          isNull(studySessions.deletedAt),
          ...scopedToTracker(studySessions.trackerId, trackerId),
        ),
      )
      .orderBy(desc(studySessions.startedAt))
      .limit(limit);
  }

  /**
   * Total recorded study time in seconds.
   *
   * Counts completed *and* abandoned sessions: a student who studied for an hour
   * before the app crashed did the work, and "total time studied using PrepPilot"
   * (PRD §12) would be a lie if it silently dropped that. Sessions still running
   * are excluded, because their duration is not yet final.
   */
  async totalSecondsForUser(userId: string, trackerId?: string | null): Promise<number> {
    const [row] = await this.db
      .select({ total: sum(studySessions.durationSeconds) })
      .from(studySessions)
      .where(
        and(
          eq(studySessions.userId, userId),
          isNull(studySessions.deletedAt),
          ...scopedToTracker(studySessions.trackerId, trackerId),
        ),
      );

    // SUM returns null over an empty set, and a string on some drivers.
    return Number(row?.total ?? 0);
  }

  async listBySubject(subjectId: string, limit = 100): Promise<StudySessionRow[]> {
    return this.db
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.subjectId, subjectId), isNull(studySessions.deletedAt)))
      .orderBy(desc(studySessions.startedAt))
      .limit(limit);
  }

  /**
   * Closes out sessions left running by a previous launch.
   *
   * The app was killed mid-session, so no accurate end time exists. The last
   * heartbeat's duration is kept and the session is marked `abandoned` rather
   * than `completed`, so history stays honest about what happened.
   *
   * @returns how many sessions were recovered.
   */
  async abandonInterrupted(userId: string): Promise<number> {
    const stale = await this.db
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.userId, userId), eq(studySessions.status, 'running')));

    if (stale.length === 0) return 0;

    const now = this.clock.now();
    for (const session of stale) {
      await this.db
        .update(studySessions)
        .set({
          status: 'abandoned',
          // Derived from the last heartbeat, not from now: the intervening time
          // was spent with the app closed, not studying.
          endedAt: session.startedAt + session.durationSeconds * 1000,
          updatedAt: now,
          syncStatus: 'pending',
        })
        .where(eq(studySessions.id, session.id));
    }

    return stale.length;
  }

  async softDelete(id: string): Promise<void> {
    const now = this.clock.now();
    await this.db
      .update(studySessions)
      .set({ deletedAt: now, updatedAt: now, syncStatus: 'pending' })
      .where(eq(studySessions.id, id));
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
  async listAllForSync(userId: string): Promise<StudySessionRow[]> {
    return this.db.select().from(studySessions).where(eq(studySessions.userId, userId));
  }

  /** Writes a row that arrived from the server, replacing any local copy. */
  async upsertFromSync(row: Record<string, unknown>): Promise<void> {
    await this.db
      .insert(studySessions)
      .values(row as never)
      .onConflictDoUpdate({ target: studySessions.id, set: row as never });
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
      .update(studySessions)
      .set({ syncStatus: 'synced' })
      .where(inArray(studySessions.id, [...ids]));
  }
}
