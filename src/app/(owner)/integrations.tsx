import { ConnectApps } from '@/components/owner/connect-apps';
import { goBack, OwnerScreen, PageHeader } from '@/components/owner/ui';
import { updateBusiness, useBusiness } from '@/data/business';
import { toggleBusinessApp, useBusinessApps } from '@/data/business-apps';

// More > Integrations. Gmail and Outlook can be connected so emails send straight
// from the owner's address; other apps are saved as ones the business uses or has
// asked for, so we know which connections to build first.
export default function IntegrationsScreen() {
  const business = useBusiness();
  const apps = useBusinessApps();

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack()}
        title="Integrations"
        subtitle="Connect Gmail or Outlook to send quotes and invoices straight from your own email address. Add the other apps you use and we'll let you know when they can connect."
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
