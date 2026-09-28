import { StyleSheet, Text, View } from 'react-native';

import { comingSoon } from '@/components/auth/auth-screen';
import { Button, Icon, SignupColors as C } from '@/components/signup/fields';

export function StepSuccess({
  businessName,
  failedUploads,
  onDashboard,
}: {
  businessName: string;
  failedUploads: string[];
  onDashboard: () => void;
}) {
  return (
    <>
      <View style={styles.hero}>
        <View style={styles.tick}>
          <Icon name={{ ios: 'checkmark', android: 'check', web: 'check' }} color="#FFFFFF" size={44} />
        </View>
        <Text style={styles.title}>You&apos;re all set!</Text>
        <Text style={styles.subtitle}>You&apos;ve successfully joined {businessName}.</Text>
      </View>

      {failedUploads.length > 0 && (
        <Text style={styles.warning}>
          We couldn&apos;t upload: {failedUploads.join(', ')}. You can try again later from your profile.
        </Text>
      )}

      <Button label="Go to Dashboard" arrow onPress={onDashboard} />
      <Button label="View Getting Started Guide" variant="secondary" onPress={() => comingSoon('The Getting Started guide')} />
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  tick: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.done,
    boxShadow: '0px 10px 30px rgba(22, 163, 74, 0.35)',
    marginBottom: 8,
  },
  title: {
    color: C.text,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: 16,
    textAlign: 'center',
  },
  warning: {
    color: '#B45309',
    fontSize: 14,
    textAlign: 'center',
  },
});
