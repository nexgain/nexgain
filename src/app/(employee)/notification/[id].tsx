import { useEffect } from 'react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  EMPLOYEE_PALETTE,
  NotificationDetail,
  type DetailAction,
} from '@/components/notifications/notification-views';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Spacing } from '@/constants/theme';
import { markRead, typeInfo, useNotifications } from '@/data/notifications';

// Where each "Related actions" shortcut goes in the Employee section.
const ACTION_ROUTES: Record<string, Href> = {
  'Open Roster': '/my-roster',
  'View Upcoming Jobs': '/home',
  'Open Payslips': '/payslips',
  'Open Qualifications': '/qualifications',
};

export default function EmployeeNotificationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const n = useNotifications().find((x) => x.id === id && x.audience === 'employee');

  useEffect(() => {
    if (id) markRead(id);
  }, [id]);

  if (!n) {
    return (
      <View style={[styles.screen, styles.missing]}>
        <Text style={styles.missingText}>This notification is no longer available.</Text>
      </View>
    );
  }

  const actions: DetailAction[] = typeInfo(n).actions.map((label) => ({
    label,
    onPress: ACTION_ROUTES[label] ? () => router.navigate(ACTION_ROUTES[label]) : undefined,
  }));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <NotificationDetail
        n={n}
        palette={EMPLOYEE_PALETTE}
        actions={actions}
        actionsTitle="Related actions"
        onOpenRelated={
          n.relatedShift
            ? () => router.push({ pathname: '/job-details', params: { date: n.relatedShift!.date } })
            : undefined
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    padding: Spacing.four - 4,
  },
  missing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  missingText: {
    color: C.textSecondary,
    fontSize: 15,
  },
});
