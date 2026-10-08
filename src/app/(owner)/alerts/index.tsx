import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import {
  FilterPills,
  NotificationGroups,
  NotificationsEmpty,
  OWNER_PALETTE,
  SearchBar,
} from '@/components/notifications/notification-views';
import { ScreenHeader } from '@/components/owner/invoices-ui';
import { OwnerScreen } from '@/components/owner/ui';
import {
  groupByDate,
  markRead,
  matchesFilter,
  matchesSearch,
  OWNER_FILTERS,
  ownerNotifications,
  useNotifications,
} from '@/data/notifications';

export default function OwnerNotificationsScreen() {
  // Opened from the Dashboard's "See more" (from=dashboard) or the More tab (from=menu).
  const { from } = useLocalSearchParams<{ from?: string }>();
  const all = ownerNotifications(useNotifications());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('All');

  const searched = all.filter((n) => matchesSearch(n, query));
  const counts = Object.fromEntries(OWNER_FILTERS.map((f) => [f, searched.filter((n) => matchesFilter(n, f)).length]));
  const groups = groupByDate(searched.filter((n) => matchesFilter(n, filter)));

  return (
    <OwnerScreen>
      <ScreenHeader title="Notifications" onBack={() => router.navigate(from === 'dashboard' ? '/dashboard' : '/menu')} />
      <SearchBar value={query} onChange={setQuery} palette={OWNER_PALETTE} placeholder="Search notifications..." />
      <FilterPills filters={OWNER_FILTERS} counts={counts} active={filter} onChange={setFilter} palette={OWNER_PALETTE} />

      {all.length === 0 ? (
        <NotificationsEmpty
          palette={OWNER_PALETTE}
          message="Job reports, incidents, roster updates and payments will show up here as they happen."
        />
      ) : groups.length === 0 ? (
        <NotificationsEmpty palette={OWNER_PALETTE} message="No notifications match your search or filter." />
      ) : (
        <NotificationGroups
          groups={groups}
          palette={OWNER_PALETTE}
          onOpen={(n) => {
            // A customer accepting or declining a quote opens that quote.
            if (n.relatedDocId) {
              markRead(n.id);
              router.push({ pathname: '/invoices/[id]', params: { id: n.relatedDocId } });
            } else {
              router.push({ pathname: '/alerts/[id]', params: { id: n.id } });
            }
          }}
        />
      )}
    </OwnerScreen>
  );
}
