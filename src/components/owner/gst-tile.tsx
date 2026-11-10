// Dashboard tile: "Estimated GST this quarter: $X" (Australian GST-registered
// businesses only). Opens the GST page.
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, OwnerIcons } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { formatDay, quarterOf, useGstQuarter } from '@/data/gst';
import { formatMoney } from '@/data/payroll';

export function GstTile() {
  const quarter = quarterOf(new Date());
  const { enabled, totals, status } = useGstQuarter(quarter);
  if (!enabled) return null;
  const amount = status === 'ready' ? formatMoney(totals.toPay) : '…';
  return (
    <Pressable
      onPress={() => router.navigate('/gst')}
      accessibilityRole="button"
      accessibilityLabel={`Estimated GST this quarter ${amount}. Open GST.`}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={styles.icon}>
        <Icon name={OwnerIcons.receipt} color={C.accent} size={18} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>Estimated GST this quarter: {amount}</Text>
        <Text style={styles.sub}>
          {quarter.label} · BAS due {formatDay(quarter.basDue)}
        </Text>
      </View>
      <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={12} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three,
    borderRadius: Radius.large - 4,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accentSoft,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  sub: {
    color: C.textSecondary,
    fontSize: 13,
  },
});
