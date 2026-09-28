import { LoginScreen } from '@/components/auth/access-and-login';

// Log In opens the Employee Home, as the old start screen's "Employee Login" button did.
export default function EmployeeLoginScreen() {
  return <LoginScreen title="Employee Login" emailPlaceholder="you@email.com" destination="/home" />;
}
