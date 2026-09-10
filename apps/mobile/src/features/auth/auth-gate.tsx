import { useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { ErrorState, Screen, Text } from '../../components/ui';
import { SplashScreen } from '../splash/splash-screen';
import { isDemoMode } from '../../config/env';
import { BrowserBuildNotice } from './components/browser-build-notice';
import { getRepositories, initialiseDatabase } from '../../db/client';
import { seedDemoData } from '../../db/demo-seed';
import { startAutoRefresh } from '../../lib/supabase';
import { useAuthStore } from './auth-store';

export interface AuthGateProps {
  readonly children: ReactNode;
}

/**
 * Restores any stored session before the first route renders.
 *
 * Without this, `status` would still be 'initialising' when the route groups
 * evaluate their guards, and an already-signed-in student would see the Login
 * screen flash before being redirected away from it.
 */
/**
 * True when this is the browser build being asked to hold a real session.
 *
 * `expo-secure-store` has no web implementation, so the session read throws and
 * nothing persists. Checked before anything touches Supabase, because the
 * failure is otherwise an unhandled rejection during start-up.
 */
export function needsBrowserBuildNotice(
  platform: string = Platform.OS,
  demo: boolean = isDemoMode(),
): boolean {
  return platform === 'web' && !demo;
}

/** How long start-up may take before the app opens regardless. */
export const STARTUP_TIMEOUT_MS = 10_000;

/**
 * The technical cause, kept for the line under the message.
 *
 * Shown rather than swallowed: a start-up failure that only happens on a device
 * is undiagnosable without it, and "something went wrong" helps nobody. It sits
 * below the student-facing sentence, not in place of it.
 */
export function describeStartupFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AuthGate({ children }: AuthGateProps) {
  const status = useAuthStore((state) => state.status);
  const initialise = useAuthStore((state) => state.initialise);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const unsupported = needsBrowserBuildNotice();

  useEffect(() => {
    if (unsupported) return undefined;

    let unsubscribeAuth: (() => void) | undefined;
    let stopRefresh: (() => void) | undefined;
    let cancelled = false;

    /*
     * Nothing in here may leave the student on the splash screen.
     *
     * This block used to have no error handling at all, so any rejection ended
     * start-up silently: `setReady` never ran and the app sat on the mark for
     * ever, with no way forward and nothing on screen to say why. Start-up is
     * exactly where a failure is least recoverable and most needs saying out
     * loud.
     */
    void (async () => {
      try {
        // Must finish before any screen queries it — on native this waits for
        // the migrations, on web for the database to open.
        await initialiseDatabase();
      } catch (error) {
        if (!cancelled) {
          setFailure(describeStartupFailure(error));
          setReady(true);
        }
        return;
      }

      try {
        unsubscribeAuth = await initialise();
      } catch {
        // A session that cannot be read means signing in again, not a dead app.
        useAuthStore.setState({ status: 'signedOut', session: null, user: null });
      }

      // Seeded before the first screen mounts, so the Tracker's initial read
      // finds the syllabus. Failing to seed is not worth blocking on: demo data
      // is a convenience, and an empty tracker still works.
      if (isDemoMode()) {
        try {
          const { user } = useAuthStore.getState();
          if (user !== null) await seedDemoData(user.id, getRepositories());
        } catch {
          // Nothing to tell the student: they can add a subject themselves.
        }
      }

      try {
        // Token refresh needs a Supabase client, which demo mode has no project for.
        if (!isDemoMode()) stopRefresh = startAutoRefresh();
      } catch {
        // Without refresh a long session eventually asks them to sign in again.
      }

      // The component may have unmounted while the session was being read.
      if (!cancelled) setReady(true);
    })();

    /*
     * The last line of defence.
     *
     * Everything above is guarded, but a promise that never settles cannot be
     * caught — a native module that hangs would still trap the student. After
     * this long, the app opens anyway: an app that works is better than a mark
     * that never moves.
     */
    const watchdog = setTimeout(() => {
      if (cancelled) return;

      // Still not knowing who they are means the sign-in screen, not an empty
      // tracker belonging to nobody.
      if (useAuthStore.getState().status === 'initialising') {
        useAuthStore.setState({ status: 'signedOut', session: null, user: null });
      }
      setReady(true);
    }, STARTUP_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      unsubscribeAuth?.();
      stopRefresh?.();
    };
  }, [initialise, unsupported]);

  // Before the splash, and before anything reads a session: there is nothing to
  // wait for on a surface that cannot hold one.
  if (unsupported) {
    return <BrowserBuildNotice />;
  }

  if (failure !== null) {
    return (
      <Screen>
        <View style={styles.failure} testID="startup-failed">
          <ErrorState
            title="PrepPilot could not start"
            message="Your work is stored on this device, and the app could not open that storage. Reopening PrepPilot usually clears it."
          />
          {/*
            The cause, in smaller type below the sentence a student can act on.
            A failure that only happens on a device cannot be diagnosed without
            it, and hiding it would make the next report as vague as this one.
          */}
          <Text variant="caption" tone="muted" style={styles.detail} selectable>
            {failure}
          </Text>
        </View>
      </Screen>
    );
  }

  // `status` is no longer part of this: leaving it in meant a store that never
  // left 'initialising' held the splash open for ever, which is the same trap
  // by another route. Start-up decides when the app opens.
  if (!ready) {
    return <SplashScreen />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  failure: { flex: 1, justifyContent: 'center', gap: 16 },
  detail: { textAlign: 'center' },
});
