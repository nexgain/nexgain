import { useLocalSearchParams } from 'expo-router';

import { ForgotPasswordScreen } from '@/components/auth/access-and-login';

// "Forgot password?" on Owner Login and Employee Login: emails a reset link.
export default function ForgotPassword() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  return <ForgotPasswordScreen initialEmail={email ?? ''} />;
}
