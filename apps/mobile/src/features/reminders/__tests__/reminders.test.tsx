import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { Repositories } from '../../../db/client';
import { getRepositories } from '../../../db/client';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../../../db/test-support/test-database';
import { getInModal, renderWithTheme } from '../../../test-utils/render';
import { useAuthStore } from '../../auth/auth-store';
import * as notifications from '../notifications';
import { formatReminderTime } from '../components/reminder-row';
import { RemindersScreen, resolveWhen } from '../reminders-screen';
import { resetRemindersStore, useRemindersStore } from '../reminders-store';

jest.mock('../../../db/client', () => ({ getRepositories: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({
  getSupabase: jest.fn(),
  startAutoRefresh: jest.fn(() => jest.fn()),
}));
jest.mock('../notifications');

const USER = 'user-1';
/**
 * Anchored to the real clock, not a fixed date.
 *
 * The store decides whether a reminder can still fire by comparing against
 * Date.now(), so a hardcoded date silently drifts into the past and every
 * scheduling assertion starts failing on some later day.
 */
const NOW = Date.now();

let db: ReturnType<typeof createTestDatabase>;
let repositories: Repositories;

const reminders = () => useRemindersStore.getState();
const mocked = notifications as jest.Mocked<typeof notifications>;

beforeEach(() => {
  db = createTestDatabase();
  repositories = createTestRepositories(db, createTestClock(NOW));
  (getRepositories as jest.MockedFunction<typeof getRepositories>).mockReturnValue(repositories);

  jest.clearAllMocks();
  mocked.ensureAndroidChannel.mockResolvedValue();
  mocked.requestPermission.mockResolvedValue(true);
  mocked.schedule.mockResolvedValue('notification-1');
  mocked.cancel.mockResolvedValue();

  resetRemindersStore();
  useAuthStore.setState({ user: { id: USER } as never, status: 'signedIn' });
});

afterEach(() => {
  db.$close();
});

const render = async () => {
  const view = renderWithTheme(<RemindersScreen />);
  await waitFor(() => expect(reminders().loading).toBe(false));
  return view;
};

const addReminder = async (title: string) => {
  await act(async () => {
    await reminders().addReminder({
      title,
      scheduledAt: NOW + 3_600_000,
      repeatRule: 'none',
    });
  });
};

describe('an empty reminders screen', () => {
  it('invites the student to create one', async () => {
    await render();

    expect(screen.getByTestId('reminders-empty')).toBeOnTheScreen();
  });
});

describe('creating a reminder', () => {
  it('saves it and schedules a notification', async () => {
    await render();
    await addReminder('Revise polynomials');

    expect(reminders().reminders).toHaveLength(1);
    expect(mocked.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Revise polynomials' }),
    );
  });

  it('records which notification backs the reminder', async () => {
    await render();
    await addReminder('Revise polynomials');

    const saved = await repositories.reminders.findById(reminders().reminders[0]!.id);
    expect(saved?.notificationId).toBe('notification-1');
  });

  it('rejects a blank title without saving', async () => {
    await render();

    fireEvent.press(screen.getByRole('button', { name: 'New reminder' }));
    await act(async () => {
      fireEvent.press(getInModal('Create'));
    });

    expect(screen.getByText('Enter a title.')).toBeOnTheScreen();
    expect(reminders().reminders).toHaveLength(0);
  });

  it('shows the reminder in the list once created', async () => {
    await render();
    await addReminder('Revise polynomials');

    await waitFor(() => expect(screen.getByText('Revise polynomials')).toBeOnTheScreen());
  });

  /** PrepPilot must not schedule anything the student did not ask for. */
  it('schedules nothing on its own', async () => {
    await render();

    expect(mocked.schedule).not.toHaveBeenCalled();
  });
});

describe('enabling and disabling', () => {
  it('cancels the notification when disabled', async () => {
    await render();
    await addReminder('Revise polynomials');
    const id = reminders().reminders[0]!.id;

    await act(async () => {
      await reminders().setEnabled(id, false);
    });

    expect(mocked.cancel).toHaveBeenCalledWith('notification-1');
    expect((await repositories.reminders.findById(id))?.enabled).toBe(false);
  });

  it('does not schedule while disabled', async () => {
    await render();
    await addReminder('Revise polynomials');
    mocked.schedule.mockClear();

    await act(async () => {
      await reminders().setEnabled(reminders().reminders[0]!.id, false);
    });

    expect(mocked.schedule).not.toHaveBeenCalled();
  });

  it('schedules again when re-enabled', async () => {
    await render();
    await addReminder('Revise polynomials');
    const id = reminders().reminders[0]!.id;
    await act(async () => {
      await reminders().setEnabled(id, false);
    });
    mocked.schedule.mockClear();

    await act(async () => {
      await reminders().setEnabled(id, true);
    });

    expect(mocked.schedule).toHaveBeenCalled();
  });

  /**
   * Editing without cancelling first is how a student ends up with two alerts
   * for one reminder.
   */
  it('cancels the previous notification before scheduling a replacement', async () => {
    await render();
    await addReminder('Revise polynomials');
    const id = reminders().reminders[0]!.id;

    await act(async () => {
      await reminders().setEnabled(id, true);
    });

    expect(mocked.cancel).toHaveBeenCalledWith('notification-1');
  });
});

describe('deleting', () => {
  /** A notification outliving its reminder fires for something no longer visible. */
  it('cancels the notification before removing the reminder', async () => {
    await render();
    await addReminder('Revise polynomials');
    const id = reminders().reminders[0]!.id;

    await act(async () => {
      await reminders().deleteReminder(id);
    });

    expect(mocked.cancel).toHaveBeenCalledWith('notification-1');
    expect(reminders().reminders).toHaveLength(0);
  });
});

describe('permission', () => {
  it('warns when notifications are turned off', async () => {
    mocked.requestPermission.mockResolvedValue(false);
    await render();

    await act(async () => {
      await reminders().requestPermission();
    });

    await waitFor(() => expect(screen.getByTestId('permission-warning')).toBeOnTheScreen());
  });

  /** Unknown is not denied: warning before asking would be wrong. */
  it('says nothing before permission has been checked', async () => {
    await render();

    expect(reminders().permissionGranted).toBeNull();
    expect(screen.queryByTestId('permission-warning')).toBeNull();
  });
});

describe('failures', () => {
  it('shows a student-facing message when saving fails', async () => {
    await render();
    jest.spyOn(repositories.reminders, 'create').mockRejectedValue(new Error('SQLITE_BUSY'));

    await addReminder('Revise polynomials');

    expect(reminders().error).toBe('We could not save that reminder. Try again.');
  });

  /** A refused schedule must not be recorded as if it succeeded. */
  it('leaves no notification id when scheduling fails', async () => {
    mocked.schedule.mockResolvedValue(null);
    await render();
    await addReminder('Revise polynomials');

    const saved = await repositories.reminders.findById(reminders().reminders[0]!.id);
    expect(saved?.notificationId).toBeNull();
  });
});

describe('the composer', () => {
  const openComposer = async () => {
    await render();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'New reminder' }));
    });
  };

  it('asks for permission when the composer opens, not at app launch', async () => {
    await render();
    expect(mocked.requestPermission).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'New reminder' }));
    });

    expect(mocked.requestPermission).toHaveBeenCalled();
  });

  it('creates a reminder from the form', async () => {
    await openComposer();
    fireEvent.changeText(screen.getByLabelText('Title'), 'Revise polynomials');

    await act(async () => {
      fireEvent.press(getInModal('Create'));
    });

    await waitFor(() => expect(reminders().reminders).toHaveLength(1));
    expect(reminders().reminders[0]?.title).toBe('Revise polynomials');
  });

  it('records the chosen repeat rule', async () => {
    await openComposer();
    fireEvent.changeText(screen.getByLabelText('Title'), 'Daily revision');
    await act(async () => {
      fireEvent.press(getInModal('Every day'));
    });
    await act(async () => {
      fireEvent.press(getInModal('Create'));
    });

    await waitFor(() => expect(reminders().reminders[0]?.repeatRule).toBe('daily'));
  });

  /** The platform cannot express weekday-only, so the app must not imply it can. */
  it('explains that weekday reminders are re-armed by the app', async () => {
    await openComposer();

    await act(async () => {
      fireEvent.press(getInModal('Weekdays'));
    });

    expect(
      screen.getByText('Weekday reminders are rescheduled each time you open PrepPilot.'),
    ).toBeOnTheScreen();
  });

  it('can be cancelled without creating anything', async () => {
    await openComposer();
    fireEvent.changeText(screen.getByLabelText('Title'), 'Abandoned');

    await act(async () => {
      fireEvent.press(getInModal('Cancel'));
    });

    expect(reminders().reminders).toHaveLength(0);
  });

  it('clears the error once the student types again', async () => {
    await openComposer();
    await act(async () => {
      fireEvent.press(getInModal('Create'));
    });
    expect(screen.getByText('Enter a title.')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Title'), 'R');

    expect(screen.queryByText('Enter a title.')).toBeNull();
  });
});

describe('the reminder row', () => {
  it('exposes its enabled state as a switch', async () => {
    await render();
    await addReminder('Revise polynomials');

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Revise polynomials' }).props.accessibilityState.checked,
      ).toBe(true),
    );
  });

  it('toggles from the row', async () => {
    await render();
    await addReminder('Revise polynomials');
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Revise polynomials' })).toBeOnTheScreen(),
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('switch', { name: 'Revise polynomials' }));
    });

    await waitFor(() => expect(reminders().reminders[0]?.enabled).toBe(false));
  });

  it('deletes from the row', async () => {
    await render();
    await addReminder('Revise polynomials');
    await waitFor(() => expect(screen.getByText('Revise polynomials')).toBeOnTheScreen());

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Delete Revise polynomials' }));
    });

    await waitFor(() => expect(reminders().reminders).toHaveLength(0));
  });

  /** A past one-off will never fire; showing it as active would be a false promise. */
  it('marks a passed one-off reminder', async () => {
    await render();
    await act(async () => {
      await reminders().addReminder({
        title: 'Already gone',
        scheduledAt: Date.now() - 3_600_000,
        repeatRule: 'none',
      });
    });

    await waitFor(() =>
      expect(screen.getByText('This reminder has already passed.')).toBeOnTheScreen(),
    );
  });
});

describe('recovering from a load failure', () => {
  it('retries when the student asks', async () => {
    const listByUser = jest
      .spyOn(repositories.reminders, 'listByUser')
      .mockRejectedValueOnce(new Error('SQLITE_BUSY'));

    await render();
    expect(screen.getByText(/could not load your reminders/)).toBeOnTheScreen();

    listByUser.mockRestore();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Reload' }));
    });

    await waitFor(() => expect(reminders().error).toBeNull());
  });

  it('opens the composer from the empty state', async () => {
    await render();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Create a reminder' }));
    });

    expect(screen.getByLabelText('Title')).toBeOnTheScreen();
  });
});

describe('re-arming on load', () => {
  /**
   * Android has no weekday-only trigger, so those reminders hold a single-date
   * notification that the app must advance each time it opens.
   */
  it('reschedules weekday reminders', async () => {
    await render();
    await act(async () => {
      await reminders().addReminder({
        title: 'Weekday revision',
        scheduledAt: NOW + 3_600_000,
        repeatRule: 'weekdays',
      });
    });
    mocked.schedule.mockClear();
    mocked.cancel.mockClear();

    await act(async () => {
      await reminders().load(USER, repositories);
    });

    expect(mocked.cancel).toHaveBeenCalled();
    expect(mocked.schedule).toHaveBeenCalledWith(expect.objectContaining({ repeat: 'weekdays' }));
  });

  it('leaves other repeat rules to the platform', async () => {
    await render();
    await act(async () => {
      await reminders().addReminder({
        title: 'Daily revision',
        scheduledAt: NOW + 3_600_000,
        repeatRule: 'daily',
      });
    });
    mocked.schedule.mockClear();

    await act(async () => {
      await reminders().load(USER, repositories);
    });

    expect(mocked.schedule).not.toHaveBeenCalled();
  });

  it('reports a student-facing message when loading fails', async () => {
    jest.spyOn(repositories.reminders, 'listByUser').mockRejectedValue(new Error('SQLITE_CORRUPT'));

    await render();

    expect(reminders().error).toBe('We could not load your reminders. Pull down to try again.');
    expect(screen.queryByText(/SQLITE_CORRUPT/)).toBeNull();
  });
});

describe('more failures', () => {
  it('reports a failure to toggle', async () => {
    await render();
    await addReminder('Revise polynomials');
    jest.spyOn(repositories.reminders, 'update').mockRejectedValue(new Error('locked'));

    await act(async () => {
      await reminders().setEnabled(reminders().reminders[0]!.id, false);
    });

    expect(reminders().error).toBe('We could not update that reminder. Try again.');
  });

  it('reports a failure to delete', async () => {
    await render();
    await addReminder('Revise polynomials');
    jest.spyOn(repositories.reminders, 'softDelete').mockRejectedValue(new Error('locked'));

    await act(async () => {
      await reminders().deleteReminder(reminders().reminders[0]!.id);
    });

    expect(reminders().error).toBe('We could not delete that reminder. Try again.');
  });

  it('dismisses an error', async () => {
    await render();
    jest.spyOn(repositories.reminders, 'create').mockRejectedValue(new Error('locked'));
    await addReminder('Revise polynomials');

    act(() => {
      reminders().clearError();
    });

    expect(reminders().error).toBeNull();
  });

  it('fails clearly when used before load()', async () => {
    resetRemindersStore();

    await expect(
      reminders().addReminder({ title: 'x', scheduledAt: NOW, repeatRule: 'none' }),
    ).rejects.toThrow(/call load/);
  });
});

describe('resolveWhen', () => {
  /**
   * A fixed reference, because this function takes its clock as a parameter.
   * The store's scheduling uses the real clock; this pure helper does not, and
   * pinning it keeps the day-boundary assertions meaningful on any date.
   */
  const MONDAY_10AM = new Date(2026, 7, 24, 10, 0).getTime();

  it('offers an hour from now', () => {
    expect(resolveWhen(0, MONDAY_10AM)).toBe(MONDAY_10AM + 3_600_000);
  });

  it('offers this evening at 19:00', () => {
    const evening = new Date(resolveWhen(1, MONDAY_10AM));

    expect(evening.getHours()).toBe(19);
    expect(evening.getDate()).toBe(24);
  });

  /** Choosing "this evening" after 19:00 must not schedule something in the past. */
  it('rolls to tomorrow when this evening has already passed', () => {
    const lateNight = new Date(2026, 7, 24, 21, 0).getTime();
    const evening = new Date(resolveWhen(1, lateNight));

    expect(evening.getDate()).toBe(25);
    expect(evening.getHours()).toBe(19);
  });

  it('offers tomorrow morning at 09:00', () => {
    const morning = new Date(resolveWhen(2, MONDAY_10AM));

    expect(morning.getDate()).toBe(25);
    expect(morning.getHours()).toBe(9);
  });
});

describe('formatReminderTime', () => {
  it('includes the weekday, because a reminder is about when', () => {
    expect(formatReminderTime(new Date(2026, 7, 25, 7, 5).getTime())).toMatch(
      /^\w{3} 25 \w{3}, 07:05$/,
    );
  });
});

/**
 * A reminder is an alarm, and an alarm that can only be set to three preset
 * offsets is not one. A student revising in 25-minute blocks was previously
 * told the nearest they could have was an hour.
 */
describe('setting a reminder for any time at all', () => {
  const openComposer = async () => {
    await render();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'New reminder' }));
    });
    fireEvent.changeText(screen.getByLabelText('Title'), 'Revise polynomials');
  };

  const submit = async () => {
    await act(async () => {
      fireEvent.press(getInModal('Create'));
    });
  };

  it('still offers the quick picks', async () => {
    await openComposer();

    expect(screen.getByTestId('quick-time-0')).toBeOnTheScreen();
  });

  it('takes a delay in minutes', async () => {
    await openComposer();
    fireEvent.press(screen.getByTestId('when-mode-in'));

    fireEvent.changeText(screen.getByTestId('reminder-delay'), '25');
    const before = Date.now();
    await submit();

    const saved = reminders().reminders[0];
    expect(saved?.scheduledAt).toBeGreaterThanOrEqual(before + 25 * 60_000 - 5_000);
    expect(saved?.scheduledAt).toBeLessThanOrEqual(before + 25 * 60_000 + 5_000);
  });

  it('takes hours and minutes together', async () => {
    await openComposer();
    fireEvent.press(screen.getByTestId('when-mode-in'));

    fireEvent.changeText(screen.getByTestId('reminder-delay'), '1h 30m');
    const before = Date.now();
    await submit();

    expect(reminders().reminders[0]?.scheduledAt).toBeGreaterThanOrEqual(
      before + 90 * 60_000 - 5_000,
    );
  });

  it('confirms what it understood before the student commits', async () => {
    await openComposer();
    fireEvent.press(screen.getByTestId('when-mode-in'));

    fireEvent.changeText(screen.getByTestId('reminder-delay'), '1h 30m');

    expect(screen.getByText('Fires in 1 hour 30 minutes')).toBeOnTheScreen();
  });

  it('takes a clock time', async () => {
    await openComposer();
    fireEvent.press(screen.getByTestId('when-mode-at'));

    fireEvent.changeText(screen.getByTestId('reminder-time'), '19:45');
    await submit();

    const saved = reminders().reminders[0];
    const at = new Date(saved?.scheduledAt ?? 0);
    expect(at.getHours()).toBe(19);
    expect(at.getMinutes()).toBe(45);
  });

  /** Silently scheduling something else would be worse than saying so. */
  it('says so rather than guessing when the delay makes no sense', async () => {
    await openComposer();
    fireEvent.press(screen.getByTestId('when-mode-in'));

    fireEvent.changeText(screen.getByTestId('reminder-delay'), 'soonish');
    await submit();

    expect(screen.getByText('Try something like 25, 45m or 1h 30m.')).toBeOnTheScreen();
    expect(reminders().reminders).toHaveLength(0);
  });

  it('says so when the clock time makes no sense', async () => {
    await openComposer();
    fireEvent.press(screen.getByTestId('when-mode-at'));

    fireEvent.changeText(screen.getByTestId('reminder-time'), '25:00');
    await submit();

    expect(screen.getByText('Try a time like 07:30 or 19:45.')).toBeOnTheScreen();
  });

  it('keeps the composer open so the student can correct it', async () => {
    await openComposer();
    fireEvent.press(screen.getByTestId('when-mode-in'));
    fireEvent.changeText(screen.getByTestId('reminder-delay'), 'soonish');
    await submit();

    fireEvent.changeText(screen.getByTestId('reminder-delay'), '25');
    await submit();

    expect(reminders().reminders).toHaveLength(1);
  });
});
