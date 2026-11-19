import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { Colors } from '@/constants/theme';
import { useIsDesktop } from '@/hooks/use-desktop';

function TabIcon({ name, color, size }: { name: SymbolViewProps['name']; color: ColorValue; size: number }) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

// The hospitality owner's tab bar: Dashboard, Menu, Sales, Transactions,
// Payroll and More. (No quotes, invoices, jobs or bookings.) Every other page
// lives in the stack in ../_layout.tsx and opens on top of these tabs.
export default function HospitalityTabsLayout() {
  // On a computer the side menu replaces the tab bar.
  const desktop = useIsDesktop();
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: desktop ? { display: 'none' } : { backgroundColor: Colors.surface, borderTopColor: Colors.border },
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: (props) => <TabIcon name={{ ios: 'square.grid.2x2.fill', android: 'dashboard', web: 'dashboard' }} {...props} />,
        }}
      />
      <Tabs.Screen
        name="menu-items"
        options={{
          title: 'Menu',
          tabBarIcon: (props) => <TabIcon name={{ ios: 'fork.knife', android: 'restaurant_menu', web: 'restaurant_menu' }} {...props} />,
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: 'Sales',
          tabBarIcon: (props) => <TabIcon name={{ ios: 'cart.fill', android: 'point_of_sale', web: 'point_of_sale' }} {...props} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: (props) => <TabIcon name={{ ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' }} {...props} />,
        }}
      />
      <Tabs.Screen
        name="payroll"
        options={{
          title: 'Payroll',
          tabBarIcon: (props) => <TabIcon name={{ ios: 'dollarsign.circle.fill', android: 'payments', web: 'payments' }} {...props} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'More',
          tabBarIcon: (props) => <TabIcon name={{ ios: 'ellipsis.circle.fill', android: 'more_horiz', web: 'more_horiz' }} {...props} />,
        }}
      />
    </Tabs>
  );
}
