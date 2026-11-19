// NexGain Hospitality: pieces shared by the Menu, Record sale and Sales screens.
import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/payroll';
import { menuPhotoUrl, type MenuItem, type Sale } from '@/systems/hospitality/data/menu';
import { profitOf } from '@/systems/hospitality/data/sales-stats';

export const MenuIcons = {
  menu: { ios: 'fork.knife', android: 'restaurant_menu', web: 'restaurant_menu' },
  sale: { ios: 'cart.fill', android: 'point_of_sale', web: 'point_of_sale' },
  day: { ios: 'moon.stars.fill', android: 'nightlight', web: 'nightlight' },
  star: { ios: 'star.fill', android: 'star', web: 'star' },
  photo: { ios: 'photo', android: 'image', web: 'image' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  minus: { ios: 'minus', android: 'remove', web: 'remove' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  category: { ios: 'square.stack.3d.up.fill', android: 'category', web: 'category' },
  trophy: { ios: 'trophy.fill', android: 'emoji_events', web: 'emoji_events' },
} as const;

/** A menu photo from private storage, or a plain placeholder. */
export function MenuPhoto({ path, size = 44 }: { path: string | null; size?: number }) {
  // The link loaded for a photo (only shown while it's still the same photo).
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    let live = true;
    if (path) menuPhotoUrl(path).then((url) => live && setLoaded({ path, url })).catch(() => {});
    return () => {
      live = false;
    };
  }, [path]);
  const url = path && loaded?.path === path ? loaded.url : null;
  const box = { width: size, height: size, borderRadius: Radius.medium };
  if (url) return <Image source={{ uri: url }} style={box} contentFit="cover" accessibilityIgnoresInvertColors />;
  return (
    <View style={[styles.placeholder, box]}>
      <Icon name={MenuIcons.menu} color={C.textSecondary} size={size / 2.6} />
    </View>
  );
}

/** "Mon 17 Nov, 2:15 pm" (end-of-day entries show the date only). */
export function saleWhen(sale: Sale) {
  const d = new Date(sale.soldAt);
  const date = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return sale.source === 'day' ? date : `${date}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/** "$3.75 profit · 75%" when a cost to make is entered. */
export function profitText(item: Pick<MenuItem, 'price' | 'cost'>) {
  const p = profitOf(item);
  if (!p) return null;
  return `${formatMoney(p.profit)} profit${p.margin !== null ? ` · ${p.margin}%` : ''}`;
}

export function MenuItemRow({
  item,
  showDivider,
  onPress,
  special,
  right,
}: {
  item: MenuItem;
  showDivider: boolean;
  onPress: () => void;
  /** Shown with a star (a special running today). */
  special?: boolean;
  right?: React.ReactNode;
}) {
  const profit = profitText(item);
  return (
    <View style={[styles.row, showDivider && styles.divider]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${formatMoney(item.price)}${item.active ? '' : ', hidden'}${special ? ', special' : ''}`}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
        <MenuPhoto path={item.photoPath} />
        <View style={styles.flex}>
          <View style={styles.nameRow}>
            {special && <Icon name={MenuIcons.star} color={C.warning} size={12} />}
            <Text style={[styles.name, !item.active && styles.hiddenText]} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
          <Text style={styles.detail} numberOfLines={1}>
            {item.active ? (profit ?? (item.description || 'No cost to make entered')) : 'Hidden: not on sale'}
          </Text>
        </View>
        <Text style={[styles.price, !item.active && styles.hiddenText]}>{formatMoney(item.price)}</Text>
      </Pressable>
      {right}
    </View>
  );
}

/** − 3 + : how many of an item. */
export function QuantityStepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        accessibilityRole="button"
        accessibilityLabel={`One less ${label}`}
        hitSlop={6}
        style={({ pressed }) => [styles.stepButton, value <= 0 && styles.disabled, pressed && styles.pressed]}>
        <Icon name={MenuIcons.minus} color={C.text} size={14} />
      </Pressable>
      <Text style={styles.stepValue} accessibilityLabel={`${value} ${label}`}>
        {value}
      </Text>
      <Pressable
        onPress={() => onChange(value + 1)}
        accessibilityRole="button"
        accessibilityLabel={`One more ${label}`}
        hitSlop={6}
        style={({ pressed }) => [styles.stepButton, styles.stepPlus, pressed && styles.pressed]}>
        <Icon name={MenuIcons.plus} color={C.onAccent} size={14} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.neutralSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, minHeight: 48 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { flexShrink: 1, color: C.text, fontSize: 15, fontWeight: '600' },
  hiddenText: { color: C.textMuted },
  detail: { color: C.textSecondary, fontSize: 13 },
  price: { color: C.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  stepPlus: { backgroundColor: C.accent, borderColor: C.accent },
  stepValue: { minWidth: 28, textAlign: 'center', color: C.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
