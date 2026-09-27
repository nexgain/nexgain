import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { EmployeeColors as C } from '@/constants/employee-theme';

// The Employee section uses a light theme; the rest of the app stays dark.
const employeeNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: C.primary,
    background: C.background,
    card: C.card,
    text: C.text,
    border: C.border,
  },
};

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function EmployeeLayout() {
  return (
    <ThemeProvider value={employeeNavigationTheme}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: C.primary,
          headerTitleStyle: { color: C.text },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="job-details" options={{ title: 'Shift details' }} />
        <Stack.Screen name="account/[section]" options={{ title: '' }} />
        <Stack.Screen name="availability" options={{ title: 'My Availability' }} />
        <Stack.Screen name="qualifications" options={{ title: 'Qualifications' }} />
        <Stack.Screen name="add-qualification" options={{ title: 'Add Qualification' }} />
      </Stack>
    </ThemeProvider>
  );
}
