import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AuthScreen } from '@/components/auth/auth-screen';
import { OptionCard } from '@/components/auth/option-card';
import { AuthColors as C } from '@/components/auth/theme';

// Welcome screen: choose Owner or Employee.
export default function WelcomeScreen() {
  return (
    <AuthScreen logoSize="large">
      <Text style={styles.tagline}>SMARTER BUSINESS. GREATER GAINS.</Text>
      <Text style={styles.prompt}>Choose how you want to sign in</Text>
      <View style={styles.cards}>
        <OptionCard
          icon={{ ios: 'building.2.fill', android: 'business', web: 'business' }}
          title="Owner"
          subtitle="Manage your business"
          onPress={() => router.push('/owner-access')}
        />
        <OptionCard
          icon={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
          title="Employee"
          subtitle="View your work and pay"
          onPress={() => router.push('/employee-access')}
        />
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  tagline: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 3,
    textAlign: 'center',
    marginTop: -4,
  },
  prompt: {
    color: C.text,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 28,
    marginBottom: 4,
  },
  cards: {
    gap: 14,
  },
});
