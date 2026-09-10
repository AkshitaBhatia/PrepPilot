import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { Repositories } from '../../../db/client';
import { getRepositories } from '../../../db/client';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../../../db/test-support/test-database';
import { getInModal, renderWithTheme } from '../../../test-utils/render';
import * as env from '../../../config/env';
import { useAuthStore } from '../../auth/auth-store';
import { deleteRemoteAccount } from '../delete-account';
import { SettingsScreen } from '../settings-screen';

jest.mock('../../../db/client', () => ({ getRepositories: jest.fn() }));
jest.mock('../delete-account', () => ({ deleteRemoteAccount: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({
  getSupabase: jest.fn(),
  startAutoRefresh: jest.fn(() => jest.fn()),
}));

const USER = 'user-1';

const mockedDeleteRemote = deleteRemoteAccount as jest.MockedFunction<typeof deleteRemoteAccount>;

let db: ReturnType<typeof createTestDatabase>;
let repositories: Repositories;
let signOut: jest.Mock;

beforeEach(() => {
  mockedDeleteRemote.mockResolvedValue({ kind: 'deleted' });
  db = createTestDatabase();
  repositories = createTestRepositories(db, createTestClock());
  (getRepositories as jest.MockedFunction<typeof getRepositories>).mockReturnValue(repositories);

  signOut = jest.fn(async () => {});
  useAuthStore.setState({
    user: { id: USER, email: 'ada@example.com' } as never,
    status: 'signedIn',
    signOut,
  });
});

afterEach(() => {
  db.$close();
});

/** Builds a syllabus, a session and a reminder to delete. */
async function seed() {
  const subject = await repositories.subjects.create({ userId: USER, name: 'Mathematics' });
  const session = await repositories.sessions.start({ userId: USER, timerMode: 'stopwatch' });
  await repositories.sessions.complete(session.id, 600);
  await repositories.reminders.create({
    userId: USER,
    title: 'Revise',
    scheduledAt: Date.now() + 3_600_000,
    repeatRule: 'none',
  });
  return { subject };
}

const render = async () => {
  const view = renderWithTheme(<SettingsScreen />);
  await waitFor(() => expect(screen.getByText('Settings')).toBeOnTheScreen());
  return view;
};

describe('the account panel', () => {
  it('shows the signed-in email', async () => {
    await render();

    expect(screen.getByText('ada@example.com')).toBeOnTheScreen();
  });

  it('shows study statistics', async () => {
    await seed();
    await render();

    await waitFor(() => expect(screen.getByTestId('settings-total')).toBeOnTheScreen());
    expect(screen.getByTestId('settings-subjects')).toBeOnTheScreen();
  });
});

describe('signing out', () => {
  it('signs the student out', async () => {
    await render();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    });

    expect(signOut).toHaveBeenCalled();
  });
});

describe('deleting account data', () => {
  const openConfirmation = async () => {
    await render();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Delete my data' }));
    });
  };

  /**
   * Destroying months of study history should take more than two taps in the
   * same place, so the confirming button stays disabled until the word is typed.
   */
  it('requires the word DELETE to be typed', async () => {
    await openConfirmation();

    expect(getInModal('Delete').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');

    await waitFor(() => expect(getInModal('Delete').props.accessibilityState.disabled).toBe(false));
  });

  it('stays disabled for a near miss', async () => {
    await openConfirmation();

    fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'delete me');

    expect(getInModal('Delete').props.accessibilityState.disabled).toBe(true);
  });

  it('removes the syllabus, history and reminders', async () => {
    await seed();
    await openConfirmation();

    fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await act(async () => {
      fireEvent.press(getInModal('Delete'));
    });

    await waitFor(async () => expect(await repositories.subjects.listByUser(USER)).toEqual([]));
    expect(await repositories.sessions.listByUser(USER)).toEqual([]);
    expect(await repositories.reminders.listByUser(USER)).toEqual([]);
  });

  it('signs the student out afterwards', async () => {
    await seed();
    await openConfirmation();

    fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await act(async () => {
      fireEvent.press(getInModal('Delete'));
    });

    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  /**
   * Cloud deletion needs a Supabase Edge Function that is not deployed. Claiming
   * a full account deletion that never reached the server would be worse than
   * admitting the gap.
   */
  const confirmDeletion = async () => {
    await seed();
    await openConfirmation();

    fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await act(async () => {
      fireEvent.press(getInModal('Delete'));
    });

    await waitFor(() => expect(screen.getByTestId('delete-outcome')).toBeOnTheScreen());
  };

  it('confirms the account is gone once the server has removed it', async () => {
    mockedDeleteRemote.mockResolvedValue({ kind: 'deleted' });

    await confirmDeletion();

    expect(screen.getByText(/account and everything in it have been deleted/)).toBeOnTheScreen();
  });

  /**
   * The one outcome that must never read as success. The account still exists,
   * and a student told otherwise would believe their data was gone when it is
   * not — and would never retry.
   */
  it('says the account still exists when the server call fails', async () => {
    mockedDeleteRemote.mockResolvedValue({
      kind: 'failed',
      message: 'Your data was removed from this device, but we could not reach the server.',
    });

    await confirmDeletion();

    expect(screen.getByText(/could not reach the server/)).toBeOnTheScreen();
    expect(screen.queryByText(/have been deleted/)).toBeNull();
  });

  it('does not claim to have deleted a server account a demo never had', async () => {
    mockedDeleteRemote.mockResolvedValue({ kind: 'localOnly' });

    await confirmDeletion();

    expect(screen.getByText(/no account on the server/)).toBeOnTheScreen();
  });

  it('warns about the limitation before deleting, too', async () => {
    await render();

    expect(
      screen.getByText(/Removing your account from the server is not built yet/),
    ).toBeOnTheScreen();
  });

  it('can be dismissed from the backdrop', async () => {
    await seed();
    await openConfirmation();

    await act(async () => {
      fireEvent.press(screen.getAllByRole('button', { name: 'Cancel' }).at(0)!);
    });

    expect((await repositories.subjects.listByUser(USER)).length).toBe(1);
  });

  it('can be cancelled', async () => {
    await seed();
    await openConfirmation();

    await act(async () => {
      fireEvent.press(getInModal('Cancel'));
    });

    expect((await repositories.subjects.listByUser(USER)).length).toBe(1);
  });

  it('reports a failure without claiming success', async () => {
    await seed();
    jest.spyOn(repositories.subjects, 'softDelete').mockRejectedValue(new Error('SQLITE_BUSY'));
    await openConfirmation();

    fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await act(async () => {
      fireEvent.press(getInModal('Delete'));
    });

    await waitFor(() =>
      expect(screen.getByText('We could not delete your data. Try again.')).toBeOnTheScreen(),
    );
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('appearance', () => {
  it('offers dark, light and device', async () => {
    await render();

    expect(screen.getByRole('button', { name: 'Dark' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Light' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Match device' })).toBeOnTheScreen();
  });

  it.each(['Dark', 'Light', 'Match device'])('applies the %s choice', async (label) => {
    await render();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: label }));
    });

    // The button remains reachable, meaning the switch did not throw.
    expect(screen.getByRole('button', { name: label })).toBeOnTheScreen();
  });
});

describe('demo mode', () => {
  it('says the session is not synced to an account', async () => {
    jest.spyOn(env, 'isDemoMode').mockReturnValue(true);

    await render();

    expect(
      screen.getByText('This is a demo session. Nothing here is synced to an account.'),
    ).toBeOnTheScreen();
  });
});

describe('statistics that cannot be read', () => {
  /** A failed statistic is not worth an error banner on a settings screen. */
  it('renders the screen anyway', async () => {
    jest
      .spyOn(repositories.sessions, 'totalSecondsForUser')
      .mockRejectedValue(new Error('SQLITE_BUSY'));

    await render();

    expect(screen.getByText('Settings')).toBeOnTheScreen();
    expect(screen.queryByText(/SQLITE_BUSY/)).toBeNull();
  });
});

/**
 * A segmented control has to show which segment is on. Dark and Light were both
 * fixed as "secondary", so choosing one changed the app's colours but left the
 * control looking untouched — and on a light device, "Light" and "Match device"
 * looked identical with no way to tell which was chosen.
 */
describe('the appearance control', () => {
  const themeButton = (name: string) => screen.getByRole('button', { name });

  it('marks the chosen mode, and only that one', async () => {
    await render();

    fireEvent.press(themeButton('Light'));

    expect(themeButton('Light').props.accessibilityState.selected).toBe(true);
    expect(themeButton('Dark').props.accessibilityState.selected).toBe(false);
    expect(themeButton('Match device').props.accessibilityState.selected).toBe(false);
  });

  it('moves the mark when a different mode is chosen', async () => {
    await render();

    fireEvent.press(themeButton('Light'));
    fireEvent.press(themeButton('Dark'));

    expect(themeButton('Dark').props.accessibilityState.selected).toBe(true);
    expect(themeButton('Light').props.accessibilityState.selected).toBe(false);
  });

  it('marks "Match device" rather than the mode it resolves to', async () => {
    // Following the device that happens to be light must not read as "Light",
    // or there is no way to tell a pinned choice from a followed one.
    await render();

    fireEvent.press(themeButton('Light'));
    fireEvent.press(themeButton('Match device'));

    expect(themeButton('Match device').props.accessibilityState.selected).toBe(true);
    expect(themeButton('Light').props.accessibilityState.selected).toBe(false);
  });
});
