import { getSupabase } from '../../../lib/supabase';
import { secureStorage } from '../../../lib/secure-storage';
import { authErrorMessages } from '../auth-errors';
import { GUEST_USER_ID, resetAuthStore, useAuthStore } from '../auth-store';
import { signInWithGoogle } from '../google';

jest.mock('../../../lib/supabase');
jest.mock('../google', () => ({ signInWithGoogle: jest.fn() }));

// Guest state outlives a launch, so the test needs storage that does too —
// expo-secure-store has no implementation under Jest.
jest.mock('../../../lib/secure-storage', () => {
  const store = new Map<string, string>();
  return {
    secureStorage: {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => void store.set(key, value)),
      removeItem: jest.fn(async (key: string) => void store.delete(key)),
    },
  };
});

const auth = {
  getSession: jest.fn(),
  onAuthStateChange: jest.fn(),
  signInWithPassword: jest.fn(),
  signUp: jest.fn(),
  signInWithOtp: jest.fn(),
  verifyOtp: jest.fn(),
  signOut: jest.fn(),
};

const unsubscribe = jest.fn();

const mockedGetSupabase = getSupabase as jest.MockedFunction<typeof getSupabase>;
const mockedSignInWithGoogle = signInWithGoogle as jest.MockedFunction<typeof signInWithGoogle>;

const session = { access_token: 'token', user: { id: 'u1', email: 'ada@example.com' } };

beforeEach(async () => {
  jest.clearAllMocks();
  resetAuthStore();
  // Guest state deliberately outlives a launch, so it must not outlive a test.
  await secureStorage.removeItem('preppilot.guest');

  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
  auth.signOut.mockResolvedValue({ error: null });

  mockedGetSupabase.mockReturnValue({ auth } as unknown as ReturnType<typeof getSupabase>);
});

const state = () => useAuthStore.getState();

describe('initialise', () => {
  it('starts in the initialising state so Login does not flash before the session is read', () => {
    expect(state().status).toBe('initialising');
  });

  it('settles to signedOut when there is no stored session', async () => {
    await state().initialise();

    expect(state().status).toBe('signedOut');
    expect(state().user).toBeNull();
  });

  it('restores a stored session', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null });

    await state().initialise();

    expect(state().status).toBe('signedIn');
    expect(state().user).toEqual(session.user);
  });

  /**
   * An unreadable session is not something a student can act on — it just means
   * signing in again. Surfacing it as an error would block app start-up.
   */
  it('falls back to signedOut when the stored session cannot be read', async () => {
    auth.getSession.mockRejectedValue(new Error('keystore unavailable'));

    await state().initialise();

    expect(state().status).toBe('signedOut');
    expect(state().error).toBeNull();
  });

  it('treats a Supabase-reported error the same way', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: { message: 'bad' } });

    await state().initialise();

    expect(state().status).toBe('signedOut');
  });

  it('tracks later auth changes', async () => {
    await state().initialise();
    const listener = auth.onAuthStateChange.mock.calls[0][0];

    listener('SIGNED_IN', session);
    expect(state().status).toBe('signedIn');

    listener('SIGNED_OUT', null);
    expect(state().status).toBe('signedOut');
  });

  it('returns a function that unsubscribes the listener', async () => {
    const stop = await state().initialise();
    stop();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('signInWithPassword', () => {
  it('reports success and leaves the session to the auth listener', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });

    await expect(state().signInWithPassword('ada@example.com', 'passw0rd')).resolves.toBe(true);
    expect(state().error).toBeNull();
  });

  it('surfaces a student-facing message on bad credentials', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials' } });

    await expect(state().signInWithPassword('ada@example.com', 'wrong')).resolves.toBe(false);
    expect(state().error).toBe('That email and password do not match. Check them and try again.');
  });

  it('never leaks a raw server message', async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: { code: 'pg_unknown', message: 'relation "profiles" does not exist' },
    });

    await state().signInWithPassword('ada@example.com', 'passw0rd');

    expect(state().error).toBe(authErrorMessages.fallback);
  });

  it('handles a thrown error as well as a returned one', async () => {
    auth.signInWithPassword.mockRejectedValue({ name: 'AuthRetryableFetchError' });

    await expect(state().signInWithPassword('ada@example.com', 'passw0rd')).resolves.toBe(false);
    expect(state().error).toBe(authErrorMessages.network);
  });

  it('clears busy even when the request throws', async () => {
    auth.signInWithPassword.mockRejectedValue(new Error('boom'));

    await state().signInWithPassword('ada@example.com', 'passw0rd');

    expect(state().busy).toBe(false);
  });

  /** A double tap must not fire two sign-in requests. */
  it('ignores a second call while one is already in flight', async () => {
    let release: (value: unknown) => void = () => {};
    auth.signInWithPassword.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const first = state().signInWithPassword('ada@example.com', 'passw0rd');
    const second = await state().signInWithPassword('ada@example.com', 'passw0rd');

    expect(second).toBe(false);
    expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);

    release({ error: null });
    await first;
  });

  it('clears a previous error when a new attempt starts', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials' } });
    await state().signInWithPassword('ada@example.com', 'wrong');
    expect(state().error).not.toBeNull();

    auth.signInWithPassword.mockResolvedValue({ error: null });
    await state().signInWithPassword('ada@example.com', 'passw0rd');

    expect(state().error).toBeNull();
  });
});

describe('signUpWithPassword', () => {
  it('passes the display name through as user metadata', async () => {
    auth.signUp.mockResolvedValue({ error: null });

    await state().signUpWithPassword('ada@example.com', 'passw0rd', 'Ada');

    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'passw0rd',
      options: { data: { display_name: 'Ada' } },
    });
  });

  it('reports an existing account in student-facing terms', async () => {
    auth.signUp.mockResolvedValue({ error: { code: 'user_already_exists' } });

    await expect(state().signUpWithPassword('ada@example.com', 'passw0rd', 'Ada')).resolves.toBe(
      false,
    );
    expect(state().error).toBe('An account already exists for that email. Try signing in instead.');
  });
});

describe('phone sign-in', () => {
  it('requests a code for the given number', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: null });

    await expect(state().requestOtp('+919876543210')).resolves.toBe(true);
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ phone: '+919876543210' });
  });

  it('verifies a code as an SMS token', async () => {
    auth.verifyOtp.mockResolvedValue({ error: null });

    await expect(state().verifyOtp('+919876543210', '123456')).resolves.toBe(true);
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      phone: '+919876543210',
      token: '123456',
      type: 'sms',
    });
  });

  it('reports an expired code', async () => {
    auth.verifyOtp.mockResolvedValue({ error: { code: 'otp_expired' } });

    await expect(state().verifyOtp('+919876543210', '123456')).resolves.toBe(false);
    expect(state().error).toBe('That code has expired. Ask for a new one.');
  });
});

describe('failures on the remaining flows', () => {
  it.each([
    [
      'signUpWithPassword',
      () => state().signUpWithPassword('ada@example.com', 'passw0rd', 'Ada'),
      auth.signUp,
    ],
    ['requestOtp', () => state().requestOtp('+919876543210'), auth.signInWithOtp],
    ['verifyOtp', () => state().verifyOtp('+919876543210', '123456'), auth.verifyOtp],
  ])('%s reports a thrown network failure', async (_label, call, mock) => {
    mock.mockRejectedValue({ name: 'AuthRetryableFetchError' });

    await expect(call()).resolves.toBe(false);
    expect(state().error).toBe(authErrorMessages.network);
    expect(state().busy).toBe(false);
  });

  it.each([
    [
      'signUpWithPassword',
      () => state().signUpWithPassword('ada@example.com', 'passw0rd', 'Ada'),
      auth.signUp,
    ],
    ['requestOtp', () => state().requestOtp('+919876543210'), auth.signInWithOtp],
    ['verifyOtp', () => state().verifyOtp('+919876543210', '123456'), auth.verifyOtp],
  ])('%s ignores a second call while one is in flight', async (_label, call, mock) => {
    let release: (value: unknown) => void = () => {};
    mock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const first = call();
    await expect(call()).resolves.toBe(false);
    expect(mock).toHaveBeenCalledTimes(1);

    release({ error: null });
    await first;
  });

  it('reports a returned error from requestOtp', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: { code: 'otp_disabled' } });

    await expect(state().requestOtp('+919876543210')).resolves.toBe(false);
    expect(state().error).toBe('Phone sign-in is not available yet.');
  });
});

describe('signOut', () => {
  it('clears the session', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    await state().initialise();
    expect(state().status).toBe('signedIn');

    await state().signOut();

    expect(state().status).toBe('signedOut');
    expect(state().user).toBeNull();
    expect(state().session).toBeNull();
  });

  /**
   * Someone signing out on a shared device must end up signed out locally even
   * if the network call fails.
   */
  it('clears the session even when the server call fails', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    await state().initialise();
    auth.signOut.mockRejectedValue(new Error('offline'));

    await state().signOut();

    expect(state().status).toBe('signedOut');
    expect(state().user).toBeNull();
    expect(state().busy).toBe(false);
  });
});

describe('clearError', () => {
  it('removes a displayed message', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials' } });
    await state().signInWithPassword('ada@example.com', 'wrong');

    state().clearError();

    expect(state().error).toBeNull();
  });
});

describe('signing in with Google', () => {
  it('reports success once the browser flow completes', async () => {
    mockedSignInWithGoogle.mockResolvedValue('signedIn');

    await expect(useAuthStore.getState().signInWithGoogle()).resolves.toBe(true);
    expect(useAuthStore.getState().error).toBeNull();
    expect(useAuthStore.getState().busy).toBe(false);
  });

  it('leaves the screen untouched when the student backs out', async () => {
    // Cancelling is not a failure: showing an error would tell them something
    // went wrong when they simply changed their mind.
    mockedSignInWithGoogle.mockResolvedValue('cancelled');

    await expect(useAuthStore.getState().signInWithGoogle()).resolves.toBe(false);
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('reports a genuine failure in words the student can act on', async () => {
    mockedSignInWithGoogle.mockRejectedValue(new Error('Unable to exchange external code'));

    await expect(useAuthStore.getState().signInWithGoogle()).resolves.toBe(false);
    expect(useAuthStore.getState().error).not.toBeNull();
    expect(useAuthStore.getState().error).not.toContain('external code');
  });

  it('will not start a second attempt while one is in flight', async () => {
    let release: (value: 'signedIn') => void = () => {};
    mockedSignInWithGoogle.mockReturnValue(
      new Promise<'signedIn'>((resolve) => {
        release = resolve;
      }),
    );

    const first = useAuthStore.getState().signInWithGoogle();
    await expect(useAuthStore.getState().signInWithGoogle()).resolves.toBe(false);

    release('signedIn');
    await expect(first).resolves.toBe(true);
    expect(mockedSignInWithGoogle).toHaveBeenCalledTimes(1);
  });
});

/**
 * A student who wants to try the tracker should not have to hand over an email
 * address first — and what they do as a guest is real work, not a trial run.
 */
describe('using the app without an account', () => {
  it('signs the student in locally', async () => {
    await useAuthStore.getState().continueAsGuest();

    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(useAuthStore.getState().isGuest).toBe(true);
  });

  it('has no Supabase session behind it', async () => {
    await useAuthStore.getState().continueAsGuest();

    expect(useAuthStore.getState().session).toBeNull();
  });

  /** The same guest each launch, or their syllabus would vanish overnight. */
  it('uses one fixed local account', async () => {
    await useAuthStore.getState().continueAsGuest();
    const first = useAuthStore.getState().user?.id;

    resetAuthStore();
    await useAuthStore.getState().continueAsGuest();

    expect(useAuthStore.getState().user?.id).toBe(first);
    expect(first).toBe(GUEST_USER_ID);
  });

  it('comes back as a guest after a relaunch', async () => {
    await useAuthStore.getState().continueAsGuest();
    resetAuthStore();

    await useAuthStore.getState().initialise();

    expect(useAuthStore.getState().isGuest).toBe(true);
    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('leaves someone who never chose it at the sign-in screen', async () => {
    await useAuthStore.getState().initialise();

    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(useAuthStore.getState().isGuest).toBe(false);
  });

  /** A real session always wins: signing in is not still being a guest. */
  it('stops being a guest once a real session arrives', async () => {
    await useAuthStore.getState().continueAsGuest();
    await useAuthStore.getState().initialise();
    const [[listener]] = auth.onAuthStateChange.mock.calls;

    listener?.('SIGNED_IN', { user: { id: 'real-user' } } as never);

    expect(useAuthStore.getState().isGuest).toBe(false);
    expect(useAuthStore.getState().user?.id).toBe('real-user');
  });

  it('does not silently hand the next person the account’s rows on sign-out', async () => {
    await useAuthStore.getState().initialise();
    const [[listener]] = auth.onAuthStateChange.mock.calls;
    listener?.('SIGNED_IN', { user: { id: 'real-user' } } as never);

    listener?.('SIGNED_OUT', null as never);

    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(useAuthStore.getState().isGuest).toBe(false);
  });
});
