import { eq, isNull, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

/**
 * Narrows a query to one tracker.
 *
 * Spreads into an `and(...)`: omitting `trackerId` contributes nothing and so
 * returns everything the student owns across every tracker, which is what sync
 * and the orphan repair need — but never what a screen wants, because two
 * exams' rows interleaved belong to neither.
 *
 * The null branch matters: `= NULL` is never true in SQL, so rows written
 * before trackers existed need `IS NULL`. Comparing instead hides every row
 * rather than filtering them, and an empty screen reads as lost work.
 */
export function scopedToTracker(column: SQLiteColumn, trackerId: string | null | undefined): SQL[] {
  if (trackerId === undefined) return [];
  return [trackerId === null ? isNull(column) : eq(column, trackerId)];
}
