import type { SupabaseClient } from '@supabase/supabase-js';
import { signInWithGoogle, type GoogleSignInDependencies } from '../google';

jest.mock('expo-linking', () => ({ createURL: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

const REDIRECT = 'preppilot://auth/callback';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc';

interface Harness {
  readonly signInWithOAuth: jest.Mock;
  readonly exchangeCodeForSession: jest.Mock;
  readonly openAuthSession: jest.Mock;
  readonly dependencies: Partial<GoogleSignInDependencies>;
}

function harness(options: {
  oauth?: { data?: { url?: string } | null; error?: unknown };
  browser?: { type: string; url?: string };
  exchange?: { error?: unknown };
}): Harness {
  const signInWithOAuth = jest.fn().mockResolvedValue({
    data: options.oauth?.data === undefined ? { url: AUTH_URL } : options.oauth.data,
    error: options.oauth?.error ?? null,
  });
  const exchangeCodeForSession = jest
    .fn()
    .mockResolvedValue({ error: options.exchange?.error ?? null });
  const openAuthSession = jest
    .fn()
    .mockResolvedValue(options.browser ?? { type: 'success', url: `${REDIRECT}?code=auth-code` });

  const client = () =>
    ({ auth: { signInWithOAuth, exchangeCodeForSession } }) as unknown as SupabaseClient;

  return {
    signInWithOAuth,
    exchangeCodeForSession,
    openAuthSession,
    dependencies: { client, redirectUri: () => REDIRECT, openAuthSession },
  };
}

describe('signing in with Google', () => {
  it('exchanges the returned code for a session', async () => {
    const h = harness({});

    await expect(signInWithGoogle(h.dependencies)).resolves.toBe('signedIn');
    expect(h.exchangeCodeForSession).toHaveBeenCalledWith('auth-code');
  });

  it('opens the system browser rather than letting Supabase navigate', async () => {
    // Supabase would otherwise redirect the page itself, which means nothing in
    // a native app and would strand it on a blank screen.
    const h = harness({});

    await signInWithGoogle(h.dependencies);

    expect(h.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
    });
    expect(h.openAuthSession).toHaveBeenCalledWith(AUTH_URL, REDIRECT);
  });

  it('reads a code returned in the fragment as well as the query', async () => {
    const h = harness({ browser: { type: 'success', url: `${REDIRECT}#code=from-fragment` } });

    await expect(signInWithGoogle(h.dependencies)).resolves.toBe('signedIn');
    expect(h.exchangeCodeForSession).toHaveBeenCalledWith('from-fragment');
  });
});

describe('when the student stops', () => {
  it('treats a dismissed browser as a cancellation, not a failure', async () => {
    const h = harness({ browser: { type: 'dismiss' } });

    await expect(signInWithGoogle(h.dependencies)).resolves.toBe('cancelled');
    expect(h.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('treats a refused consent screen as a cancellation', async () => {
    // Declining consent is a decision, not a fault; reporting it as an error
    // would tell a student something went wrong when nothing did.
    const h = harness({ browser: { type: 'success', url: `${REDIRECT}?error=access_denied` } });

    await expect(signInWithGoogle(h.dependencies)).resolves.toBe('cancelled');
    expect(h.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('treats a success with no address as a cancellation', async () => {
    const h = harness({ browser: { type: 'success' } });

    await expect(signInWithGoogle(h.dependencies)).resolves.toBe('cancelled');
  });
});

describe('when it genuinely fails', () => {
  it('raises the error Supabase gave for starting the flow', async () => {
    const h = harness({ oauth: { error: new Error('provider is not enabled') } });

    await expect(signInWithGoogle(h.dependencies)).rejects.toThrow('provider is not enabled');
    expect(h.openAuthSession).not.toHaveBeenCalled();
  });

  it('raises when no authorisation URL comes back', async () => {
    const h = harness({ oauth: { data: {} } });

    await expect(signInWithGoogle(h.dependencies)).rejects.toThrow(
      'Google sign-in could not be started.',
    );
  });

  it('surfaces a provider error other than a refusal', async () => {
    const h = harness({
      browser: {
        type: 'success',
        url: `${REDIRECT}?error=server_error&error_description=Google%20is%20unavailable`,
      },
    });

    await expect(signInWithGoogle(h.dependencies)).rejects.toThrow('Google is unavailable');
  });

  it('raises when the redirect carries no code at all', async () => {
    const h = harness({ browser: { type: 'success', url: REDIRECT } });

    await expect(signInWithGoogle(h.dependencies)).rejects.toThrow(
      'did not return an authorisation code',
    );
  });

  it('raises when the redirect is not a readable address', async () => {
    const h = harness({ browser: { type: 'success', url: 'not a url' } });

    await expect(signInWithGoogle(h.dependencies)).rejects.toThrow('could not read');
  });

  it('raises when the code cannot be exchanged', async () => {
    const h = harness({ exchange: { error: new Error('invalid code verifier') } });

    await expect(signInWithGoogle(h.dependencies)).rejects.toThrow('invalid code verifier');
  });
});

describe('the defaults it uses in the app', () => {
  it('redirects to the path Supabase must have on its allow list', async () => {
    // Supabase rejects a redirect that is not registered, and the failure looks
    // like the browser simply closing — so the value is worth pinning here.
    const Linking = jest.requireMock('expo-linking') as { createURL: jest.Mock };
    const WebBrowser = jest.requireMock('expo-web-browser') as {
      openAuthSessionAsync: jest.Mock;
    };

    Linking.createURL.mockReturnValue('preppilot://auth/callback');
    WebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'preppilot://auth/callback?code=auth-code',
    });

    const signInWithOAuth = jest.fn().mockResolvedValue({ data: { url: AUTH_URL }, error: null });
    const exchangeCodeForSession = jest.fn().mockResolvedValue({ error: null });

    await expect(
      signInWithGoogle({
        client: () =>
          ({ auth: { signInWithOAuth, exchangeCodeForSession } }) as unknown as SupabaseClient,
      }),
    ).resolves.toBe('signedIn');

    expect(Linking.createURL).toHaveBeenCalledWith('/auth/callback');
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      AUTH_URL,
      'preppilot://auth/callback',
    );
  });
});
