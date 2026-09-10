import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AppState } from 'react-native';
import { StudySessionRepository } from '../../../db/repositories/study-sessions';
import { createTestClock, createTestDatabase } from '../../../db/test-support/test-database';
import { renderWithTheme } from '../../../test-utils/render';
import { activeCapabilities, focusCapabilities } from '../capabilities';
import { FocusScreen } from '../focus-screen';
import {
  configureFocusContext,
  resetFocusStore,
  useFocusStore,
  watchForDistractions,
} from '../focus-store';

jest.mock('../../../lib/supabase', () => ({
  getSupabase: jest.fn(),
  startAutoRefresh: jest.fn(() => jest.fn()),
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));

const USER = 'user-1';
const NOW = new Date(2026, 7, 24, 10).getTime();

let db: ReturnType<typeof createTestDatabase>;
let clock: ReturnType<typeof createTestClock>;
let sessions: StudySessionRepository;

const focus = () => useFocusStore.getState();

beforeEach(() => {
  db = createTestDatabase();
  clock = createTestClock(NOW);
  sessions = new StudySessionRepository(db, clock);
  resetFocusStore();
  configureFocusContext({ userId: USER, sessions, now: clock.now });
});

afterEach(() => {
  db.$close();
});

describe('capabilities', () => {
  /**
   * PRD §17: "Never claim universal app blocking. Document device/API
   * limitations." The panel is that documentation, so this must stay false.
   */
  it('never claims it can block other apps', () => {
    const blocking = focusCapabilities('android').find((entry) => entry.id === 'blocking');

    expect(blocking?.supported).toBe(false);
    expect(blocking?.detail).toMatch(/does not let PrepPilot block other apps/);
  });

  it('does not claim it can silence other apps', () => {
    expect(focusCapabilities('android').find((entry) => entry.id === 'dnd')?.supported).toBe(false);
  });

  it('claims only what it does: a full-screen timer and its own silence', () => {
    const supported = activeCapabilities('android').map((entry) => entry.id);

    expect(supported).toEqual(
      expect.arrayContaining(['fullscreen', 'quiet', 'awake', 'distractions']),
    );
    expect(supported).not.toContain('blocking');
  });

  /** The browser build cannot keep the screen awake or watch app state. */
  it('reports fewer capabilities on the web', () => {
    const web = focusCapabilities('web');

    expect(web.find((entry) => entry.id === 'awake')?.supported).toBe(false);
    expect(web.find((entry) => entry.id === 'distractions')?.supported).toBe(false);
    expect(web.find((entry) => entry.id === 'fullscreen')?.supported).toBe(true);
  });
});

describe('running a session', () => {
  it('records a study session when it begins', async () => {
    await act(async () => {
      await focus().begin({ minutes: 25 });
    });

    expect(focus().timer?.status).toBe('running');
    expect(await sessions.findById(focus().sessionId!)).toMatchObject({
      status: 'running',
      timerMode: 'custom',
    });
  });

  it('ignores a second start while one is running', async () => {
    await act(async () => {
      await focus().begin({ minutes: 25 });
    });
    const first = focus().sessionId;

    await act(async () => {
      await focus().begin({ minutes: 45 });
    });

    expect(focus().sessionId).toBe(first);
  });

  it('completes the session and reports the time focused', async () => {
    await act(async () => {
      await focus().begin({ minutes: 25 });
    });
    const sessionId = focus().sessionId!;
    clock.advance(600_000);

    await act(async () => {
      await focus().end();
    });

    expect(await sessions.findById(sessionId)).toMatchObject({
      status: 'completed',
      durationSeconds: 600,
    });
    expect(focus().lastSessionSeconds).toBe(600);
  });

  /** Refusing to let someone start studying is worse than losing the record. */
  it('still runs the timer when the session cannot be recorded', async () => {
    jest.spyOn(sessions, 'start').mockRejectedValue(new Error('SQLITE_BUSY'));

    await act(async () => {
      await focus().begin({ minutes: 25 });
    });

    expect(focus().timer?.status).toBe('running');
    expect(focus().error).toMatch(/still running/);
  });

  it('reports a failure to save the finished session', async () => {
    await act(async () => {
      await focus().begin({ minutes: 25 });
    });
    jest.spyOn(sessions, 'complete').mockRejectedValue(new Error('disk full'));

    await act(async () => {
      await focus().end();
    });

    expect(focus().error).toMatch(/could not save this session/);
  });

  it('does nothing when ending with no session', async () => {
    await expect(focus().end()).resolves.toBeUndefined();
  });
});

describe('counting distractions', () => {
  /**
   * The honest substitute for app blocking: PrepPilot cannot stop someone
   * switching away, but it can notice and tell them afterwards.
   */
  it('counts each time the app leaves the foreground', async () => {
    const listeners: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      listeners.push(handler as (state: string) => void);
      return { remove: jest.fn() } as never;
    });

    await act(async () => {
      await focus().begin({ minutes: 25 });
    });
    const stop = watchForDistractions();

    act(() => {
      listeners[0]?.('background');
      listeners[0]?.('active');
      listeners[0]?.('background');
    });

    expect(focus().timesLeft).toBe(2);
    stop();
  });

  /** The OS reports intermediate states; one switch away must count once. */
  it('does not count repeated background reports as separate departures', async () => {
    const listeners: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      listeners.push(handler as (state: string) => void);
      return { remove: jest.fn() } as never;
    });

    await act(async () => {
      await focus().begin({ minutes: 25 });
    });
    watchForDistractions();

    act(() => {
      listeners[0]?.('inactive');
      listeners[0]?.('background');
    });

    expect(focus().timesLeft).toBe(1);
  });

  it('counts nothing when no session is running', () => {
    act(() => {
      focus().noteLeft();
    });

    expect(focus().timesLeft).toBe(0);
  });

  it('removes its listener when torn down', async () => {
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove } as never);

    watchForDistractions()();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('the screen', () => {
  const render = () => renderWithTheme(<FocusScreen />);

  it('offers durations before starting', () => {
    render();

    expect(screen.getByRole('button', { name: '25 min' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '90 min' })).toBeOnTheScreen();
  });

  it('states plainly that it cannot block other apps', () => {
    render();

    expect(
      screen.getByText(/does not let PrepPilot block other apps|Not possible on this platform/),
    ).toBeOnTheScreen();
  });

  it('starts a session from the chosen duration', async () => {
    render();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: '45 min' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start focus session' }));
    });

    await waitFor(() => expect(focus().timer?.targetSeconds).toBe(45 * 60));
  });

  it('shows the countdown while running', async () => {
    render();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start focus session' }));
    });

    await waitFor(() => expect(screen.getByTestId('focus-readout')).toHaveTextContent('00:25:00'));
  });

  it('shows how many times the student left', async () => {
    render();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start focus session' }));
    });

    act(() => {
      focus().noteLeft();
    });

    await waitFor(() =>
      expect(screen.getByText('You have left PrepPilot 1 time')).toBeOnTheScreen(),
    );
  });

  it('summarises the session once it ends', async () => {
    render();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start focus session' }));
    });
    clock.advance(900_000);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'End session' }));
    });

    await waitFor(() => expect(screen.getByText('Session finished')).toBeOnTheScreen());
    expect(screen.getByTestId('focus-summary-time')).toBeOnTheScreen();
    expect(screen.getByTestId('focus-summary-left')).toBeOnTheScreen();
  });

  it('can start another session from the summary', async () => {
    render();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start focus session' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'End session' }));
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start another' }));
    });

    expect(screen.getByRole('button', { name: 'Start focus session' })).toBeOnTheScreen();
  });
});

describe('the countdown finishing', () => {
  /** A finished session must stop recording, not keep banking time. */
  it('ends itself when the time runs out', async () => {
    jest.useFakeTimers();
    renderWithTheme(<FocusScreen />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: '25 min' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start focus session' }));
    });

    await act(async () => {
      clock.advance(25 * 60 * 1000);
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => expect(focus().timer?.status).toBe('finished'));
    jest.useRealTimers();
  });
});

describe('navigation from the summary', () => {
  it('offers a way back to the tracker', async () => {
    renderWithTheme(<FocusScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start focus session' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'End session' }));
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Back to tracker' }));
    });

    expect(router.push).toHaveBeenCalledWith('/');
  });
});

describe('errors', () => {
  it('shows a student-facing message before starting', async () => {
    jest.spyOn(sessions, 'start').mockRejectedValue(new Error('SQLITE_BUSY'));
    renderWithTheme(<FocusScreen />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Start focus session' }));
    });
    await act(async () => {
      await focus().end();
    });
    act(() => {
      focus().reset();
    });
    // Re-render the idle screen with the error still set.
    act(() => {
      useFocusStore.setState({ error: 'We could not record this session.' });
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeOnTheScreen());
  });

  it('dismisses an error', () => {
    act(() => {
      useFocusStore.setState({ error: 'boom' });
      focus().clearError();
    });

    expect(focus().error).toBeNull();
  });
});

describe('using the store before configuration', () => {
  it('fails with an actionable message', async () => {
    resetFocusStore();

    await expect(focus().begin({ minutes: 25 })).rejects.toThrow(/configureFocusContext/);
  });
});
