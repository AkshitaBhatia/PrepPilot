import { create } from 'zustand';
import { getRepositories, type Repositories } from '../../db/client';
import { LAST_SYNCED_AT } from '../../db/repositories/preferences';
import { isDemoMode } from '../../config/env';
import { useNetworkStore } from '../network/network-store';
import { createSupabaseRemote } from './supabase-remote';
import { synchronise, type SyncResult } from './sync-engine';
import type { Remote } from './remote';

export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface SyncState {
  readonly status: SyncStatus;
  /** When this device last completed a sync, in epoch milliseconds. */
  readonly lastSyncedAt: number | null;
  /** A student-facing message, never a raw transport error. */
  readonly error: string | null;
  readonly lastResult: SyncResult | null;
}

export interface SyncActions {
  /** Loads the stored watermark. Called once after sign-in. */
  hydrate: (userId: string, repositories?: Repositories) => Promise<void>;
  syncNow: (
    userId: string,
    options?: { remote?: Remote; repositories?: Repositories },
  ) => Promise<void>;
  clearError: () => void;
}

const initialState: SyncState = {
  status: 'idle',
  lastSyncedAt: null,
  error: null,
  lastResult: null,
};

/**
 * Overlap between the watermark and what is pulled.
 *
 * Clocks differ between a device and the server, and a row written a moment
 * before the last sync finished can carry a timestamp just before the watermark.
 * Re-pulling a minute of already-seen rows is cheap; missing one is not, and
 * every write is an idempotent upsert so the overlap costs nothing.
 */
const WATERMARK_OVERLAP_MS = 60_000;

export const useSyncStore = create<SyncState & SyncActions>((set, get) => ({
  ...initialState,

  async hydrate(userId, repositories = getRepositories()) {
    try {
      const stored = await repositories.preferences.get(userId, LAST_SYNCED_AT);
      const parsed = stored === null ? null : Number.parseInt(stored, 10);
      set({ lastSyncedAt: Number.isFinite(parsed) ? parsed : null });
    } catch {
      // A missing watermark just means the next sync pulls everything.
      set({ lastSyncedAt: null });
    }
  },

  async syncNow(userId, options = {}) {
    // Demo mode has no server to reach, and the client would fail to construct.
    if (isDemoMode() || get().status === 'syncing') return;

    // A sync attempted while offline can only fail, and failing loudly on every
    // launch in a tunnel would train a student to ignore the message. The
    // reconnect watcher retries this as soon as there is a connection.
    const network = useNetworkStore.getState();
    if (network.known && !network.online) {
      set({ status: 'idle', error: null });
      return;
    }

    const repositories = options.repositories ?? getRepositories();
    set({ status: 'syncing', error: null });

    try {
      const remote = options.remote ?? createSupabaseRemote();
      const since = get().lastSyncedAt;

      const result = await synchronise({
        userId,
        repositories,
        remote,
        since: since === null ? null : since - WATERMARK_OVERLAP_MS,
      });

      // The watermark advances only on success, so a failed pass is retried in
      // full rather than skipping whatever it did not reach.
      //
      // It comes from the newest row the server returned, not from this device's
      // clock. The two disagree — `updated_at` is written by Postgres — and a
      // device running fast would bookmark an instant the server has not reached
      // yet, then never pull anything written in between. Where the pass saw no
      // rows there is nothing to move past, so the previous mark stands.
      const advanced = result.serverWatermark ?? get().lastSyncedAt;
      if (advanced !== null) {
        await repositories.preferences.set(userId, LAST_SYNCED_AT, String(advanced));
      }

      set({ status: 'idle', lastSyncedAt: advanced, lastResult: result });
    } catch (error) {
      set({ status: 'error', error: describeSyncFailure(error) });
    }
  },

  clearError() {
    set({ error: null, status: 'idle' });
  },
}));

/** Maps a transport failure to something a student can act on. */
export function describeSyncFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/network|fetch|offline|unreachable/i.test(message)) {
    return 'PrepPilot could not reach the server. Your work is saved on this device and will sync when you are back online.';
  }
  if (/jwt|token|unauthor/i.test(message)) {
    return 'Your session expired. Sign in again to keep syncing.';
  }

  return 'We could not sync just now. Your work is saved on this device.';
}

/** Test seam: returns the store to its initial state. */
export function resetSyncStore(): void {
  useSyncStore.setState({ ...initialState });
}
