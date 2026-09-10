import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { remainingSeconds, type TimerState } from '@preppilot/shared';

/**
 * Telling a student their timer has finished.
 *
 * A countdown that ends silently ends unnoticed: the student is meant to be
 * studying, not watching a number. The alert is a scheduled local notification
 * rather than an in-app animation, so it arrives whether they are on another
 * screen, in another app, or have the phone face-down on the desk.
 *
 * Everything here is best-effort and never throws. A timer that refuses to
 * start because a notification could not be scheduled would be a worse app than
 * one that occasionally fails to chime.
 */

/** What the notification says, per timer mode. */
function wording(timer: TimerState): { title: string; body: string } {
  if (timer.mode !== 'pomodoro') {
    return { title: 'Time’s up', body: 'Your timer has finished.' };
  }

  return timer.phase === 'work'
    ? { title: 'Work interval done', body: 'Time for a break.' }
    : { title: 'Break over', body: 'Ready for the next interval?' };
}

let scheduledId: string | null = null;

/**
 * Schedules the chime for the moment this countdown ends.
 *
 * A stopwatch has no end, so there is nothing to arm. Re-arming replaces any
 * previous alert, which is what makes pausing and resuming land on the new end
 * time rather than the original one.
 */
export async function armTimerAlert(timer: TimerState, now: number): Promise<void> {
  await disarmTimerAlert();

  const remaining = remainingSeconds(timer, now);
  if (remaining === null || remaining <= 0) return;

  try {
    const { title, body } = wording(timer);
    scheduledId = await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { kind: 'timer' } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: remaining,
        repeats: false,
      },
    });
  } catch {
    scheduledId = null;
  }
}

/** Cancels a pending chime — the timer was paused, stopped or reset. */
export async function disarmTimerAlert(): Promise<void> {
  if (scheduledId === null) return;

  const id = scheduledId;
  scheduledId = null;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Nothing to do: a notification that cannot be cancelled will simply fire.
  }
}

/**
 * The in-app half of the alert, for a student who is looking at the screen.
 *
 * The scheduled notification still fires and carries the sound; this adds the
 * physical cue, which is the part a person notices without reading anything.
 */
export async function announceTimerFinished(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Haptics are unavailable on web and on some devices. Not worth a message.
  }
}

/** Test seam: forgets any armed alert without touching the platform. */
export function resetTimerAlert(): void {
  scheduledId = null;
}
