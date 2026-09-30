import { useEffect } from 'react';
import { router, useLocalSearchParams, type Href } from 'expo-router';

import { NotificationDetail, OWNER_PALETTE, type DetailAction } from '@/components/notifications/notification-views';
import { ScreenHeader } from '@/components/owner/invoices-ui';
import { Card, EmptyState, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { markRead, typeInfo, useNotifications } from '@/data/notifications';

// Actions that already have a screen to go to; the rest are shown as coming soon.
const ACTION_ROUTES: Record<string, Href> = {
  'View full job details': '/roster',
  'Open roster': '/roster',
  'View invoice': '/invoices' as Href,
  'Create quote': { pathname: '/invoices/new', params: { kind: 'quote' } },
};

export default function OwnerNotificationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const n = useNotifications().find((x) => x.id === id && x.audience === 'owner');

  useEffect(() => {
    if (id) markRead(id);
  }, [id]);

  if (!n) {
    return (
      <OwnerScreen>
        <ScreenHeader title="Notification" onBack={() => router.back()} />
        <Card>
          <EmptyState icon={OwnerIcons.bell} message="This notification is no longer available." />
        </Card>
      </OwnerScreen>
    );
  }

  // The roster opens on the job's day, with a back arrow to return here.
  const openRoster = () =>
    router.navigate({ pathname: '/roster', params: { from: 'notification', date: n.relatedShift?.date ?? '' } });

  const actions: DetailAction[] = typeInfo(n).actions.map((label) => ({
    label,
    onPress:
      ACTION_ROUTES[label] === '/roster'
        ? openRoster
        : ACTION_ROUTES[label]
          ? () => router.navigate(ACTION_ROUTES[label])
          : undefined,
  }));

  return (
    <OwnerScreen>
      <ScreenHeader title="Notification" onBack={() => router.back()} />
      <NotificationDetail
        n={n}
        palette={OWNER_PALETTE}
        actions={actions}
        onOpenRelated={n.relatedShift ? openRoster : undefined}
      />
    </OwnerScreen>
  );
}
