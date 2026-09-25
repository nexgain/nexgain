import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';

type Props = {
  title: string;
  subtitle?: string;
};

export function PlaceholderScreen({ title, subtitle = 'Coming soon' }: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.body}>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.four,
  },
  title: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: '700',
    marginTop: Spacing.four,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
});
