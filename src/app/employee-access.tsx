import { AccessScreen } from '@/components/auth/access-and-login';

export default function EmployeeAccessScreen() {
  return (
    <AccessScreen
      title="Employee Access"
      subtitle="View your schedule, tasks, payslips and more."
      loginHref="/employee-login"
      signUpSubtitle="Join your employer's business"
      signUpHref="/employee-signup"
    />
  );
}
