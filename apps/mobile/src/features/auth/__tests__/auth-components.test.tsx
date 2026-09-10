import { act, renderWithTheme, screen, waitFor } from '../../../test-utils/render';
import { Text } from '../../../components/ui';
import { AuthGate, needsBrowserBuildNotice } from '../auth-gate';
import { BrowserBuildNotice } from '../components/browser-build-notice';
import { AuthError } from '../components/auth-error';
import { AuthLayout } from '../components/auth-layout';
import { resetAuthStore, useAuthStore } from '../auth-store';

jest.mock('../../../lib/supabase', () => ({
  getSupabase: jest.fn(),
  startAutoRefresh: jest.fn(() => jest.fn()),
}));

// AuthGate opens the database before the first screen renders; these tests are
// about the gate's own sequencing, not about storage.
jest.mock('../../../db/client', () => ({
  initialiseDatabase: jest.fn(async () => {}),
  getRepositories: jest.fn(),
}));

describe('AuthError', () => {
  it('renders nothing when there is no message', () => {
    renderWithTheme(<AuthError message={null} />);

    expect(screen.queryByTestId('auth-error')).toBeNull();
  });

  /**
   * A student using a screen reader would otherwise submit the form and hear
   * nothing back, so the message is announced rather than merely displayed.
   */
  it('announces the message as an alert', () => {
    renderWithTheme(<AuthError message="That code has expired. Ask for a new one." />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeOnTheScreen();
    expect(screen.getByText('That code has expired. Ask for a new one.')).toBeOnTheScreen();
  });
});

describe('AuthLayout', () => {
  it('renders its title, subtitle, content and footer', () => {
    renderWithTheme(
      <AuthLayout title="Welcome back" subtitle="Sign in to continue." footer={<Text>Footer</Text>}>
        <Text>Form</Text>
      </AuthLayout>,
    );

    expect(screen.getByText('Welcome back')).toBeOnTheScreen();
    expect(screen.getByText('Sign in to continue.')).toBeOnTheScreen();
    expect(screen.getByText('Form')).toBeOnTheScreen();
    expect(screen.getByText('Footer')).toBeOnTheScreen();
  });

  it('omits the footer when none is given', () => {
    renderWithTheme(
      <AuthLayout title="Welcome back" subtitle="Sign in to continue.">
        <Text>Form</Text>
      </AuthLayout>,
    );

    expect(screen.queryByText('Footer')).toBeNull();
  });
});

describe('AuthGate', () => {
  beforeEach(() => {
    resetAuthStore();
  });

  /**
   * Rendering routes before the stored session is read would flash the Login
   * screen at a student who is already signed in.
   */
  it('shows a loading state until the session has been read', async () => {
    let settle: () => void = () => {};
    const initialise = jest.fn(
      () =>
        new Promise<() => void>((resolve) => {
          settle = () => resolve(jest.fn());
        }),
    );
    useAuthStore.setState({ initialise });

    renderWithTheme(
      <AuthGate>
        <Text>Tracker</Text>
      </AuthGate>,
    );

    expect(screen.getByTestId('splash')).toBeOnTheScreen();
    expect(screen.queryByText('Tracker')).toBeNull();

    // The gate opens the database before reading the session, so `settle` is not
    // assigned until initialise() has actually been called.
    await waitFor(() => expect(initialise).toHaveBeenCalled());

    await act(async () => {
      useAuthStore.setState({ status: 'signedOut' });
      settle();
    });

    await waitFor(() => expect(screen.getByText('Tracker')).toBeOnTheScreen());
  });

  it('renders its children once initialisation has settled', async () => {
    useAuthStore.setState({
      initialise: jest.fn(async () => jest.fn()),
      status: 'signedOut',
    });

    renderWithTheme(
      <AuthGate>
        <Text>Tracker</Text>
      </AuthGate>,
    );

    await waitFor(() => expect(screen.getByText('Tracker')).toBeOnTheScreen());
  });

  it('unsubscribes from auth changes when unmounted', async () => {
    const unsubscribe = jest.fn();
    useAuthStore.setState({
      initialise: jest.fn(async () => unsubscribe),
      status: 'signedOut',
    });

    const { unmount } = renderWithTheme(
      <AuthGate>
        <Text>Tracker</Text>
      </AuthGate>,
    );

    await waitFor(() => expect(screen.getByText('Tracker')).toBeOnTheScreen());
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

/**
 * `expo-secure-store` has no web implementation — it exports an empty object, so
 * every session read throws and nothing persists. SECURITY.md requires tokens in
 * the device keystore and a browser has none, so the browser build says so
 * rather than crashing on start-up with an unhandled rejection.
 */
describe('the browser build', () => {
  it('refuses to pretend it can hold a real session', () => {
    expect(needsBrowserBuildNotice('web', false)).toBe(true);
  });

  it('runs normally as a demonstration, which needs no session', () => {
    expect(needsBrowserBuildNotice('web', true)).toBe(false);
  });

  it('never gets in the way on a device that does have a keystore', () => {
    expect(needsBrowserBuildNotice('android', false)).toBe(false);
    expect(needsBrowserBuildNotice('ios', false)).toBe(false);
  });

  it('explains what to do instead of only what failed', () => {
    renderWithTheme(<BrowserBuildNotice />);

    expect(screen.getByTestId('browser-build-notice')).toBeOnTheScreen();
    expect(screen.getByText(/no secure keystore/)).toBeOnTheScreen();
    expect(screen.getByText(/EXPO_PUBLIC_DEMO_MODE=true/)).toBeOnTheScreen();
  });
});
