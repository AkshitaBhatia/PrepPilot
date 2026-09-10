import {
  cancel,
  ensureAndroidChannel,
  remindersSurviveClosing,
  requestPermission,
  resetWebNotifications,
  schedule,
} from '../notifications.web';

/**
 * A reminder set in the web demo used to do nothing at all while appearing to
 * have been set. These pin the fallback that actually delivers one.
 */

class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = jest.fn(async () => FakeNotification.permission);
  static delivered: { title: string; body?: string }[] = [];

  constructor(title: string, options?: NotificationOptions) {
    FakeNotification.delivered.push({
      title,
      ...(options?.body === undefined ? {} : { body: options.body }),
    });
  }
}

const request = (overrides: Partial<Parameters<typeof schedule>[0]> = {}) => ({
  id: 'reminder-1',
  title: 'Revise polynomials',
  body: 'Time to sit down.',
  fireAt: Date.now() + 60_000,
  repeat: 'none' as const,
  ...overrides,
});

beforeEach(() => {
  jest.useFakeTimers();
  FakeNotification.permission = 'granted';
  FakeNotification.delivered = [];
  FakeNotification.requestPermission.mockClear();
  (globalThis as { Notification?: unknown }).Notification = FakeNotification;
  (globalThis as { window?: unknown }).window = globalThis;
  resetWebNotifications();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('asking the browser for permission', () => {
  it('does not ask again once granted', async () => {
    expect(await requestPermission()).toBe(true);
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it('asks when the student has not decided', async () => {
    FakeNotification.permission = 'default';
    FakeNotification.requestPermission.mockResolvedValueOnce('granted');

    expect(await requestPermission()).toBe(true);
  });

  /** Asking again after a refusal is nagging, and browsers ignore it anyway. */
  it('takes no for an answer', async () => {
    FakeNotification.permission = 'denied';

    expect(await requestPermission()).toBe(false);
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it('reports false where there is no Notification API at all', async () => {
    delete (globalThis as { Notification?: unknown }).Notification;

    expect(await requestPermission()).toBe(false);
  });
});

describe('delivering a reminder', () => {
  it('fires it at the time it was set for', async () => {
    await schedule(request({ fireAt: Date.now() + 60_000 }));

    jest.advanceTimersByTime(59_000);
    expect(FakeNotification.delivered).toHaveLength(0);

    jest.advanceTimersByTime(2_000);
    expect(FakeNotification.delivered).toEqual([
      { title: 'Revise polynomials', body: 'Time to sit down.' },
    ]);
  });

  it('hands back an id so it can be cancelled', async () => {
    expect(await schedule(request())).toEqual(expect.any(String));
  });

  it('schedules nothing without permission', async () => {
    FakeNotification.permission = 'denied';

    expect(await schedule(request())).toBeNull();
  });

  /** A one-off already in the past has no next occurrence to fire at. */
  it('schedules nothing for a time that has gone', async () => {
    expect(await schedule(request({ fireAt: Date.now() - 60_000 }))).toBeNull();
  });

  /**
   * setTimeout saturates above about 24.8 days and fires at once instead of
   * never — a reminder set for next term arriving immediately.
   */
  it('refuses a delay a browser timer cannot hold', async () => {
    expect(await schedule(request({ fireAt: Date.now() + 40 * 24 * 60 * 60_000 }))).toBeNull();
  });

  it('does not fire one that was cancelled', async () => {
    const id = await schedule(request({ fireAt: Date.now() + 60_000 }));
    if (id === null) throw new Error('expected an id');

    await cancel(id);
    jest.advanceTimersByTime(120_000);

    expect(FakeNotification.delivered).toHaveLength(0);
  });

  it('ignores cancelling something that was never scheduled', async () => {
    await expect(cancel('web-999')).resolves.toBeUndefined();
  });

  it('keeps other reminders when one is cancelled', async () => {
    const first = await schedule(request({ id: 'a', title: 'First', fireAt: Date.now() + 60_000 }));
    await schedule(request({ id: 'b', title: 'Second', fireAt: Date.now() + 60_000 }));
    if (first === null) throw new Error('expected an id');

    await cancel(first);
    jest.advanceTimersByTime(120_000);

    expect(FakeNotification.delivered.map((n) => n.title)).toEqual(['Second']);
  });
});

describe('what the screen is told', () => {
  /** The reminders screen says so rather than implying a real alarm. */
  it('admits a web reminder does not survive the tab closing', () => {
    expect(remindersSurviveClosing).toBe(false);
  });

  it('has nothing to do about Android channels', async () => {
    await expect(ensureAndroidChannel()).resolves.toBeUndefined();
  });
});
