// Pieces shared by the Transactions tab and the transaction detail page.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, OwnerIcons, type IconName } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { INCOME_CATEGORY, TRANSFERS_CATEGORY, type TransactionItem } from '@/data/bank';
import { formatShortDate } from '@/data/employee-roster';
import { formatMoney } from '@/data/payroll';

const CATEGORY_ICONS: Record<string, IconName> = {
  [INCOME_CATEGORY]: { ios: 'arrow.down.left', android: 'south_west', web: 'south_west' },
  Fuel: { ios: 'fuelpump.fill', android: 'local_gas_station', web: 'local_gas_station' },
  'Materials & supplies': { ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' },
  'Equipment & tools': { ios: 'wrench.and.screwdriver.fill', android: 'construction', web: 'construction' },
  Vehicle: { ios: 'car.fill', android: 'directions_car', web: 'directions_car' },
  Rent: { ios: 'house.fill', android: 'home', web: 'home' },
  Utilities: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' },
  Insurance: { ios: 'shield.fill', android: 'shield', web: 'shield' },
  'Phone & internet': { ios: 'phone.fill', android: 'call', web: 'call' },
  'Software & subscriptions': { ios: 'laptopcomputer', android: 'laptop', web: 'laptop' },
  Advertising: { ios: 'megaphone.fill', android: 'campaign', web: 'campaign' },
  'Wages & super': OwnerIcons.people,
  'Bank fees': OwnerIcons.bank,
  Tax: OwnerIcons.percent,
  [TRANSFERS_CATEGORY]: { ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' },
  Other: { ios: 'square.grid.2x2.fill', android: 'category', web: 'category' },
};

export function categoryIcon(category: string): IconName {
  return CATEGORY_ICONS[category] ?? CATEGORY_ICONS.Other;
}

/** Green for money in, plain for money out, grey for moving money between your own accounts. */
export function amountColor(item: Pick<TransactionItem, 'amount' | 'category'>) {
  if (item.category === TRANSFERS_CATEGORY) return C.textSecondary;
  return item.amount > 0 ? C.success : C.text;
}

/** "+$120.00" or "-$45.50". */
export function signedMoney(amount: number) {
  return `${amount > 0 ? '+' : amount < 0 ? '-' : ''}${formatMoney(Math.abs(amount))}`;
}

export function TransactionRow({ item, showDivider, onPress }: { item: TransactionItem; showDivider: boolean; onPress: () => void }) {
  const moneyIn = item.amount > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${moneyIn ? 'money in' : 'money out'} ${formatMoney(Math.abs(item.amount))}, ${formatShortDate(item.date)}`}
      style={({ pressed }) => [styles.row, showDivider && styles.divider, pressed && styles.pressed]}>
      <View style={[styles.icon, moneyIn ? styles.iconIn : styles.iconOut]}>
        <Icon
          name={
            moneyIn
              ? { ios: 'arrow.down.left', android: 'south_west', web: 'south_west' }
              : { ios: 'arrow.up.right', android: 'north_east', web: 'north_east' }
          }
          color={moneyIn ? C.success : C.danger}
          size={14}
        />
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {[formatShortDate(item.date, false), item.subtitle].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={[styles.amount, { color: amountColor(item) }]}>{signedMoney(item.amount)}</Text>
      <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={12} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    minHeight: 56,
    paddingVertical: Spacing.two,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  pressed: {
    opacity: 0.7,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconIn: {
    backgroundColor: 'rgba(34, 197, 94, 0.14)',
  },
  iconOut: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  sub: {
    color: C.textSecondary,
    fontSize: 13,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
