import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { EmployeeScreen, Icon } from '@/components/employee/ui';
import {
  EMPLOYEE_PALETTE,
  FilterPills,
  NotificationGroups,
  NotificationsEmpty,
} from '@/components/notifications/notification-views';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { currentEmployee } from '@/data/current-employee';
import {
  EMPLOYEE_FILTERS,
  employeeNotifications,
  groupByDate,
  matchesFilter,
  useNotifications,
} from '@/data/notifications';

export default function EmployeeNotificationsScreen() {
  const mine = employeeNotifications(useNotifications(), currentEmployee?.id ?? null);
  const [filter, setFilter] = useState<string>('All');

  const counts = Object.fromEntries(EMPLOYEE_FILTERS.map((f) => [f, mine.filter((n) => matchesFilter(n, f)).length]));
  const groups = groupByDate(mine.filter((n) => matchesFilter(n, filter)));

  return (
    <EmployeeScreen
      title="Notifications"
      headerRight={
        <Pressable
          onPress={() => router.push({ pathname: '/account/[section]', params: { section: 'notifications' } })}
          accessibilityRole="button"
          accessibilityLabel="Notification settings"
          hitSlop={8}
          style={({ pressed }) => [styles.gear, pressed && styles.pressed]}>
          <Icon name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }} color={C.textSecondary} size={18} />
        </Pressable>
      }>
      <FilterPills filters={EMPLOYEE_FILTERS} counts={counts} active={filter} onChange={setFilter} palette={EMPLOYEE_PALETTE} />

      {mine.length === 0 ? (
        <NotificationsEmpty
          palette={EMPLOYEE_PALETTE}
          message="Roster updates, payslips and messages from your manager will show up here."
        />
      ) : groups.length === 0 ? (
        <NotificationsEmpty palette={EMPLOYEE_PALETTE} message={`Nothing under "${filter}" right now.`} />
      ) : (
        <NotificationGroups
          groups={groups}
          palette={EMPLOYEE_PALETTE}
          onOpen={(n) => router.push({ pathname: '/notification/[id]', params: { id: n.id } })}
        />
      )}
    </EmployeeScreen>
  );
}

const styles = StyleSheet.create({
  gear: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  pressed: {
    opacity: 0.7,
  },
});
