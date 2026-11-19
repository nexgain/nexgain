import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { Colors } from '@/constants/theme';
import { useIsDesktop } from '@/hooks/use-desktop';

type TabIconProps = {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size: number;
};

function TabIcon({ name, color, size }: TabIconProps) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

// NexGain Retail's tab bar (phone): Home, Products, Orders, Transactions,
// Payroll, More (Suppliers, the AI Assistant and everything else open from More).
// The owner's tab bar. Only real tabs belong here: since Expo Router 58 a tab
// hidden with `href: null` can't be opened (it bounces straight back to a
// visible tab), so every other owner page lives in the stack in ../_layout.tsx
// and opens on top of these tabs.
export default function OwnerTabsLayout() {
  // On a computer the side menu (OwnerDesktopShell) replaces the tab bar.
  const desktop = useIsDesktop();
  return (
    <Tabs
      // Android's back button returns to the tab you came from.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: desktop
          ? { display: 'none' }
          : {
              backgroundColor: Colors.surface,
              borderTopColor: Colors.border,
            },
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: (props) => <TabIcon name={{ ios: 'house.fill', android: 'home', web: 'home' }} {...props} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Products',
          tabBarIcon: (props) => <TabIcon name={{ ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' }} {...props} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: (props) => <TabIcon name={{ ios: 'cart.fill', android: 'shopping_cart', web: 'shopping_cart' }} {...props} />,
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
