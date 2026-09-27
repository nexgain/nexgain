import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';

type Integration = {
  id: string;
  name: string;
  description: string;
  icon: SymbolViewProps['name'];
  color: string;
};

// Generic icons on brand-coloured tiles until real logos are added.
const INTEGRATIONS: Integration[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Email',
    icon: { ios: 'envelope.fill', android: 'mail', web: 'mail' },
    color: '#EA4335',
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Scheduling',
    icon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
    color: '#4285F4',
  },
  {
    id: 'bank',
    name: 'Bank Account',
    description: 'Business banking',
    icon: { ios: 'building.columns.fill', android: 'account_balance', web: 'account_balance' },
    color: '#10B981',
  },
  {
    id: 'xero',
    name: 'Xero',
    description: 'Accounting',
    icon: { ios: 'chart.pie.fill', android: 'pie_chart', web: 'pie_chart' },
    color: '#13B5EA',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Payments',
    icon: { ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' },
    color: '#635BFF',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'File storage',
    icon: { ios: 'folder.fill', android: 'folder', web: 'folder' },
    color: '#0F9D58',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    description: 'Email & calendar',
    icon: { ios: 'tray.full.fill', android: 'inbox', web: 'inbox' },
    color: '#0078D4',
  },
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Online store',
    icon: { ios: 'bag.fill', android: 'shopping_bag', web: 'shopping_bag' },
    color: '#95BF47',
  },
];

export default function IntegrationsScreen() {
  // Demo only: connection state lives in memory and nothing is actually connected.
  const [connected, setConnected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setConnected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.title}>Integrations</Text>
          <Text style={styles.subtitle}>
            {connected.size} of {INTEGRATIONS.length} connected
          </Text>
        </View>

        <View style={styles.list}>
          {INTEGRATIONS.map((item) => {
            const isConnected = connected.has(item.id);
            return (
              <View key={item.id} style={styles.card}>
                <View style={[styles.iconTile, { backgroundColor: item.color }]}>
                  <SymbolView name={item.icon} tintColor="#FFFFFF" size={22} />
                </View>

                <View style={styles.info}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.description}>{item.description}</Text>
                </View>

                <Pressable
                  onPress={() => toggle(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${isConnected ? 'Disconnect' : 'Connect'} ${item.name}`}
                  style={({ pressed }) => [
                    styles.button,
                    isConnected ? styles.buttonConnected : styles.buttonConnect,
                    pressed && styles.pressed,
                  ]}>
                  {isConnected && (
                    <SymbolView
                      name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                      tintColor={Colors.success}
                      size={14}
                    />
                  )}
                  <Text style={[styles.buttonText, isConnected && styles.buttonTextConnected]}>
                    {isConnected ? 'Connected' : 'Connect'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 16,
    marginTop: Spacing.one,
  },
  list: {
    gap: Spacing.two + 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    backgroundColor: Colors.surface,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
  },
  buttonConnect: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  buttonConnected: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  pressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonTextConnected: {
    color: Colors.success,
  },
});
