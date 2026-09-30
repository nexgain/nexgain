import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

// Expenses list -> Add / edit expense. Opened from the Expenses box on the Dashboard.
export default function ExpensesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    />
  );
}
