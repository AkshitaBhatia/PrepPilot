import { totalSeconds } from '@preppilot/shared';
import { create } from 'zustand';
import type { Repositories } from '../../db/client';
import type { StudySessionRow } from '../../db/schema';
import { activeTrackerId } from '../trackers/trackers-store';

export interface HistoryState {
  readonly sessions: readonly StudySessionRow[];
  readonly totalSeconds: number;
  readonly loading: boolean;
  readonly error: string | null;
}

export interface HistoryActions {
  load: (userId: string, repositories: Repositories) => Promise<void>;
  /**
   * Removes a session from the history.
   *
   * Tombstoned, not erased, so the deletion reaches other devices. It reduces
   * total study time, which is why the screen confirms first: the figure is
   * something a student has watched grow.
   */
  deleteSession: (id: string) => Promise<void>;
}

const initialState: HistoryState = {
  sessions: [],
  totalSeconds: 0,
  loading: false,
  error: null,
};

interface Context {
  readonly userId: string;
  readonly repositories: Repositories;
}

let context: Context | null = null;

export const useHistoryStore = create<HistoryState & HistoryActions>((set, get) => ({
  ...initialState,

  async load(userId, repositories) {
    context = { userId, repositories };
    set({ loading: true, error: null });

    try {
      const sessions = await repositories.sessions.listByUser(userId, 200, activeTrackerId());
      // A running session has no final duration, so it is not history yet.
      const settled = sessions.filter((session) => session.status !== 'running');

      set({ sessions: settled, totalSeconds: totalSeconds(settled) });
    } catch {
      set({ error: 'We could not load your study history. Pull down to try again.' });
    } finally {
      set({ loading: false });
    }
  },

  async deleteSession(id) {
    if (context === null) return;

    try {
      await context.repositories.sessions.softDelete(id);

      const remaining = get().sessions.filter((session) => session.id !== id);
      set({ sessions: remaining, totalSeconds: totalSeconds(remaining) });
    } catch {
      set({ error: 'We could not delete that session. Try again.' });
    }
  },
}));

/** Test seam: returns the store to its initial state. */
export function resetHistoryStore(): void {
  context = null;
  useHistoryStore.setState({ ...initialState });
}
