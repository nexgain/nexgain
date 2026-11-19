// Products tab (NexGain Retail): search (name, SKU or barcode: results show as
// you type), a filter button (stock level, sort, store, and the stock tools),
// category chips from the business type picked at sign-up, and a card for
// each product: photo, name, SKU, a red "Low stock" tag, and the stock number.
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarcodeScanner } from '@/systems/retail/components/barcode-scanner';
import { shareLabels } from '@/systems/retail/components/owner/barcode-labels';
import { Panel, Pill } from '@/systems/retail/components/owner/retail-ui';
import { Chips, ProductPhoto, StockIcons } from '@/systems/retail/components/owner/stock-ui';
import { ActionRow, Button, EmptyState, Icon, OwnerScreen, PageHeader } from '@/systems/retail/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/payroll';
import { hasManyStores, useCategories, useStores } from '@/systems/retail/data/retail';
import {
  findBarcode,
  productSku,
  productStatus,
  productStock,
  searchProducts,
  sortProducts,
  stockValue,
  useProducts,
  useStockLevels,
  useStockLoad,
  variantLabel,
  type Product,
  type StockSort,
} from '@/systems/retail/data/stock';

type StatusFilter = 'all' | 'low' | 'out';
const ALL = 'all';
const WARNING = { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' } as const;
const FILTER = { ios: 'line.3.horizontal.decrease', android: 'filter_list', web: 'filter_list' } as const;

export default function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const products = useProducts().filter((p) => !p.archived);
  const levels = useStockLevels();
  const load = useStockLoad();
  const categories = useCategories();
  const stores = useStores();
  const manyStores = hasManyStores(stores);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(ALL);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<StockSort>('name');
  const [store, setStore] = useState<string>(ALL);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const storeId = manyStores && store !== ALL ? store : undefined;
  const statusOf = (p: Product) => productStatus(levels, p, storeId);
  const filtered = sortProducts(
    searchProducts(products, query).filter(
      (p) => (category === ALL || (category === 'none' ? !p.categoryId : p.categoryId === category)) && (status === 'all' || statusOf(p) === status),
    ),
    sort,
    levels,
    storeId,
  );
  const value = stockValue(products, levels, storeId);
  const lowCount = products.filter((p) => statusOf(p) !== 'ok').length;
  const filtering = status !== 'all' || sort !== 'name' || store !== ALL;

  function onScan(code: string) {
    const found = findBarcode(products, code);
    if (found) {
      setMessage(null);
      router.push({ pathname: '/retail/stock-item/[id]', params: { id: found.product.id, variant: found.variant.id } } as Href);
    } else {
      router.push({ pathname: '/retail/product/[id]', params: { id: 'new', barcode: code } } as Href);
    }
  }

  async function printLabels() {
    setFiltersOpen(false);
    const labels = filtered.flatMap((p) =>
      p.variants.map((v) => ({ name: p.name, option: variantLabel(v), price: p.sellPrice !== null ? formatMoney(p.sellPrice) : '', barcode: v.barcode })),
    );
    if (labels.length === 0) return setMessage('No products to print labels for.');
    try {
      await shareLabels(labels);
    } catch {
      setMessage('Couldn’t make the labels. Please try again.');
    }
  }

  const go = (href: Href) => {
    setFiltersOpen(false);
    router.push(href);
  };

  return (
    <OwnerScreen>
      <PageHeader
        title="Products"
        subtitle={`${products.length} product${products.length === 1 ? '' : 's'} · ${formatMoney(value.cost, { cents: false })} at cost · ${formatMoney(value.sell, { cents: false })} to sell`}
        right={<Button label="Add" icon={StockIcons.plus} onPress={() => router.push({ pathname: '/retail/product/[id]', params: { id: 'new' } } as Href)} />}
      />

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Icon name={StockIcons.search} color={C.textSecondary} size={16} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search products…"
            placeholderTextColor={C.textMuted}
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="Search products by name, SKU or barcode"
            style={styles.searchInput}
          />
          <Pressable onPress={() => setScanning(true)} accessibilityRole="button" accessibilityLabel="Scan a barcode" hitSlop={8}>
            <Icon name={StockIcons.barcode} color={C.accent} size={18} />
          </Pressable>
        </View>
        <Pressable
          onPress={() => setFiltersOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Filters and stock tools"
          style={({ pressed }) => [styles.filterButton, filtering && styles.filterButtonOn, pressed && styles.pressed]}>
          <Icon name={FILTER} color={filtering ? C.onAccent : C.text} size={18} />
        </Pressable>
      </View>

      <Chips
        label="Category"
        value={category}
        onChange={setCategory}
        options={[{ value: ALL, label: 'All' }, ...categories.map((c) => ({ value: c.id, label: c.name })), ...(products.some((p) => !p.categoryId) ? [{ value: 'none', label: 'No category' }] : [])]}
      />

      {lowCount > 0 && status === 'all' && (
        <Pressable onPress={() => setStatus('low')} accessibilityRole="button" style={({ pressed }) => [styles.lowBanner, pressed && styles.pressed]}>
          <Icon name={WARNING} color={C.danger} size={16} />
          <Text style={styles.lowText}>
            {lowCount} product{lowCount === 1 ? ' is' : 's are'} low or out of stock
          </Text>
          <Text style={styles.lowLink}>Show</Text>
        </Pressable>
      )}
      {status !== 'all' && (
        <Pressable onPress={() => setStatus('all')} accessibilityRole="button" style={styles.clear}>
          <Text style={styles.lowLink}>Showing {status === 'low' ? 'low stock' : 'out of stock'} only · Show all</Text>
        </Pressable>
      )}
      {message && (
        <Text style={styles.message} accessibilityRole="alert">
          {message}
        </Text>
      )}

      <Panel style={styles.list}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={StockIcons.box}
            message={
              load === 'loading'
                ? 'Loading your products…'
                : products.length === 0
                  ? 'No products yet. Tap Add, or import a spreadsheet from the filter button.'
                  : 'No products match. Try another search or category.'
            }
          />
        ) : (
          filtered.map((p, i) => {
            const qty = productStock(levels, p, storeId);
            const st = statusOf(p);
            const sku = productSku(p);
            return (
              <Pressable
                key={p.id}
                onPress={() => router.push({ pathname: '/retail/stock-item/[id]', params: { id: p.id } } as Href)}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}, ${qty} in stock${st === 'ok' ? '' : st === 'low' ? ', low stock' : ', out of stock'}`}
                style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}>
                <ProductPhoto path={p.photos[0]} size={64} />
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={2}>
                    {p.name}
                  </Text>
                  {sku ? <Text style={styles.sku}>SKU: {sku}</Text> : null}
                  {st !== 'ok' && <Pill label={st === 'out' ? 'Out of stock' : 'Low stock'} tone="danger" icon={WARNING} />}
                </View>
                <View style={styles.qtyBox}>
                  <Text style={[styles.qty, st === 'out' && styles.qtyOut]}>{qty}</Text>
                  <Text style={styles.sku}>in stock</Text>
                </View>
                <Icon name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} color={C.textSecondary} size={13} />
              </Pressable>
            );
          })
        )}
      </Panel>

      <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setFiltersOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            <Text style={styles.sheetTitle}>Filter</Text>
            <Chips
              label="Stock level"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'All stock' },
                { value: 'low', label: 'Low stock' },
                { value: 'out', label: 'Out of stock' },
              ]}
            />
            <Chips
              label="Sort"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'name', label: 'A–Z' },
                { value: 'low-first', label: 'Lowest stock first' },
                { value: 'high-first', label: 'Most stock first' },
              ]}
            />
            {manyStores && (
              <Chips label="Store" value={store} onChange={setStore} options={[{ value: ALL, label: 'All stores' }, ...stores.map((s) => ({ value: s.id, label: s.name }))]} />
            )}
            <Text style={styles.sheetTitle}>Stock tools</Text>
            <View>
              <ActionRow icon={StockIcons.truck} label="Receive a Delivery" onPress={() => go('/retail/receive' as Href)} />
              <ActionRow icon={StockIcons.clipboard} label="Stocktake" onPress={() => go('/retail/stocktake' as Href)} showDivider />
              <ActionRow icon={StockIcons.upload} label="Import Products (CSV)" onPress={() => go('/retail/import-products' as Href)} showDivider />
              <ActionRow icon={StockIcons.history} label="Stock History" onPress={() => go('/retail/stock-history' as Href)} showDivider />
              <ActionRow icon={StockIcons.printer} label="Print Barcode Labels (this list)" onPress={printLabels} showDivider />
              <ActionRow
                icon={{ ios: 'square.grid.2x2.fill', android: 'category', web: 'category' }}
                label="Edit Categories"
                onPress={() => go('/retail/categories' as Href)}
                showDivider
              />
            </View>
            <Button label="Done" onPress={() => setFiltersOpen(false)} />
          </ScrollView>
        </View>
      </Modal>

      <BarcodeScanner visible={scanning} title="Scan Item" hint="Scan a barcode to open the product." onScan={onScan} onClose={() => setScanning(false)} />
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 4 },
  pressed: { opacity: 0.7 },
  searchRow: { flexDirection: 'row', gap: Spacing.two },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  searchInput: { flex: 1, minHeight: 46, color: C.text, fontSize: 15 },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  filterButtonOn: { backgroundColor: C.accent, borderColor: C.accent },
  lowBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three - 4, borderRadius: Radius.medium, backgroundColor: C.dangerSoft },
  lowText: { flex: 1, color: C.text, fontSize: 14, fontWeight: '600' },
  lowLink: { color: C.accent, fontSize: 14, fontWeight: '700' },
  clear: { paddingVertical: 4 },
  message: { color: C.warning, fontSize: 14, fontWeight: '600' },
  list: { paddingVertical: Spacing.one, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, paddingVertical: Spacing.three - 4 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  name: { color: C.text, fontSize: 16, fontWeight: '700' },
  sku: { color: C.textSecondary, fontSize: 13 },
  qtyBox: { alignItems: 'center', minWidth: 56 },
  qty: { color: C.text, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  qtyOut: { color: C.danger },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: Radius.large, borderTopRightRadius: Radius.large, backgroundColor: C.background },
  sheetBody: { padding: Spacing.three, gap: Spacing.three - 4 },
  sheetTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
});
