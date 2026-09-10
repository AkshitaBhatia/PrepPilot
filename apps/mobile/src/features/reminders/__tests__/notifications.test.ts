import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  buildTrigger,
  cancel,
  configureNotificationHandler,
  ensureAndroidChannel,
  requestPermission,
  schedule,
} from '../notifications';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly' },
}));

const mocked = Notifications as jest.Mocked<typeof Notifications>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('configureNotificationHandler', () => {
  /** A reminder should be visible even while the app is open, which is not the default. */
  it('shows reminders in the foreground', async () => {
    configureNotificationHandler();

    const handler = mocked.setNotificationHandler.mock.calls[0]?.[0];
    const behaviour = await handler!.handleNotification({} as never);

    expect(behaviour).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
    // A study reminder is not an unread count.
    expect(behaviour).toMatchObject({ shouldSetBadge: false });
  });
});

describe('requestPermission', () => {
  it('does not ask again when already granted', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);

    await expect(requestPermission()).resolves.toBe(true);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('asks when permission has not been decided', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    mocked.requestPermissionsAsync.mockResolvedValue({ granted: true } as never);

    await expect(requestPermission()).resolves.toBe(true);
  });

  /** Asking again after a permanent refusal does nothing but annoy. */
  it('does not ask again once permanently refused', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);

    await expect(requestPermission()).resolves.toBe(false);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  /** A student who declines must still be able to use the rest of the app. */
  it('reports false rather than throwing when the platform errors', async () => {
    mocked.getPermissionsAsync.mockRejectedValue(new Error('no permission module'));

    await expect(requestPermission()).resolves.toBe(false);
  });
});

describe('ensureAndroidChannel', () => {
  it('creates the channel on Android', async () => {
    Platform.OS = 'android';
    mocked.setNotificationChannelAsync.mockResolvedValue(null as never);

    await ensureAndroidChannel();

    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith(
      'reminders',
      expect.objectContaining({ name: 'Study reminders' }),
    );
  });

  it('does nothing on other platforms', async () => {
    Platform.OS = 'ios';

    await ensureAndroidChannel();

    expect(mocked.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('does not throw when the channel cannot be created', async () => {
    Platform.OS = 'android';
    mocked.setNotificationChannelAsync.mockRejectedValue(new Error('nope'));

    await expect(ensureAndroidChannel()).resolves.toBeUndefined();
  });
});

describe('buildTrigger', () => {
  const at = (hour: number, minute: number) => new Date(2026, 7, 24, hour, minute).getTime();

  /**
   * Daily and weekly must use calendar triggers so the OS re-arms them; a date
   * trigger would fire once and never again.
   */
  it('uses a daily calendar trigger for a daily reminder', () => {
    expect(buildTrigger(at(7, 30), 'daily')).toEqual({ type: 'daily', hour: 7, minute: 30 });
  });

  it('uses a weekly calendar trigger, counting Sunday as 1', () => {
    // 24 Aug 2026 is a Monday, so getDay() is 1 and the platform wants 2.
    expect(buildTrigger(at(7, 0), 'weekly')).toEqual({
      type: 'weekly',
      weekday: 2,
      hour: 7,
      minute: 0,
    });
  });

  it('uses a one-off date trigger when there is no repeat', () => {
    const trigger = buildTrigger(at(7, 0), 'none') as { type: string; date: Date };

    expect(trigger.type).toBe('date');
    expect(trigger.date.getTime()).toBe(at(7, 0));
  });

  /** Android has no weekday-only trigger, so it is re-armed by the app. */
  it('falls back to a single date for weekday reminders', () => {
    expect((buildTrigger(at(7, 0), 'weekdays') as { type: string }).type).toBe('date');
  });
});

describe('schedule', () => {
  const request = {
    id: 'r1',
    title: 'Revise polynomials',
    body: 'Time to study.',
    fireAt: Date.now() + 3_600_000,
    repeat: 'none' as const,
  };

  it('returns the platform identifier', async () => {
    mocked.scheduleNotificationAsync.mockResolvedValue('notification-1');

    await expect(schedule(request)).resolves.toBe('notification-1');
  });

  it('carries the reminder id so a tap can be traced back', async () => {
    mocked.scheduleNotificationAsync.mockResolvedValue('notification-1');

    await schedule(request);

    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ data: { reminderId: 'r1' } }),
      }),
    );
  });

  /** Scheduling a past one-off would notify about a moment already over. */
  it('schedules nothing for a one-off that has passed', async () => {
    await expect(schedule({ ...request, fireAt: Date.now() - 60_000 })).resolves.toBeNull();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('returns null rather than throwing when the platform refuses', async () => {
    mocked.scheduleNotificationAsync.mockRejectedValue(new Error('too many'));

    await expect(schedule(request)).resolves.toBeNull();
  });
});

describe('cancel', () => {
  it('cancels by identifier', async () => {
    mocked.cancelScheduledNotificationAsync.mockResolvedValue();

    await cancel('notification-1');

    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-1');
  });

  /** Already delivered or already cancelled: nothing to undo, nothing to report. */
  it('ignores a failure', async () => {
    mocked.cancelScheduledNotificationAsync.mockRejectedValue(new Error('unknown id'));

    await expect(cancel('notification-1')).resolves.toBeUndefined();
  });
});
