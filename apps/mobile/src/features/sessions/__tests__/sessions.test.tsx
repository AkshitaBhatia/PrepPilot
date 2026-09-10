import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';
import { router } from 'expo-router';
import type { Repositories } from '../../../db/client';
import { getRepositories } from '../../../db/client';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../../../db/test-support/test-database';
import { getInModal, renderWithTheme } from '../../../test-utils/render';
import { useAuthStore } from '../../auth/auth-store';
import { resetDashboardStore } from '../../dashboard/dashboard-store';
import { resetHistoryStore, useHistoryStore } from '../../history/history-store';
import { SessionsScreen } from '../sessions-screen';

jest.mock('../../../db/client', () => ({ getRepositories: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({
  getSupabase: jest.fn(),
  startAutoRefresh: jest.fn(() => jest.fn()),
}));

const USER = 'user-1';

let db: ReturnType<typeof createTestDatabase>;
let repositories: Repositories;

const history = () => useHistoryStore.getState();

beforeEach(() => {
  db = createTestDatabase();
  repositories = createTestRepositories(db, createTestClock(Date.now()));
  (getRepositories as jest.MockedFunction<typeof getRepositories>).mockReturnValue(repositories);
  jest.mocked(router.push).mockClear();
  resetHistoryStore();
  resetDashboardStore();
  useAuthStore.setState({ user: { id: USER } as never, status: 'signedIn' });
});

afterEach(() => {
  db.$close();
});

const render = async () => {
  const view = renderWithTheme(<SessionsScreen />);
  await waitFor(() => expect(history().loading).toBe(false));
  return view;
};

/** A session that ran and was closed properly. */
const completed = async (seconds = 900) => {
  const session = await repositories.sessions.start({ userId: USER, timerMode: 'stopwatch' });
  await repositories.sessions.complete(session.id, seconds);
  return session;
};

/** A session the app never got to close — the process was killed mid-study. */
const abandoned = async (seconds = 300) => {
  const session = await repositories.sessions.start({ userId: USER, timerMode: 'stopwatch' });
  await repositories.sessions.heartbeat(session.id, seconds, 'running');
  await repositories.sessions.abandonInterrupted(USER);
  return session;
};

describe('what the screen reports', () => {
  it('invites a first session when there are none', async () => {
    await render();

    expect(screen.getByTestId('sessions-empty')).toBeOnTheScreen();
  });

  /**
   * An interrupted session still counts as time studied — the student really did
   * spend it — but it is not one they finished, so the two are reported apart
   * rather than one number standing for both.
   */
  it('counts finished and unfinished sessions separately', async () => {
    await completed();
    await completed();
    await abandoned();

    await render();

    expect(screen.getByTestId('sessions-finished')).toHaveTextContent(/Finished\s*2$/);
    expect(screen.getByTestId('sessions-unfinished')).toHaveTextContent(/Unfinished\s*1$/);
  });

  it('reports total time across both kinds', async () => {
    await completed(900);
    await abandoned(300);

    await render();

    // 20 minutes: the abandoned session's time is not thrown away.
    expect(screen.getByTestId('sessions-total')).toHaveTextContent(/0h 20m/);
  });

  it('shows today and the streak', async () => {
    await completed();

    await render();

    expect(screen.getByTestId('sessions-today')).toBeOnTheScreen();
    expect(screen.getByTestId('sessions-streak')).toBeOnTheScreen();
  });

  it('lists the sessions behind the totals', async () => {
    // The figures and the sessions that produced them belong on one screen.
    await completed();

    await render();

    expect(screen.getByRole('button', { name: /^Delete session:/ })).toBeOnTheScreen();
  });
});

describe('deleting a session', () => {
  it('asks first, because the total is not restorable', async () => {
    const session = await completed();
    await render();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /^Delete session:/ }));
    });

    expect(screen.getByText('Delete this session?')).toBeOnTheScreen();
    expect(await repositories.sessions.findById(session.id)).not.toBeNull();
  });

  it('removes it once confirmed', async () => {
    await completed();
    await render();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /^Delete session:/ }));
    });
    await act(async () => {
      fireEvent.press(getInModal('Delete'));
    });

    await waitFor(() => expect(history().sessions).toHaveLength(0));
  });

  it('keeps it when cancelled', async () => {
    await completed();
    await render();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /^Delete session:/ }));
    });
    await act(async () => {
      fireEvent.press(getInModal('Cancel'));
    });

    expect(history().sessions).toHaveLength(1);
  });
});

describe('reaching the rest', () => {
  it('opens reminders, which no longer have a tab of their own', async () => {
    await render();

    fireEvent.press(screen.getByTestId('open-reminders'));

    expect(router.push).toHaveBeenCalledWith('/reminders');
  });

  it('carries the header to the courses, assistant and settings', async () => {
    await render();

    fireEvent.press(screen.getByTestId('header-courses'));
    expect(router.push).toHaveBeenCalledWith('/templates');
  });
});

describe('refreshing and failing', () => {
  it('reloads on pull to refresh', async () => {
    await render();

    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });

    // A session recorded elsewhere appears without leaving the screen.
    await completed();
    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });

    await waitFor(() => expect(history().sessions).toHaveLength(1));
  });

  it('says so when the sessions cannot be read', async () => {
    jest
      .spyOn(repositories.sessions, 'listByUser')
      .mockRejectedValue(new Error('SQLITE_BUSY: database is locked'));

    await render();

    await waitFor(() => expect(screen.getByText(/could not load/i)).toBeOnTheScreen());
    expect(screen.queryByText(/SQLITE_BUSY/)).toBeNull();
  });

  it('recovers when the student retries', async () => {
    const listByUser = jest
      .spyOn(repositories.sessions, 'listByUser')
      .mockRejectedValueOnce(new Error('SQLITE_BUSY'));

    await render();
    await waitFor(() => expect(screen.getByText(/could not load/i)).toBeOnTheScreen());

    listByUser.mockRestore();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Reload' }));
    });

    await waitFor(() => expect(screen.queryByText(/could not load/i)).toBeNull());
  });
});
