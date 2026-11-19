import { type Href } from 'expo-router';
import { View } from 'react-native';

import { InviteCodeCard } from '@/components/owner/employee-ui';
import { ActionRow, Card, OwnerIcons, OwnerScreen, PageHeader } from '@/components/owner/ui';
import { useBusiness } from '@/data/business';
import { useContractorInvoices } from '@/data/contractor-invoices';
import { superStatusOf, useEmployeeSuper } from '@/data/employee-super';
import { useEmployees } from '@/data/employees';
import { ownerNotifications, useNotifications } from '@/data/notifications';
import { businessUsesGst, businessUsesSuper } from '@/data/super-rules';
import { logOut } from '@/lib/auth';
import { router } from '@/lib/nav';

// Hospitality owner screens that don't fit in the tab bar. No jobs, quotes,
// invoices, reminders or services (those are System 1 only).
export default function HospitalityMoreScreen() {
  const unread = ownerNotifications(useNotifications()).filter((n) => !n.read).length;
  const toReview = useContractorInvoices().filter((i) => i.status === 'sent').length;
  const business = useBusiness();
  const usesSuper = businessUsesSuper(business);
  const usesGst = businessUsesGst(business);
  const superRecords = useEmployeeSuper();
  const stapledChecks = useEmployees().filter((e) => superStatusOf(e, superRecords.find((r) => r.employeeId === e.id)) === 'Stapled fund check needed').length;

  return (
    <OwnerScreen>
      <PageHeader title="More" />
      <InviteCodeCard />
      <Card>
        <View>
          <ActionRow
            icon={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }}
            label={unread > 0 ? `Notifications (${unread} new)` : 'Notifications'}
            onPress={() => router.navigate({ pathname: '/alerts', params: { from: 'menu' } } as Href)}
          />
          <ActionRow
            icon={{ ios: 'square.stack.3d.up.fill', android: 'category', web: 'category' }}
            label="Menu categories"
            onPress={() => router.navigate('/hospitality/menu-categories')}
            showDivider
          />
          <ActionRow
            icon={{ ios: 'moon.stars.fill', android: 'nightlight', web: 'nightlight' }}
            label="End of day sales"
            onPress={() => router.navigate('/hospitality/end-of-day')}
            showDivider
          />
          <ActionRow
            icon={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
            label="Employees"
            onPress={() => router.navigate('/employees' as Href)}
            showDivider
          />
          <ActionRow
            icon={{ ios: 'doc.plaintext.fill', android: 'request_quote', web: 'request_quote' }}
            label={toReview > 0 ? `Contractor Invoices (${toReview} to review)` : 'Contractor Invoices'}
            onPress={() => router.navigate('/contractor-invoices')}
            showDivider
          />
          {usesGst && <ActionRow icon={OwnerIcons.receipt} label="GST" onPress={() => router.navigate('/gst')} showDivider />}
          {usesSuper && (
            <ActionRow
              icon={{ ios: 'banknote.fill', android: 'savings', web: 'savings' }}
              label={stapledChecks > 0 ? `Super (${stapledChecks} need a stapled fund check)` : 'Super'}
              onPress={() => router.navigate('/super')}
              showDivider
            />
          )}
          <ActionRow
            icon={{ ios: 'puzzlepiece.extension.fill', android: 'extension', web: 'extension' }}
            label="Integrations"
            onPress={() => router.navigate('/integrations')}
            showDivider
          />
          <ActionRow
            icon={{ ios: 'building.2.fill', android: 'store', web: 'store' }}
            label="Business Profile"
            onPress={() => router.navigate('/business-profile')}
            showDivider
          />
        </View>
      </Card>
      <Card>
        <ActionRow
          icon={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }}
          label="Log Out"
          onPress={async () => {
            await logOut();
            router.replace('/');
          }}
        />
      </Card>
    </OwnerScreen>
  );
}
