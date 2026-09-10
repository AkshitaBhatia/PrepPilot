import { StyleSheet, View } from 'react-native';
import { Card, Logo, Screen, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';

/**
 * Shown when the browser build is asked to sign in to a real account.
 *
 * `expo-secure-store` has no web implementation — it exports an empty object, so
 * every session read throws and nothing persists. SECURITY.md requires session
 * tokens to live in the device keystore and never fall back to unencrypted
 * storage, and a browser has no keystore to fall back *from*.
 *
 * So the browser build is a demonstration surface: it runs the whole app against
 * a local database with `EXPO_PUBLIC_DEMO_MODE=true`, and refuses to pretend it
 * can hold a real session. Saying that plainly is better than the alternative,
 * which was an unhandled TypeError and a sign-in that silently never stuck.
 */
export function BrowserBuildNotice() {
  const theme = useTheme();

  return (
    <Screen>
      <View style={[styles.container, { gap: theme.spacing.lg }]}>
        <Logo size={48} />

        <Card testID="browser-build-notice">
          <Text variant="caption" tone="muted" overline>
            Browser Build
          </Text>
          <Text variant="title" style={{ marginTop: theme.spacing.xs }}>
            Signing in needs the app
          </Text>
          <Text variant="body" tone="secondary" style={{ marginTop: theme.spacing.md }}>
            A browser has no secure keystore, so PrepPilot will not keep a real account&apos;s
            session here. Everything in the app works — the tracker, timers, progress and flashcards
            — in the demonstration build.
          </Text>
          <Text variant="small" tone="muted" style={{ marginTop: theme.spacing.md }}>
            Run it with EXPO_PUBLIC_DEMO_MODE=true to explore, or install the Android build to sign
            in.
          </Text>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'stretch' },
});
