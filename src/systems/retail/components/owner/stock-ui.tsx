// Pieces shared by the NexGain Retail stock screens: product photos, stock
// badges, filter chips, a quantity box, history rows and a product picker.
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge, Icon, type IconName } from '@/systems/retail/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/payroll';
import {
  MOVEMENT_LABELS,
  productPhotoUrl,
  searchProducts,
  stockStatus,
  variantLabel,
  variantStock,
  type Movement,
  type Product,
  type StockLevels,
  type StockStatus,
  type Variant,
} from '@/systems/retail/data/stock';

export const StockIcons = {
  box: { ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' },
  barcode: { ios: 'barcode.viewfinder', android: 'qr_code_scanner', web: 'qr_code_scanner' },
  truck: { ios: 'truck.box.fill', android: 'local_shipping', web: 'local_shipping' },
  clipboard: { ios: 'list.clipboard.fill', android: 'fact_check', web: 'fact_check' },
  person: { ios: 'person.crop.rectangle.stack.fill', android: 'contacts', web: 'contacts' },
  upload: { ios: 'square.and.arrow.down.fill', android: 'upload_file', web: 'upload_file' },
  history: { ios: 'clock.arrow.circlepath', android: 'history', web: 'history' },
  printer: { ios: 'printer.fill', android: 'print', web: 'print' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  minus: { ios: 'minus', android: 'remove', web: 'remove' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  tag: { ios: 'tag.fill', android: 'sell', web: 'sell' },
  camera: { ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' },
  trash: { ios: 'trash', android: 'delete', web: 'delete' },
  edit: { ios: 'pencil', android: 'edit', web: 'edit' },
  swap: { ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  link: { ios: 'link', android: 'link', web: 'link' },
  cart: { ios: 'cart.fill', android: 'shopping_cart', web: 'shopping_cart' },
  factory: { ios: 'building.2.fill', android: 'factory', web: 'factory' },
} as const satisfies Record<string, IconName>;

/** A product's first photo (or a box icon). */
export function ProductPhoto({ path, size = 48 }: { path: string | null | undefined; size?: number }) {
  // The link for the photo it was made for (a different photo shows the box until its link arrives).
  const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    if (path) productPhotoUrl(path).then((url) => live && setLoaded({ path, url }));
    return () => {
      live = false;
    };
  }, [path]);
  const url = path && loaded?.path === path ? loaded.url : null;
  const box = { width: size, height: size, borderRadius: Math.round(size / 5) };
  return url ? (
    <Image source={{ uri: url }} style={[styles.photo, box]} contentFit="cover" accessibilityIgnoresInvertColors />
  ) : (
    <View style={[styles.photo, styles.photoEmpty, box]}>
      <Icon name={StockIcons.box} color={C.textSecondary} size={Math.round(size * 0.42)} />
    </View>
  );
}

const STATUS_BADGE: Record<StockStatus, { label: string; tone: 'danger' | 'warning' | 'success' }> = {
  out: { label: 'Out of stock', tone: 'danger' },
  low: { label: 'Low stock', tone: 'warning' },
  ok: { label: 'In stock', tone: 'success' },
};

export function StockBadge({ status, hideOk }: { status: StockStatus; hideOk?: boolean }) {
  if (hideOk && status === 'ok') return null;
  const b = STATUS_BADGE[status];
  return <Badge label={b.label} tone={b.tone} />;
}

/** A row of chips to pick one of (filters, sizes...). */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** A number box with − and + buttons. */
export function QuantityBox({
  value,
  onChange,
  label,
  min = 0,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <View style={styles.qty}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        accessibilityRole="button"
        accessibilityLabel={`One less ${label}`}
        hitSlop={4}
        style={({ pressed }) => [styles.qtyButton, pressed && styles.pressed]}>
        <Icon name={StockIcons.minus} color={C.text} size={14} />
      </Pressable>
      <TextInput
        value={text ?? String(value)}
        onChangeText={(t) => {
          const clean = t.replace(/[^\d-]/g, '').slice(0, 6);
          setText(clean);
          const n = Number(clean);
          if (clean !== '' && clean !== '-' && Number.isInteger(n)) onChange(Math.max(min, n));
        }}
        onBlur={() => setText(null)}
        keyboardType="number-pad"
        selectTextOnFocus
        accessibilityLabel={label}
        style={styles.qtyInput}
      />
      <Pressable
        onPress={() => onChange(value + 1)}
        accessibilityRole="button"
        accessibilityLabel={`One more ${label}`}
        hitSlop={4}
        style={({ pressed }) => [styles.qtyButton, pressed && styles.pressed]}>
        <Icon name={StockIcons.plus} color={C.text} size={14} />
      </Pressable>
    </View>
  );
}

/** "Black Tee · M / Black" */
export function itemName(product: Pick<Product, 'name'>, variant: Pick<Variant, 'size' | 'colour'>) {
  const option = variantLabel(variant);
  return option ? `${product.name} · ${option}` : product.name;
}

const whenText = (iso: string) =>
  new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** One line of stock history: what happened, how many, who and when. */
export function MovementRow({
  movement: m,
  name,
  storeName,
  showDivider,
}: {
  movement: Movement;
  name: string;
  storeName?: string | null;
  showDivider?: boolean;
}) {
  const up = m.change > 0;
  return (
    <View style={[styles.movement, showDivider && styles.divider]}>
      <View style={[styles.change, up ? styles.changeUp : styles.changeDown]}>
        <Text style={[styles.changeText, up ? styles.changeTextUp : styles.changeTextDown]}>{up ? `+${m.change}` : m.change}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.movementTitle} numberOfLines={1}>
          {MOVEMENT_LABELS[m.kind]} · {name}
        </Text>
        <Text style={styles.muted} numberOfLines={2}>
          {[whenText(m.createdAt), m.actorName, storeName, m.unitPrice !== null ? `${formatMoney(m.unitPrice)} each` : null, m.note && m.note !== 'Delivery' && m.note !== 'Stocktake' && m.note !== 'Starting stock' ? m.note : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <Text style={styles.after}>{m.quantityAfter} left</Text>
    </View>
  );
}

/**
 * Pick a product, then (if it has several) which size / colour. Shows stock
 * for each. Used by Receive a Delivery and the Stocktake.
 */
export function ProductPicker({
  visible,
  products,
  levels,
  storeId,
  onPick,
  onClose,
}: {
  visible: boolean;
  products: Product[];
  levels: StockLevels;
  storeId: string | null;
  onPick: (product: Product, variant: Variant) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const shown = searchProducts(
    products.filter((p) => !p.archived),
    query,
  ).slice(0, 60);

  const close = () => {
    setProduct(null);
    setQuery('');
    onClose();
  };
  const pick = (p: Product, v: Variant) => {
    onPick(p, v);
    close();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={product ? () => setProduct(null) : close}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={product ? 'Back' : 'Close'}
            style={styles.headerButton}>
            <Icon name={product ? { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' } : StockIcons.close} color={C.accent} size={18} />
          </Pressable>
          <Text style={styles.headerTitle}>{product ? product.name : 'Choose a product'}</Text>
        </View>
        {!product && (
          <View style={styles.searchBox}>
            <Icon name={StockIcons.search} color={C.textSecondary} size={16} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name, brand, SKU or barcode"
              placeholderTextColor={C.textMuted}
              autoCorrect={false}
              accessibilityLabel="Search products"
              style={styles.searchInput}
            />
          </View>
        )}
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.four }]} keyboardShouldPersistTaps="handled">
          {product
            ? product.variants.map((v) => {
                const qty = variantStock(levels, v.id, storeId);
                return (
                  <Pressable key={v.id} onPress={() => pick(product, v)} accessibilityRole="button" style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}>
                    <View style={styles.flex}>
                      <Text style={styles.pickTitle}>{variantLabel(v) || 'One size'}</Text>
                      <Text style={styles.muted}>{[v.sku, v.barcode].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <Text style={styles.after}>{qty} in stock</Text>
                    <StockBadge status={stockStatus(qty, product.lowStockLevel)} hideOk />
                  </Pressable>
                );
              })
            : shown.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => (p.variants.length === 1 ? pick(p, p.variants[0]) : setProduct(p))}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}>
                  <ProductPhoto path={p.photos[0]} size={40} />
                  <View style={styles.flex}>
                    <Text style={styles.pickTitle} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      {[p.brand, p.variants.length > 1 ? `${p.variants.length} sizes / colours` : variantLabel(p.variants[0] ?? { size: '', colour: '' })]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Icon name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} color={C.textSecondary} size={12} />
                </Pressable>
              ))}
          {!product && shown.length === 0 && <Text style={[styles.muted, styles.center]}>No products match. Add products in Stock first.</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

export const stockStyles = StyleSheet.create({
  muted: { color: C.textSecondary, fontSize: 13 },
  input: {
    minHeight: 44,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium - 2,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceRaised,
    color: C.text,
    fontSize: 15,
  },
  message: { color: C.success, fontSize: 14, fontWeight: '600' },
  error: { color: C.danger, fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  center: { textAlign: 'center', paddingVertical: Spacing.four },
  muted: { color: C.textSecondary, fontSize: 13 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  photo: { backgroundColor: C.surfaceRaised },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  chips: { gap: Spacing.two, paddingVertical: 2 },
  chip: {
    minHeight: 34,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.text, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: C.onAccent },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceRaised },
  qtyInput: {
    minWidth: 52,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  movement: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, paddingVertical: Spacing.two },
  change: { minWidth: 44, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  changeUp: { backgroundColor: C.successSoft },
  changeDown: { backgroundColor: C.dangerSoft },
  changeText: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  changeTextUp: { color: C.success },
  changeTextDown: { color: C.danger },
  movementTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
  after: { color: C.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] },
  screen: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - 4,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  headerTitle: { flex: 1, color: C.text, fontSize: 18, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    margin: Spacing.three,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  searchInput: { flex: 1, minHeight: 44, color: C.text, fontSize: 15 },
  list: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  pickTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
});
