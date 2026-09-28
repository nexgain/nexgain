import { AccessScreen } from '@/components/auth/access-and-login';

export default function OwnerAccessScreen() {
  return (
    <AccessScreen
      title="Owner Access"
      subtitle="Manage your business, team, finances and more."
      loginHref="/owner-login"
      signUpSubtitle="Create a new business account"
    />
  );
}
