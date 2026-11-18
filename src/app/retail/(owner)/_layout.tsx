import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { OwnerDesktopShell } from '@/systems/retail/components/owner/owner-desktop-shell';
import { Colors } from '@/constants/theme';
import { useRetailSync } from '@/systems/retail/data/retail';
import { useStockSync } from '@/systems/retail/data/stock';
import { useOrdersSync } from '@/systems/retail/data/orders';
import { useRetailAnswers } from '@/systems/retail/data/retail-ai';
import { useSalesSync } from '@/systems/retail/data/sales';

// Owner section: the tab bar ((tabs)/_layout.tsx) with every other owner page
// (Jobs, Job Details, Business Profile, Reminders, Integrations, Roster...)
// opening on top of it. Route groups like "(tabs)" aren't part of the address,
// so links such as "/retail/business-profile" or "/retail/job/123" stay the same.
//
// Keep the tabs underneath even when a page is opened directly (e.g. from a
// notification), so its back button always has somewhere to go.
export const unstable_settings = {
  anchor: '(tabs)',
};

export default function OwnerLayout() {
  // The shop's business type and product categories, and its stock (kept live).
  useRetailSync();
  useStockSync();
  // Orders to suppliers (kept live).
  useOrdersSync();
  // Sales and returns (kept live: a sale on the staff Scanner shows straight away).
  useSalesSync();
  // The free AI Assistant's stock and sales answers (on the phone, no cost).
  useRetailAnswers();
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
