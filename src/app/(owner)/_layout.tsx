import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { OwnerDesktopShell } from '@/components/owner/owner-desktop-shell';
import { Colors } from '@/constants/theme';

// Owner section: the tab bar ((tabs)/_layout.tsx) with every other owner page
// (Jobs, Job Details, Business Profile, Reminders, Integrations, Roster...)
// opening on top of it. Route groups like "(tabs)" aren't part of the address,
// so links such as "/business-profile" or "/job/123" stay the same.
//
// Keep the tabs underneath even when a page is opened directly (e.g. from a
// notification), so its back button always has somewhere to go.
export const unstable_settings = {
  anchor: '(tabs)',
};

export default function OwnerLayout() {
  return (
    <>
      {/* Dark status bar icons on the light owner screens. */}
      <StatusBar style="dark" />
      {/* On a computer (web, wide window): a menu down the left side. Phones: unchanged. */}
      <OwnerDesktopShell>
        <Stack
          screenOptions={{
            // Each page draws its own header with a back button.
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
          }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </OwnerDesktopShell>
    </>
  );
}
