/**
 * Runtime configuration.
 *
 * Only `EXPO_PUBLIC_*` values may live here: everything in this file is compiled
 * into the app bundle and is readable by anyone who downloads it. The Supabase
 * anon key belongs here — it is a publishable identifier whose power is bounded
 * by Row Level Security. The service-role key and the Gemini key must never
 * appear in this file or anywhere else under `apps/` (SECURITY.md).
 *
 * `babel-preset-expo` inlines each `process.env.EXPO_PUBLIC_*` access at build
 * time, so the values are captured once below rather than read on demand.
 * Parsing is a separate pure function so it can be tested without pretending the
 * environment is mutable at runtime.
 */

/** The raw, unvalidated values as the bundler inlined them. */
export interface RawEnv {
  readonly supabaseUrl: string | undefined;
  readonly supabaseAnonKey: string | undefined;
  readonly googleWebClientId: string | undefined;
  readonly enablePhoneOtp: string | undefined;
  readonly demoMode: string | undefined;
  readonly allowAnonymousAi: string | undefined;
  readonly aiProxyUrl: string | undefined;
}

const bundledEnv: RawEnv = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  enablePhoneOtp: process.env.EXPO_PUBLIC_ENABLE_PHONE_OTP,
  demoMode: process.env.EXPO_PUBLIC_DEMO_MODE,
  allowAnonymousAi: process.env.EXPO_PUBLIC_ALLOW_ANONYMOUS_AI,
  aiProxyUrl: process.env.EXPO_PUBLIC_AI_PROXY_URL,
};

export interface Env {
  /** Empty in demo mode, where no Supabase project is contacted. */
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  /** Null until a Google OAuth client is configured; Google sign-in stays hidden. */
  readonly googleWebClientId: string | null;
  /** Requires a Supabase SMS provider before it can be turned on (DECISIONS.md, D26). */
  readonly enablePhoneOtp: boolean;
  /**
   * Runs the app against local storage only, with a fixed local account and no
   * Supabase (DECISIONS.md, D40).
   *
   * A preview affordance for reviewing the app without a backend, never a
   * product feature. It is off unless EXPO_PUBLIC_DEMO_MODE is exactly "true",
   * and the UI says so on every screen so a demo session cannot be mistaken for
   * a real one.
   */
  readonly demoMode: boolean;
  /**
   * Whether the assistant may be used without an account.
   *
   * Off unless set to exactly "true". The proxy must be deployed with the
   * matching `ALLOW_ANONYMOUS_AI` secret for it to work — this flag only decides
   * whether the app offers it (D54).
   */
  readonly allowAnonymousAi: boolean;
  /**
   * Where the assistant sends its requests, when that is not Supabase.
   *
   * The Gemini key must never reach a device (PRD §15), so something server-side
   * has to hold it. Normally that is the deployed Edge Function; this points at
   * the same function run locally instead, which is what makes the assistant
   * usable before any Supabase project exists (D56).
   */
  readonly aiProxyUrl: string | null;
}

function required(envVarName: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    throw new Error(
      `Missing ${envVarName}. Copy .env.example to .env and fill it in — see apps/mobile/README.md.`,
    );
  }
  return trimmed;
}

function optional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

/**
 * Validates raw configuration, failing with an actionable message rather than
 * letting an undefined URL surface later as an opaque network error.
 */
export function parseEnv(raw: RawEnv): Env {
  const demoMode = raw.demoMode?.trim() === 'true';
  const allowAnonymousAi = raw.allowAnonymousAi?.trim() === 'true';
  const aiProxyUrl = optional(raw.aiProxyUrl)?.replace(/\/+$/, '') ?? null;

  // Demo mode never contacts Supabase for data, so demanding its credentials
  // would make the app impossible to preview without a backend.
  //
  // The exception is anonymous AI: the assistant is the one thing a demo cannot
  // do locally, so when it is switched on the project's URL and key are needed
  // after all — not to sign anybody in, but to reach the proxy.
  if (demoMode) {
    return {
      supabaseUrl: allowAnonymousAi ? required('EXPO_PUBLIC_SUPABASE_URL', raw.supabaseUrl) : '',
      supabaseAnonKey: allowAnonymousAi
        ? required('EXPO_PUBLIC_SUPABASE_ANON_KEY', raw.supabaseAnonKey)
        : '',
      googleWebClientId: null,
      enablePhoneOtp: false,
      demoMode: true,
      allowAnonymousAi,
      aiProxyUrl,
    };
  }

  return {
    supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', raw.supabaseUrl),
    supabaseAnonKey: required('EXPO_PUBLIC_SUPABASE_ANON_KEY', raw.supabaseAnonKey),
    googleWebClientId: optional(raw.googleWebClientId),
    // Compared against the exact string: any other value, including "1" or
    // "yes", leaves an unprovisioned flow switched off.
    enablePhoneOtp: raw.enablePhoneOtp?.trim() === 'true',
    demoMode: false,
    allowAnonymousAi,
    aiProxyUrl,
  };
}

/**
 * Whether demo mode is on, without validating anything else.
 *
 * `getEnv()` throws when Supabase configuration is missing, which is right at
 * start-up but wrong for a component that only needs one boolean — coupling a
 * render to full config validation makes every screen crash on a misconfigured
 * build instead of showing its error once.
 */
export function isDemoMode(): boolean {
  return bundledEnv.demoMode?.trim() === 'true';
}

/** The fixed account demo mode runs as. Never a real Supabase user id. */
export const DEMO_USER_ID = 'demo-local-user';

let cached: Env | null = null;

export function getEnv(): Env {
  cached ??= parseEnv(bundledEnv);
  return cached;
}

/** Test seam: clears the memoised value. */
export function resetEnvCache(): void {
  cached = null;
}
