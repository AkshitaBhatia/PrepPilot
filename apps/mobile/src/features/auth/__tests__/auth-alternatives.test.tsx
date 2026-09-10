import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderWithTheme } from '../../../test-utils/render';
import { getFeatures } from '../../../config/features';
import { resetAuthStore, useAuthStore } from '../auth-store';
import { AuthAlternatives } from '../components/auth-alternatives';
import { signInWithGoogle } from '../google';

jest.mock('../../../lib/supabase', () => ({
  getSupabase: jest.fn(),
  startAutoRefresh: jest.fn(() => jest.fn()),
}));
jest.mock('../google', () => ({ signInWithGoogle: jest.fn() }));
jest.mock('../../../config/features', () => ({ getFeatures: jest.fn() }));

const mockedGetFeatures = getFeatures as jest.MockedFunction<typeof getFeatures>;
const mockedSignInWithGoogle = signInWithGoogle as jest.MockedFunction<typeof signInWithGoogle>;

beforeEach(() => {
  jest.clearAllMocks();
  resetAuthStore();
  mockedSignInWithGoogle.mockResolvedValue('signedIn');
});

/**
 * A sign-in button that cannot possibly work is worse than no button: the
 * student cannot tell the missing configuration apart from their own mistake
 * (DECISIONS.md, D26).
 */
describe('what is offered', () => {
  it('offers no third-party method that is not configured', () => {
    mockedGetFeatures.mockReturnValue({ googleSignIn: false, phoneOtp: false });

    renderWithTheme(<AuthAlternatives />);

    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use phone number' })).toBeNull();
  });

  /**
   * Guest never depends on configuration: it needs no provider, and a student
   * who only wants to try the tracker should never be stuck at a sign-in screen
   * with nothing on it.
   */
  it('always offers to continue without an account', () => {
    mockedGetFeatures.mockReturnValue({ googleSignIn: false, phoneOtp: false });

    renderWithTheme(<AuthAlternatives />);

    expect(screen.getByTestId('continue-as-guest')).toBeOnTheScreen();
  });

  it('offers Google once an OAuth client exists', () => {
    mockedGetFeatures.mockReturnValue({ googleSignIn: true, phoneOtp: false });

    renderWithTheme(<AuthAlternatives />);

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Use phone number' })).toBeNull();
  });

  it('offers phone once an SMS provider exists', () => {
    mockedGetFeatures.mockReturnValue({ googleSignIn: false, phoneOtp: true });

    renderWithTheme(<AuthAlternatives />);

    expect(screen.getByRole('button', { name: 'Use phone number' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
  });

  it('names the phone route for the screen it sits on', () => {
    // Sign-in and sign-up share one OTP screen, but not one wording.
    mockedGetFeatures.mockReturnValue({ googleSignIn: false, phoneOtp: true });

    renderWithTheme(<AuthAlternatives phoneLabel="Sign up with a phone number" />);

    expect(screen.getByRole('button', { name: 'Sign up with a phone number' })).toBeOnTheScreen();
  });
});

describe('using them', () => {
  beforeEach(() => {
    mockedGetFeatures.mockReturnValue({ googleSignIn: true, phoneOtp: true });
  });

  it('starts the Google flow', async () => {
    renderWithTheme(<AuthAlternatives />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
    });

    expect(mockedSignInWithGoogle).toHaveBeenCalled();
  });

  it('goes to the phone screen', () => {
    renderWithTheme(<AuthAlternatives />);

    fireEvent.press(screen.getByRole('button', { name: 'Use phone number' }));

    expect(router.push).toHaveBeenCalledWith('/phone');
  });

  it('locks both while a sign-in is already in flight', () => {
    // Two sign-ins racing would leave whichever finished last in charge.
    useAuthStore.setState({ busy: true });

    renderWithTheme(<AuthAlternatives />);

    const google = screen.getByRole('button', { name: 'Continue with Google' });
    expect(google.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(google);
    expect(mockedSignInWithGoogle).not.toHaveBeenCalled();
  });
});
