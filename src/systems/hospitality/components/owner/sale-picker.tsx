// NexGain Hospitality: the item list used by Record sale (tap − / +) and End of
// day (type how many sold). Only items on sale are listed, by category, with
// today's specials first. Quantities are kept by the screen that uses it.
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { TextField } from '@/components/owner/form';
import { Card, EmptyState, Icon } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/payroll';
import { MenuIcons, MenuPhoto, QuantityStepper } from '@/systems/hospitality/components/owner/menu-ui';
import { useMenuCategories, useMenuItems, type MenuItem } from '@/systems/hospitality/data/menu';
import { dateKey, isSpecialNow } from '@/systems/hospitality/data/sales-stats';

export type Quantities = Record<string, number>;

export function SalePicker({
  quantities,
  onChange,
  mode,
}: {
  quantities: Quantities;
  onChange: (next: Quantities) => void;
  /** tap: − / + buttons (Record sale). type: a number box (End of day). */
  mode: 'tap' | 'type';
}) {
  const categories = [...useMenuCategories()].sort((a, b) => a.sort - b.sort);
  const items = useMenuItems().filter((i) => i.active);
  const [query, setQuery] = useState('');
  const today = dateKey(new Date());
  const q = query.trim().toLowerCase();
  const matches = (i: MenuItem) => !q || i.name.toLowerCase().includes(q);
  const sorted = (list: MenuItem[]) => [...list].filter(matches).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

  const specials = sorted(items.filter((i) => isSpecialNow(i, today)));
  const sections = [
    ...categories.map((c) => ({ id: c.id, name: c.name, items: sorted(items.filter((i) => i.categoryId === c.id && !isSpecialNow(i, today))) })),
    {
      id: 'none',
      name: 'No category',
      items: sorted(items.filter((i) => !isSpecialNow(i, today) && (!i.categoryId || !categories.some((c) => c.id === i.categoryId)))),
    },
  ].filter((s) => s.items.length > 0);

  const set = (id: string, n: number) => onChange({ ...quantities, [id]: n });

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState icon={MenuIcons.menu} message="There’s nothing on sale yet. Add items on the Menu tab first (or turn hidden items back on)." />
      </Card>
    );
  }

  const row = (item: MenuItem, i: number) => (
    <View key={item.id} style={[styles.row, i > 0 && styles.divider]}>
      <MenuPhoto path={item.photoPath} size={40} />
      <View style={styles.flex}>
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.price}>{formatMoney(item.price)}</Text>
      </View>
      {mode === 'tap' ? (
        <QuantityStepper value={quantities[item.id] ?? 0} onChange={(n) => set(item.id, n)} label={item.name} />
      ) : (
        <View style={styles.typeBox}>
          <TextField
            value={quantities[item.id] ? String(quantities[item.id]) : ''}
            onChangeText={(t) => {
              const n = Number(t.replace(/[^0-9.]/g, ''));
              set(item.id, Number.isFinite(n) ? n : 0);
            }}
            placeholder="0"
            keyboardType="decimal-pad"
            accessibilityLabel={`How many ${item.name} sold`}
            style={styles.typeInput}
          />
        </View>
      )}
    </View>
  );

  return (
    <>
      <View style={styles.search}>
        <Icon name={MenuIcons.search} color={C.textSecondary} size={16} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Find an item"
          placeholderTextColor={C.textMuted}
          accessibilityLabel="Find an item"
          style={styles.searchInput}
        />
      </View>
      {specials.length > 0 && (
        <Card title="Specials" icon={MenuIcons.star}>
          <View>{specials.map(row)}</View>
        </Card>
      )}
      {sections.map((s) => (
        <Card key={s.id} title={s.name}>
          <View>{s.items.map(row)}</View>
        </Card>
      ))}
      {q && specials.length === 0 && sections.length === 0 && <Text style={styles.muted}>Nothing on sale matches “{query.trim()}”.</Text>}
    </>
  );
}

/** The picked items and quantities, ready to save. */
export function pickedEntries(quantities: Quantities, items: MenuItem[]) {
  return items.filter((i) => (quantities[i.id] ?? 0) > 0).map((item) => ({ item, quantity: quantities[item.id] }));
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, paddingVertical: Spacing.two, minHeight: 56 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  price: { color: C.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] },
  typeBox: { width: 80 },
  typeInput: { textAlign: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
    borderRadius: Radius.large - 4,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 15, paddingVertical: Spacing.two },
  muted: { color: C.textSecondary, fontSize: 13, textAlign: 'center' },
});
