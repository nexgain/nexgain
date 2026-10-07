import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { EmployeeColors as C } from '@/constants/employee-theme';
import { useCurrentEmployee } from '@/data/current-employee';
import { isContractor } from '@/data/employees';
import { employeeNotifications, useNotifications } from '@/data/notifications';

type TabIconProps = {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size: number;
};

function TabIcon({ name, color, size }: TabIconProps) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

export default function EmployeeTabsLayout() {
  const currentEmployee = useCurrentEmployee();
  const unread = employeeNotifications(useNotifications(), currentEmployee?.id ?? null).filter((n) => !n.read).length;
  // Decided only by their employment type (set at sign-up, changeable by the owner).
  const contractor = isContractor(currentEmployee);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.textMuted,
        tabBarStyle: {
          backgroundColor: C.card,
          borderTopColor: C.border,
        },
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: (props) => (
            <TabIcon name={{ ios: 'house.fill', android: 'home', web: 'home' }} {...props} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-roster"
        options={{
          title: 'Roster',
          tabBarIcon: (props) => (
            <TabIcon
              name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
              {...props}
            />
          ),
        }}
      />
      {/* Contractors only: their invoices. ("my-invoices" so it doesn't clash with the owner's /invoices.) */}
      <Tabs.Screen
        name="my-invoices"
        options={{
          title: 'Invoices',
          href: contractor ? undefined : null,
          tabBarIcon: (props) => (
            <TabIcon name={{ ios: 'doc.plaintext.fill', android: 'request_quote', web: 'request_quote' }} {...props} />
          ),
        }}
      />
      {/* Everyone except contractors: payslips (unchanged). */}
      <Tabs.Screen
        name="payslips"
        options={{
          title: 'Payslips',
          href: contractor ? null : undefined,
          tabBarIcon: (props) => (
            <TabIcon
              name={{ ios: 'doc.text.fill', android: 'receipt_long', web: 'receipt_long' }}
              {...props}
            />
          ),
        }}
      />
      {/* Contractors only: paid invoices, in the Payslips position. */}
      <Tabs.Screen
        name="paid"
        options={{
          title: 'Paid',
          href: contractor ? undefined : null,
          tabBarIcon: (props) => (
            <TabIcon name={{ ios: 'checkmark.seal.fill', android: 'paid', web: 'paid' }} {...props} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarIcon: (props) => (
            <TabIcon name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }} {...props} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: (props) => (
            <TabIcon
              name={{ ios: 'ellipsis.circle.fill', android: 'more_horiz', web: 'more_horiz' }}
              {...props}
            />
          ),
        }}
      />
    </Tabs>
  );
}
