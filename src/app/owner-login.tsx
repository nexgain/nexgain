import { LoginScreen } from '@/components/auth/access-and-login';

// Checks the email and password, then opens the Owner Dashboard.
export default function OwnerLoginScreen() {
  return (
    <LoginScreen
      title="Owner Login"
      emailPlaceholder="you@business.com"
      destination="/dashboard"
      signUpHref="/owner-signup"
      accountType="owner"
    />
  );
}
