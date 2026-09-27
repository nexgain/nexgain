import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

// Invoices & Quotes has its own stack (list -> detail / create) inside the
// Owner tabs; each screen draws its own header.
export default function InvoicesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    />
  );
}
