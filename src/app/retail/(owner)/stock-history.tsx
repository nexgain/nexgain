// Stock > Stock History (NexGain Retail): every stock change, newest first:
// sold, received, returned, damaged / lost, stocktake adjustments and moves
// between stores, with who did it, when and how many. Filter by kind or search.
import { type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Chips, itemName, MovementRow, StockIcons, stockStyles } from '@/systems/retail/components/owner/stock-ui';
import { Card, EmptyState, goBack, Icon, OwnerScreen, PageHeader } from '@/systems/retail/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { hasManyStores, useStores } from '@/systems/retail/data/retail';
import { useMovements, useProducts, type MovementKind } from '@/systems/retail/data/stock';

type Filter = 'all' | 'sold' | 'received' | 'returned' | 'damaged' | 'stocktake' | 'transfer' | 'other';

const FILTERS: { value: Filter; label: string; kinds: MovementKind[] }[] = [
  { value: 'all', label: 'All', kinds: [] },
  { value: 'sold', label: 'Sold', kinds: ['sold'] },
  { value: 'received', label: 'Received', kinds: ['received'] },
  { value: 'returned', label: 'Returned', kinds: ['returned'] },
  { value: 'damaged', label: 'Damaged / lost', kinds: ['damaged'] },
  { value: 'stocktake', label: 'Stocktake', kinds: ['stocktake'] },
  { value: 'transfer', label: 'Moved', kinds: ['transfer_in', 'transfer_out'] },
  { value: 'other', label: 'Starting & adjusted', kinds: ['starting', 'adjusted'] },
];

/** How many rows are drawn at once (the newest). */
const SHOWN = 200;

export default function StockHistoryScreen() {
  const movements = useMovements();
  const products = useProducts();
  const stores = useStores();
  const manyStores = hasManyStores(stores);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const names = new Map<string, string>();
  for (const p of products) for (const v of p.variants) names.set(v.id, itemName(p, v));
  const kinds = FILTERS.find((f) => f.value === filter)!.kinds;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = movements.filter((m) => {
    if (kinds.length && !kinds.includes(m.kind)) return false;
    if (!words.length) return true;
    const text = `${names.get(m.variantId) ?? ''} ${m.actorName} ${m.note}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const storeName = (id: string | null) => (manyStores ? (stores.find((s) => s.id === id)?.name ?? 'No store') : null);

  return (
    <OwnerScreen>
      <PageHeader onBack={() => goBack('/retail/products' as Href)} title="Stock History" subtitle="Every stock change: what, how many, who and when." />
      <View style={styles.searchBox}>
        <Icon name={StockIcons.search} color={C.textSecondary} size={16} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search product, person or note"
          placeholderTextColor={C.textMuted}
          autoCorrect={false}
          accessibilityLabel="Search history"
          style={styles.searchInput}
        />
      </View>
      <Chips label="Kind of change" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.value, label: f.label }))} />
      <Card title={`Changes (${shown.length})`} icon={StockIcons.history}>
        {shown.length === 0 ? (
          <EmptyState icon={StockIcons.history} message={movements.length === 0 ? 'No stock changes yet.' : 'No changes match.'} />
        ) : (
          shown.slice(0, SHOWN).map((m, i) => (
            <MovementRow key={m.id} movement={m} name={names.get(m.variantId) ?? 'Removed product'} storeName={storeName(m.storeId)} showDivider={i > 0} />
          ))
        )}
        {shown.length > SHOWN && <Text style={stockStyles.muted}>Showing the newest {SHOWN}. Search or filter to find older ones.</Text>}
      </Card>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  searchInput: { flex: 1, minHeight: 44, color: C.text, fontSize: 15 },
});
