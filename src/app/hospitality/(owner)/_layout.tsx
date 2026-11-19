import { Redirect, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Colors } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import { useCurrentEmployee } from '@/data/current-employee';
import { homeFor, systemOf } from '@/data/systems';
import { HospitalityDesktopShell } from '@/systems/hospitality/components/owner/hospitality-desktop-shell';
import { useHospitalitySync } from '@/systems/hospitality/data/menu';

// Hospitality owner section: the tab bar ((tabs)/_layout.tsx) with every other
// owner page opening on top of it.
export const unstable_settings = {
  anchor: '(tabs)',
};

export default function HospitalityOwnerLayout() {
  const business = useBusiness();
  const me = useCurrentEmployee();
  // The menu and sales, loaded for this business.
  useHospitalitySync();

  // Only hospitality owners belong here: anyone else goes to their own home page.
  if (me) return <Redirect href={homeFor('employee', business)} />;
  if (business && systemOf(business) !== 'hospitality') return <Redirect href={homeFor('owner', business)} />;

  return (
    <>
      <StatusBar style="dark" />
      {/* On a computer (web, wide window): a menu down the left side. Phones: the tab bar. */}
      <HospitalityDesktopShell>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
          }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </HospitalityDesktopShell>
    </>
  );
}
