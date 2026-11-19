// Stock > Stocktake (NexGain Retail): count everything, then see the
// differences and approve them. Counts save as you go (on this phone or the
// next time it's opened), so a big count can be done over several sessions.
// Scanning a barcode adds one to that item's count. Only counted items change
// when approved; each change is logged as a "Stocktake adjustment".
import { type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BarcodeScanner } from '@/systems/retail/components/barcode-scanner';
import { ConfirmDialog } from '@/systems/retail/components/owner/confirm-dialog';
import { Chips, itemName, StockIcons, stockStyles } from '@/systems/retail/components/owner/stock-ui';
import { Button, Card, EmptyState, goBack, Icon, OwnerScreen, PageHeader } from '@/systems/retail/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/payroll';
import { hasManyStores, useStores } from '@/systems/retail/data/retail';
import {
  approveStocktake,
  cancelStocktake,
  countDifferences,
  findBarcode,
  openStocktake,
  saveCount,
  searchProducts,
  useProducts,
  useStockLevels,
  variantLabel,
  variantStock,
} from '@/systems/retail/data/stock';

type Phase = 'choose' | 'counting' | 'review';

export default function StocktakeScreen() {
  const products = useProducts().filter((p) => !p.archived);
  const levels = useStockLevels();
  const stores = useStores();
  const manyStores = hasManyStores(stores);
  const [store, setStore] = useState<string | null>(manyStores ? (stores[0]?.id ?? null) : null);
  const [phase, setPhase] = useState<Phase>(manyStores ? 'choose' : 'counting');
  const [stocktakeId, setStocktakeId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [query, setQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'approve' | 'cancel' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  // Open (or reopen) the stocktake when counting starts.
  useEffect(() => {
    if (phase !== 'counting' || stocktakeId) return;
    let live = true;
    openStocktake(store).then((r) => {
      if (!live) return;
      if ('error' in r) setMessage({ tone: 'error', text: r.error });
      else {
        setStocktakeId(r.id);
        setCounts(r.counts);
      }
    });
    return () => {
      live = false;
    };
  }, [phase, stocktakeId, store]);

  async function setCount(variantId: string, counted: number | null) {
    if (!stocktakeId) return;
    setCounts((all) => {
      const next = new Map(all);
      if (counted === null) next.delete(variantId);
      else next.set(variantId, counted);
      return next;
    });
    const error = await saveCount(stocktakeId, variantId, counted);
    if (error) setMessage({ tone: 'error', text: `A count didn’t save: ${error}` });
  }

  function onScan(code: string) {
    const found = findBarcode(products, code);
    if (!found) return setLastScan(`Not found: ${code}`);
    const now = (counts.get(found.variant.id) ?? 0) + 1;
    setCount(found.variant.id, now);
    setLastScan(`${itemName(found.product, found.variant)}: ${now} counted`);
  }

  const shown = searchProducts(products, query);
  const differences = countDifferences(counts, levels, store);
  const variantInfo = (variantId: string) => {
    for (const p of products) {
      const v = p.variants.find((x) => x.id === variantId);
      if (v) return { product: p, variant: v };
    }
    return null;
  };
  // What the differences are worth at cost price (missing stock = shrinkage).
  const valueOf = (variantId: string, diff: number) => diff * (variantInfo(variantId)?.product.costPrice ?? 0);
  const lost = differences.filter((d) => d.difference < 0).reduce((s, d) => s + valueOf(d.variantId, d.difference), 0);
  const found = differences.filter((d) => d.difference > 0).reduce((s, d) => s + valueOf(d.variantId, d.difference), 0);
  const totalVariants = products.reduce((s, p) => s + p.variants.length, 0);

  async function approve() {
    if (!stocktakeId) return;
    setConfirm(null);
    setBusy(true);
    const r = await approveStocktake(stocktakeId);
    setBusy(false);
    if ('error' in r) return setMessage({ tone: 'error', text: r.error });
    setMessage({ tone: 'ok', text: r.changed === 0 ? 'Stocktake approved. Everything matched.' : `Stocktake approved. ${r.changed} item${r.changed === 1 ? '' : 's'} updated.` });
    setStocktakeId(null);
    setCounts(new Map());
    setPhase(manyStores ? 'choose' : 'counting');
  }

  async function cancel() {
    if (!stocktakeId) return;
    setConfirm(null);
    const error = await cancelStocktake(stocktakeId);
    if (error) return setMessage({ tone: 'error', text: error });
    goBack('/retail/products' as Href);
  }

  const storeName = stores.find((s) => s.id === store)?.name;

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack('/retail/products' as Href)}
        title="Stocktake"
        subtitle={phase === 'review' ? 'Check the differences, then approve them.' : 'Count everything. Your counts save as you go.'}
      />

      {message && (
        <Text style={message.tone === 'ok' ? stockStyles.message : stockStyles.error} accessibilityRole="alert">
          {message.text}
        </Text>
      )}

      {phase === 'choose' && (
        <Card title="Which store are you counting?" icon={StockIcons.clipboard}>
          <Chips label="Store" value={store ?? ''} onChange={setStore} options={stores.map((s) => ({ value: s.id, label: s.name }))} />
          <Button label="Start counting" icon={StockIcons.clipboard} onPress={() => setPhase('counting')} disabled={!store} />
        </Card>
      )}

      {phase === 'counting' && !stocktakeId && !message && <ActivityIndicator color={C.accent} />}

      {phase === 'counting' && stocktakeId && (
        <>
          <Card>
            <Text style={styles.progress}>
              {counts.size} of {totalVariants} counted{storeName ? ` · ${storeName}` : ''}
            </Text>
            <View style={styles.buttons}>
              <View style={styles.flex}>
                <Button fill label="Scan to count" icon={StockIcons.barcode} onPress={() => setScanning(true)} />
              </View>
              <View style={styles.flex}>
                <Button fill label="Review differences" variant="secondary" onPress={() => setPhase('review')} disabled={counts.size === 0} />
              </View>
            </View>
          </Card>
          <View style={styles.searchBox}>
            <Icon name={StockIcons.search} color={C.textSecondary} size={16} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search products"
              placeholderTextColor={C.textMuted}
              autoCorrect={false}
              accessibilityLabel="Search products"
              style={styles.searchInput}
            />
          </View>
          {shown.length === 0 ? (
            <Card>
              <EmptyState icon={StockIcons.box} message="No products to count." />
            </Card>
          ) : (
            shown.map((p) => (
              <Card key={p.id} title={p.name}>
                {p.variants.map((v, i) => {
                  const counted = counts.get(v.id);
                  const expected = variantStock(levels, v.id, store);
                  return (
                    <View key={v.id} style={[styles.countRow, i > 0 && stockStyles.divider]}>
                      <View style={styles.flex}>
                        <Text style={styles.name}>{variantLabel(v) || 'One size'}</Text>
                        <Text style={stockStyles.muted}>Records say {expected}</Text>
                      </View>
                      <CountInput value={counted ?? null} onChange={(n) => setCount(v.id, n)} label={`Count for ${itemName(p, v)}`} />
                    </View>
                  );
                })}
              </Card>
            ))
          )}
        </>
      )}

      {phase === 'review' && (
        <>
          <Card title={`Differences (${differences.length})`} icon={StockIcons.clipboard}>
            {differences.length === 0 ? (
              <Text style={stockStyles.muted}>Everything you counted matches the records.</Text>
            ) : (
              differences.map((d, i) => {
                const info = variantInfo(d.variantId);
                return (
                  <View key={d.variantId} style={[styles.countRow, i > 0 && stockStyles.divider]}>
                    <View style={styles.flex}>
                      <Text style={styles.name}>{info ? itemName(info.product, info.variant) : 'Removed item'}</Text>
                      <Text style={stockStyles.muted}>
                        Records {d.expected} → counted {d.counted}
                      </Text>
                    </View>
                    <Text style={[styles.diff, d.difference < 0 ? styles.bad : styles.good]}>{d.difference > 0 ? `+${d.difference}` : d.difference}</Text>
                  </View>
                );
              })
            )}
            {lost < 0 && <Text style={styles.lost}>Stock missing: {formatMoney(-lost)} at cost price (shrinkage).</Text>}
            {found > 0 && <Text style={stockStyles.muted}>Extra stock found: {formatMoney(found)} at cost price.</Text>}
            <Text style={stockStyles.muted}>{counts.size} counted. Items you didn’t count stay as they are.</Text>
          </Card>
          <Button label={busy ? 'Approving…' : 'Approve stocktake'} icon={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} onPress={() => setConfirm('approve')} disabled={busy} />
          <Button label="Keep counting" variant="secondary" onPress={() => setPhase('counting')} />
        </>
      )}

      {stocktakeId && (
        <Pressable onPress={() => setConfirm('cancel')} accessibilityRole="button" style={styles.cancel} hitSlop={6}>
          <Text style={styles.cancelText}>Cancel this stocktake</Text>
        </Pressable>
      )}

      <BarcodeScanner visible={scanning} title="Scan to count" hint="Each scan adds one to that item's count." keepOpen lastScan={lastScan} onScan={onScan} onClose={() => setScanning(false)} />
      <ConfirmDialog
        visible={confirm === 'approve'}
        message={`Approve the stocktake? ${differences.length} item${differences.length === 1 ? '' : 's'} will change to what you counted. This is saved in the stock history.`}
        confirmLabel="Approve"
        destructive={false}
        onConfirm={approve}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        visible={confirm === 'cancel'}
        message="Cancel this stocktake? Your counts are thrown away and no stock changes."
        confirmLabel="Cancel stocktake"
        onConfirm={cancel}
        onCancel={() => setConfirm(null)}
      />
    </OwnerScreen>
  );
}

/** A count box: blank = not counted yet. */
function CountInput({ value, onChange, label }: { value: number | null; onChange: (n: number | null) => void; label: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <TextInput
      value={text ?? (value === null ? '' : String(value))}
      onChangeText={(t) => setText(t.replace(/\D/g, '').slice(0, 6))}
      onBlur={() => {
        if (text === null) return;
        onChange(text === '' ? null : Number(text));
        setText(null);
      }}
      placeholder="—"
      placeholderTextColor={C.textMuted}
      keyboardType="number-pad"
      selectTextOnFocus
      accessibilityLabel={label}
      style={[styles.count, value !== null && styles.counted]}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  progress: { color: C.text, fontSize: 16, fontWeight: '700' },
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
  countRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  count: {
    width: 72,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceRaised,
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  counted: { borderColor: C.accent, backgroundColor: C.accentSoft },
  diff: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  good: { color: C.success },
  bad: { color: C.danger },
  lost: { color: C.danger, fontSize: 14, fontWeight: '700' },
  cancel: { alignItems: 'center', paddingVertical: Spacing.three },
  cancelText: { color: C.danger, fontSize: 15, fontWeight: '600' },
});
