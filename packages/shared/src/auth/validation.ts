/**
 * Input validation for the authentication flows.
 *
 * Pure and framework-free so the same rules run in the app, in the web demo and
 * in tests. Messages are written for a student: they say what to do, never what
 * the validator was thinking (UI_UX_SPECIFICATION.md, "Loading/Error").
 */

export type ValidationResult =
  { readonly valid: true } | { readonly valid: false; readonly message: string };

const valid: ValidationResult = { valid: true };
const invalid = (message: string): ValidationResult => ({ valid: false, message });

/**
 * bcrypt — which Supabase Auth uses — silently ignores everything past the 72nd
 * byte. A user whose password is longer would find that changing its tail did
 * nothing, so it is rejected up front rather than truncated behind their back.
 */
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_MIN_LENGTH = 8;
export const OTP_LENGTH = 6;

/**
 * Deliberately permissive: one `@`, something before it, and a dotted domain
 * after it. Stricter regexes reject valid addresses, and only a delivered email
 * proves an address works.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** E.164: a leading `+`, a non-zero country digit, then up to 14 more digits. */
const E164_PATTERN = /^\+[1-9]\d{1,14}$/;

/** Trims and lower-cases, so `  Ada@Example.COM ` and `ada@example.com` are one account. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Strips spaces, hyphens and brackets, which people type but E.164 does not allow. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s()-]/g, '');
}

export function validateEmail(email: string): ValidationResult {
  const normalized = normalizeEmail(email);
  if (normalized.length === 0) return invalid('Enter your email address.');
  if (!EMAIL_PATTERN.test(normalized)) return invalid('Enter a valid email address.');
  return valid;
}

export function validatePassword(password: string): ValidationResult {
  if (password.length === 0) return invalid('Enter a password.');
  if (password.length < PASSWORD_MIN_LENGTH) {
    return invalid(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  // Measured in bytes, not characters: an emoji or an accented letter costs more
  // than one byte, so a 30-character password can still exceed the bcrypt limit.
  if (byteLength(password) > PASSWORD_MAX_BYTES) {
    return invalid('That password is too long. Try a shorter one.');
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return invalid('Include at least one letter and one number.');
  }
  return valid;
}

/** Confirms the two entries match, for the registration form. */
export function validatePasswordConfirmation(
  password: string,
  confirmation: string,
): ValidationResult {
  if (confirmation.length === 0) return invalid('Re-enter your password.');
  if (password !== confirmation) return invalid('Those passwords do not match.');
  return valid;
}

export function validatePhone(phone: string): ValidationResult {
  const normalized = normalizePhone(phone);
  if (normalized.length === 0) return invalid('Enter your phone number.');
  if (!normalized.startsWith('+')) {
    return invalid('Include your country code, starting with +.');
  }
  if (!E164_PATTERN.test(normalized)) return invalid('Enter a valid phone number.');
  return valid;
}

export function validateOtp(code: string): ValidationResult {
  const trimmed = code.trim();
  if (trimmed.length === 0) return invalid('Enter the code we sent you.');
  if (!/^\d+$/.test(trimmed)) return invalid('The code is numbers only.');
  if (trimmed.length !== OTP_LENGTH) return invalid(`The code is ${OTP_LENGTH} digits.`);
  return valid;
}

export function validateDisplayName(name: string): ValidationResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) return invalid('Enter your name.');
  if (trimmed.length > 60) return invalid('That name is too long.');
  return valid;
}

/** UTF-8 byte length, which is what bcrypt counts. */
function byteLength(value: string): number {
  // TextEncoder is available in Hermes, Node and every target browser.
  return new TextEncoder().encode(value).length;
}

/** Returns the first failure among the given results, or a passing result. */
export function firstFailure(...results: readonly ValidationResult[]): ValidationResult {
  for (const result of results) {
    if (!result.valid) return result;
  }
  return valid;
}
