import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';
import type { Repositories } from '../../../db/client';
import { getRepositories } from '../../../db/client';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../../../db/test-support/test-database';
import { getInModal, renderWithTheme } from '../../../test-utils/render';
import { useAuthStore } from '../../auth/auth-store';
import { formatSessionDate, SessionRow } from '../components/session-row';
import { HistoryScreen } from '../history-screen';
import { resetHistoryStore, useHistoryStore } from '../history-store';

jest.mock('../../../db/client', () => ({ getRepositories: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({
  getSupabase: jest.fn(),
  startAutoRefresh: jest.fn(() => jest.fn()),
}));

const USER = 'user-1';
const NOW = new Date(2026, 7, 23, 14, 5).getTime();

let db: ReturnType<typeof createTestDatabase>;
let repositories: Repositories;

const history = () => useHistoryStore.getState();

beforeEach(() => {
  db = createTestDatabase();
  const clock = createTestClock(NOW);
  repositories = createTestRepositories(db, clock);
  (getRepositories as jest.MockedFunction<typeof getRepositories>).mockReturnValue(repositories);
  resetHistoryStore();
  useAuthStore.setState({ user: { id: USER } as never, status: 'signedIn' });
});

afterEach(() => {
  db.$close();
});

const render = async () => {
  const view = renderWithTheme(<HistoryScreen />);
  await waitFor(() => expect(history().loading).toBe(false));
  return view;
};

describe('an empty history', () => {
  it('shows the specification copy', async () => {
    await render();

    expect(screen.getByText('No study sessions yet')).toBeOnTheScreen();
    expect(
      screen.getByText('Start a timer to begin building your study history.'),
    ).toBeOnTheScreen();
  });
});

describe('listing sessions', () => {
  it('shows what was studied and for how long', async () => {
    const session = await repositories.sessions.start({
      userId: USER,
      timerMode: 'pomodoro',
      subjectId: 's1',
      subjectName: 'Mathematics',
      chapterName: 'Number Systems',
      topicName: 'Decimal',
    });
    await repositories.sessions.complete(session.id, 1500);

    await render();

    expect(screen.getByText('Decimal')).toBeOnTheScreen();
    // The header total reads the same for a single session, so scope to the row.
    expect(
      within(screen.getByTestId(`session-${session.id}`)).getByText('0h 25m'),
    ).toBeOnTheScreen();
  });

  it('falls back to a general label when nothing was attached', async () => {
    const session = await repositories.sessions.start({ userId: USER, timerMode: 'stopwatch' });
    await repositories.sessions.complete(session.id, 600);

    await render();

    expect(screen.getByText('General study')).toBeOnTheScreen();
  });

  it('excludes sessions that are still running', async () => {
    await repositories.sessions.start({ userId: USER, timerMode: 'stopwatch' });

    await act(async () => {
      await history().load(USER, repositories);
    });

    expect(history().sessions).toHaveLength(0);
  });

  it('totals only settled sessions', async () => {
    const done = await repositories.sessions.start({ userId: USER, timerMode: 'stopwatch' });
    await repositories.sessions.complete(done.id, 900);
    await repositories.sessions.start({ userId: USER, timerMode: 'stopwatch' });

    await act(async () => {
      await history().load(USER, repositories);
    });

    expect(history().totalSeconds).toBe(900);
  });

  /**
   * An abandoned session's duration is a lower bound, not a measurement. Showing
   * it as a plain total would present a partial figure as complete.
   */
  it('marks an interrupted session as such', async () => {
    const session = await repositories.sessions.start({ userId: USER, timerMode: 'stopwatch' });
    await repositories.sessions.heartbeat(session.id, 600, 'running');
    await repositories.sessions.abandonInterrupted(USER);

    await render();

    expect(screen.getByText('interrupted')).toBeOnTheScreen();
  });

  it('shows a student-facing message when history cannot be read', async () => {
    jest
      .spyOn(repositories.sessions, 'listByUser')
      .mockRejectedValue(new Error('SQLITE_BUSY: database is locked'));

    await render();

    expect(screen.getByText(/could not load your study history/)).toBeOnTheScreen();
    expect(screen.queryByText(/SQLITE_BUSY/)).toBeNull();
  });
});

describe('deleting a session', () => {
  const seedCompleted = async (seconds = 900) => {
    const session = await repositories.sessions.start({ userId: USER, timerMode: 'stopwatch' });
    await repositories.sessions.complete(session.id, seconds);
    return session;
  };

  /** Deleting reduces total study time, so it is confirmed rather than immediate. */
  it('asks before deleting', async () => {
    const session = await seedCompleted();
    await render();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /^Delete session:/ }));
    });

    expect(screen.getByText('Delete this session?')).toBeOnTheScreen();
    expect(await repositories.sessions.findById(session.id)).not.toBeNull();
  });

  it('removes it once confirmed, and reduces the total', async () => {
    await seedCompleted(900);
    await render();
    expect(history().totalSeconds).toBe(900);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /^Delete session:/ }));
    });
    await act(async () => {
      fireEvent.press(getInModal('Delete'));
    });

    await waitFor(() => expect(history().sessions).toHaveLength(0));
    expect(history().totalSeconds).toBe(0);
  });

  it('keeps it when cancelled', async () => {
    await seedCompleted();
    await render();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /^Delete session:/ }));
    });
    await act(async () => {
      fireEvent.press(getInModal('Cancel'));
    });

    expect(history().sessions).toHaveLength(1);
  });

  it('reports a failure without claiming success', async () => {
    const session = await seedCompleted();
    await render();
    jest.spyOn(repositories.sessions, 'softDelete').mockRejectedValue(new Error('SQLITE_BUSY'));

    await act(async () => {
      await history().deleteSession(session.id);
    });

    expect(history().error).toBe('We could not delete that session. Try again.');
    expect(history().sessions).toHaveLength(1);
  });

  /** The dashboard's rows are informational, so they offer no delete. */
  it('is not offered where the row is informational', () => {
    renderWithTheme(
      <SessionRow
        session={
          {
            id: 's',
            userId: USER,
            subjectId: null,
            chapterId: null,
            topicId: null,
            subjectName: null,
            chapterName: null,
            topicName: null,
            startedAt: NOW,
            endedAt: NOW,
            durationSeconds: 600,
            timerMode: 'stopwatch',
            status: 'completed',
            createdAt: NOW,
            updatedAt: NOW,
            deletedAt: null,
            syncStatus: 'pending',
          } as never
        }
      />,
    );

    expect(screen.queryByRole('button', { name: /^Delete session:/ })).toBeNull();
  });
});

describe('pull to refresh', () => {
  it('picks up a session recorded elsewhere', async () => {
    await render();
    expect(history().sessions).toHaveLength(0);

    const session = await repositories.sessions.start({ userId: USER, timerMode: 'stopwatch' });
    await repositories.sessions.complete(session.id, 600);

    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });

    await waitFor(() => expect(history().sessions).toHaveLength(1));
  });
});

describe('formatSessionDate', () => {
  it('formats as day, short month and 24-hour time', () => {
    expect(formatSessionDate(new Date(2026, 7, 23, 14, 5).getTime())).toMatch(/^23 \w{3}, 14:05$/);
  });

  it('zero-pads the time', () => {
    expect(formatSessionDate(new Date(2026, 0, 5, 9, 7).getTime())).toMatch(/^5 \w{3}, 09:07$/);
  });
});

describe('SessionRow', () => {
  it('shows the parent subject alongside a topic', () => {
    renderWithTheme(
      <SessionRow
        session={
          {
            id: 's',
            userId: USER,
            subjectId: 'x',
            chapterId: null,
            topicId: 't',
            subjectName: 'Mathematics',
            chapterName: null,
            topicName: 'Decimal',
            startedAt: NOW,
            endedAt: NOW,
            durationSeconds: 600,
            timerMode: 'stopwatch',
            status: 'completed',
            createdAt: NOW,
            updatedAt: NOW,
            deletedAt: null,
            syncStatus: 'pending',
          } as never
        }
      />,
    );

    expect(screen.getByText('Decimal')).toBeOnTheScreen();
    expect(screen.getByText(/Mathematics/)).toBeOnTheScreen();
  });
});

describe('recovering from a failure', () => {
  it('reloads when the student retries, and clears the message on success', async () => {
    const listByUser = jest
      .spyOn(repositories.sessions, 'listByUser')
      .mockRejectedValueOnce(new Error('SQLITE_BUSY: database is locked'));

    await render();
    expect(screen.getByText(/could not load your study history/)).toBeOnTheScreen();

    listByUser.mockRestore();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Reload' }));
    });

    expect(screen.queryByText(/could not load your study history/)).toBeNull();
  });

  it('ignores a delete requested before the store has a database', async () => {
    // Nothing to delete against, and nothing to report: the screen that would
    // trigger this cannot render before the store is configured.
    resetHistoryStore();

    await act(async () => {
      await history().deleteSession('session-1');
    });

    expect(history().error).toBeNull();
  });
});
