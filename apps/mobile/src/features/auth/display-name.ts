import type { User } from '@supabase/supabase-js';

/** What a guest is called. They have no account, so there is no name to use. */
export const GUEST_NAME = 'Guest';

/**
 * What to call the person using the app.
 *
 * Reads the account that already exists rather than storing a second copy of
 * the name: Supabase keeps it in user metadata, put there at sign-up and by
 * Google when it is used. Falls back down the chain — the display name, the
 * name Google supplied, then the local part of the email — because a student
 * who signed up before the field existed still has an email address, and
 * "Welcome, " with nothing after it is worse than any of them.
 */
export function displayNameFor(user: User | null, isGuest: boolean): string {
  if (isGuest || user === null) return GUEST_NAME;

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const named = firstNonEmpty([
    metadata.display_name,
    metadata.full_name,
    metadata.name,
    metadata.preferred_username,
  ]);
  if (named !== null) return firstWord(named);

  const email = typeof user.email === 'string' ? user.email : '';
  const local = email.split('@')[0]?.trim() ?? '';
  return local.length > 0 ? local : GUEST_NAME;
}

/** Only the given name: "Welcome, Archit Sharma" reads like a form, not a greeting. */
function firstWord(value: string): string {
  return value.trim().split(/\s+/)[0] ?? value.trim();
}

function firstNonEmpty(values: readonly unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}
