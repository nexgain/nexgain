import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';

// Temporary role picker. No real authentication yet.
export default function LandingScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>NexGain</Text>
        <Text style={styles.subtitle}>Choose how you want to sign in</Text>
      </View>

      <View style={styles.buttons}>
        <Link href="/dashboard" asChild>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, styles.ownerButton, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>Owner Login</Text>
          </Pressable>
        </Link>

        <Link href="/home" asChild>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, styles.employeeButton, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>Employee Login</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.four,
    justifyContent: 'center',
    gap: Spacing.six,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    color: Colors.text,
    fontSize: 40,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
  buttons: {
    gap: Spacing.three,
  },
  button: {
    paddingVertical: Spacing.three + 2,
    borderRadius: Radius.medium,
    alignItems: 'center',
    borderWidth: 1,
  },
  ownerButton: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  employeeButton: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  pressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
});
