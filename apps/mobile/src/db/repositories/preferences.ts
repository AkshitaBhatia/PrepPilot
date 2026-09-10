import { uuidV7 } from '@preppilot/shared';
import { and, eq } from 'drizzle-orm';
import { preferences } from '../schema';
import { systemClock, type Clock, type Database } from '../types';

/**
 * Local key/value settings.
 *
 * Deliberately not synchronised: these describe this device's state — the last
 * time it reached the server, for instance — and copying that between devices
 * would make each one act on the other's progress.
 */
export class PreferenceRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async get(userId: string, key: string): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(preferences)
      .where(and(eq(preferences.userId, userId), eq(preferences.key, key)))
      .limit(1);

    return rows[0]?.value ?? null;
  }

  async set(userId: string, key: string, value: string): Promise<void> {
    const now = this.clock.now();

    await this.db
      .insert(preferences)
      .values({ id: uuidV7(), userId, key, value, updatedAt: now, syncStatus: 'synced' })
      .onConflictDoUpdate({
        // The unique index is on (user_id, key), so a repeated set updates.
        target: [preferences.userId, preferences.key],
        set: { value, updatedAt: now },
      });
  }
}

/** The watermark: when this device last completed a sync. */
export const LAST_SYNCED_AT = 'sync.lastSyncedAt';

/** Which tracker the student is currently looking at. */
export const ACTIVE_TRACKER = 'tracker.active';
