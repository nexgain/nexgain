import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { InviteCodeCard } from '@/components/owner/employee-ui';
import { ActionRow, Card, OwnerScreen, PageHeader } from '@/components/owner/ui';
import { ownerNotifications, useNotifications } from '@/data/notifications';
import { logOut } from '@/lib/auth';

// Owner screens that don't fit in the tab bar.
export default function OwnerMoreScreen() {
  const unread = ownerNotifications(useNotifications()).filter((n) => !n.read).length;

  return (
    <OwnerScreen>
      <PageHeader title="More" />
      <InviteCodeCard />
      <Card>
        <View>
          <ActionRow
            icon={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }}
            label={unread > 0 ? `Notifications (${unread} new)` : 'Notifications'}
            // Typed routes only list '/alerts/index' for a folder index screen.
            onPress={() => router.navigate('/alerts' as Href)}
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
            icon={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
            label="Employees"
            onPress={() => router.navigate('/employees' as Href)}
            showDivider
          />
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
          <ActionRow
            icon={{ ios: 'list.bullet.rectangle.fill', android: 'list_alt', web: 'list_alt' }}
            label="Services"
            onPress={() => router.navigate('/services')}
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
