// Scanner tab (NexGain Retail staff): scan a product's barcode (or type it, or
// search by name) to see its photo, name, size, colour, price and how many are
// left, plus stock for the other sizes / colours ("we have it in a medium").
// Then record what happened: Sold, Received, Returned, Damaged or Count (only
// the ones the owner allows). Each updates stock straight away and shows in
// the owner's stock history and sales. A barcode that isn't in NexGain can be
// sent to the owner to add. Staff never see cost prices or margins.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarcodeScanner } from '@/systems/retail/components/barcode-scanner';
import { ProductPhoto } from '@/systems/retail/components/owner/stock-ui';
import { Card, EmployeeScreen, Icon } from '@/systems/retail/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Radius, Spacing } from '@/constants/theme';
import { useCurrentEmployee } from '@/data/current-employee';
import { formatMoney } from '@/data/payroll';
import { toDateKey, useShifts } from '@/data/shifts';
import { hasManyStores, useStores, type StoreLocation } from '@/systems/retail/data/retail';
import {
  findStaffBarcode,
  loadStaffCatalogue,
  reportMissingBarcode,
  searchStaffProducts,
  staffCatalogueStore,
  staffStock,
  useStaffCatalogue,
  useStaffCatalogueLoad,
  type StaffProduct,
  type StaffVariant,
} from '@/systems/retail/data/staff-catalogue';
import {
  ACTION_LABELS,
  actionDoneText,
  loadMyPermissions,
  STAFF_ACTIONS,
  staffStockAction,
  useMyPermissions,
  type StaffAction,
} from '@/systems/retail/data/staff-permissions';
import { variantLabel } from '@/systems/retail/data/stock';

const BARCODE = { ios: 'barcode.viewfinder', android: 'qr_code_scanner', web: 'qr_code_scanner' } as const;
const SEARCH = { ios: 'magnifyingglass', android: 'search', web: 'search' } as const;
const WARNING = { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' } as const;
const MINUS = { ios: 'minus', android: 'remove', web: 'remove' } as const;
const PLUS = { ios: 'plus', android: 'add', web: 'add' } as const;

type Result = { kind: 'found'; product: StaffProduct; variant: StaffVariant } | { kind: 'missing'; code: string } | null;

export default function ScannerScreen() {
  const catalogue = useStaffCatalogue();
  const load = useStaffCatalogueLoad();
  const permissions = useMyPermissions();
  const me = useCurrentEmployee();
  const stores = useStores();
  const manyStores = hasManyStores(stores);
  const shifts = useShifts();
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Result>(null);
  const [acting, setActing] = useState<StaffAction | null>(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fresh stock and permissions every time the tab is opened.
  const employeeId = me?.id ?? null;
  useFocusEffect(
    useCallback(() => {
      loadStaffCatalogue();
      loadMyPermissions(employeeId);
    }, [employeeId]),
  );

  // The store they're rostered at today (several stores only).
  const today = toDateKey(new Date());
  const todaysStore = stores.find((s) => shifts.some((sh) => sh.date === today && me && sh.employeeIds.includes(me.id) && sh.location === s.name)) ?? stores[0] ?? null;

  function onScan(code: string) {
    setSent(null);
    setError(null);
    setDone(null);
    setQuery('');
    const found = findStaffBarcode(catalogue, code);
    setResult(found ? { kind: 'found', ...found } : { kind: 'missing', code });
  }

  async function sendToOwner(code: string) {
    setError(null);
    const failed = await reportMissingBarcode(code, note);
    if (failed) setError(failed);
    else {
      setSent(code);
      setNote('');
    }
  }

  /** After an action: reload stock and show the same product with its new numbers. */
  async function afterAction(text: string) {
    setActing(null);
    setDone(text);
    await loadStaffCatalogue();
    if (result?.kind !== 'found') return;
    const product = staffCatalogueStore.get().find((p) => p.id === result.product.id);
    const variant = product?.variants.find((v) => v.id === result.variant.id);
    if (product && variant) setResult({ kind: 'found', product, variant });
  }

  const matches = query.trim() ? searchStaffProducts(catalogue, query).slice(0, 20) : [];
  const allowed = STAFF_ACTIONS.filter((a) => permissions[a]);

  return (
    <EmployeeScreen title="Scanner">
      <Pressable onPress={() => setScanning(true)} accessibilityRole="button" style={({ pressed }) => [styles.scanButton, pressed && styles.pressed]}>
        <Icon name={BARCODE} color={C.onPrimary} size={26} />
        <Text style={styles.scanText}>Scan a barcode</Text>
      </Pressable>

      <View style={styles.searchBox}>
        <Icon name={SEARCH} color={C.textSecondary} size={16} />
        <TextInput
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            if (t.trim()) setResult(null);
          }}
          placeholder="Or search by name, SKU or barcode"
          placeholderTextColor={C.textMuted}
          autoCorrect={false}
          accessibilityLabel="Search products"
          style={styles.searchInput}
        />
      </View>

      {load === 'error' && <Text style={styles.error}>Couldn’t load the products. Check your internet connection.</Text>}
      {done && (
        <Text style={styles.ok} accessibilityRole="alert">
          {done}
        </Text>
      )}

      {matches.length > 0 && (
        <Card style={styles.list}>
          {matches.map((p, i) => (
            <Pressable
              key={p.id}
              onPress={() => {
                setQuery('');
                setDone(null);
                setResult({ kind: 'found', product: p, variant: p.variants[0] });
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.matchRow, i > 0 && styles.divider, pressed && styles.pressed]}>
              <ProductPhoto path={p.photo} size={44} />
              <View style={styles.flex}>
                <Text style={styles.matchName} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.muted}>{p.variants.reduce((s, v) => s + staffStock(v), 0)} in stock</Text>
              </View>
            </Pressable>
          ))}
        </Card>
      )}
      {query.trim() && matches.length === 0 && <Text style={styles.muted}>No products match.</Text>}

      {result?.kind === 'found' && (
        <>
          <ProductResult product={result.product} variant={result.variant} manyStores={manyStores} stores={stores} onPick={(variant) => setResult({ ...result, variant })} />
          {allowed.length > 0 ? (
            <View style={styles.actions}>
              {allowed.map((a) => (
                <Pressable
                  key={a}
                  onPress={() => {
                    setDone(null);
                    setActing(a);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${ACTION_LABELS[a].label} ${result.product.name}`}
                  style={({ pressed }) => [styles.action, a === 'sold' && styles.actionMain, pressed && styles.pressed]}>
                  <Text style={[styles.actionText, a === 'sold' && styles.actionTextMain]}>{ACTION_LABELS[a].label}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>You can look products up. Ask the owner if you need to record sales or stock changes.</Text>
          )}
        </>
      )}

      {result?.kind === 'missing' && (
        <Card style={styles.missing}>
          <Icon name={WARNING} color={C.warning} size={28} />
          <Text style={styles.missingTitle}>Product not found</Text>
          <Text style={styles.muted}>Barcode {result.code} isn’t in NexGain yet.</Text>
          {sent === result.code ? (
            <Text style={styles.ok}>Sent. The owner has been told so they can add it.</Text>
          ) : (
            <>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Note for the owner (optional), e.g. Black tee, size M"
                placeholderTextColor={C.textMuted}
                maxLength={300}
                accessibilityLabel="Note for the owner"
                style={styles.input}
              />
              <Pressable onPress={() => sendToOwner(result.code)} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>Send to the owner to add</Text>
              </Pressable>
            </>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </Card>
      )}

      {!result && !query.trim() && !done && (
        <Text style={styles.hint}>Scan a tag to see the price, how many are left, and which other sizes and colours are in stock.</Text>
      )}

      {acting && result?.kind === 'found' && (
        <ActionSheet
          action={acting}
          product={result.product}
          variant={result.variant}
          stores={manyStores ? stores : []}
          defaultStore={manyStores ? (todaysStore?.id ?? null) : null}
          onClose={() => setActing(null)}
          onDone={afterAction}
        />
      )}

      <BarcodeScanner visible={scanning} title="Scan Item" hint="Point the camera at the product's barcode." onScan={onScan} onClose={() => setScanning(false)} />
    </EmployeeScreen>
  );
}

function ProductResult({
  product,
  variant,
  manyStores,
  stores,
  onPick,
}: {
  product: StaffProduct;
  variant: StaffVariant;
  manyStores: boolean;
  stores: { id: string; name: string }[];
  onPick: (variant: StaffVariant) => void;
}) {
  const qty = staffStock(variant);
  const low = qty <= product.lowStockLevel;
  return (
    <>
      <Card style={styles.result}>
        <View style={styles.resultTop}>
          <ProductPhoto path={product.photo} size={96} />
          <View style={styles.flex}>
            <Text style={styles.name}>{product.name}</Text>
            {variantLabel(variant) ? <Text style={styles.option}>{variantLabel(variant)}</Text> : null}
            {product.sellPrice !== null && <Text style={styles.price}>{formatMoney(product.sellPrice)}</Text>}
          </View>
        </View>
        <View style={[styles.stockBox, qty === 0 ? styles.stockOut : low ? styles.stockLow : styles.stockOk]}>
          <Text style={[styles.stockNumber, qty === 0 ? styles.textOut : low ? styles.textLow : styles.textOk]}>{qty}</Text>
          <Text style={styles.stockLabel}>{qty === 0 ? 'Out of stock' : low ? 'Low stock: left' : 'left in stock'}</Text>
        </View>
        {manyStores && <Text style={styles.muted}>{stores.map((s) => `${s.name}: ${staffStock(variant, s.id)}`).join(' · ')}</Text>}
        <Text style={styles.muted}>{[product.sku || variant.sku, variant.barcode].filter(Boolean).join(' · ')}</Text>
      </Card>

      {product.variants.length > 1 && (
        <Card style={styles.list}>
          <Text style={styles.sectionTitle}>Other sizes & colours</Text>
          {product.variants.map((v, i) => {
            const n = staffStock(v);
            const on = v.id === variant.id;
            return (
              <Pressable
                key={v.id}
                onPress={() => onPick(v)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [styles.variantRow, i > 0 && styles.divider, on && styles.variantOn, pressed && styles.pressed]}>
                <Text style={[styles.variantName, styles.flex]}>{variantLabel(v) || 'One size'}</Text>
                <Text style={[styles.variantQty, n === 0 ? styles.textOut : n <= product.lowStockLevel ? styles.textLow : null]}>{n === 0 ? 'None left' : `${n} in stock`}</Text>
              </Pressable>
            );
          })}
        </Card>
      )}
    </>
  );
}

/** Confirm a stock action: how many (or the count), which store, and a note. */
function ActionSheet({
  action,
  product,
  variant,
  stores,
  defaultStore,
  onClose,
  onDone,
}: {
  action: StaffAction;
  product: StaffProduct;
  variant: StaffVariant;
  stores: StoreLocation[];
  defaultStore: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [store, setStore] = useState<string | null>(defaultStore);
  const here = staffStock(variant, stores.length ? store : undefined);
  const [quantity, setQuantity] = useState(action === 'count' ? here : 1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = [product.name, variantLabel(variant)].filter(Boolean).join(' · ');
  const min = action === 'count' ? 0 : 1;

  async function confirm() {
    setBusy(true);
    setError(null);
    const r = await staffStockAction(variant.id, stores.length ? store : null, action, quantity, note);
    setBusy(false);
    if ('error' in r) setError(r.error);
    else onDone(actionDoneText(action, quantity, name, r.left));
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>
            {ACTION_LABELS[action].label}: {name}
          </Text>
          <Text style={styles.muted}>{ACTION_LABELS[action].hint}</Text>
          {stores.length > 0 && (
            <View style={styles.chips}>
              {stores.map((s) => {
                const on = s.id === store;
                return (
                  <Pressable key={s.id} onPress={() => setStore(s.id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Text style={styles.muted}>{here} in stock here now.</Text>
          <View style={styles.qtyRow}>
            <Text style={styles.qtyLabel}>{action === 'count' ? 'How many you counted' : 'How many'}</Text>
            <View style={styles.stepper}>
              <Pressable onPress={() => setQuantity((q) => Math.max(min, q - 1))} accessibilityRole="button" accessibilityLabel="One less" style={styles.stepButton}>
                <Icon name={MINUS} color={C.text} size={16} />
              </Pressable>
              <Text style={styles.qty}>{quantity}</Text>
              <Pressable onPress={() => setQuantity((q) => q + 1)} accessibilityRole="button" accessibilityLabel="One more" style={styles.stepButton}>
                <Icon name={PLUS} color={C.text} size={16} />
              </Pressable>
            </View>
          </View>
          {action === 'sold' && product.sellPrice !== null && <Text style={styles.muted}>Recorded at {formatMoney(product.sellPrice)} each.</Text>}
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional)"
            placeholderTextColor={C.textMuted}
            maxLength={300}
            accessibilityLabel="Note"
            style={styles.input}
          />
          {error && (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          )}
        </ScrollView>
        <View style={styles.sheetButtons}>
          <Pressable onPress={onClose} accessibilityRole="button" style={[styles.secondary, styles.flex]}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={confirm} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.primary, styles.flex, (pressed || busy) && styles.pressed]}>
            <Text style={styles.primaryText}>{busy ? 'Saving…' : `Confirm ${ACTION_LABELS[action].label}`}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  muted: { color: C.textSecondary, fontSize: 14 },
  hint: { color: C.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: Spacing.three, lineHeight: 20 },
  error: { color: C.danger, fontSize: 14, fontWeight: '600' },
  ok: { color: C.success, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 64,
    borderRadius: Radius.large - 4,
    backgroundColor: C.primary,
  },
  scanText: { color: C.onPrimary, fontSize: 18, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  searchInput: { flex: 1, minHeight: 46, color: C.text, fontSize: 15 },
  list: { paddingVertical: Spacing.one },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, paddingVertical: Spacing.two },
  matchName: { color: C.text, fontSize: 15, fontWeight: '600' },
  result: { gap: Spacing.three - 4 },
  resultTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  name: { color: C.text, fontSize: 20, fontWeight: '800' },
  option: { color: C.text, fontSize: 16, fontWeight: '600', marginTop: 2 },
  price: { color: C.primary, fontSize: 20, fontWeight: '800', marginTop: 4 },
  stockBox: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.medium },
  stockOk: { backgroundColor: C.successSoft },
  stockLow: { backgroundColor: C.warningSoft },
  stockOut: { backgroundColor: C.dangerSoft },
  stockNumber: { fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  stockLabel: { color: C.text, fontSize: 16, fontWeight: '600' },
  textOk: { color: C.success },
  textLow: { color: C.warning },
  textOut: { color: C.danger },
  sectionTitle: { color: C.text, fontSize: 16, fontWeight: '700', paddingVertical: Spacing.two },
  variantRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three - 4, paddingHorizontal: 4 },
  variantOn: { backgroundColor: C.primarySoft, borderRadius: Radius.medium - 4 },
  variantName: { color: C.text, fontSize: 15, fontWeight: '600' },
  variantQty: { color: C.text, fontSize: 15, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  action: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 50,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  actionMain: { backgroundColor: C.primary, borderColor: C.primary },
  actionText: { color: C.text, fontSize: 16, fontWeight: '700' },
  actionTextMain: { color: C.onPrimary },
  missing: { alignItems: 'center', gap: Spacing.two },
  missingTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  input: {
    alignSelf: 'stretch',
    minHeight: 44,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium - 2,
    borderWidth: 1,
    borderColor: C.inputBorder,
    color: C.text,
    fontSize: 15,
  },
  secondary: { minHeight: 48, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primarySoft, alignSelf: 'stretch' },
  secondaryText: { color: C.primary, fontSize: 15, fontWeight: '700' },
  primary: { minHeight: 48, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary },
  primaryText: { color: C.onPrimary, fontSize: 15, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: Radius.large, borderTopRightRadius: Radius.large, backgroundColor: C.background },
  sheetBody: { padding: Spacing.three, gap: Spacing.three - 4 },
  sheetTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  sheetButtons: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { minHeight: 36, paddingHorizontal: Spacing.three - 4, borderRadius: 999, borderWidth: 1, borderColor: C.border, justifyContent: 'center', backgroundColor: C.card },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { color: C.text, fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: C.onPrimary },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qtyLabel: { color: C.text, fontSize: 15, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.track },
  qty: { minWidth: 44, textAlign: 'center', color: C.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
