import { LoginScreen } from '@/components/auth/access-and-login';

// Checks the email and password, then opens the Employee Home.
export default function EmployeeLoginScreen() {
  return (
    <LoginScreen
      title="Employee Login"
      emailPlaceholder="you@email.com"
      destination="/home"
      signUpHref="/employee-signup"
      accountType="employee"
    />
  );
}
