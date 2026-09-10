import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import type { Repositories } from '../../../db/client';
import { getRepositories } from '../../../db/client';
import { StudySessionRepository } from '../../../db/repositories/study-sessions';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../../../db/test-support/test-database';
import { getInModal, renderWithTheme } from '../../../test-utils/render';
import { TimerScreen } from '../timer-screen';
import { useAuthStore } from '../../auth/auth-store';
import { configureTimerContext, resetTimerStore, useTimerStore } from '../timer-store';

jest.mock('../../../db/client', () => ({ getRepositories: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({
  getSupabase: jest.fn(),
  startAutoRefresh: jest.fn(() => jest.fn()),
}));

const USER = 'user-1';

let db: ReturnType<typeof createTestDatabase>;
let clock: ReturnType<typeof createTestClock>;
let sessions: StudySessionRepository;
let repositories: Repositories;

const store = () => useTimerStore.getState();

beforeEach(() => {
  jest.useFakeTimers();
  db = createTestDatabase();
  clock = createTestClock();
  sessions = new StudySessionRepository(db, clock);
  repositories = createTestRepositories(db, clock);
  (getRepositories as jest.MockedFunction<typeof getRepositories>).mockReturnValue(repositories);
  resetTimerStore();
  configureTimerContext({ userId: USER, sessions, now: clock.now });
  // Persisting settings needs a signed-in account, as it does in the app.
  useAuthStore.setState({ user: { id: USER } as never, status: 'signedIn' });

  jest.mocked(useLocalSearchParams).mockReturnValue({
    subjectId: 's1',
    subjectName: 'Mathematics',
    accent: '#3B82F6',
  });
});

afterEach(() => {
  jest.useRealTimers();
  db.$close();
});

const renderTimer = async () => {
  const view = renderWithTheme(<TimerScreen />);
  await waitFor(() => expect(store().timer).not.toBeNull());
  return view;
};

describe('setting up', () => {
  it('labels the timer with what is being studied', async () => {
    await renderTimer();

    expect(screen.getByText('Mathematics')).toBeOnTheScreen();
  });

  it('prefers the most specific name available', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({
      subjectName: 'Mathematics',
      chapterName: 'Number Systems',
      topicName: 'Decimal',
    });

    await renderTimer();

    expect(screen.getByText('Decimal')).toBeOnTheScreen();
  });

  it('falls back to a general label when nothing is attached', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({});

    await renderTimer();

    expect(screen.getByText('General study')).toBeOnTheScreen();
  });

  it('starts on the stopwatch at zero', async () => {
    await renderTimer();

    expect(screen.getByTestId('timer-readout')).toHaveTextContent('00:00:00');
  });

  it('offers all three modes required by the PRD', async () => {
    await renderTimer();

    expect(screen.getByRole('button', { name: 'Stopwatch' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pomodoro' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Custom' })).toBeOnTheScreen();
  });

  it('switches to a Pomodoro showing the work interval', async () => {
    await renderTimer();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Pomodoro' }));
    });

    expect(screen.getByTestId('timer-readout')).toHaveTextContent('00:25:00');
  });

  it('offers custom presets once Custom is chosen', async () => {
    await renderTimer();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Custom' }));
    });

    expect(screen.getByRole('button', { name: '45 min' })).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: '45 min' }));
    });

    expect(screen.getByTestId('timer-readout')).toHaveTextContent('00:45:00');
  });
});

describe('running a session', () => {
  it('counts up from zero and records a session', async () => {
    await renderTimer();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    });

    expect(store().sessionId).not.toBeNull();

    await act(async () => {
      clock.advance(65_000);
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('timer-readout')).toHaveTextContent('00:01:05');
  });

  it('offers pause and stop while running', async () => {
    await renderTimer();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    });

    expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeOnTheScreen();
  });

  it('holds the readout steady while paused', async () => {
    await renderTimer();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    });

    await act(async () => {
      clock.advance(30_000);
      jest.advanceTimersByTime(1000);
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    });

    await act(async () => {
      clock.advance(600_000);
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('timer-readout')).toHaveTextContent('00:00:30');
    expect(screen.getByRole('button', { name: 'Resume' })).toBeOnTheScreen();
  });

  it('reports the saved session when stopped', async () => {
    await renderTimer();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    });
    await act(async () => {
      clock.advance(1_800_000);
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Stop' }));
    });

    expect(screen.getByText('Session saved')).toBeOnTheScreen();
    expect(screen.getByText('You studied 0h 30m.')).toBeOnTheScreen();
  });

  /**
   * The display refreshes every second; the database is written every thirty.
   * Conflating the two would either waste writes or look frozen.
   */
  it('writes progress on the heartbeat interval, not on every frame', async () => {
    const heartbeat = jest.spyOn(sessions, 'heartbeat');
    await renderTimer();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    });

    await act(async () => {
      clock.advance(5000);
      jest.advanceTimersByTime(5000);
    });
    expect(heartbeat).not.toHaveBeenCalled();

    await act(async () => {
      clock.advance(30_000);
      jest.advanceTimersByTime(30_000);
    });
    expect(heartbeat).toHaveBeenCalled();
  });
});

describe('countdowns', () => {
  it('counts down and stops itself when the time runs out', async () => {
    await renderTimer();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Custom' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: '15 min' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    });

    await act(async () => {
      clock.advance(15 * 60 * 1000);
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => expect(store().timer?.status).toBe('finished'));
    expect(screen.getByText('Session saved')).toBeOnTheScreen();
  });
});

describe('the Pomodoro cycle on screen', () => {
  const startPomodoro = async () => {
    await renderTimer();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Pomodoro' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    });
  };

  it('offers a break once the work interval finishes', async () => {
    await startPomodoro();

    await act(async () => {
      clock.advance(25 * 60 * 1000);
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Take a break' })).toBeOnTheScreen(),
    );
  });

  it('moves to the short break and shows its length', async () => {
    await startPomodoro();
    await act(async () => {
      clock.advance(25 * 60 * 1000);
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Take a break' }));
    });

    expect(store().timer?.phase).toBe('shortBreak');
    expect(screen.getByTestId('timer-readout')).toHaveTextContent('00:05:00');
  });

  it('counts completed intervals', async () => {
    await startPomodoro();
    await act(async () => {
      clock.advance(25 * 60 * 1000);
      jest.advanceTimersByTime(1000);
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Take a break' }));
    });

    // toHaveTextContent matches the chip's full text, label included, so the
    // counter itself is asserted on the state that renders it.
    expect(store().timer?.completedWorkIntervals).toBe(1);
    expect(screen.getByTestId('pomodoro-intervals')).toBeOnTheScreen();
  });

  it('starts a fresh session from the finished state', async () => {
    await renderTimer();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    });
    await act(async () => {
      clock.advance(60_000);
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Stop' }));
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'New session' }));
    });

    expect(screen.getByTestId('timer-readout')).toHaveTextContent('00:00:00');
    expect(screen.getByRole('button', { name: 'Start' })).toBeOnTheScreen();
  });
});

describe('configuring the Pomodoro', () => {
  /**
   * D23 said the defaults were "all configurable" from the start. Until now
   * nothing let a student change them, which made the decision a statement of
   * intent rather than a fact.
   */
  const openSettings = async () => {
    await renderTimer();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Pomodoro' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Pomodoro settings' }));
    });
  };

  it('is not offered for the other modes', async () => {
    await renderTimer();

    expect(screen.queryByRole('button', { name: 'Pomodoro settings' })).toBeNull();
  });

  it('opens with the current values', async () => {
    await openSettings();

    expect(getInModal('Increase Focus interval')).toBeOnTheScreen();
    expect(screen.getByText('25 min')).toBeOnTheScreen();
  });

  it('applies a longer focus interval immediately', async () => {
    await openSettings();

    await act(async () => {
      fireEvent.press(getInModal('Increase Focus interval'));
    });
    await act(async () => {
      fireEvent.press(getInModal('Save'));
    });

    await waitFor(() => expect(store().timer?.targetSeconds).toBe(30 * 60));
  });

  it('persists the choice for the next session', async () => {
    await openSettings();
    await act(async () => {
      fireEvent.press(getInModal('Increase Focus interval'));
    });
    await act(async () => {
      fireEvent.press(getInModal('Save'));
    });

    await waitFor(async () =>
      expect(await repositories.preferences.get(USER, 'timer.pomodoro')).not.toBeNull(),
    );
  });

  it('discards changes on cancel', async () => {
    await openSettings();

    await act(async () => {
      fireEvent.press(getInModal('Increase Focus interval'));
    });
    await act(async () => {
      fireEvent.press(getInModal('Cancel'));
    });

    expect(store().timer?.targetSeconds).toBe(25 * 60);
  });

  /** The bounds live in the control, so there is no invalid state to report. */
  it('will not go below the minimum focus interval', async () => {
    await openSettings();

    for (let i = 0; i < 10; i += 1) {
      await act(async () => {
        fireEvent.press(getInModal('Decrease Focus interval'));
      });
    }

    expect(getInModal('Decrease Focus interval').props.accessibilityState.disabled).toBe(true);
  });
});

describe('a custom length beyond the presets', () => {
  /** PRD §11 calls the mode Custom; presets are shortcuts, not the whole choice. */
  it('can be stepped to an arbitrary duration', async () => {
    await renderTimer();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Custom' }));
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Increase Or choose a length' }));
    });

    await waitFor(() => expect(store().timer?.targetSeconds).toBe(30 * 60));
  });
});

describe('errors', () => {
  it('shows a student-facing message and can dismiss it', async () => {
    jest.spyOn(sessions, 'start').mockRejectedValue(new Error('SQLITE_BUSY'));
    await renderTimer();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    });

    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(screen.queryByText(/SQLITE_BUSY/)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
