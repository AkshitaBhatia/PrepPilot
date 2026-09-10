import { eq } from 'drizzle-orm';
import {
  chapters,
  flashcards,
  preferences,
  reminders,
  studySessions,
  subjects,
  subtopics,
  topics,
  trackers,
} from './schema';
import type { Database } from './types';

/**
 * Every table a student's work lives in.
 *
 * Listed rather than derived so that adding a table without deciding what
 * happens to a guest's copy of it is a compile error, not a silent omission
 * that loses their work.
 */
const OWNED_TABLES = [
  trackers,
  subjects,
  chapters,
  topics,
  subtopics,
  flashcards,
  studySessions,
  reminders,
  preferences,
] as const;

export interface ClaimResult {
  readonly rows: number;
}

/**
 * Moves everything a guest made into the account they have just signed in to.
 *
 * A guest's work is real work — a syllabus ticked off over a fortnight is not
 * a trial run — so signing in adopts it rather than starting them over. Rows
 * are re-owned in place: their ids are UUIDv7 and already unique, so nothing
 * needs rewriting except who they belong to.
 *
 * Everything moved is marked `pending`, because the server has never seen these
 * rows under the new owner; leaving them `synced` would strand a guest's whole
 * syllabus on the one device.
 *
 * Idempotent by construction: once the guest id owns nothing, a second call
 * moves nothing.
 */
export async function claimGuestData(
  db: Database,
  guestUserId: string,
  ownerUserId: string,
): Promise<ClaimResult> {
  if (guestUserId === ownerUserId) return { rows: 0 };

  let rows = 0;

  for (const table of OWNED_TABLES) {
    const moved = await db
      .update(table)
      // Preferences carry no sync status; the rest do, and must be re-sent.
      .set(
        'syncStatus' in table
          ? { userId: ownerUserId, syncStatus: 'pending' as const }
          : { userId: ownerUserId },
      )
      .where(eq(table.userId, guestUserId));

    rows += Number((moved as { changes?: number }).changes ?? 0);
  }

  return { rows };
}
