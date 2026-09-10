import type { SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { getSupabase } from '../../lib/supabase';

/**
 * Backing out of the Google sheet is not a failure, and must not be reported as
 * one — a student who changed their mind did nothing wrong.
 */
export type GoogleSignInOutcome = 'signedIn' | 'cancelled';

export interface GoogleSignInDependencies {
  readonly client: () => SupabaseClient;
  readonly redirectUri: () => string;
  readonly openAuthSession: (
    url: string,
    redirectUri: string,
  ) => Promise<{ readonly type: string; readonly url?: string }>;
}

const defaults: GoogleSignInDependencies = {
  client: getSupabase,
  // A path rather than the bare scheme, so the redirect is distinguishable from
  // any other link that opens the app.
  redirectUri: () => Linking.createURL('/auth/callback'),
  openAuthSession: (url, redirectUri) => WebBrowser.openAuthSessionAsync(url, redirectUri),
};

/**
 * Signs in with Google through the system browser.
 *
 * The system browser rather than a WebView: Google refuses to authenticate in an
 * embedded WebView, and it is also the only surface that can reuse an existing
 * Google session, so most students never type a password at all.
 *
 * Supabase's PKCE flow returns an authorisation code on the redirect, which is
 * exchanged for a session here. The code verifier never leaves the device, so an
 * intercepted redirect on its own grants nothing.
 */
export async function signInWithGoogle(
  dependencies: Partial<GoogleSignInDependencies> = {},
): Promise<GoogleSignInOutcome> {
  const { client, redirectUri, openAuthSession } = { ...defaults, ...dependencies };
  const redirect = redirectUri();

  const { data, error } = await client().auth.signInWithOAuth({
    provider: 'google',
    // Supabase would otherwise navigate the page itself, which is meaningless
    // outside a browser and would strand the native app on a blank screen.
    options: { redirectTo: redirect, skipBrowserRedirect: true },
  });

  if (error !== null) throw error;
  if (data === null || typeof data.url !== 'string' || data.url === '') {
    throw new Error('Google sign-in could not be started.');
  }

  const result = await openAuthSession(data.url, redirect);
  if (result.type !== 'success' || typeof result.url !== 'string') return 'cancelled';

  const returned = readRedirect(result.url);
  if (returned.kind === 'cancelled') return 'cancelled';
  if (returned.kind === 'error') throw new Error(returned.message);

  const { error: exchangeError } = await client().auth.exchangeCodeForSession(returned.code);
  if (exchangeError !== null) throw exchangeError;

  return 'signedIn';
}

type Redirect =
  | { readonly kind: 'code'; readonly code: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'error'; readonly message: string };

/**
 * Reads the authorisation code out of the redirect.
 *
 * Parameters can arrive in the query string or the fragment depending on the
 * provider and platform, so both are searched.
 */
function readRedirect(url: string): Redirect {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'error', message: 'Google sign-in returned an address we could not read.' };
  }

  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const value = (name: string) => parsed.searchParams.get(name) ?? fragment.get(name);

  const failure = value('error');
  if (failure !== null) {
    // Declining consent is a decision, not a fault, and reads to the student as
    // simply having stopped.
    if (failure === 'access_denied') return { kind: 'cancelled' };
    return { kind: 'error', message: value('error_description') ?? 'Google sign-in was refused.' };
  }

  const code = value('code');
  if (code === null || code === '') {
    return { kind: 'error', message: 'Google sign-in did not return an authorisation code.' };
  }

  return { kind: 'code', code };
}
