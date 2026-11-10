import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { EmployeeDesktopShell } from '@/components/employee/employee-desktop-shell';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { useIsDesktop } from '@/hooks/use-desktop';

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
  anchor: '(tabs)',
};

export default function EmployeeLayout() {
  // On a computer, pages in the side menu are main pages: no back arrow in their header.
  const desktop = useIsDesktop();
  const menuPage = desktop ? { headerLeft: () => null } : {};
  return (
    <ThemeProvider value={employeeNavigationTheme}>
      <StatusBar style="dark" />
      {/* On a computer (web, wide window): a menu down the left side. Phones: unchanged. */}
      <EmployeeDesktopShell>
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
          <Stack.Screen name="availability" options={{ title: 'My Availability', ...menuPage }} />
          <Stack.Screen name="profile" options={{ title: 'My Profile', ...menuPage }} />
          <Stack.Screen name="super-details" options={{ title: 'Super Details' }} />
          <Stack.Screen name="payslip/[id]" options={{ title: 'Payslip' }} />
          <Stack.Screen name="contractor-invoice/[id]" options={{ title: 'Invoice' }} />
          <Stack.Screen name="qualifications" options={{ title: 'Qualifications', ...menuPage }} />
          <Stack.Screen name="add-qualification" options={{ title: 'Add Qualification' }} />
          <Stack.Screen name="job-report" options={{ title: 'Job report form' }} />
          <Stack.Screen name="notification/[id]" options={{ title: 'Notification' }} />
        </Stack>
      </EmployeeDesktopShell>
    </ThemeProvider>
  );
}
