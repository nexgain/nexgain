import { useState } from 'react';
import { router } from 'expo-router';

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
  matchesFilter,
  matchesSearch,
  OWNER_FILTERS,
  ownerNotifications,
  useNotifications,
} from '@/data/notifications';

export default function OwnerNotificationsScreen() {
  const all = ownerNotifications(useNotifications());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('All');

  const searched = all.filter((n) => matchesSearch(n, query));
  const counts = Object.fromEntries(OWNER_FILTERS.map((f) => [f, searched.filter((n) => matchesFilter(n, f)).length]));
  const groups = groupByDate(searched.filter((n) => matchesFilter(n, filter)));

  return (
    <OwnerScreen>
      <ScreenHeader title="Notifications" />
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
          onOpen={(n) => router.push({ pathname: '/alerts/[id]', params: { id: n.id } })}
        />
      )}
    </OwnerScreen>
  );
}
