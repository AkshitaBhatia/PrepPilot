import { getEnv, type Env } from './env';

/**
 * Feature flags for capabilities that are implemented but not yet provisioned.
 *
 * Both flags gate flows whose code is complete and tested but which cannot work
 * until external credentials exist. Gating them keeps an untested path from
 * reaching a student as a broken button (DECISIONS.md, D26).
 */
export interface Features {
  /** Requires a Supabase SMS provider and, for Indian numbers, DLT registration. */
  readonly phoneOtp: boolean;
  /** Requires a Google OAuth client ID and a development build. */
  readonly googleSignIn: boolean;
}

export function featuresFor(env: Env): Features {
  return {
    phoneOtp: env.enablePhoneOtp,
    googleSignIn: env.googleWebClientId !== null,
  };
}

export function getFeatures(): Features {
  return featuresFor(getEnv());
}
