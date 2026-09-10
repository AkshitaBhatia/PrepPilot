import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Logo, Screen, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';

export interface AuthLayoutProps {
  readonly title: string;
  readonly subtitle: string;
  readonly children: React.ReactNode;
  readonly footer?: React.ReactNode;
}

/** Shared frame for the sign-in, registration and OTP screens. */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  const theme = useTheme();

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.fill}
        // Only iOS needs the offset; Android's windowSoftInputMode handles it.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { gap: theme.spacing.lg }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/*
            The logo, not a second copy of it: one asset drives this, the splash
            screen and the launcher icon.
          */}
          <View style={styles.brand}>
            <Logo size={56} label="PrepPilot" />
          </View>

          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="heading">{title}</Text>
            <Text variant="body" tone="secondary">
              {subtitle}
            </Text>
          </View>

          <View style={{ gap: theme.spacing.base }}>{children}</View>

          {footer !== undefined && <View style={styles.footer}>{footer}</View>}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: 32 },
  brand: { alignItems: 'center' },
  footer: { alignItems: 'center' },
});
