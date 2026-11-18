// Stock > Receive a Delivery (NexGain Retail): scan or pick the products that
// arrived and how many, then add them to stock in one go. Each scan adds one
// (scan the same tag again for another). The supplier and what each item cost
// are saved with the delivery, and it shows in the stock history as "Received".
import { type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BarcodeScanner } from '@/systems/retail/components/barcode-scanner';
import { OptionSheet } from '@/systems/retail/components/owner/form';
import { Chips, itemName, ProductPicker, QuantityBox, StockIcons, stockStyles } from '@/systems/retail/components/owner/stock-ui';
import { Button, Card, EmptyState, goBack, Icon, OwnerScreen, PageHeader } from '@/systems/retail/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/payroll';
import { hasManyStores, useStores } from '@/systems/retail/data/retail';
import { findBarcode, receiveDelivery, useProducts, useStockLevels, useSuppliers, type Product, type Variant } from '@/systems/retail/data/stock';

type Line = { product: Product; variant: Variant; quantity: number; cost: string };

const NO_SUPPLIER = 'No supplier';

export default function ReceiveScreen() {
  const products = useProducts().filter((p) => !p.archived);
  const levels = useStockLevels();
  const suppliers = useSuppliers();
  const stores = useStores();
  const manyStores = hasManyStores(stores);
  const [store, setStore] = useState<string | null>(manyStores ? (stores[0]?.id ?? null) : null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [scanning, setScanning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [supplierSheet, setSupplierSheet] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  function add(product: Product, variant: Variant, quantity = 1) {
    setLines((all) => {
      const existing = all.find((l) => l.variant.id === variant.id);
      if (existing) return all.map((l) => (l.variant.id === variant.id ? { ...l, quantity: l.quantity + quantity } : l));
      return [...all, { product, variant, quantity, cost: product.costPrice === null ? '' : String(product.costPrice) }];
    });
    // The product's supplier, when none is picked yet.
    if (!supplierId && product.supplierId) setSupplierId(product.supplierId);
  }

  function onScan(code: string) {
    const found = findBarcode(products, code);
    if (!found) return setLastScan(`Not found: ${code}. Add it as a product first.`);
    add(found.product, found.variant);
    const now = (lines.find((l) => l.variant.id === found.variant.id)?.quantity ?? 0) + 1;
    setLastScan(`Added: ${itemName(found.product, found.variant)} (${now})`);
  }

  const total = lines.reduce((sum, l) => sum + l.quantity, 0);
  const cost = lines.reduce((sum, l) => sum + l.quantity * (Number(l.cost) || 0), 0);
  const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? null;

  async function save() {
    if (manyStores && !store) return setMessage({ tone: 'error', text: 'Choose which store the delivery arrived at.' });
    if (lines.some((l) => l.cost.trim() !== '' && !Number.isFinite(Number(l.cost)))) return setMessage({ tone: 'error', text: 'Enter each cost as a number, e.g. 12.50.' });
    setBusy(true);
    setMessage(null);
    const error = await receiveDelivery(
      store,
      supplierId,
      note,
      lines.map((l) => ({ variantId: l.variant.id, quantity: l.quantity, unitCost: l.cost.trim() === '' ? null : Number(l.cost) })),
    );
    setBusy(false);
    if (error) return setMessage({ tone: 'error', text: error });
    setMessage({ tone: 'ok', text: `Added ${total} item${total === 1 ? '' : 's'} to stock.` });
    setLines([]);
    setNote('');
    setLastScan(null);
  }

  return (
    <OwnerScreen>
      <PageHeader onBack={() => goBack('/retail/products' as Href)} title="Receive a Delivery" subtitle="Scan or pick what arrived, then add it to stock." />

      <Card>
        {manyStores && (
          <>
            <Text style={styles.label}>Arrived at</Text>
            <Chips label="Store" value={store ?? ''} onChange={setStore} options={stores.map((s) => ({ value: s.id, label: s.name }))} />
          </>
        )}
        <Text style={styles.label}>Supplier</Text>
        <Pressable onPress={() => setSupplierSheet(true)} accessibilityRole="button" style={({ pressed }) => [stockStyles.input, styles.select, pressed && styles.pressed]}>
          <Text style={[styles.selectText, !supplierName && styles.placeholder]}>{supplierName ?? 'Choose a supplier (optional)'}</Text>
          <Icon name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} color={C.textSecondary} size={12} />
        </Pressable>
        <View style={styles.buttons}>
          <View style={styles.flex}>
            <Button fill label="Scan items" icon={StockIcons.barcode} onPress={() => setScanning(true)} />
          </View>
          <View style={styles.flex}>
            <Button fill label="Pick a product" variant="secondary" icon={StockIcons.plus} onPress={() => setPicking(true)} />
          </View>
        </View>
      </Card>

      {message && (
        <Text style={message.tone === 'ok' ? stockStyles.message : stockStyles.error} accessibilityRole="alert">
          {message.text}
        </Text>
      )}

      <Card title={`In This Delivery (${total})`} icon={StockIcons.truck}>
        {lines.length === 0 ? (
          <EmptyState icon={StockIcons.truck} message="Nothing added yet. Scan the items' barcodes, or pick products." />
        ) : (
          lines.map((l, i) => (
            <View key={l.variant.id} style={[styles.line, i > 0 && stockStyles.divider]}>
              <View style={styles.lineTop}>
                <Text style={styles.name} numberOfLines={2}>
                  {itemName(l.product, l.variant)}
                </Text>
                <Pressable
                  onPress={() => setLines((all) => all.filter((x) => x.variant.id !== l.variant.id))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${itemName(l.product, l.variant)}`}
                  hitSlop={8}>
                  <Icon name={StockIcons.trash} color={C.danger} size={16} />
                </Pressable>
              </View>
              <View style={styles.lineBottom}>
                <QuantityBox value={l.quantity} onChange={(quantity) => setLines((all) => all.map((x) => (x.variant.id === l.variant.id ? { ...x, quantity } : x)))} label="quantity" min={1} />
                <View style={styles.costBox}>
                  <Text style={stockStyles.muted}>Cost each</Text>
                  <TextInput
                    value={l.cost}
                    onChangeText={(c) => setLines((all) => all.map((x) => (x.variant.id === l.variant.id ? { ...x, cost: c } : x)))}
                    placeholder="0.00"
                    placeholderTextColor={C.textMuted}
                    keyboardType="decimal-pad"
                    accessibilityLabel="Cost each"
                    style={[stockStyles.input, styles.cost]}
                  />
                </View>
              </View>
            </View>
          ))
        )}
        {lines.length > 0 && cost > 0 && <Text style={stockStyles.muted}>Delivery cost: {formatMoney(cost)}</Text>}
      </Card>

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note (optional), e.g. invoice number"
        placeholderTextColor={C.textMuted}
        maxLength={500}
        accessibilityLabel="Note"
        style={stockStyles.input}
      />
      <Button label={busy ? 'Adding…' : `Add ${total} to stock`} icon={StockIcons.plus} onPress={save} disabled={busy || lines.length === 0} />

      <BarcodeScanner
        visible={scanning}
        title="Scan the delivery"
        hint="Each scan adds one. Scan the same item again for another."
        keepOpen
        lastScan={lastScan}
        onScan={onScan}
        onClose={() => setScanning(false)}
      />
      <ProductPicker visible={picking} products={products} levels={levels} storeId={store} onPick={(p, v) => add(p, v)} onClose={() => setPicking(false)} />
      <OptionSheet
        visible={supplierSheet}
        title="Supplier"
        options={[NO_SUPPLIER, ...suppliers.map((s) => s.name)]}
        value={supplierName ?? NO_SUPPLIER}
        onSelect={(name) => setSupplierId(suppliers.find((s) => s.name === name)?.id ?? null)}
        onClose={() => setSupplierSheet(false)}
      />
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  label: { color: C.text, fontSize: 15, fontWeight: '600' },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { color: C.text, fontSize: 15 },
  placeholder: { color: C.textMuted },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  line: { gap: Spacing.two, paddingVertical: Spacing.three - 4 },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  lineBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  name: { flex: 1, color: C.text, fontSize: 15, fontWeight: '600' },
  costBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cost: { width: 90 },
});
