import { fromIso, toIso, type RemoteRow, type SyncedTable } from './remote';

/**
 * Translation between the local row shape and the remote one.
 *
 * The two schemas mirror each other, but SQLite stores timestamps as epoch
 * milliseconds and booleans as integers while Postgres uses `timestamptz` and
 * `boolean`. Keeping the conversion in one place means a column added to one
 * side fails loudly here rather than silently arriving as the wrong type.
 *
 * `notification_id` and `sync_status` are deliberately local-only: the first
 * identifies a scheduled notification on one device (D45), the second is this
 * device's bookkeeping about what it has sent.
 */

const LOCAL_ONLY = new Set(['syncStatus', 'notificationId']);

/** camelCase to snake_case, matching the column names on both sides. */
function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

/** Columns holding epoch milliseconds locally and timestamptz remotely. */
const TIMESTAMP_COLUMNS = new Set([
  'createdAt',
  'updatedAt',
  'deletedAt',
  'startedAt',
  'endedAt',
  'completedChangedAt',
  'scheduledAt',
  'dueAt',
  'lastReviewedAt',
]);

export function toRemote(row: Record<string, unknown>): RemoteRow {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (LOCAL_ONLY.has(key)) continue;

    if (TIMESTAMP_COLUMNS.has(key)) {
      out[toSnake(key)] = typeof value === 'number' ? toIso(value) : null;
      continue;
    }

    out[toSnake(key)] = value;
  }

  return out as RemoteRow;
}

export function fromRemote(row: RemoteRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    const camel = toCamel(key);

    if (TIMESTAMP_COLUMNS.has(camel)) {
      out[camel] = typeof value === 'string' ? fromIso(value) : null;
      continue;
    }

    // SQLite has no boolean; Drizzle handles the column mode, but a value
    // arriving from Postgres is a real boolean and passes through unchanged.
    out[camel] = value;
  }

  // A row that just arrived is by definition in step with the server.
  out.syncStatus = 'synced';
  return out;
}

/** The local table name for a synced table. They match, but this makes it explicit. */
export function localTableFor(table: SyncedTable): SyncedTable {
  return table;
}
