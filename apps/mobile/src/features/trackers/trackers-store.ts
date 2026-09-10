import { create } from 'zustand';
import type { Repositories } from '../../db/client';
import { ACTIVE_TRACKER } from '../../db/repositories/preferences';
import type { TrackerRow } from '../../db/schema';

export interface TrackersState {
  readonly trackers: readonly TrackerRow[];
  /** The one every screen is showing. Null only before the first load finishes. */
  readonly activeId: string | null;
  readonly loading: boolean;
  readonly error: string | null;
}

export interface TrackersActions {
  load: (userId: string, repositories: Repositories) => Promise<void>;
  select: (trackerId: string) => Promise<void>;
  add: (name: string, templateId?: string | null) => Promise<TrackerRow | null>;
  rename: (trackerId: string, name: string) => Promise<void>;
  remove: (trackerId: string) => Promise<void>;
  clearError: () => void;
}

const initialState: TrackersState = {
  trackers: [],
  activeId: null,
  loading: false,
  error: null,
};

interface Context {
  readonly userId: string;
  readonly repositories: Repositories;
}

let context: Context | null = null;

function requireContext(): Context {
  if (context === null) {
    throw new Error('Trackers used before load() — call load(userId, repositories) first.');
  }
  return context;
}

export const useTrackersStore = create<TrackersState & TrackersActions>((set, get) => ({
  ...initialState,

  /**
   * Loads the trackers and decides which one is showing.
   *
   * Repairs scope first: a student who had a syllabus before trackers existed
   * has rows belonging to none, and they would be invisible everywhere rather
   * than merely in the wrong place.
   */
  async load(userId, repositories) {
    context = { userId, repositories };
    set({ loading: true, error: null });

    try {
      await repositories.trackers.adoptOrphans(userId);
      const trackers = await repositories.trackers.listByUser(userId);

      const stored = await repositories.preferences.get(userId, ACTIVE_TRACKER);
      // A remembered tracker that has since been deleted must not leave the app
      // pointing at nothing.
      const remembered = trackers.find((tracker) => tracker.id === stored);
      const active = remembered ?? trackers[0] ?? null;

      set({ trackers, activeId: active?.id ?? null });
    } catch {
      set({ error: 'We could not open your courses. Try again.' });
    } finally {
      set({ loading: false });
    }
  },

  async select(trackerId) {
    const ctx = requireContext();
    if (get().activeId === trackerId) return;

    set({ activeId: trackerId });
    try {
      await ctx.repositories.preferences.set(ctx.userId, ACTIVE_TRACKER, trackerId);
    } catch {
      // Which tracker is showing is a convenience; failing to remember it across
      // launches is not worth an error in front of the student.
    }
  },

  async add(name, templateId = null) {
    const ctx = requireContext();

    try {
      const tracker = await ctx.repositories.trackers.create({
        userId: ctx.userId,
        name,
        templateId,
      });
      await get().load(ctx.userId, ctx.repositories);
      await get().select(tracker.id);
      return tracker;
    } catch {
      set({ error: 'We could not add that course. Try again.' });
      return null;
    }
  },

  async rename(trackerId, name) {
    const ctx = requireContext();

    try {
      await ctx.repositories.trackers.rename(trackerId, name);
      await get().load(ctx.userId, ctx.repositories);
    } catch {
      set({ error: 'We could not rename that course. Try again.' });
    }
  },

  /**
   * Removes a tracker and everything under it.
   *
   * The last one is kept: an app with no tracker has nowhere to put a subject,
   * and every screen would have to handle a state that only exists for a moment.
   */
  async remove(trackerId) {
    const ctx = requireContext();
    if (get().trackers.length <= 1) {
      set({ error: 'This is your only course. Add another before removing this one.' });
      return;
    }

    try {
      await ctx.repositories.trackers.softDelete(trackerId);
      await get().load(ctx.userId, ctx.repositories);

      // load() has already moved to another course if this was the one showing.
      // Remembering that choice is what stops the next launch from resolving a
      // course that no longer exists all over again.
      const active = get().activeId;
      if (active !== null && active !== trackerId) {
        await ctx.repositories.preferences.set(ctx.userId, ACTIVE_TRACKER, active);
      }
    } catch {
      set({ error: 'We could not remove that course. Try again.' });
    }
  },

  clearError() {
    set({ error: null });
  },
}));

/**
 * Subscribes a screen to the course it is showing.
 *
 * Screens read through `activeTrackerId()`, which is a plain snapshot — so a
 * screen that read before the courses had loaded would sit on an empty result,
 * and switching courses would leave the previous one's syllabus on screen.
 * Depending on this hook makes both re-read.
 */
export function useActiveTrackerId(): string | null {
  return useTrackersStore((state) => state.activeId);
}

/** The tracker every screen is scoped to, or null before the first load. */
export function activeTrackerId(): string | null {
  return useTrackersStore.getState().activeId;
}

/** Test seam: clears the store and its captured context. */
export function resetTrackersStore(): void {
  context = null;
  useTrackersStore.setState({ ...initialState });
}
