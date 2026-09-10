/**
 * Translates Supabase auth failures into messages written for a student.
 *
 * UI_UX_SPECIFICATION.md forbids exposing raw technical errors, and Supabase's
 * own strings ("Invalid login credentials", "AuthApiError") are not something to
 * show someone trying to start studying.
 */

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'That email and password do not match. Check them and try again.',
  email_not_confirmed: 'Confirm your email address first — check your inbox for the link.',
  user_already_exists: 'An account already exists for that email. Try signing in instead.',
  weak_password: 'Choose a stronger password.',
  over_email_send_rate_limit: 'Too many attempts. Wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Wait a few minutes and try again.',
  otp_expired: 'That code has expired. Ask for a new one.',
  otp_disabled: 'Phone sign-in is not available yet.',
  validation_failed: 'Check the details you entered and try again.',
  same_password: 'That is already your password. Choose a different one.',
};

const NETWORK_MESSAGE =
  'PrepPilot could not reach the server. Check your connection and try again.';
const FALLBACK = 'Something went wrong. Please try again.';

interface MaybeAuthError {
  readonly code?: string | undefined;
  readonly message?: string | undefined;
  readonly status?: number | undefined;
  readonly name?: string | undefined;
}

/** Never returns a raw server string; always something a student can act on. */
export function toStudentFacingMessage(error: unknown): string {
  if (error === null || typeof error !== 'object') return FALLBACK;

  const { code, message, status, name } = error as MaybeAuthError;

  if (code !== undefined && code in MESSAGES) {
    // Narrowed by the `in` check above.
    return MESSAGES[code] as string;
  }

  // supabase-js surfaces offline failures as a generic fetch error with no status.
  const looksOffline =
    name === 'AuthRetryableFetchError' ||
    status === 0 ||
    (message !== undefined && /network request failed|fetch failed/i.test(message));

  if (looksOffline) return NETWORK_MESSAGE;

  return FALLBACK;
}

export const authErrorMessages = {
  network: NETWORK_MESSAGE,
  fallback: FALLBACK,
} as const;
