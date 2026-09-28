import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

// Invoices & Quotes has its own stack (list -> detail / create) inside the
// Owner tabs; each screen draws its own header.

// Keep the Invoices list underneath even when a quote is opened directly
// (e.g. from a notification), so leaving it always has somewhere to go.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function InvoicesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}>
      {/* The list must be declared first: the first screen listed is where the tab opens. */}
      <Stack.Screen name="index" />
      {/* The create form steps back one page at a time itself, so the iOS
          swipe-back (which would leave the whole form) is turned off. */}
      <Stack.Screen name="new" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
