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
        name="roster"
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
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics & Reports',
          tabBarLabel: 'Analytics',
          tabBarIcon: (props) => (
            <TabIcon
              name={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }}
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
        name="integrations"
        options={{
          title: 'Integrations',
          tabBarIcon: (props) => (
            <TabIcon
              name={{ ios: 'puzzlepiece.extension.fill', android: 'extension', web: 'extension' }}
              {...props}
            />
          ),
        }}
      />
    </Tabs>
  );
}
