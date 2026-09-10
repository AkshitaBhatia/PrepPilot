import { nextOccurrence, type RepeatRule } from '@preppilot/shared';
import { create } from 'zustand';
import type { Repositories } from '../../db/client';
import type { ReminderRow } from '../../db/schema';
import * as notifications from './notifications';
import { activeTrackerId } from '../trackers/trackers-store';

export interface RemindersState {
  readonly reminders: readonly ReminderRow[];
  readonly loading: boolean;
  readonly error: string | null;
  /**
   * Null until permission has been checked. Distinguishing "unknown" from
   * "denied" stops the screen warning about something not yet asked.
   */
  readonly permissionGranted: boolean | null;
}

export interface CreateReminderRequest {
  readonly title: string;
  readonly scheduledAt: number;
  readonly repeatRule: RepeatRule;
  readonly subjectId?: string | null;
  readonly relatedName?: string | null;
}

export interface RemindersActions {
  load: (userId: string, repositories: Repositories) => Promise<void>;
  requestPermission: () => Promise<void>;
  addReminder: (request: CreateReminderRequest) => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  clearError: () => void;
}

const initialState: RemindersState = {
  reminders: [],
  loading: false,
  error: null,
  permissionGranted: null,
};

interface Context {
  readonly userId: string;
  readonly repositories: Repositories;
}

let context: Context | null = null;

function requireContext(): Context {
  if (context === null) {
    throw new Error('Reminders used before load() — call load(userId, repositories) first.');
  }
  return context;
}

/** What the notification actually says when it arrives. */
function describeBody(reminder: ReminderRow): string {
  return reminder.relatedName === null
    ? 'Time to study.'
    : `Time to study ${reminder.relatedName}.`;
}

export const useRemindersStore = create<RemindersState & RemindersActions>((set, get) => {
  const refresh = async () => {
    const ctx = requireContext();
    set({ reminders: await ctx.repositories.reminders.listByUser(ctx.userId, activeTrackerId()) });
  };

  /**
   * Cancels any notification the reminder holds, then schedules a new one if it
   * is enabled and still has an occurrence ahead of it.
   *
   * Doing both here keeps the platform's scheduled set matching the database:
   * scheduling without cancelling first is how a student ends up with duplicate
   * alerts after editing a reminder.
   */
  const reschedule = async (reminder: ReminderRow) => {
    const ctx = requireContext();

    if (reminder.notificationId !== null) {
      await notifications.cancel(reminder.notificationId);
      await ctx.repositories.reminders.setNotificationId(reminder.id, null);
    }

    if (!reminder.enabled) return;
    if (
      nextOccurrence(
        { scheduledAt: reminder.scheduledAt, repeat: reminder.repeatRule },
        Date.now(),
      ) === null
    ) {
      return;
    }

    const notificationId = await notifications.schedule({
      id: reminder.id,
      title: reminder.title,
      body: describeBody(reminder),
      fireAt: reminder.scheduledAt,
      repeat: reminder.repeatRule,
    });

    if (notificationId !== null) {
      await ctx.repositories.reminders.setNotificationId(reminder.id, notificationId);
    }
  };

  return {
    ...initialState,

    async load(userId, repositories) {
      context = { userId, repositories };
      set({ loading: true, error: null });

      try {
        await notifications.ensureAndroidChannel();
        await refresh();

        // Re-arm anything the OS may have dropped, and advance the reminders
        // whose repeat rule the platform cannot express on its own.
        for (const reminder of get().reminders) {
          if (reminder.enabled && reminder.repeatRule === 'weekdays') {
            await reschedule(reminder);
          }
        }
      } catch {
        set({ error: 'We could not load your reminders. Pull down to try again.' });
      } finally {
        set({ loading: false });
      }
    },

    async requestPermission() {
      set({ permissionGranted: await notifications.requestPermission() });
    },

    async addReminder(request) {
      const ctx = requireContext();

      try {
        const reminder = await ctx.repositories.reminders.create({
          userId: ctx.userId,
          trackerId: activeTrackerId(),
          title: request.title,
          scheduledAt: request.scheduledAt,
          repeatRule: request.repeatRule,
          subjectId: request.subjectId ?? null,
          relatedName: request.relatedName ?? null,
        });

        await reschedule(reminder);
        await refresh();
      } catch {
        set({ error: 'We could not save that reminder. Try again.' });
      }
    },

    async setEnabled(id, enabled) {
      const ctx = requireContext();

      try {
        await ctx.repositories.reminders.update(id, { enabled });
        const updated = await ctx.repositories.reminders.findById(id);
        if (updated !== null) await reschedule(updated);
        await refresh();
      } catch {
        set({ error: 'We could not update that reminder. Try again.' });
      }
    },

    async deleteReminder(id) {
      const ctx = requireContext();

      try {
        const existing = await ctx.repositories.reminders.findById(id);
        // Cancel before deleting, or the notification outlives its reminder and
        // fires for something the student can no longer see.
        if (existing?.notificationId != null) await notifications.cancel(existing.notificationId);

        await ctx.repositories.reminders.softDelete(id);
        await refresh();
      } catch {
        set({ error: 'We could not delete that reminder. Try again.' });
      }
    },

    clearError() {
      set({ error: null });
    },
  };
});

/** Test seam: clears the store and its captured context. */
export function resetRemindersStore(): void {
  context = null;
  useRemindersStore.setState({ ...initialState });
}
