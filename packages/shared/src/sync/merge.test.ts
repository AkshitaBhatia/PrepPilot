import { describe, expect, it } from 'vitest';
import { mergeRow, mergeTopic, reconcile, type SyncableRow, type SyncableTopic } from './merge';

const T = 1_700_000_000_000;

const row = (over: Partial<SyncableRow> = {}): SyncableRow => ({
  id: 'r1',
  updatedAt: T,
  deletedAt: null,
  ...over,
});

const topic = (over: Partial<SyncableTopic> = {}): SyncableTopic => ({
  id: 't1',
  updatedAt: T,
  deletedAt: null,
  completed: false,
  completedChangedAt: null,
  ...over,
});

describe('mergeRow', () => {
  it('takes the newer side', () => {
    const result = mergeRow(row({ updatedAt: T }), row({ updatedAt: T + 1000 }));

    expect(result.outcome).toBe('remote');
    expect(result.row.updatedAt).toBe(T + 1000);
  });

  it('takes the local side when it is newer', () => {
    expect(mergeRow(row({ updatedAt: T + 1000 }), row({ updatedAt: T })).outcome).toBe('local');
  });

  /** A device that churned its own rows on every tie would sync forever. */
  it('keeps the local copy on an exact tie', () => {
    expect(mergeRow(row({ updatedAt: T }), row({ updatedAt: T })).outcome).toBe('local');
  });

  describe('tombstones', () => {
    /**
     * Deletion is sticky. Resurrecting something a student deleted is worse than
     * losing an edit they made to it.
     */
    it('wins over a newer edit on the other side', () => {
      const deletedLocally = row({ updatedAt: T, deletedAt: T });
      const editedRemotely = row({ updatedAt: T + 60_000 });

      expect(mergeRow(deletedLocally, editedRemotely).row.deletedAt).toBe(T);
    });

    it('wins whichever side holds it', () => {
      const result = mergeRow(row({ updatedAt: T + 60_000 }), row({ updatedAt: T, deletedAt: T }));

      expect(result.row.deletedAt).toBe(T);
      expect(result.outcome).toBe('remote');
    });

    it('keeps the earliest tombstone when both sides deleted', () => {
      const result = mergeRow(row({ deletedAt: T + 5000 }), row({ deletedAt: T }));

      expect(result.row.deletedAt).toBe(T);
      expect(result.outcome).toBe('merged');
    });
  });

  it('refuses to merge two different records', () => {
    expect(() => mergeRow(row({ id: 'a' }), row({ id: 'b' }))).toThrow(RangeError);
  });
});

describe('mergeTopic', () => {
  /**
   * The case the separate timestamp exists for: renaming on one device must not
   * revert a tick made on another.
   */
  it('keeps a remote tick alongside a newer local rename', () => {
    const renamedLocally = topic({ updatedAt: T + 60_000, completed: false });
    const tickedRemotely = topic({
      updatedAt: T + 1000,
      completed: true,
      completedChangedAt: T + 1000,
    });

    const result = mergeTopic(renamedLocally, tickedRemotely);

    expect(result.row.completed).toBe(true);
    expect(result.row.updatedAt).toBe(T + 60_000);
    expect(result.outcome).toBe('merged');
  });

  it('keeps a local tick alongside a newer remote rename', () => {
    const tickedLocally = topic({ updatedAt: T, completed: true, completedChangedAt: T });
    const renamedRemotely = topic({ updatedAt: T + 60_000, completed: false });

    expect(mergeTopic(tickedLocally, renamedRemotely).row.completed).toBe(true);
  });

  it('takes the more recent completion change', () => {
    const ticked = topic({ completed: true, completedChangedAt: T });
    const untickedLater = topic({ completed: false, completedChangedAt: T + 5000 });

    expect(mergeTopic(ticked, untickedLater).row.completed).toBe(false);
  });

  it('respects an un-tick that is genuinely newer, in either direction', () => {
    const untickedLater = topic({ completed: false, completedChangedAt: T + 5000 });
    const ticked = topic({ completed: true, completedChangedAt: T });

    expect(mergeTopic(untickedLater, ticked).row.completed).toBe(false);
  });

  /**
   * If both clocks genuinely agree, marking work done is the safer error.
   * Silently un-ticking finished work is the failure a student would never
   * forgive.
   */
  it('resolves a dead-heat toward completed', () => {
    const ticked = topic({ completed: true, completedChangedAt: T });
    const unticked = topic({ completed: false, completedChangedAt: T });

    expect(mergeTopic(ticked, unticked).row.completed).toBe(true);
    expect(mergeTopic(unticked, ticked).row.completed).toBe(true);
  });

  it('takes the side that has touched completion when the other never has', () => {
    const untouched = topic({ completed: false, completedChangedAt: null });
    const ticked = topic({ completed: true, completedChangedAt: T + 1000 });

    expect(mergeTopic(untouched, ticked).row.completed).toBe(true);
    expect(mergeTopic(ticked, untouched).row.completed).toBe(true);
  });

  it('reports a whole side when nothing had to be combined', () => {
    const older = topic({ updatedAt: T });
    const newer = topic({ updatedAt: T + 1000 });

    expect(mergeTopic(older, newer).outcome).toBe('remote');
  });

  it('still lets a tombstone win', () => {
    const deleted = topic({ deletedAt: T });
    const tickedLater = topic({
      updatedAt: T + 60_000,
      completed: true,
      completedChangedAt: T + 60_000,
    });

    expect(mergeTopic(deleted, tickedLater).row.deletedAt).toBe(T);
  });

  it('refuses to merge two different topics', () => {
    expect(() => mergeTopic(topic({ id: 'a' }), topic({ id: 'b' }))).toThrow(RangeError);
  });
});

describe('reconcile', () => {
  it('separates unseen rows from conflicts', () => {
    const local = [row({ id: 'a' }), row({ id: 'b' })];
    const remote = [row({ id: 'b' }), row({ id: 'c' })];

    const result = reconcile(local, remote);

    expect(result.toInsert.map((r) => r.id)).toEqual(['c']);
    expect(result.conflicts.map((c) => c.remote.id)).toEqual(['b']);
  });

  /**
   * Matching by id is why identifiers are client-generated and stable: without
   * it the same record created offline would arrive as a duplicate rather than a
   * conflict, which PRD §22 forbids.
   */
  it('treats a row with a known id as a conflict, never a duplicate', () => {
    const shared = row({ id: 'same' });

    expect(reconcile([shared], [row({ id: 'same', updatedAt: T + 1 })]).toInsert).toEqual([]);
  });

  it('handles an empty local set', () => {
    expect(reconcile([], [row({ id: 'a' })]).toInsert).toHaveLength(1);
  });

  it('handles an empty remote set', () => {
    const result = reconcile([row({ id: 'a' })], []);

    expect(result.toInsert).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });
});
