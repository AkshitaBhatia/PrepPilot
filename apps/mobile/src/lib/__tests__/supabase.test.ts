import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { getSupabase, resetSupabaseClient, startAutoRefresh } from '../supabase';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../../config/env', () => ({
  getEnv: () => ({
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-key',
    googleWebClientId: null,
    enablePhoneOtp: false,
  }),
}));

const mockedCreateClient = createClient as jest.MockedFunction<typeof createClient>;

const startAuto = jest.fn();
const stopAuto = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  resetSupabaseClient();
  mockedCreateClient.mockReturnValue({
    auth: { startAutoRefresh: startAuto, stopAutoRefresh: stopAuto },
  } as never);
});

describe('getSupabase', () => {
  it('creates the client with the configured project', () => {
    getSupabase();

    expect(mockedCreateClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.anything(),
    );
  });

  /** Sessions must live in the keystore, never in plain storage (SECURITY.md). */
  it('persists the session through the secure storage adapter', () => {
    getSupabase();

    const options = mockedCreateClient.mock.calls[0]?.[2] as {
      auth: { storage: unknown; persistSession: boolean; detectSessionInUrl: boolean };
    };

    expect(options.auth.storage).toBeDefined();
    expect(options.auth.persistSession).toBe(true);
    // Browser redirect handling has no meaning in a native app.
    expect(options.auth.detectSessionInUrl).toBe(false);
  });

  it('returns the same client on repeat calls', () => {
    expect(getSupabase()).toBe(getSupabase());
    expect(mockedCreateClient).toHaveBeenCalledTimes(1);
  });
});

describe('startAutoRefresh', () => {
  it('starts refreshing immediately when the app is already active', () => {
    // currentState is a plain property on AppState, not a getter, so it is
    // assigned directly and restored afterwards.
    const previous = AppState.currentState;
    (AppState as { currentState: string }).currentState = 'active';

    try {
      startAutoRefresh();
      expect(startAuto).toHaveBeenCalled();
    } finally {
      (AppState as { currentState: string }).currentState = previous;
    }
  });

  /**
   * The refresh timer keeps firing in the background, where the OS can suspend
   * the process mid-request and leave a half-written session behind.
   */
  it('stops refreshing when the app leaves the foreground and resumes on return', () => {
    const listeners: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      listeners.push(handler as (state: string) => void);
      return { remove: jest.fn() } as never;
    });

    startAutoRefresh();
    const handler = listeners[0];

    handler?.('background');
    expect(stopAuto).toHaveBeenCalled();

    startAuto.mockClear();
    handler?.('active');
    expect(startAuto).toHaveBeenCalled();
  });

  it('removes its listener and stops refreshing when torn down', () => {
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove } as never);

    startAutoRefresh()();

    expect(remove).toHaveBeenCalledTimes(1);
    expect(stopAuto).toHaveBeenCalled();
  });
});
