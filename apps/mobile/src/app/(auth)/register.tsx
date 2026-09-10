import {
  firstFailure,
  normalizeEmail,
  validateDisplayName,
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
} from '@preppilot/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, TextField, Button } from '../../components/ui';
import { AuthAlternatives } from '../../features/auth/components/auth-alternatives';
import { AuthError } from '../../features/auth/components/auth-error';
import { AuthLayout } from '../../features/auth/components/auth-layout';
import { useAuthStore } from '../../features/auth/auth-store';

export default function RegisterScreen() {
  const { signUpWithPassword, busy, error, clearError } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async () => {
    clearError();
    const result = firstFailure(
      validateDisplayName(name),
      validateEmail(email),
      validatePassword(password),
      validatePasswordConfirmation(password, confirmation),
    );
    if (!result.valid) {
      setFieldError(result.message);
      return;
    }

    setFieldError(null);
    const ok = await signUpWithPassword(normalizeEmail(email), password, name.trim());
    // Supabase may require email confirmation, in which case no session arrives
    // and the student would otherwise be left staring at an unchanged form.
    if (ok) setSent(true);
  };

  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={`We sent a confirmation link to ${normalizeEmail(email)}. Open it to finish setting up your account.`}
        footer={
          <Link href="/login" asChild>
            <Text variant="small" tone="accent" accessibilityRole="link">
              Back to sign in
            </Text>
          </Link>
        }
      >
        <Text variant="small" tone="muted">
          You can close PrepPilot and come back after confirming.
        </Text>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Track your syllabus, your progress and your study time."
      footer={
        <Link href="/login" asChild>
          <Text variant="small" tone="accent" accessibilityRole="link">
            Already have an account? Sign in
          </Text>
        </Link>
      }
    >
      <AuthError message={fieldError ?? error} />

      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        autoComplete="name"
        textContentType="name"
      />

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />

      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        hint="Use at least 8 characters, including a letter and a number."
      />

      <TextField
        label="Confirm password"
        value={confirmation}
        onChangeText={setConfirmation}
        placeholder="Re-enter your password"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        onSubmitEditing={() => void onSubmit()}
      />

      <Button label="Create account" onPress={() => void onSubmit()} loading={busy} fullWidth />

      <AuthAlternatives phoneLabel="Sign up with a phone number" />
    </AuthLayout>
  );
}
