import { isDemoMode } from '../../config/env';
import { getSupabase } from '../../lib/supabase';

export const DELETE_ACCOUNT_FUNCTION = 'delete-account';

export type DeleteAccountOutcome =
  /** The auth user is gone from the server. */
  | { readonly kind: 'deleted' }
  /** There was never a server account to delete — demo mode. */
  | { readonly kind: 'localOnly' }
  /** Local data is gone but the server copy remains. */
  | { readonly kind: 'failed'; readonly message: string };

/**
 * Removes the account from the server.
 *
 * The client SDK cannot delete an auth user — that needs the service-role key,
 * which must never reach a device (D28) — so this calls the `delete-account`
 * Edge Function, which holds it. No account id is sent: the function deletes the
 * one named by the caller's own verified token, so there is nothing here that
 * could be pointed at somebody else.
 */
export async function deleteRemoteAccount(): Promise<DeleteAccountOutcome> {
  if (isDemoMode()) return { kind: 'localOnly' };

  try {
    const { error } = await getSupabase().functions.invoke(DELETE_ACCOUNT_FUNCTION, { body: {} });
    if (error !== null) return { kind: 'failed', message: describeFailure(error) };

    return { kind: 'deleted' };
  } catch (error) {
    return { kind: 'failed', message: describeFailure(error) };
  }
}

/**
 * A student-facing message.
 *
 * Deleting locally and failing remotely is the one case that must not read as
 * success: the account still exists, and they need to know to try again.
 */
function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/network|fetch|offline|unreachable/i.test(message)) {
    return 'Your data was removed from this device, but we could not reach the server to delete your account. Connect and try again.';
  }
  if (/404|not found/i.test(message)) {
    return 'Your data was removed from this device. Account deletion is not set up on the server yet, so the account itself still exists.';
  }

  return 'Your data was removed from this device, but your account could not be deleted from the server. Try again.';
}
