import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

export default function OwnerDashboardScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Owner Dashboard</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  title: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
});
