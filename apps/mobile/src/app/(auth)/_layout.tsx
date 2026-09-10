import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '../../features/auth/auth-store';

/** Routes for a signed-out student. A signed-in one is sent straight to the app. */
export default function AuthLayout() {
  const status = useAuthStore((state) => state.status);

  if (status === 'signedIn') return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
