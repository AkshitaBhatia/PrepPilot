import { normalizePhone, validateOtp, validatePhone } from '@preppilot/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Button, Text, TextField } from '../../components/ui';
import { AuthError } from '../../features/auth/components/auth-error';
import { AuthLayout } from '../../features/auth/components/auth-layout';
import { useAuthStore } from '../../features/auth/auth-store';

/**
 * Phone sign-in, in two steps on one route: request a code, then verify it.
 *
 * Reachable only when EXPO_PUBLIC_ENABLE_PHONE_OTP is set, because Supabase phone
 * auth needs a paid SMS provider that is not yet provisioned (DECISIONS.md, D26).
 */
export default function PhoneScreen() {
  const { requestOtp, verifyOtp, busy, error, clearError } = useAuthStore();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const onRequest = async () => {
    clearError();
    const result = validatePhone(phone);
    if (!result.valid) {
      setFieldError(result.message);
      return;
    }

    setFieldError(null);
    const ok = await requestOtp(normalizePhone(phone));
    if (ok) setCodeSent(true);
  };

  const onVerify = async () => {
    clearError();
    const result = validateOtp(code);
    if (!result.valid) {
      setFieldError(result.message);
      return;
    }

    setFieldError(null);
    await verifyOtp(normalizePhone(phone), code.trim());
  };

  return (
    <AuthLayout
      title={codeSent ? 'Enter your code' : 'Sign in with your phone'}
      subtitle={
        codeSent
          ? `We sent a 6-digit code to ${normalizePhone(phone)}.`
          : 'We will text you a code to sign in.'
      }
      footer={
        <Link href="/login" asChild>
          <Text variant="small" tone="accent" accessibilityRole="link">
            Use email instead
          </Text>
        </Link>
      }
    >
      <AuthError message={fieldError ?? error} />

      {codeSent ? (
        <>
          <TextField
            label="Verification code"
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={6}
            onSubmitEditing={() => void onVerify()}
          />
          <Button label="Verify" onPress={() => void onVerify()} loading={busy} fullWidth />
          <Button
            label="Use a different number"
            variant="ghost"
            fullWidth
            onPress={() => {
              setCodeSent(false);
              setCode('');
              setFieldError(null);
              clearError();
            }}
          />
        </>
      ) : (
        <>
          <TextField
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            hint="Include your country code."
            onSubmitEditing={() => void onRequest()}
          />
          <Button label="Send code" onPress={() => void onRequest()} loading={busy} fullWidth />
        </>
      )}
    </AuthLayout>
  );
}
