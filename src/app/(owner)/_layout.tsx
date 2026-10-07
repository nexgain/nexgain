import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { Colors } from '@/constants/theme';

type TabIconProps = {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size: number;
};

function TabIcon({ name, color, size }: TabIconProps) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

export default function OwnerLayout() {
  return (
    <Tabs
      // Back buttons on sub-pages (Services, Analytics, ...) return to the screen they were opened from.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
        },
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: (props) => (
            <TabIcon
              name={{ ios: 'square.grid.2x2.fill', android: 'dashboard', web: 'dashboard' }}
              {...props}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: (props) => (
            <TabIcon
              name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
              {...props}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="payroll"
        options={{
          title: 'Payroll',
          tabBarIcon: (props) => (
            <TabIcon
              name={{ ios: 'dollarsign.circle.fill', android: 'payments', web: 'payments' }}
              {...props}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={{
          title: 'Invoices',
          // Leaving the tab closes any open quote/invoice screens, so the tab
          // always reopens on the Invoices list.
          popToTopOnBlur: true,
          tabBarIcon: (props) => (
            <TabIcon
              name={{ ios: 'doc.text.fill', android: 'receipt_long', web: 'receipt_long' }}
              {...props}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="ai-assistant"
        options={{
          title: 'AI Assistant',
          tabBarIcon: (props) => (
            <TabIcon
              name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
              {...props}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
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
      {/* Opened from the More tab (and Dashboard quick actions), not shown in the tab bar. */}
      <Tabs.Screen name="analytics" options={{ href: null, title: 'Analytics & Reports' }} />
      <Tabs.Screen name="integrations" options={{ href: null, title: 'Integrations' }} />
      <Tabs.Screen name="alerts" options={{ href: null, title: 'Notifications' }} />
      <Tabs.Screen name="services" options={{ href: null, title: 'Services' }} />
      <Tabs.Screen name="business-profile" options={{ href: null, title: 'Business Profile' }} />
      <Tabs.Screen name="employee/[id]" options={{ href: null, title: 'Employee Profile' }} />
      <Tabs.Screen name="roster" options={{ href: null, title: 'Roster' }} />
      <Tabs.Screen name="contractor-invoices" options={{ href: null, title: 'Contractor Invoices' }} />
      <Tabs.Screen name="team-invoice/[id]" options={{ href: null, title: 'Contractor Invoice' }} />
      <Tabs.Screen name="jobs" options={{ href: null, title: 'Jobs' }} />
      <Tabs.Screen name="job/[id]" options={{ href: null, title: 'Job Details' }} />
      <Tabs.Screen name="employees" options={{ href: null, title: 'Employees', popToTopOnBlur: true }} />
      <Tabs.Screen name="revenue" options={{ href: null, title: 'Revenue' }} />
      <Tabs.Screen name="expenses" options={{ href: null, title: 'Expenses', popToTopOnBlur: true }} />
    </Tabs>
  );
}
