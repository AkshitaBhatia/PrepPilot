import { nextOccurrence, type RepeatRule } from '@preppilot/shared';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * The platform notification layer.
 *
 * Everything here is a **local** notification: PrepPilot schedules on the device
 * and no server is involved, so this needs no push credentials and works
 * offline. Remote push is not part of the product.
 *
 * The module is deliberately thin and side-effect-free at import time, so the
 * reminder store can use it as a seam in tests.
 */

export interface ScheduleRequest {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly fireAt: number;
  readonly repeat: RepeatRule;
}

/** Foreground behaviour: a reminder should be visible even while the app is open. */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Asks for permission, returning whether reminders can actually be delivered.
 *
 * Never throws: a student who declines should still be able to use the rest of
 * the app, and the reminders screen explains the consequence instead.
 */
export async function requestPermission(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

/**
 * Android groups notifications by channel, and one must exist before anything is
 * delivered. Creating it is idempotent.
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Study reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  } catch {
    // A missing channel degrades delivery; it should not stop the app starting.
  }
}

/**
 * Schedules one reminder and returns the platform's identifier.
 *
 * Returns null when nothing could be scheduled — a past one-off, or a platform
 * refusal — which the caller records rather than treating as success.
 */
export async function schedule(request: ScheduleRequest): Promise<string | null> {
  const fireAt = nextOccurrence(
    { scheduledAt: request.fireAt, repeat: request.repeat },
    Date.now(),
  );
  if (fireAt === null) return null;

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: request.title,
        body: request.body,
        data: { reminderId: request.id },
      },
      trigger: buildTrigger(fireAt, request.repeat),
    });
  } catch {
    return null;
  }
}

/**
 * A one-off reminder uses a date trigger. Daily and weekly use calendar triggers
 * so the OS re-arms them; a date trigger would fire once and never again.
 */
export function buildTrigger(
  fireAt: number,
  repeat: RepeatRule,
): Notifications.NotificationTriggerInput {
  const date = new Date(fireAt);

  if (repeat === 'daily') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: date.getHours(),
      minute: date.getMinutes(),
    };
  }

  if (repeat === 'weekly') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      // expo-notifications counts weekdays from 1 = Sunday.
      weekday: date.getDay() + 1,
      hour: date.getHours(),
      minute: date.getMinutes(),
    };
  }

  // 'weekdays' has no native equivalent, so it is scheduled as the next single
  // occurrence and re-armed when the app next opens. The reminders screen says
  // so rather than implying an OS-level repeat.
  return { type: Notifications.SchedulableTriggerInputTypes.DATE, date };
}

/**
 * Whether a reminder set here will survive the app being closed.
 *
 * True on a device, where the OS holds the schedule. The web build cannot —
 * see notifications.web.ts — and the reminders screen says so rather than
 * letting a student trust an alarm that will not sound.
 */
export const remindersSurviveClosing = true;

export async function cancel(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // Already delivered or already cancelled; nothing to undo.
  }
}
