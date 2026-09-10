import { nextOccurrence } from '@preppilot/shared';
import type { ScheduleRequest } from './notifications';

/**
 * Reminders in a browser.
 *
 * expo-notifications cannot schedule on web — there is no OS scheduler to hand
 * the request to — so a reminder set in the web demo previously did nothing at
 * all while appearing to have been set.
 *
 * This delivers them the only way a page can: a timer held in the tab, firing
 * the browser's own Notification. That is a real limitation, not a hidden one —
 * it stops when the tab closes, and the reminders screen says so rather than
 * letting a student trust an alarm that will not sound.
 *
 * The module mirrors the native one's shape exactly, so nothing above it knows
 * which platform it is on. Metro picks this file for web builds.
 */

/** Timers for reminders waiting to fire, keyed by the id handed back to the caller. */
const pending = new Map<string, ReturnType<typeof setTimeout>>();

let nextId = 0;

/** setTimeout saturates above ~24.8 days, firing immediately instead of never. */
const MAX_TIMEOUT_MS = 2_147_483_647;

function notificationApi(): typeof Notification | null {
  return typeof window !== 'undefined' && 'Notification' in window ? window.Notification : null;
}

/** Foreground behaviour is the browser's own; there is nothing to configure. */
export function configureNotificationHandler(): void {}

export async function requestPermission(): Promise<boolean> {
  const api = notificationApi();
  if (api === null) return false;

  try {
    if (api.permission === 'granted') return true;
    if (api.permission === 'denied') return false;
    return (await api.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** Android-only concept; nothing to do here. */
export async function ensureAndroidChannel(): Promise<void> {}

export async function schedule(request: ScheduleRequest): Promise<string | null> {
  const api = notificationApi();
  if (api === null || api.permission !== 'granted') return null;

  const fireAt = nextOccurrence(
    { scheduledAt: request.fireAt, repeat: request.repeat },
    Date.now(),
  );
  if (fireAt === null) return null;

  const delay = fireAt - Date.now();
  if (delay > MAX_TIMEOUT_MS) return null;

  const id = `web-${(nextId += 1)}`;
  const timer = setTimeout(
    () => {
      pending.delete(id);
      try {
        new api(request.title, { body: request.body, tag: request.id });
      } catch {
        // A browser can refuse at delivery time; nothing useful to do about it.
      }
    },
    Math.max(0, delay),
  );

  pending.set(id, timer);
  return id;
}

export async function cancel(notificationId: string): Promise<void> {
  const timer = pending.get(notificationId);
  if (timer === undefined) return;

  clearTimeout(timer);
  pending.delete(notificationId);
}

/**
 * Whether a reminder set here will survive the student closing the tab.
 *
 * The reminders screen asks so it can say so. Native returns true; there is no
 * such export on the native module because nothing needs to ask it.
 */
export const remindersSurviveClosing = false;

/** Test seam: forgets every pending timer without firing it. */
export function resetWebNotifications(): void {
  for (const timer of pending.values()) clearTimeout(timer);
  pending.clear();
}
