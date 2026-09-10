import {
  mergeRow,
  mergeTopic,
  reconcile,
  type SyncableRow,
  type SyncableTopic,
} from '@preppilot/shared';
import type { Repositories } from '../../db/client';
import { fromRemote, toRemote } from './mappers';
import { SYNCED_TABLES, fromIso, type Remote, type SyncedTable } from './remote';

/**
 * The synchronisation engine.
 *
 * Push then pull, one table at a time, parents before children — a chapter
 * arriving before its subject would violate the foreign key on the server.
 *
 * Everything here is driven by data the local database already tracks:
 * `syncStatus` marks what has not been sent, `updatedAt` decides conflicts, and
 * tombstones carry deletions. There is no separate change log to fall out of
 * step with the rows it describes.
 */

export interface SyncResult {
  readonly pushed: number;
  readonly pulled: number;
  readonly conflicts: number;
  /**
   * The newest `updated_at` this pass saw from the server, in epoch
   * milliseconds, or null if it saw no rows.
   *
   * The next pull resumes from here rather than from the device clock. Those are
   * two different clocks: `updated_at` is written by Postgres, so a device whose
   * own clock runs fast would otherwise bookmark a future instant and skip every
   * row written in between — silently, and permanently.
   */
  readonly serverWatermark: number | null;
}

export interface SyncOptions {
  readonly userId: string;
  readonly repositories: Repositories;
  readonly remote: Remote;
  /** Only rows changed at or after this are pulled. Null pulls everything. */
  readonly since: number | null;
  readonly now?: () => number;
}

/** Local row shapes vary by table, so the engine works structurally. */
interface LocalRow extends SyncableRow {
  readonly [column: string]: unknown;
}

type Accessor = {
  readonly all: (userId: string) => Promise<LocalRow[]>;
  readonly upsert: (row: Record<string, unknown>) => Promise<void>;
  readonly markSynced: (ids: readonly string[]) => Promise<void>;
};

/**
 * Runs one synchronisation pass.
 *
 * **Pull and merge before pushing.** Pushing first looks natural — send my work,
 * then collect theirs — but it overwrites the server with a local row that has
 * not yet been reconciled, destroying any change made elsewhere since the last
 * sync. Merging first means what gets pushed is already the agreed version.
 *
 * Failures are not swallowed: the caller decides whether to retry, and a partial
 * pass is safe to repeat because every write is an upsert keyed on a stable id.
 */
export async function synchronise({
  userId,
  repositories,
  remote,
  since,
}: SyncOptions): Promise<SyncResult> {
  let pushed = 0;
  let pulled = 0;
  let conflicts = 0;
  let serverWatermark: number | null = null;

  for (const table of SYNCED_TABLES) {
    const accessor = accessorFor(table, repositories);

    // --- pull and merge ---------------------------------------------------
    const remoteRows = await remote.pull(table, since);

    for (const row of remoteRows) {
      const updatedAt = fromIso(row.updated_at);
      if (updatedAt !== null && (serverWatermark === null || updatedAt > serverWatermark)) {
        serverWatermark = updatedAt;
      }
    }

    if (remoteRows.length > 0) {
      const local = await accessor.all(userId);
      const incoming = remoteRows.map((row) => fromRemote(row) as unknown as LocalRow);
      const { toInsert, conflicts: clashes } = reconcile(local, incoming);

      for (const row of toInsert) {
        await accessor.upsert(row as Record<string, unknown>);
        pulled += 1;
      }

      for (const clash of clashes) {
        const merged =
          // Sub-topics carry completion exactly as topics do, so completion must
          // resolve on its own timestamp for them too — otherwise a rename on one
          // device silently reverts a tick made on another (D14).
          table === 'topics' || table === 'subtopics'
            ? mergeTopic(
                clash.local as unknown as SyncableTopic,
                clash.remote as unknown as SyncableTopic,
              )
            : mergeRow(clash.local, clash.remote);

        // The local copy already won outright; nothing to write.
        if (merged.outcome === 'local') continue;

        conflicts += 1;

        // A row taken whole from the server is in step with it, so it is stored
        // as synced. A merged row exists nowhere yet and must go back, so it
        // stays pending and the push below carries it.
        const resolved = {
          ...(merged.row as unknown as Record<string, unknown>),
          syncStatus: merged.outcome === 'merged' ? 'pending' : 'synced',
        };

        await accessor.upsert(resolved);
        pulled += 1;
      }
    }

    // --- push -------------------------------------------------------------
    // Read after merging, so this sends the agreed version rather than the
    // unreconciled local one.
    const pending = (await accessor.all(userId)).filter((row) => row.syncStatus === 'pending');

    if (pending.length > 0) {
      await remote.push(
        table,
        pending.map((row) => toRemote(row as unknown as Record<string, unknown>)),
      );
      await accessor.markSynced(pending.map((row) => row.id));
      pushed += pending.length;
    }
  }

  return { pushed, pulled, conflicts, serverWatermark };
}

function accessorFor(table: SyncedTable, repositories: Repositories): Accessor {
  switch (table) {
    case 'trackers':
      return {
        all: (userId) => repositories.trackers.listAllForSync(userId) as Promise<LocalRow[]>,
        upsert: (row) => repositories.trackers.upsertFromSync(row),
        markSynced: (ids) => repositories.trackers.markSynced(ids),
      };
    case 'subjects':
      return {
        all: (userId) => repositories.subjects.listAllForSync(userId) as Promise<LocalRow[]>,
        upsert: (row) => repositories.subjects.upsertFromSync(row),
        markSynced: (ids) => repositories.subjects.markSynced(ids),
      };
    case 'chapters':
      return {
        all: (userId) => repositories.chapters.listAllForSync(userId) as Promise<LocalRow[]>,
        upsert: (row) => repositories.chapters.upsertFromSync(row),
        markSynced: (ids) => repositories.chapters.markSynced(ids),
      };
    case 'topics':
      return {
        all: (userId) => repositories.topics.listAllForSync(userId) as Promise<LocalRow[]>,
        upsert: (row) => repositories.topics.upsertFromSync(row),
        markSynced: (ids) => repositories.topics.markSynced(ids),
      };
    case 'subtopics':
      return {
        all: (userId) => repositories.subtopics.listAllForSync(userId) as Promise<LocalRow[]>,
        upsert: (row) => repositories.subtopics.upsertFromSync(row),
        markSynced: (ids) => repositories.subtopics.markSynced(ids),
      };
    case 'flashcards':
      return {
        all: (userId) => repositories.flashcards.listAllForSync(userId) as Promise<LocalRow[]>,
        upsert: (row) => repositories.flashcards.upsertFromSync(row),
        markSynced: (ids) => repositories.flashcards.markSynced(ids),
      };
    case 'study_sessions':
      return {
        all: (userId) => repositories.sessions.listAllForSync(userId) as Promise<LocalRow[]>,
        upsert: (row) => repositories.sessions.upsertFromSync(row),
        markSynced: (ids) => repositories.sessions.markSynced(ids),
      };
    case 'reminders':
      return {
        all: (userId) => repositories.reminders.listAllForSync(userId) as Promise<LocalRow[]>,
        upsert: (row) => repositories.reminders.upsertFromSync(row),
        markSynced: (ids) => repositories.reminders.markSynced(ids),
      };
  }
}
