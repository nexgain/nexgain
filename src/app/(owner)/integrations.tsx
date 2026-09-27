import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

import { BrandLogos, StripeBrandColor, type BrandLogoName } from '@/constants/brand-logos';
import { Colors, Radius, Spacing } from '@/constants/theme';

type IntegrationLogo =
  | { type: 'brand'; name: BrandLogoName; tile: string }
  | { type: 'symbol'; name: SymbolViewProps['name']; tile: string };

type Integration = {
  id: string;
  name: string;
  description: string;
  logo: IntegrationLogo;
};

const WHITE_TILE = '#FFFFFF';

const INTEGRATIONS: Integration[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Email',
    logo: { type: 'brand', name: 'gmail', tile: WHITE_TILE },
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Scheduling',
    logo: { type: 'brand', name: 'googleCalendar', tile: WHITE_TILE },
  },
  {
    id: 'bank',
    name: 'Bank Account',
    description: 'Business banking',
    // Generic icon: not tied to a specific bank.
    logo: {
      type: 'symbol',
      name: { ios: 'building.columns.fill', android: 'account_balance', web: 'account_balance' },
      tile: '#10B981',
    },
  },
  {
    id: 'xero',
    name: 'Xero',
    description: 'Accounting',
    logo: { type: 'brand', name: 'xero', tile: WHITE_TILE },
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Payments',
    // Stripe's mark is a white "S" on its brand purple.
    logo: { type: 'brand', name: 'stripe', tile: StripeBrandColor },
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'File storage',
    logo: { type: 'brand', name: 'googleDrive', tile: WHITE_TILE },
  },
  {
    id: 'outlook',
    name: 'Outlook',
    description: 'Email & calendar',
    logo: { type: 'brand', name: 'outlook', tile: WHITE_TILE },
  },
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Online store',
    logo: { type: 'brand', name: 'shopify', tile: WHITE_TILE },
  },
];

function IntegrationIcon({ logo }: { logo: IntegrationLogo }) {
  return (
    <View style={[styles.iconTile, { backgroundColor: logo.tile }]}>
      {logo.type === 'brand' ? (
        <SvgXml xml={BrandLogos[logo.name]} width={28} height={28} />
      ) : (
        <SymbolView name={logo.name} tintColor="#FFFFFF" size={22} />
      )}
    </View>
  );
}

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
                <IntegrationIcon logo={item.logo} />

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
