import { act, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { isDemoMode } from '../../../config/env';
import { getRepositories, initialiseDatabase } from '../../../db/client';
import { seedDemoData } from '../../../db/demo-seed';
import { startAutoRefresh } from '../../../lib/supabase';
import { renderWithTheme } from '../../../test-utils/render';
import { AuthGate, STARTUP_TIMEOUT_MS, describeStartupFailure } from '../auth-gate';
import { resetAuthStore, useAuthStore } from '../auth-store';

jest.mock('../../../config/env', () => ({
  ...jest.requireActual('../../../config/env'),
  isDemoMode: jest.fn(() => true),
}));
jest.mock('../../../db/client', () => ({
  initialiseDatabase: jest.fn(async () => undefined),
  getRepositories: jest.fn(() => ({}) as never),
}));
jest.mock('../../../db/demo-seed', () => ({ seedDemoData: jest.fn(async () => true) }));
jest.mock('../../../lib/supabase', () => ({
  startAutoRefresh: jest.fn(() => jest.fn()),
  getSupabase: jest.fn(),
}));

const mockedInit = initialiseDatabase as jest.MockedFunction<typeof initialiseDatabase>;
const mockedSeed = seedDemoData as jest.MockedFunction<typeof seedDemoData>;
const mockedDemo = isDemoMode as jest.MockedFunction<typeof isDemoMode>;
const mockedRefresh = startAutoRefresh as jest.MockedFunction<typeof startAutoRefresh>;

const child = () => <Text>The tracker</Text>;

beforeEach(() => {
  jest.clearAllMocks();
  resetAuthStore();
  mockedDemo.mockReturnValue(true);
  mockedInit.mockResolvedValue(undefined);
  mockedSeed.mockResolvedValue(true);
  (getRepositories as jest.Mock).mockReturnValue({});
  // The demo path signs in locally, which is what start-up waits on.
  useAuthStore.setState({
    initialise: jest.fn(async () => {
      useAuthStore.setState({ status: 'signedIn', user: { id: 'demo' } as never });
      return () => {};
    }) as never,
  });
});

const renderGate = async () => {
  const view = renderWithTheme(<AuthGate>{child()}</AuthGate>);
  await act(async () => {
    await Promise.resolve();
  });
  return view;
};

describe('opening the app', () => {
  it('shows the app once start-up finishes', async () => {
    await renderGate();

    await waitFor(() => expect(screen.getByText('The tracker')).toBeOnTheScreen());
  });

  it('waits for the database before anything reads it', async () => {
    await renderGate();

    await waitFor(() => expect(mockedInit).toHaveBeenCalled());
    // Seeding queries tables the migrations create. Running it first was the
    // race that left the app on the splash screen.
    expect(mockedInit.mock.invocationCallOrder[0]).toBeLessThan(
      mockedSeed.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it('shows the splash while it is still working', async () => {
    let release = (): void => {};
    mockedInit.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    await renderGate();

    expect(screen.queryByText('The tracker')).toBeNull();
    expect(screen.getByText('Tracker first, AI second')).toBeOnTheScreen();
    await act(async () => {
      release();
    });
  });
});

/**
 * The app shipped an Android build that sat on the splash screen for ever: the
 * start-up block had no error handling, so one rejection ended it silently.
 */
describe('when start-up goes wrong', () => {
  it('never leaves the student on the splash screen', async () => {
    mockedInit.mockRejectedValue(new Error('database is locked'));

    await renderGate();

    await waitFor(() => expect(screen.queryByText('Tracker first, AI second')).toBeNull());
  });

  it('says the database could not be opened', async () => {
    mockedInit.mockRejectedValue(new Error('database is locked'));

    await renderGate();

    await waitFor(() => expect(screen.getByTestId('startup-failed')).toBeOnTheScreen());
    expect(screen.getByText('PrepPilot could not start')).toBeOnTheScreen();
  });

  /** A device-only failure cannot be diagnosed from "something went wrong". */
  it('shows the underlying cause rather than swallowing it', async () => {
    mockedInit.mockRejectedValue(new Error('no such table: subjects'));

    await renderGate();

    await waitFor(() => expect(screen.getByText('no such table: subjects')).toBeOnTheScreen());
  });

  it('opens anyway when seeding the demo data fails', async () => {
    mockedSeed.mockRejectedValue(new Error('disk full'));

    await renderGate();

    await waitFor(() => expect(screen.getByText('The tracker')).toBeOnTheScreen());
  });

  it('opens anyway when the session cannot be restored', async () => {
    useAuthStore.setState({
      initialise: jest.fn(async () => {
        throw new Error('secure store unavailable');
      }) as never,
    });

    await renderGate();

    await waitFor(() => expect(screen.getByText('The tracker')).toBeOnTheScreen());
  });

  it('opens anyway when token refresh cannot start', async () => {
    mockedDemo.mockReturnValue(false);
    mockedRefresh.mockImplementation(() => {
      throw new Error('no supabase project');
    });

    await renderGate();

    await waitFor(() => expect(screen.getByText('The tracker')).toBeOnTheScreen());
  });
});

/**
 * Everything above is guarded, but a promise that never settles cannot be
 * caught. After long enough the app opens regardless.
 */
describe('when start-up hangs', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens the app rather than waiting for ever', async () => {
    mockedInit.mockReturnValue(new Promise<void>(() => {}));
    renderWithTheme(<AuthGate>{child()}</AuthGate>);

    await act(async () => {
      jest.advanceTimersByTime(STARTUP_TIMEOUT_MS + 1);
    });

    expect(screen.getByText('The tracker')).toBeOnTheScreen();
  });

  /** An app that does not know who you are should ask, not show an empty one. */
  it('falls back to signed out so the student can sign in', async () => {
    mockedInit.mockReturnValue(new Promise<void>(() => {}));
    useAuthStore.setState({ status: 'initialising', initialise: jest.fn() as never });
    renderWithTheme(<AuthGate>{child()}</AuthGate>);

    await act(async () => {
      jest.advanceTimersByTime(STARTUP_TIMEOUT_MS + 1);
    });

    expect(useAuthStore.getState().status).toBe('signedOut');
  });
});

describe('describing a failure', () => {
  it('uses the error message', () => {
    expect(describeStartupFailure(new Error('no such table'))).toBe('no such table');
  });

  it('copes with something that is not an error', () => {
    expect(describeStartupFailure('exploded')).toBe('exploded');
  });
});
