import type { Remote, RemoteRow, SyncedTable } from '../remote';

/**
 * An in-memory stand-in for the server.
 *
 * Behaves the way PostgREST does for the operations the engine uses: upsert
 * replaces by primary key, and a pull filters on `updated_at`. That is enough to
 * exercise conflict resolution, tombstone propagation and duplicate avoidance
 * without a network.
 */
export function createFakeRemote() {
  const tables = new Map<SyncedTable, Map<string, RemoteRow>>();
  const failures = new Map<SyncedTable, string>();

  const tableOf = (table: SyncedTable) => {
    let rows = tables.get(table);
    if (rows === undefined) {
      rows = new Map();
      tables.set(table, rows);
    }
    return rows;
  };

  const remote: Remote = {
    async pull(table, since) {
      const failure = failures.get(table);
      if (failure !== undefined) throw new Error(failure);

      const rows = [...tableOf(table).values()];
      if (since === null) return rows;

      return rows.filter((row) => Date.parse(row.updated_at) >= since);
    },

    async push(table, rows) {
      const failure = failures.get(table);
      if (failure !== undefined) throw new Error(failure);

      const target = tableOf(table);
      for (const row of rows) target.set(row.id, row);
    },
  };

  return {
    remote,
    /** Seeds a row as though another device had already pushed it. */
    seed(table: SyncedTable, row: RemoteRow) {
      tableOf(table).set(row.id, row);
    },
    rows(table: SyncedTable): RemoteRow[] {
      return [...tableOf(table).values()];
    },
    failOn(table: SyncedTable, message: string) {
      failures.set(table, message);
    },
    clearFailures() {
      failures.clear();
    },
  };
}
