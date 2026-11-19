// NexGain Retail: change one size / colour's stock by hand: received, sold,
// returned, damaged / lost, set to a counted number, or moved between stores.
// Every change goes in the stock history (with who did it).
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chips, itemName, QuantityBox, stockStyles } from '@/systems/retail/components/owner/stock-ui';
import { Button } from '@/systems/retail/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/payroll';
import { hasManyStores, useStores } from '@/systems/retail/data/retail';
import { changeStock, transferStock, useStockLevels, variantStock, type Product, type Variant } from '@/systems/retail/data/stock';

type Kind = 'received' | 'sold' | 'returned' | 'damaged' | 'count' | 'transfer';

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: 'received', label: 'Received', hint: 'Stock that arrived (adds to stock).' },
  { value: 'sold', label: 'Sold', hint: 'Sold to a customer (takes off stock and counts as a sale).' },
  { value: 'returned', label: 'Returned', hint: 'A customer brought it back (puts it back in stock).' },
  { value: 'damaged', label: 'Damaged / lost', hint: 'Broken, stolen or missing (takes off stock).' },
  { value: 'count', label: 'Set count', hint: 'You counted it: set stock to the number you counted.' },
  { value: 'transfer', label: 'Move store', hint: 'Move stock from one store to another.' },
];

export function ChangeStock({ product, variant, onClose, onDone }: { product: Product; variant: Variant; onClose: () => void; onDone: (message: string) => void }) {
  const insets = useSafeAreaInsets();
  const levels = useStockLevels();
  const stores = useStores();
  const manyStores = hasManyStores(stores);
  const [kind, setKind] = useState<Kind>('received');
  const [quantity, setQuantity] = useState(1);
  const [store, setStore] = useState<string | null>(manyStores ? (product.storeId ?? stores[0]?.id ?? null) : null);
  const [toStore, setToStore] = useState<string | null>(manyStores ? (stores.find((s) => s.id !== store)?.id ?? null) : null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = variantStock(levels, variant.id, store);
  const name = itemName(product, variant);
  const kinds = KINDS.filter((k) => k.value !== 'transfer' || manyStores);

  async function save() {
    setBusy(true);
    setError(null);
    let failed: string | null;
    let done: string;
    if (kind === 'transfer') {
      if (!store || !toStore || store === toStore) {
        setBusy(false);
        return setError('Choose two different stores.');
      }
      failed = await transferStock(variant.id, store, toStore, quantity, note);
      done = `Moved ${quantity} ${name} to ${stores.find((s) => s.id === toStore)?.name}.`;
    } else if (kind === 'count') {
      const difference = quantity - here;
      failed = difference === 0 ? null : await changeStock(variant.id, store, 'adjusted', difference, note || 'Counted');
      done = difference === 0 ? `${name}: the count matches (${here}).` : `${name} set to ${quantity} (${difference > 0 ? '+' : ''}${difference}).`;
    } else {
      // Sales and returns record the price (for revenue).
      const price = kind === 'sold' || kind === 'returned' ? product.sellPrice : null;
      failed = await changeStock(variant.id, store, kind, quantity, note, price);
      done = `${KINDS.find((k) => k.value === kind)!.label}: ${quantity} × ${name}.`;
    }
    setBusy(false);
    if (failed) setError(failed);
    else onDone(done);
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Text style={styles.sheetTitle}>{name}</Text>
        <Text style={stockStyles.muted}>
          {here} in stock{manyStores && store ? ` at ${stores.find((s) => s.id === store)?.name}` : ''}
        </Text>
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Chips
            label="What happened"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setQuantity(k === 'count' ? here : 1);
            }}
            options={kinds.map((k) => ({ value: k.value, label: k.label }))}
          />
          <Text style={stockStyles.muted}>{KINDS.find((k) => k.value === kind)!.hint}</Text>
          {manyStores && (
            <>
              <Text style={styles.label}>{kind === 'transfer' ? 'From store' : 'Store'}</Text>
              <Chips label="Store" value={store ?? ''} onChange={(s) => setStore(s)} options={stores.map((s) => ({ value: s.id, label: s.name }))} />
            </>
          )}
          {kind === 'transfer' && (
            <>
              <Text style={styles.label}>To store</Text>
              <Chips label="To store" value={toStore ?? ''} onChange={(s) => setToStore(s)} options={stores.filter((s) => s.id !== store).map((s) => ({ value: s.id, label: s.name }))} />
            </>
          )}
          <View style={styles.line}>
            <Text style={styles.label}>{kind === 'count' ? 'Counted' : 'How many'}</Text>
            <QuantityBox value={quantity} onChange={setQuantity} label="quantity" min={kind === 'count' ? 0 : 1} />
          </View>
          {kind === 'sold' && product.sellPrice !== null && <Text style={stockStyles.muted}>Recorded at {formatMoney(product.sellPrice)} each.</Text>}
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional)"
            placeholderTextColor={C.textMuted}
            maxLength={500}
            accessibilityLabel="Note"
            style={stockStyles.input}
          />
          {error && (
            <Text style={stockStyles.error} accessibilityRole="alert">
              {error}
            </Text>
          )}
        </ScrollView>
        <View style={styles.buttons}>
          <View style={styles.flex}>
            <Button fill label="Cancel" variant="secondary" onPress={onClose} />
          </View>
          <View style={styles.flex}>
            <Button fill label={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: {
    maxHeight: '88%',
    padding: Spacing.three,
    gap: Spacing.two,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    backgroundColor: C.background,
  },
  sheetTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  sheetBody: { gap: Spacing.three - 4, paddingVertical: Spacing.two },
  label: { color: C.text, fontSize: 15, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingVertical: Spacing.two },
  buttons: { flexDirection: 'row', gap: Spacing.two },
});
