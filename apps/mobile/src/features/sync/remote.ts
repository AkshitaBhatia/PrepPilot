/**
 * The remote side of synchronisation.
 *
 * Defined as an interface so the engine can be tested against an in-memory
 * implementation. The Supabase adapter below is the only place that knows about
 * PostgREST; everything above it works in terms of plain rows.
 */

/** Tables that synchronise, in dependency order — parents before children. */
export const SYNCED_TABLES = [
  // Trackers own everything else, so they must land before the rows that
  // reference them — otherwise a pulled subject points at a course this device
  // has not heard of yet.
  'trackers',
  'subjects',
  'chapters',
  'topics',
  'subtopics',
  'flashcards',
  'study_sessions',
  'reminders',
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

export interface RemoteRow {
  readonly id: string;
  readonly user_id: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly [column: string]: unknown;
}

export interface Remote {
  /** Rows changed at or after `since`. Null pulls everything. */
  pull: (table: SyncedTable, since: number | null) => Promise<RemoteRow[]>;
  /** Inserts or updates by primary key. */
  push: (table: SyncedTable, rows: readonly RemoteRow[]) => Promise<void>;
}

/** Epoch milliseconds to the ISO form PostgREST expects. */
export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** ISO timestamp back to epoch milliseconds, tolerating null. */
export function fromIso(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
