import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

// Owner notifications (list -> detail). Lives at /alerts because the Employee
// section already uses /notifications. Opened from the More tab.
export default function AlertsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    />
  );
}
