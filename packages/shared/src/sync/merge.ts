/**
 * Conflict resolution.
 *
 * PRD §22 requires synchronisation to "resolve conflicts deterministically". Two
 * devices editing the same row while offline is not an exotic case — it is the
 * normal one for a student with a phone and a tablet — so the rule has to be
 * stated precisely and be the same on every device.
 *
 * The rule (DECISIONS.md D14, refined by D33):
 *
 *   1. A tombstone wins. Deletion is sticky: a row deleted anywhere stays
 *      deleted, because resurrecting something a student removed is worse than
 *      losing an edit they made to it.
 *   2. Completion resolves on its own timestamp, independently of the rest of
 *      the row, so renaming a topic on one device cannot revert a tick made on
 *      another.
 *   3. A tie on completion resolves to *completed*. If the two clocks genuinely
 *      agree, marking work done is the safer error — silently un-ticking
 *      finished work is the failure a student would never forgive.
 *   4. Everything else is last-write-wins on `updatedAt`, with the local copy
 *      winning an exact tie so a device never churns its own rows.
 */

/** The minimum any synchronised row must expose. */
export interface SyncableRow {
  readonly id: string;
  readonly updatedAt: number;
  readonly deletedAt: number | null;
}

/** A topic additionally resolves its completion separately. */
export interface SyncableTopic extends SyncableRow {
  readonly completed: boolean;
  readonly completedChangedAt: number | null;
}

export type MergeOutcome = 'local' | 'remote' | 'merged';

export interface MergeResult<T> {
  readonly row: T;
  /**
   * Which side supplied the result. `merged` means neither copy was taken whole,
   * so the winner must be pushed back even though it came partly from the remote.
   */
  readonly outcome: MergeOutcome;
}

/**
 * Merges two versions of an ordinary row.
 *
 * @throws {RangeError} if the two rows are not the same record — merging
 * different ids silently would corrupt data in a way nothing downstream could
 * detect.
 */
export function mergeRow<T extends SyncableRow>(local: T, remote: T): MergeResult<T> {
  assertSameRow(local, remote);

  // Deletion is sticky, and the earliest tombstone is the truthful one.
  if (local.deletedAt !== null || remote.deletedAt !== null) {
    const deletedAt = earliestTombstone(local.deletedAt, remote.deletedAt);
    const base = local.deletedAt !== null ? local : remote;
    const outcome: MergeOutcome =
      local.deletedAt !== null && remote.deletedAt !== null
        ? 'merged'
        : local.deletedAt !== null
          ? 'local'
          : 'remote';

    return { row: { ...base, deletedAt }, outcome };
  }

  // Local wins an exact tie, so a device does not churn rows it already agrees with.
  return remote.updatedAt > local.updatedAt
    ? { row: remote, outcome: 'remote' }
    : { row: local, outcome: 'local' };
}

/**
 * Merges two versions of a topic, resolving completion on its own timestamp.
 *
 * The rest of the row still uses last-write-wins, so a rename made after a tick
 * takes the newer name while keeping the tick.
 */
export function mergeTopic<T extends SyncableTopic>(local: T, remote: T): MergeResult<T> {
  assertSameRow(local, remote);

  if (local.deletedAt !== null || remote.deletedAt !== null) {
    return mergeRow(local, remote);
  }

  const base = remote.updatedAt > local.updatedAt ? remote : local;
  const completion = resolveCompletion(local, remote);

  const row = {
    ...base,
    completed: completion.completed,
    completedChangedAt: completion.completedChangedAt,
  };

  // 'merged' whenever the winning row did not already carry the winning
  // completion, because then neither copy is correct on its own.
  const tookWholeSide =
    row.completed === base.completed && row.completedChangedAt === base.completedChangedAt;
  const outcome: MergeOutcome = !tookWholeSide ? 'merged' : base === remote ? 'remote' : 'local';

  return { row, outcome };
}

interface Completion {
  readonly completed: boolean;
  readonly completedChangedAt: number | null;
}

function resolveCompletion(local: SyncableTopic, remote: SyncableTopic): Completion {
  const localAt = local.completedChangedAt;
  const remoteAt = remote.completedChangedAt;

  // Neither side has ever changed completion.
  if (localAt === null && remoteAt === null) {
    // They should agree, but if they do not, completed is the safer answer.
    const completed = local.completed || remote.completed;
    return { completed, completedChangedAt: null };
  }

  if (localAt === null) return { completed: remote.completed, completedChangedAt: remoteAt };
  if (remoteAt === null) return { completed: local.completed, completedChangedAt: localAt };

  if (remoteAt > localAt) return { completed: remote.completed, completedChangedAt: remoteAt };
  if (localAt > remoteAt) return { completed: local.completed, completedChangedAt: localAt };

  // Same instant on both clocks: completed wins. Un-ticking finished work is the
  // failure a student would never forgive.
  return { completed: local.completed || remote.completed, completedChangedAt: localAt };
}

function earliestTombstone(a: number | null, b: number | null): number {
  if (a === null) return b as number;
  if (b === null) return a;
  return Math.min(a, b);
}

function assertSameRow(local: { id: string }, remote: { id: string }): void {
  if (local.id !== remote.id) {
    throw new RangeError(`cannot merge different rows: ${local.id} and ${remote.id}`);
  }
}

/**
 * Splits remote rows into those that are new locally and those that conflict.
 *
 * Matching is by id, which is why identifiers are client-generated and stable
 * (D13): without that, the same record created offline would arrive as a
 * duplicate rather than a conflict, which PRD §22 explicitly forbids.
 */
export interface Reconciliation<T> {
  readonly toInsert: readonly T[];
  readonly conflicts: readonly { readonly local: T; readonly remote: T }[];
}

export function reconcile<T extends SyncableRow>(
  localRows: readonly T[],
  remoteRows: readonly T[],
): Reconciliation<T> {
  const byId = new Map(localRows.map((row) => [row.id, row]));

  const toInsert: T[] = [];
  const conflicts: { local: T; remote: T }[] = [];

  for (const remote of remoteRows) {
    const local = byId.get(remote.id);
    if (local === undefined) {
      toInsert.push(remote);
    } else {
      conflicts.push({ local, remote });
    }
  }

  return { toInsert, conflicts };
}
