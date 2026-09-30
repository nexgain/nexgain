import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

// Employees list -> Add / edit invited employee. Opened from the More tab.
// (An employee's profile lives at /employee/[id], shared with the Roster.)
export default function EmployeesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    />
  );
}
