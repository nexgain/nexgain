import { LoginScreen } from '@/components/auth/access-and-login';

// Log In opens the Owner Dashboard, as the old start screen's "Owner Login" button did.
export default function OwnerLoginScreen() {
  return <LoginScreen title="Owner Login" emailPlaceholder="you@business.com" destination="/dashboard" />;
}
