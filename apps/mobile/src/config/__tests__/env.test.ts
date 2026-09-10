import { getEnv, parseEnv, resetEnvCache, type RawEnv } from '../env';
import { featuresFor, getFeatures } from '../features';

const complete: RawEnv = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key',
  googleWebClientId: undefined,
  enablePhoneOtp: undefined,
  demoMode: undefined,
  allowAnonymousAi: undefined,
  aiProxyUrl: undefined,
};

describe('parseEnv', () => {
  it('reads the Supabase configuration', () => {
    expect(parseEnv(complete)).toMatchObject({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key',
    });
  });

  it('trims surrounding whitespace, which is easy to paste in by accident', () => {
    const parsed = parseEnv({
      ...complete,
      supabaseUrl: '  https://example.supabase.co  ',
      supabaseAnonKey: ' anon-key ',
    });

    expect(parsed.supabaseUrl).toBe('https://example.supabase.co');
    expect(parsed.supabaseAnonKey).toBe('anon-key');
  });

  /**
   * A missing URL would otherwise surface much later as an opaque network
   * failure, so it fails immediately with a message that says what to do.
   */
  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace', '   '],
  ])('throws an actionable error when the URL is %s', (_label, supabaseUrl) => {
    const act = () => parseEnv({ ...complete, supabaseUrl });

    expect(act).toThrow(/Missing EXPO_PUBLIC_SUPABASE_URL/);
    expect(act).toThrow(/\.env\.example/);
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
  ])('throws when the anon key is %s', (_label, supabaseAnonKey) => {
    expect(() => parseEnv({ ...complete, supabaseAnonKey })).toThrow(
      /Missing EXPO_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });

  it('treats an unset Google client id as absent rather than empty string', () => {
    expect(parseEnv({ ...complete, googleWebClientId: '' }).googleWebClientId).toBeNull();
    expect(parseEnv({ ...complete, googleWebClientId: '  ' }).googleWebClientId).toBeNull();
  });

  it('keeps the Google client id when one is configured', () => {
    const parsed = parseEnv({ ...complete, googleWebClientId: 'abc.apps.googleusercontent.com' });

    expect(parsed.googleWebClientId).toBe('abc.apps.googleusercontent.com');
  });

  describe('the phone OTP flag', () => {
    it('is off when unset, since no SMS provider is provisioned', () => {
      expect(parseEnv(complete).enablePhoneOtp).toBe(false);
    });

    it('is on for the exact string "true"', () => {
      expect(parseEnv({ ...complete, enablePhoneOtp: 'true' }).enablePhoneOtp).toBe(true);
      expect(parseEnv({ ...complete, enablePhoneOtp: ' true ' }).enablePhoneOtp).toBe(true);
    });

    /** A truthy-looking value must not switch on a flow that cannot work yet. */
    it.each(['1', 'yes', 'TRUE', 'on', 'false', ''])('is off for %p', (enablePhoneOtp) => {
      expect(parseEnv({ ...complete, enablePhoneOtp }).enablePhoneOtp).toBe(false);
    });
  });
});

describe('featuresFor', () => {
  it('hides Google sign-in until a client id exists', () => {
    expect(featuresFor(parseEnv(complete)).googleSignIn).toBe(false);
  });

  it('shows Google sign-in once a client id is configured', () => {
    const env = parseEnv({ ...complete, googleWebClientId: 'abc.apps.googleusercontent.com' });

    expect(featuresFor(env).googleSignIn).toBe(true);
  });

  it('mirrors the phone OTP flag', () => {
    expect(featuresFor(parseEnv({ ...complete, enablePhoneOtp: 'true' })).phoneOtp).toBe(true);
    expect(featuresFor(parseEnv(complete)).phoneOtp).toBe(false);
  });
});

describe('getEnv', () => {
  afterEach(resetEnvCache);

  /**
   * The test bundle is built without EXPO_PUBLIC_SUPABASE_URL, which is exactly
   * what an unconfigured release build looks like. It must fail loudly at the
   * point of misconfiguration rather than later, as an opaque network error.
   */
  it('throws when the app was bundled without configuration', () => {
    expect(() => getEnv()).toThrow(/Missing EXPO_PUBLIC_SUPABASE_URL/);
  });

  it('keeps throwing after the cache is reset', () => {
    expect(() => getEnv()).toThrow();
    resetEnvCache();
    expect(() => getEnv()).toThrow();
  });
});

describe('getFeatures', () => {
  afterEach(resetEnvCache);

  it('surfaces the same misconfiguration rather than silently disabling everything', () => {
    expect(() => getFeatures()).toThrow(/Missing EXPO_PUBLIC_SUPABASE_URL/);
  });
});

describe('demo mode', () => {
  /**
   * A preview affordance, not a product feature. It bypasses sign-in entirely
   * (D1), so anything less than an exact opt-in would be dangerous.
   */
  it('is off unless the flag is exactly "true"', () => {
    expect(parseEnv(complete).demoMode).toBe(false);

    for (const value of ['1', 'yes', 'TRUE', 'on', '']) {
      expect(parseEnv({ ...complete, demoMode: value }).demoMode).toBe(false);
    }
  });

  it('is on for the exact string "true"', () => {
    expect(
      parseEnv({
        ...complete,
        demoMode: 'true',
        allowAnonymousAi: undefined,
        aiProxyUrl: undefined,
      }).demoMode,
    ).toBe(true);
  });

  /** Demo mode contacts no backend, so demanding credentials would defeat it. */
  it('does not require Supabase credentials', () => {
    const env = parseEnv({
      supabaseUrl: undefined,
      supabaseAnonKey: undefined,
      googleWebClientId: undefined,
      enablePhoneOtp: undefined,
      demoMode: 'true',
      allowAnonymousAi: undefined,
      aiProxyUrl: undefined,
    });

    expect(env).toMatchObject({ demoMode: true, supabaseUrl: '', supabaseAnonKey: '' });
  });

  /** Nothing optional may switch itself on just because demo mode is active. */
  it('leaves the unprovisioned features off', () => {
    const env = parseEnv({ ...complete, demoMode: 'true', enablePhoneOtp: 'true' });

    expect(env.enablePhoneOtp).toBe(false);
    expect(env.googleWebClientId).toBeNull();
  });
});

/**
 * Demo mode deliberately blanks the Supabase credentials, so anything deciding
 * "is the assistant available" has to check demo mode *before* the credentials.
 * Checking them first reported a demo as "not set up yet", which reads as
 * something being broken rather than switched off.
 */
describe('what demo mode actually produces', () => {
  const demoRaw = {
    supabaseUrl: 'https://real.supabase.co',
    supabaseAnonKey: 'sb_publishable_real',
    googleWebClientId: undefined,
    enablePhoneOtp: undefined,
    demoMode: 'true',
    allowAnonymousAi: undefined,
    aiProxyUrl: undefined,
  };

  it('blanks the credentials it will not use', () => {
    const env = parseEnv(demoRaw);

    expect(env.supabaseUrl).toBe('');
    expect(env.supabaseAnonKey).toBe('');
    expect(env.demoMode).toBe(true);
  });

  it('keeps them when anonymous asking needs them', () => {
    const env = parseEnv({ ...demoRaw, allowAnonymousAi: 'true' });

    expect(env.supabaseUrl).toBe('https://real.supabase.co');
    expect(env.allowAnonymousAi).toBe(true);
  });

  it('carries a local proxy through, which needs no Supabase at all', () => {
    const env = parseEnv({ ...demoRaw, aiProxyUrl: 'http://localhost:8787' });

    expect(env.aiProxyUrl).toBe('http://localhost:8787');
  });

  it('trims a trailing slash so the URL is not doubled up', () => {
    expect(parseEnv({ ...demoRaw, aiProxyUrl: 'http://localhost:8787/' }).aiProxyUrl).toBe(
      'http://localhost:8787',
    );
  });

  it('treats an unset proxy as absent rather than an empty string', () => {
    expect(parseEnv(demoRaw).aiProxyUrl).toBeNull();
    expect(parseEnv({ ...demoRaw, aiProxyUrl: '   ' }).aiProxyUrl).toBeNull();
  });
});
