import { ConnectApps } from '@/components/owner/connect-apps';
import { goBack, OwnerScreen, PageHeader } from '@/components/owner/ui';
import { updateBusiness, useBusiness } from '@/data/business';
import { toggleBusinessApp, useBusinessApps } from '@/data/business-apps';
import { useRefreshConnectedAccountsOnFocus } from '@/data/connected-accounts';

// More > Integrations: Email (Gmail and Outlook can be connected so emails send
// straight from the owner's address) and Bank account (transactions come into the
// Transactions tab). Other apps are hidden for now (src/constants/features.ts).
export default function IntegrationsScreen() {
  const business = useBusiness();
  const apps = useBusinessApps();
  useRefreshConnectedAccountsOnFocus();

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack()}
        title="Integrations"
        subtitle="Send quotes and invoices from your own email address, and bring your business bank transactions into NexGain."
      />
      <ConnectApps
        theme="dark"
        emailApp={business?.emailApp ?? 'other'}
        onEmailAppChange={(emailApp) => updateBusiness({ emailApp })}
        apps={apps}
        onToggleApp={toggleBusinessApp}
      />
    </OwnerScreen>
  );
}
