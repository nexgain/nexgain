import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { EmployeeColors as C } from '@/constants/employee-theme';
import { Spacing } from '@/constants/theme';
import { ACCOUNT_SECTIONS } from '@/data/employee-account';

// Placeholder for each row on the More tab until those pages are built.
export default function AccountSectionScreen() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const info = ACCOUNT_SECTIONS.find((s) => s.id === section);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: info?.title ?? 'Not found' }} />
      <Text style={styles.title}>{info?.title ?? 'Not found'}</Text>
      <Text style={styles.subtitle}>{info ? 'Coming soon' : 'This page does not exist.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: C.background,
  },
  title: {
    color: C.text,
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: 15,
  },
});
