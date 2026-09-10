import { createTimer, start, type TimerState } from '@preppilot/shared';
import * as Notifications from 'expo-notifications';
import {
  announceTimerFinished,
  armTimerAlert,
  disarmTimerAlert,
  resetTimerAlert,
} from '../timer-alert';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(async () => 'notification-1'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success' },
}));

const NOW = 1_700_000_000_000;
const mocked = Notifications as jest.Mocked<typeof Notifications>;

const countdown = (seconds: number): TimerState =>
  start(createTimer({ mode: 'custom', targetSeconds: seconds }), NOW);

beforeEach(() => {
  jest.clearAllMocks();
  resetTimerAlert();
});

describe('arming the chime', () => {
  it('schedules it for the moment the countdown ends', async () => {
    await armTimerAlert(countdown(1500), NOW);

    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({ seconds: 1500, repeats: false }),
      }),
    );
  });

  it('counts from now, not from when the timer was created', async () => {
    await armTimerAlert(countdown(1500), NOW + 500_000);

    const [request] = mocked.scheduleNotificationAsync.mock.calls[0] ?? [];
    expect((request?.trigger as { seconds: number }).seconds).toBe(1000);
  });

  /** A stopwatch has no end, so there is nothing to announce. */
  it('schedules nothing for a stopwatch', async () => {
    await armTimerAlert(start(createTimer({ mode: 'stopwatch' }), NOW), NOW);

    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules nothing for a countdown that has already run out', async () => {
    await armTimerAlert(countdown(60), NOW + 120_000);

    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  /** Two chimes for one timer is worse than none. */
  it('replaces a previous alert rather than stacking a second', async () => {
    await armTimerAlert(countdown(1500), NOW);
    await armTimerAlert(countdown(900), NOW);

    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-1');
  });

  it('says the work interval is over during a Pomodoro', async () => {
    const pomodoro = start(createTimer({ mode: 'pomodoro' }), NOW);

    await armTimerAlert(pomodoro, NOW);

    const [request] = mocked.scheduleNotificationAsync.mock.calls[0] ?? [];
    expect(request?.content.title).toBe('Work interval done');
  });

  /**
   * A timer that refused to start because the OS would not take a notification
   * would be a worse app than one that occasionally fails to chime.
   */
  it('never throws when the platform refuses', async () => {
    mocked.scheduleNotificationAsync.mockRejectedValueOnce(new Error('denied'));

    await expect(armTimerAlert(countdown(1500), NOW)).resolves.toBeUndefined();
  });
});

describe('cancelling the chime', () => {
  it('cancels the one that was armed', async () => {
    await armTimerAlert(countdown(1500), NOW);

    await disarmTimerAlert();

    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-1');
  });

  it('does nothing when none is armed', async () => {
    await disarmTimerAlert();

    expect(mocked.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('does not try twice', async () => {
    await armTimerAlert(countdown(1500), NOW);

    await disarmTimerAlert();
    await disarmTimerAlert();

    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('survives the platform refusing to cancel', async () => {
    await armTimerAlert(countdown(1500), NOW);
    mocked.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error('gone'));

    await expect(disarmTimerAlert()).resolves.toBeUndefined();
  });
});

describe('the in-app cue', () => {
  it('buzzes the phone', async () => {
    const haptics = jest.requireMock('expo-haptics') as { notificationAsync: jest.Mock };

    await announceTimerFinished();

    expect(haptics.notificationAsync).toHaveBeenCalled();
  });

  /** Haptics are absent on web and on some devices; not worth an error. */
  it('stays quiet when haptics are unavailable', async () => {
    const haptics = jest.requireMock('expo-haptics') as { notificationAsync: jest.Mock };
    haptics.notificationAsync.mockRejectedValueOnce(new Error('unsupported'));

    await expect(announceTimerFinished()).resolves.toBeUndefined();
  });
});
