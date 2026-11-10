import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { InviteCodeCard } from '@/components/owner/employee-ui';
import { ActionRow, Card, OwnerScreen, PageHeader } from '@/components/owner/ui';
import { useBusiness } from '@/data/business';
import { useContractorInvoices } from '@/data/contractor-invoices';
import { superStatusOf, useEmployeeSuper } from '@/data/employee-super';
import { useEmployees } from '@/data/employees';
import { useJobs } from '@/data/jobs';
import { reminderProblems, useReminders } from '@/data/reminders';
import { ownerNotifications, useNotifications } from '@/data/notifications';
import { businessUsesSuper } from '@/data/super-rules';
import { logOut } from '@/lib/auth';

// Owner screens that don't fit in the tab bar.
export default function OwnerMoreScreen() {
  const unread = ownerNotifications(useNotifications()).filter((n) => !n.read).length;
  const toReview = useContractorInvoices().filter((i) => i.status === 'sent').length;
  const cantSend = reminderProblems(useJobs(), useReminders()).length;
  // Super: Australian businesses only.
  const usesSuper = businessUsesSuper(useBusiness());
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
            // Typed routes only list '/alerts/index' for a folder index screen. Always
            // from=menu, so a "from=dashboard" left from an earlier visit is replaced.
            onPress={() => router.navigate({ pathname: '/alerts', params: { from: 'menu' } } as Href)}
          />
          <ActionRow
            icon={{ ios: 'briefcase.fill', android: 'work', web: 'work' }}
            label="Jobs"
            onPress={() => router.navigate('/jobs')}
            showDivider
          />
          <ActionRow
            icon={{ ios: 'calendar.badge.clock', android: 'event_note', web: 'event_note' }}
            label="Roster"
            onPress={() => router.navigate('/roster')}
            showDivider
          />
          <ActionRow
            icon={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }}
            label="Analytics & Reports"
            onPress={() => router.navigate('/analytics')}
            showDivider
          />
          <ActionRow
            icon={{ ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' }}
            label={cantSend > 0 ? `Reminders (${cantSend} couldn't send)` : 'Reminders'}
            onPress={() => router.navigate('/reminders')}
            showDivider
          />
          <ActionRow
            icon={{ ios: 'doc.plaintext.fill', android: 'request_quote', web: 'request_quote' }}
            label={toReview > 0 ? `Contractor Invoices (${toReview} to review)` : 'Contractor Invoices'}
            onPress={() => router.navigate('/contractor-invoices')}
            showDivider
          />
          <ActionRow
            icon={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
            label="Employees"
            onPress={() => router.navigate('/employees' as Href)}
            showDivider
          />
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
            icon={{ ios: 'list.bullet.rectangle.fill', android: 'list_alt', web: 'list_alt' }}
            label="Services"
            onPress={() => router.navigate('/services')}
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
