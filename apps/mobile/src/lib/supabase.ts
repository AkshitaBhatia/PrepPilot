// supabase-js relies on a full URL implementation that Hermes does not provide.
import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { getEnv } from '../config/env';
import { secureStorage } from './secure-storage';

let client: SupabaseClient | null = null;

/**
 * The Supabase client, created on first use.
 *
 * Sessions persist in the device keystore rather than AsyncStorage, because a
 * refresh token grants access to the account and must not sit in plain storage
 * (SECURITY.md, "Local Data").
 *
 * `detectSessionInUrl` is off: that behaviour is for browser redirects and has no
 * meaning in a native app.
 */
export function getSupabase(): SupabaseClient {
  if (client !== null) return client;

  const env = getEnv();

  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return client;
}

/**
 * Refreshes the session only while the app is in the foreground.
 *
 * Supabase's timer keeps firing in the background, where the OS may suspend the
 * process mid-request and leave the stored session half-written. Pausing on
 * background and resuming on foreground avoids that, and stops needless wake-ups.
 *
 * Returns an unsubscribe function.
 */
export function startAutoRefresh(): () => void {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void getSupabase().auth.startAutoRefresh();
    } else {
      void getSupabase().auth.stopAutoRefresh();
    }
  });

  if (AppState.currentState === 'active') {
    void getSupabase().auth.startAutoRefresh();
  }

  return () => {
    subscription.remove();
    void getSupabase().auth.stopAutoRefresh();
  };
}

/** Test seam: drops the memoised client so a test can supply a different environment. */
export function resetSupabaseClient(): void {
  client = null;
}
