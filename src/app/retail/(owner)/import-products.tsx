// Stock > Import Products (NexGain Retail): add lots of products at once from
// a CSV spreadsheet (Excel, Google Sheets or Numbers: File › Download / Export
// as CSV). One row per size / colour; rows with the same name become one
// product. Categories and suppliers in the file are added if they're new.
// The file is checked first, so the owner sees what will be added (and any
// rows with problems) before anything is saved.
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Chips, StockIcons, stockStyles } from '@/systems/retail/components/owner/stock-ui';
import { Button, Card, goBack, OwnerScreen, PageHeader } from '@/systems/retail/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { CSV_TEMPLATE, importProducts, parseCsv, type ImportResult } from '@/systems/retail/data/csv-import';
import { addCategory, categoriesStore, hasManyStores, useStores } from '@/systems/retail/data/retail';
import { saveProduct, saveSupplier, suppliersStore } from '@/systems/retail/data/stock';

async function readFile(uri: string) {
  if (Platform.OS === 'web') return (await fetch(uri)).text();
  return new File(uri).text();
}

/** Shares (phone) or downloads (web) the example CSV file. */
async function shareTemplate() {
  if (Platform.OS === 'web') {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }));
    link.download = 'NexGain products template.csv';
    link.click();
    return;
  }
  const file = new File(Paths.cache, 'NexGain products template.csv');
  file.write(CSV_TEMPLATE);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Products template' });
}

export default function ImportProductsScreen() {
  const stores = useStores();
  const manyStores = hasManyStores(stores);
  const [store, setStore] = useState<string | null>(manyStores ? (stores[0]?.id ?? null) : null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [done, setDone] = useState<{ added: number; failed: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setError(null);
    setDone(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    try {
      const text = await readFile(asset.uri);
      setFileName(asset.name);
      setResult(importProducts(parseCsv(text)));
    } catch {
      setError('Couldn’t read that file. Save your spreadsheet as CSV (comma separated) and try again.');
    }
  }

  async function run() {
    if (!result) return;
    if (manyStores && !store) return setError('Choose which store the stock is at.');
    setError(null);
    const failed: string[] = [];
    let added = 0;

    // New categories and suppliers first.
    const categoryId = async (name: string) => {
      if (!name.trim()) return null;
      const find = () => categoriesStore.get().find((c) => c.name.toLowerCase() === name.trim().toLowerCase())?.id ?? null;
      if (!find()) await addCategory(name);
      return find();
    };
    const supplierId = async (name: string) => {
      if (!name.trim()) return null;
      const existing = suppliersStore.get().find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
      if (existing) return existing.id;
      const r = await saveSupplier({ id: null, name, contactName: '', phone: '', email: '', website: '', notes: '', leadTimeDays: 7 });
      return 'supplier' in r ? r.supplier.id : null;
    };

    for (const [i, p] of result.products.entries()) {
      setProgress(`Adding ${i + 1} of ${result.products.length}: ${p.name}`);
      const saved = await saveProduct(
        {
          id: null,
          name: p.name,
          sku: '',
          categoryId: await categoryId(p.category),
          brand: p.brand,
          description: p.description,
          supplierId: await supplierId(p.supplier),
          costPrice: p.costPrice,
          sellPrice: p.sellPrice,
          gstIncluded: p.gstIncluded,
          lowStockLevel: p.lowStockLevel,
          storeId: null,
          photos: [],
          variants: p.variants.map((v) => ({ id: null, size: v.size, colour: v.colour, sku: v.sku, barcode: v.barcode, startingStock: v.stock })),
        },
        store,
      );
      if ('error' in saved) failed.push(`${p.name}: ${saved.error}`);
      else added++;
    }
    setProgress(null);
    setResult(null);
    setDone({ added, failed });
  }

  const variantCount = result?.products.reduce((s, p) => s + p.variants.length, 0) ?? 0;
  const stockCount = result?.products.reduce((s, p) => s + p.variants.reduce((t, v) => t + v.stock, 0), 0) ?? 0;

  return (
    <OwnerScreen>
      <PageHeader onBack={() => goBack('/retail/products' as Href)} title="Import Products" subtitle="Add lots of products at once from a spreadsheet." />

      <Card title="1. Fill in the template" icon={StockIcons.upload}>
        <Text style={styles.text}>
          One row for each size and colour. Rows with the same name become one product. Only Name is needed; leave Barcode blank and NexGain makes one.
        </Text>
        <Text style={stockStyles.muted}>Columns: Name, Category, Brand, Description, Supplier, Cost price, Sell price, GST included, Size, Colour, SKU, Barcode, Stock, Low stock alert.</Text>
        <Button label="Get the template" variant="secondary" icon={StockIcons.upload} onPress={() => shareTemplate().catch(() => setError('Couldn’t share the template.'))} />
      </Card>

      <Card title="2. Choose your file" icon={StockIcons.box}>
        <Text style={stockStyles.muted}>In Excel, Google Sheets or Numbers: save or download it as CSV.</Text>
        {manyStores && (
          <>
            <Text style={styles.label}>Stock goes into</Text>
            <Chips label="Store" value={store ?? ''} onChange={setStore} options={stores.map((s) => ({ value: s.id, label: s.name }))} />
          </>
        )}
        <Button label={fileName ? 'Choose another file' : 'Choose CSV file'} icon={StockIcons.upload} onPress={pick} disabled={!!progress} />
      </Card>

      {error && (
        <Text style={stockStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      {result && (
        <Card title="3. Check and import" icon={StockIcons.clipboard}>
          <Text style={styles.label}>{fileName}</Text>
          <Text style={styles.text}>
            {result.products.length} product{result.products.length === 1 ? '' : 's'}, {variantCount} size{variantCount === 1 ? '' : 's'} / colour{variantCount === 1 ? '' : 's'}, {stockCount} in stock.
          </Text>
          {result.products.slice(0, 8).map((p) => (
            <Text key={`${p.name}|${p.brand}`} style={stockStyles.muted} numberOfLines={1}>
              • {p.name}
              {p.variants.length > 1 ? ` (${p.variants.length} variants)` : ''}
            </Text>
          ))}
          {result.products.length > 8 && <Text style={stockStyles.muted}>…and {result.products.length - 8} more.</Text>}
          {result.problems.length > 0 && (
            <View style={styles.problems}>
              <Text style={styles.problemTitle}>Check these ({result.problems.length})</Text>
              {result.problems.slice(0, 10).map((p) => (
                <Text key={p} style={styles.problem}>
                  {p}
                </Text>
              ))}
            </View>
          )}
          {progress ? (
            <Text style={styles.label}>{progress}</Text>
          ) : (
            <Button label={`Import ${result.products.length} product${result.products.length === 1 ? '' : 's'}`} onPress={run} disabled={result.products.length === 0} />
          )}
        </Card>
      )}

      {done && (
        <Card title="Done" icon={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}>
          <Text style={stockStyles.message}>
            Added {done.added} product{done.added === 1 ? '' : 's'}.
          </Text>
          {done.failed.map((f) => (
            <Text key={f} style={styles.problem}>
              {f}
            </Text>
          ))}
          <Button label="Back to Stock" variant="secondary" onPress={() => goBack('/retail/products' as Href)} />
        </Card>
      )}
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  text: { color: C.text, fontSize: 15, lineHeight: 21 },
  label: { color: C.text, fontSize: 15, fontWeight: '600' },
  problems: { gap: 4, padding: Spacing.two, borderRadius: 10, backgroundColor: C.warningSoft },
  problemTitle: { color: C.warning, fontSize: 14, fontWeight: '700' },
  problem: { color: C.text, fontSize: 13, lineHeight: 18 },
});
