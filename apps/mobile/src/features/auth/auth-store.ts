import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { DEMO_USER_ID, isDemoMode } from '../../config/env';
import { getSupabase } from '../../lib/supabase';
import { secureStorage } from '../../lib/secure-storage';
import { toStudentFacingMessage } from './auth-errors';
import { signInWithGoogle } from './google';

/**
 * `initialising` is distinct from `signedOut`: on launch we do not yet know
 * whether a stored session exists, and showing the Login screen during that gap
 * would flash sign-in at an already-authenticated student.
 */
export type AuthStatus = 'initialising' | 'signedIn' | 'signedOut';

export interface AuthState {
  readonly status: AuthStatus;
  readonly session: Session | null;
  readonly user: User | null;
  /**
   * Signed in without an account.
   *
   * A guest gets the tracker and everything local; the assistant needs a real
   * account, because it costs money to answer and there is nobody to attribute
   * that to. Signing in later keeps everything they made.
   */
  readonly isGuest: boolean;
  /** A student-facing message, never a raw server error. */
  readonly error: string | null;
  /** True while a sign-in, sign-up or sign-out request is in flight. */
  readonly busy: boolean;
}

export interface AuthActions {
  /** Restores any stored session and subscribes to auth changes. Returns an unsubscribe. */
  initialise: () => Promise<() => void>;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signUpWithPassword: (email: string, password: string, displayName: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  /** Starts using the app with no account. Everything stays on this device. */
  continueAsGuest: () => Promise<void>;
  requestOtp: (phone: string) => Promise<boolean>;
  verifyOtp: (phone: string, token: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const initialState: AuthState = {
  status: 'initialising',
  session: null,
  user: null,
  isGuest: false,
  error: null,
  busy: false,
};

/**
 * The one guest account on this device.
 *
 * Fixed rather than generated per launch: a guest who closes the app and comes
 * back is the same guest, and would otherwise find their syllabus gone.
 */
export const GUEST_USER_ID = 'guest-local-user';

const GUEST_KEY = 'preppilot.guest';

/**
 * Hands a guest's rows to the account they just signed in to.
 *
 * Imported lazily: the auth store is loaded before the database is open, and a
 * static import would pull the whole data layer into start-up.
 */
async function adoptGuestWork(ownerUserId: string): Promise<void> {
  try {
    const [{ getDatabase }, { claimGuestData }] = await Promise.all([
      import('../../db/client'),
      import('../../db/claim-guest-data'),
    ]);
    await claimGuestData(getDatabase(), GUEST_USER_ID, ownerUserId);
  } catch {
    // The guest's rows stay under the guest id and are still on the device;
    // nothing is lost, and blocking sign-in over it would be worse.
  }
}

function guestUser(): User {
  return { id: GUEST_USER_ID, email: null } as unknown as User;
}

/** Remembered so a relaunch does not drop a guest back at the sign-in screen. */
async function rememberGuest(active: boolean): Promise<void> {
  try {
    if (active) await secureStorage.setItem(GUEST_KEY, 'true');
    else await secureStorage.removeItem(GUEST_KEY);
  } catch {
    // Losing the flag costs a guest one trip through the sign-in screen; it is
    // not worth failing sign-in over.
  }
}

async function wasGuest(): Promise<boolean> {
  try {
    return (await secureStorage.getItem(GUEST_KEY)) === 'true';
  } catch {
    return false;
  }
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  ...initialState,

  async initialise() {
    // Demo mode never contacts Supabase: it signs in as a fixed local account so
    // the app can be reviewed without a backend (D40). Creating a client here
    // would fail, because there is no project to point it at.
    if (isDemoMode()) {
      set({
        session: null,
        user: { id: DEMO_USER_ID, email: 'demo@preppilot.local' } as User,
        status: 'signedIn',
        isGuest: false,
      });
      return () => {};
    }

    const supabase = getSupabase();

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error !== null) throw error;

      if (data.session !== null) {
        set({ session: data.session, user: data.session.user, status: 'signedIn', isGuest: false });
      } else if (await wasGuest()) {
        // A guest who closed the app is still the same guest, with the same
        // syllabus, rather than a stranger at the sign-in screen.
        set({ session: null, user: guestUser(), status: 'signedIn', isGuest: true });
      } else {
        set({ session: null, user: null, status: 'signedOut', isGuest: false });
      }
    } catch {
      // A session that cannot be read is not an error a student can act on —
      // it simply means they must sign in. Surfacing it would block start-up.
      set({ session: null, user: null, status: 'signedOut', isGuest: false });
    }

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // A real session always wins over guest. Losing one drops back to guest
      // only if this device had been one, so signing out of an account does not
      // silently hand the next person that account's local rows.
      if (session !== null) {
        const wasGuestBefore = get().isGuest;
        void rememberGuest(false);
        set({ session, user: session.user, status: 'signedIn', isGuest: false });

        // A guest's syllabus is real work, so signing in adopts it rather than
        // starting them over. Fire-and-forget: sign-in must not fail because a
        // local write did.
        if (wasGuestBefore) void adoptGuestWork(session.user.id);
        return;
      }

      set({ session: null, user: null, status: 'signedOut', isGuest: false });
    });

    return () => data.subscription.unsubscribe();
  },

  async signInWithPassword(email, password) {
    if (get().busy) return false;
    set({ busy: true, error: null });

    try {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password });
      if (error !== null) {
        set({ error: toStudentFacingMessage(error) });
        return false;
      }
      // onAuthStateChange sets the session, keeping one source of truth.
      return true;
    } catch (error) {
      set({ error: toStudentFacingMessage(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  async signUpWithPassword(email, password, displayName) {
    if (get().busy) return false;
    set({ busy: true, error: null });

    try {
      const { error } = await getSupabase().auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error !== null) {
        set({ error: toStudentFacingMessage(error) });
        return false;
      }
      return true;
    } catch (error) {
      set({ error: toStudentFacingMessage(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  async signInWithGoogle() {
    if (get().busy) return false;
    set({ busy: true, error: null });

    try {
      // A student who backed out of the Google sheet did not fail at anything,
      // so a cancellation leaves the screen exactly as they left it.
      return (await signInWithGoogle()) === 'signedIn';
    } catch (error) {
      set({ error: toStudentFacingMessage(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  async requestOtp(phone) {
    if (get().busy) return false;
    set({ busy: true, error: null });

    try {
      const { error } = await getSupabase().auth.signInWithOtp({ phone });
      if (error !== null) {
        set({ error: toStudentFacingMessage(error) });
        return false;
      }
      return true;
    } catch (error) {
      set({ error: toStudentFacingMessage(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  async verifyOtp(phone, token) {
    if (get().busy) return false;
    set({ busy: true, error: null });

    try {
      const { error } = await getSupabase().auth.verifyOtp({ phone, token, type: 'sms' });
      if (error !== null) {
        set({ error: toStudentFacingMessage(error) });
        return false;
      }
      return true;
    } catch (error) {
      set({ error: toStudentFacingMessage(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  async signOut() {
    set({ busy: true, error: null });
    try {
      await getSupabase().auth.signOut();
    } catch {
      // Sign-out is best-effort. If the network call fails the local session is
      // still cleared below, because a student asking to sign out on a shared
      // device must not stay signed in.
    } finally {
      set({ ...initialState, status: 'signedOut' });
    }
  },

  async continueAsGuest() {
    await rememberGuest(true);
    set({ session: null, user: guestUser(), status: 'signedIn', isGuest: true, error: null });
  },

  clearError() {
    set({ error: null });
  },
}));

/**
 * Test seam: returns the store's data to its launch state.
 *
 * Merges rather than replaces — a replacing `setState` would drop the actions
 * along with the data and leave the store unusable.
 */
export function resetAuthStore(): void {
  useAuthStore.setState({ ...initialState });
}
