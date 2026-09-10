import { authErrorMessages, toStudentFacingMessage } from '../auth-errors';

describe('toStudentFacingMessage', () => {
  it.each([
    ['invalid_credentials', 'That email and password do not match. Check them and try again.'],
    ['email_not_confirmed', 'Confirm your email address first — check your inbox for the link.'],
    ['user_already_exists', 'An account already exists for that email. Try signing in instead.'],
    ['otp_expired', 'That code has expired. Ask for a new one.'],
    ['over_request_rate_limit', 'Too many attempts. Wait a few minutes and try again.'],
  ])('maps %s to a student-facing message', (code, expected) => {
    expect(toStudentFacingMessage({ code })).toBe(expected);
  });

  describe('offline detection', () => {
    it.each([
      [{ name: 'AuthRetryableFetchError' }],
      [{ status: 0 }],
      [{ message: 'Network request failed' }],
      [{ message: 'fetch failed' }],
    ])('recognises %o as a connectivity problem', (error) => {
      expect(toStudentFacingMessage(error)).toBe(authErrorMessages.network);
    });
  });

  describe('never leaking internals', () => {
    /**
     * The whole point of this mapping: a raw Supabase string must never reach a
     * student. An unknown code has to fall back, not pass the message through.
     */
    it('does not pass through an unrecognised server message', () => {
      const raw = 'AuthApiError: relation "public.profiles" does not exist';

      expect(toStudentFacingMessage({ code: 'some_new_code', message: raw })).toBe(
        authErrorMessages.fallback,
      );
    });

    it.each([[null], [undefined], ['a string'], [42], [{}]])(
      'falls back for non-error input %p',
      (input) => {
        expect(toStudentFacingMessage(input)).toBe(authErrorMessages.fallback);
      },
    );

    it('falls back when the object has no recognisable fields', () => {
      expect(toStudentFacingMessage(new Error('boom'))).toBe(authErrorMessages.fallback);
    });
  });
});
