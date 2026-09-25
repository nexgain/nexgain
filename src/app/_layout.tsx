import { DarkTheme, ThemeProvider, Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { Colors } from '@/constants/theme';

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.accent,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.text,
    border: Colors.border,
  },
};

type TabIconProps = {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size: number;
};

function TabIcon({ name, color, size }: TabIconProps) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

export default function RootLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="light" />
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
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: (props) => (
              <TabIcon name={{ ios: 'house.fill', android: 'home', web: 'home' }} {...props} />
            ),
          }}
        />
        <Tabs.Screen
          name="jobs"
          options={{
            title: 'Jobs',
            tabBarIcon: (props) => (
              <TabIcon name={{ ios: 'briefcase.fill', android: 'work', web: 'work' }} {...props} />
            ),
          }}
        />
        <Tabs.Screen
          name="payslips"
          options={{
            title: 'Payslips',
            tabBarIcon: (props) => (
              <TabIcon
                name={{ ios: 'doc.text.fill', android: 'receipt_long', web: 'receipt_long' }}
                {...props}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: (props) => (
              <TabIcon name={{ ios: 'person.fill', android: 'person', web: 'person' }} {...props} />
            ),
          }}
        />
      </Tabs>
    </ThemeProvider>
  );
}
