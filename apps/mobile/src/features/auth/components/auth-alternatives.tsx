import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Button, Text } from '../../../components/ui';
import { getFeatures } from '../../../config/features';
import { useTheme } from '../../../theme/theme-context';
import { useAuthStore } from '../auth-store';

export interface AuthAlternativesProps {
  /** Where the phone route should lead: sign-in and sign-up share one OTP screen. */
  readonly phoneLabel?: string;
}

/**
 * Sign-in methods other than email and password (PRD §7).
 *
 * Each is shown only once it can actually work: Google needs an OAuth client,
 * and phone OTP needs an SMS provider. A button that always fails is worse than
 * no button, because the student cannot tell it apart from their own mistake
 * (DECISIONS.md, D26).
 */
export function AuthAlternatives({ phoneLabel = 'Use phone number' }: AuthAlternativesProps) {
  const theme = useTheme();
  const features = getFeatures();
  const busy = useAuthStore((state) => state.busy);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const continueAsGuest = useAuthStore((state) => state.continueAsGuest);

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={styles.divider}>
        <View style={[styles.rule, { backgroundColor: theme.colors.border }]} />
        <Text variant="caption" tone="muted">
          or
        </Text>
        <View style={[styles.rule, { backgroundColor: theme.colors.border }]} />
      </View>

      {features.googleSignIn && (
        <Button
          label="Continue with Google"
          variant="secondary"
          fullWidth
          disabled={busy}
          icon={<GoogleMark />}
          testID="google-sign-in"
          onPress={() => void signInWithGoogle()}
        />
      )}

      {features.phoneOtp && (
        <Button
          label={phoneLabel}
          variant="secondary"
          fullWidth
          disabled={busy}
          onPress={() => router.push('/phone')}
        />
      )}

      {/*
        A student who wants to try the tracker should not have to hand over an
        email address first. Everything stays on the device until they sign in,
        and signing in later keeps what they made.
      */}
      <Button
        label="Continue without an account"
        variant="ghost"
        fullWidth
        disabled={busy}
        testID="continue-as-guest"
        onPress={() => void continueAsGuest()}
      />

      <Text variant="caption" tone="muted" style={styles.guestNote}>
        Your work stays on this device, and the assistant needs an account. Sign in whenever you
        like — nothing you have done is lost.
      </Text>
    </View>
  );
}

/**
 * Google's mark, in its own colours.
 *
 * Google's branding terms require the official mark rather than a recoloured
 * one, so this is the single icon in the app that ignores the theme.
 */
function GoogleMark() {
  return (
    <Svg
      width={18}
      height={18}
      viewBox="0 0 48 48"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24 24 0 0 0 0 21.56l7.98-6.19Z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.46-9.9l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  guestNote: { textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
});
