// Add Product / Edit Product (NexGain Retail). Everything about a product:
// photos, name, category, brand, description, supplier, cost and sell price
// (with its profit margin), GST, sizes and colours (each combination is its own
// variant with its own barcode, optional SKU and starting stock), the low
// stock alert level and, with more than one store, its store.
// A variant without a barcode gets one made automatically when it's saved.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BarcodeScanner } from '@/systems/retail/components/barcode-scanner';
import { FormField, OptionSheet, SwitchRow, TextField } from '@/systems/retail/components/owner/form';
import { Chips, ProductPhoto, QuantityBox, StockIcons, stockStyles } from '@/systems/retail/components/owner/stock-ui';
import { Button, Card, goBack, Icon, OwnerScreen, PageHeader } from '@/systems/retail/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import { businessUsesGst } from '@/data/super-rules';
import { PRESET_SIZES } from '@/systems/retail/constants/retail-business-types';
import { hasManyStores, useCategories, useRetailType, useStores } from '@/systems/retail/data/retail';
import {
  combineOptions,
  marginPercent,
  productProblem,
  saveProduct,
  saveSupplier,
  uploadProductPhoto,
  useProducts,
  useStockLevels,
  useSuppliers,
  variantLabel,
  variantStock,
  type Product,
  type ProductDraft,
  type VariantDraft,
} from '@/systems/retail/data/stock';

const NO_CATEGORY = 'No category';
const NO_SUPPLIER = 'No supplier';
const NEW_SUPPLIER = '+ Add a new supplier';
const EVERY_STORE = 'every';

function draftOf(p: Product | undefined, barcode?: string): ProductDraft {
  if (!p) {
    return {
      id: null,
      name: '',
      sku: '',
      categoryId: null,
      brand: '',
      description: '',
      supplierId: null,
      costPrice: null,
      sellPrice: null,
      gstIncluded: true,
      lowStockLevel: 5,
      storeId: null,
      photos: [],
      // Opened from a scan of an unknown barcode: it's filled in.
      variants: [{ id: null, size: '', colour: '', sku: '', barcode: barcode?.trim() ?? '', startingStock: 0 }],
    };
  }
  return {
    ...p,
    variants: p.variants.map((v) => ({ id: v.id, size: v.size, colour: v.colour, sku: v.sku, barcode: v.barcode, startingStock: 0 })),
  };
}

const priceText = (n: number | null) => (n === null ? '' : String(n));
/** "39.95" -> 39.95; "" -> null; anything else -> NaN (shown as a mistake). */
const parsePrice = (t: string) => (t.trim() === '' ? null : Number(t.replace(/[$,\s]/g, '')));

async function pickPhoto(source: 'camera' | 'library') {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [1, 1] };
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera access is turned off. Turn it on in Settings, or choose a photo instead.');
  }
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  // Small enough to upload quickly, big enough to see the product clearly.
  const image = await ImageManipulator.manipulate(result.assets[0].uri, { maxWidth: 1000, maxHeight: 1000 }).renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.75 });
  return saved.uri;
}

export default function ProductEditorScreen() {
  const { id, barcode } = useLocalSearchParams<{ id: string; barcode?: string }>();
  const existing = useProducts().find((p) => p.id === id);
  const levels = useStockLevels();
  const categories = useCategories();
  const suppliers = useSuppliers();
  const stores = useStores();
  const manyStores = hasManyStores(stores);
  const retailType = useRetailType();
  const usesGst = businessUsesGst(useBusiness());

  const [draft, setDraft] = useState<ProductDraft>(() => draftOf(existing, barcode));
  const [cost, setCost] = useState(priceText(draft.costPrice));
  const [sell, setSell] = useState(priceText(draft.sellPrice));
  const [sizes, setSizes] = useState<string[]>(() => [...new Set(draft.variants.map((v) => v.size).filter(Boolean))]);
  const [colours, setColours] = useState<string[]>(() => [...new Set(draft.variants.map((v) => v.colour).filter(Boolean))]);
  const [sizeText, setSizeText] = useState('');
  const [colourText, setColourText] = useState('');
  const [startingStore, setStartingStore] = useState<string | null>(existing?.storeId ?? stores[0]?.id ?? null);
  const [sheet, setSheet] = useState<'category' | 'supplier' | null>(null);
  const [newSupplier, setNewSupplier] = useState<string | null>(null);
  const [scanFor, setScanFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (changes: Partial<ProductDraft>) => setDraft((d) => ({ ...d, ...changes }));
  const setVariant = (i: number, changes: Partial<VariantDraft>) =>
    setDraft((d) => ({ ...d, variants: d.variants.map((v, j) => (j === i ? { ...v, ...changes } : v)) }));

  const costPrice = parsePrice(cost);
  const sellPrice = parsePrice(sell);
  const margin = marginPercent(Number.isNaN(costPrice) ? null : costPrice, Number.isNaN(sellPrice) ? null : sellPrice, draft.gstIncluded, usesGst);
  const suggestions = PRESET_SIZES[retailType?.variants ?? 'none'].filter((s) => !sizes.includes(s));
  const stockOf = (v: VariantDraft) => (v.id ? variantStock(levels, v.id) : 0);
  const hasNewStock = draft.variants.some((v) => !v.id && v.startingStock > 0);

  /** Makes a variant for every size / colour combination, keeping the ones already there. */
  function makeVariants(nextSizes = sizes, nextColours = colours) {
    const combos = combineOptions(nextSizes, nextColours);
    setDraft((d) => {
      const keyOf = (v: { size: string; colour: string }) => `${v.size.trim().toLowerCase()}|${v.colour.trim().toLowerCase()}`;
      const old = new Map(d.variants.map((v) => [keyOf(v), v]));
      const next = combos.map((c) => old.get(keyOf(c)) ?? { id: null, size: c.size, colour: c.colour, sku: '', barcode: '', startingStock: 0 });
      // Saved variants that still have stock are kept even if their size or colour was taken out.
      const kept = d.variants.filter((v) => v.id && !next.includes(v) && stockOf(v) > 0);
      return { ...d, variants: [...next, ...kept] };
    });
  }

  const addSize = (s: string) => {
    const v = s.trim().slice(0, 40);
    if (!v || sizes.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    const next = [...sizes, v];
    setSizes(next);
    setSizeText('');
    makeVariants(next, colours);
  };
  const addColour = (s: string) => {
    const v = s.trim().slice(0, 40);
    if (!v || colours.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    const next = [...colours, v];
    setColours(next);
    setColourText('');
    makeVariants(sizes, next);
  };
  const removeSize = (s: string) => {
    const next = sizes.filter((x) => x !== s);
    setSizes(next);
    makeVariants(next, colours);
  };
  const removeColour = (s: string) => {
    const next = colours.filter((x) => x !== s);
    setColours(next);
    makeVariants(sizes, next);
  };

  async function addPhoto() {
    if (draft.photos.length >= 6) return setError('Up to 6 photos per product.');
    const source = await new Promise<'camera' | 'library' | null>((resolve) =>
      Platform.OS === 'web'
        ? resolve('library')
        : Alert.alert('Add photo', undefined, [
            { text: 'Take Photo', onPress: () => resolve('camera') },
            { text: 'Choose Photo', onPress: () => resolve('library') },
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          ]),
    );
    if (!source) return;
    setPhotoBusy(true);
    setError(null);
    try {
      const uri = await pickPhoto(source);
      if (uri) {
        const path = await uploadProductPhoto(uri);
        update({ photos: [...draft.photos, path] });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t add the photo. Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function addSupplier() {
    const name = (newSupplier ?? '').trim();
    if (!name) return;
    const result = await saveSupplier({ id: null, name, contactName: '', phone: '', email: '', website: '', notes: '', leadTimeDays: 7 });
    if ('error' in result) return setError(result.error);
    update({ supplierId: result.supplier.id });
    setNewSupplier(null);
  }

  async function save() {
    if (Number.isNaN(costPrice) || Number.isNaN(sellPrice)) return setError('Enter prices as numbers, e.g. 39.95.');
    const ready: ProductDraft = { ...draft, costPrice, sellPrice };
    const problem = productProblem(ready);
    if (problem) return setError(problem);
    if (manyStores && hasNewStock && !startingStore) return setError('Choose which store the starting stock is at.');
    setBusy(true);
    setError(null);
    const result = await saveProduct(ready, manyStores ? startingStore : null);
    setBusy(false);
    if ('error' in result) {
      setError(result.error);
      if (!result.error.startsWith('The product was saved')) return;
    }
    const savedId = 'id' in result ? result.id : draft.id;
    if (savedId) router.replace({ pathname: '/retail/stock-item/[id]', params: { id: savedId } } as Href);
    else goBack('/retail/products' as Href);
  }

  const categoryName = categories.find((c) => c.id === draft.categoryId)?.name ?? null;
  const supplierName = suppliers.find((s) => s.id === draft.supplierId)?.name ?? null;

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack((existing ? { pathname: '/retail/stock-item/[id]', params: { id: existing.id } } : '/retail/products') as Href)}
        title={existing ? 'Edit Product' : 'Add Product'}
        subtitle={existing ? existing.name : 'Fill in what you know. Only the name is needed.'}
      />

      <Card title="Photos" icon={StockIcons.camera}>
        <View style={styles.photos}>
          {draft.photos.map((path) => (
            <View key={path}>
              <ProductPhoto path={path} size={76} />
              <Pressable
                onPress={() => update({ photos: draft.photos.filter((p) => p !== path) })}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                hitSlop={6}
                style={styles.removePhoto}>
                <Icon name={StockIcons.close} color="#fff" size={10} />
              </Pressable>
            </View>
          ))}
          {draft.photos.length < 6 && (
            <Pressable onPress={addPhoto} disabled={photoBusy} accessibilityRole="button" style={({ pressed }) => [styles.addPhoto, pressed && styles.pressed]}>
              <Icon name={StockIcons.camera} color={C.accent} size={20} />
              <Text style={styles.addPhotoText}>{photoBusy ? 'Adding…' : 'Add photo'}</Text>
            </Pressable>
          )}
        </View>
      </Card>

      <Card title="Details" icon={StockIcons.tag}>
        <FormField label="Product name">
          <TextField value={draft.name} onChangeText={(name) => update({ name })} placeholder="e.g. Classic Hoodie" maxLength={120} accessibilityLabel="Product name" />
        </FormField>
        <FormField label="SKU (optional)">
          <TextField
            value={draft.sku}
            onChangeText={(sku) => update({ sku })}
            placeholder="e.g. HOOD-001"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={60}
            accessibilityLabel="SKU"
          />
        </FormField>
        <FormField label="Category">
          <Pressable onPress={() => setSheet('category')} accessibilityRole="button" style={({ pressed }) => [stockStyles.input, styles.select, pressed && styles.pressed]}>
            <Text style={[styles.selectText, !categoryName && styles.placeholder]}>{categoryName ?? 'Choose a category'}</Text>
            <Icon name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} color={C.textSecondary} size={12} />
          </Pressable>
        </FormField>
        <FormField label="Brand (optional)">
          <TextField value={draft.brand} onChangeText={(brand) => update({ brand })} placeholder="e.g. Your Brand" maxLength={100} accessibilityLabel="Brand" />
        </FormField>
        <FormField label="Description (optional)">
          <TextField value={draft.description} onChangeText={(description) => update({ description })} multiline maxLength={2000} accessibilityLabel="Description" />
        </FormField>
        <FormField label="Supplier (optional)">
          {newSupplier === null ? (
            <Pressable onPress={() => setSheet('supplier')} accessibilityRole="button" style={({ pressed }) => [stockStyles.input, styles.select, pressed && styles.pressed]}>
              <Text style={[styles.selectText, !supplierName && styles.placeholder]}>{supplierName ?? 'Choose or add a supplier'}</Text>
              <Icon name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} color={C.textSecondary} size={12} />
            </Pressable>
          ) : (
            <View style={styles.inline}>
              <TextInput
                value={newSupplier}
                onChangeText={setNewSupplier}
                placeholder="New supplier's name"
                placeholderTextColor={C.textMuted}
                maxLength={100}
                autoFocus
                accessibilityLabel="New supplier name"
                style={[stockStyles.input, styles.flex]}
              />
              <Button label="Add" onPress={addSupplier} disabled={!newSupplier.trim()} />
              <Button label="Cancel" variant="secondary" onPress={() => setNewSupplier(null)} />
            </View>
          )}
        </FormField>
      </Card>

      <Card title="Prices" icon={{ ios: 'dollarsign.circle.fill', android: 'payments', web: 'payments' }}>
        <View style={styles.inline}>
          <FormField label={usesGst ? 'Cost price (ex GST)' : 'Cost price'} style={styles.flex}>
            <TextField value={cost} onChangeText={setCost} placeholder="0.00" keyboardType="decimal-pad" accessibilityLabel="Cost price" />
          </FormField>
          <FormField label="Sell price" style={styles.flex}>
            <TextField value={sell} onChangeText={setSell} placeholder="0.00" keyboardType="decimal-pad" accessibilityLabel="Sell price" />
          </FormField>
        </View>
        <Text style={[styles.margin, margin !== null && margin < 0 && styles.marginBad]}>
          {margin === null ? 'Enter both prices to see the profit margin.' : `Profit margin: ${margin}%${margin < 0 ? ' (selling below cost)' : ''}`}
        </Text>
        {usesGst && (
          <SwitchRow
            label="Sell price includes GST"
            hint={draft.gstIncluded ? 'The price customers pay includes 10% GST.' : 'GST is added on top of the sell price.'}
            value={draft.gstIncluded}
            onChange={(gstIncluded) => update({ gstIncluded })}
          />
        )}
      </Card>

      <Card title="Sizes & Colours" icon={StockIcons.box}>
        <Text style={stockStyles.muted}>Each size and colour combination is its own variant, with its own stock and barcode. Leave both empty for a product with no sizes.</Text>
        <FormField label="Sizes">
          <OptionChips items={sizes} onRemove={removeSize} />
          <View style={styles.inline}>
            <TextInput
              value={sizeText}
              onChangeText={setSizeText}
              onSubmitEditing={() => addSize(sizeText)}
              placeholder="Add a size, e.g. M or 10"
              placeholderTextColor={C.textMuted}
              returnKeyType="done"
              accessibilityLabel="New size"
              style={[stockStyles.input, styles.flex]}
            />
            <Button label="Add" variant="secondary" onPress={() => addSize(sizeText)} disabled={!sizeText.trim()} />
          </View>
          {suggestions.length > 0 && (
            <View style={styles.suggestions}>
              {suggestions.map((s) => (
                <Pressable key={s} onPress={() => addSize(s)} accessibilityRole="button" accessibilityLabel={`Add size ${s}`} style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
                  <Text style={styles.suggestionText}>+ {s}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </FormField>
        <FormField label="Colours">
          <OptionChips items={colours} onRemove={removeColour} />
          <View style={styles.inline}>
            <TextInput
              value={colourText}
              onChangeText={setColourText}
              onSubmitEditing={() => addColour(colourText)}
              placeholder="Add a colour, e.g. Black"
              placeholderTextColor={C.textMuted}
              returnKeyType="done"
              accessibilityLabel="New colour"
              style={[stockStyles.input, styles.flex]}
            />
            <Button label="Add" variant="secondary" onPress={() => addColour(colourText)} disabled={!colourText.trim()} />
          </View>
        </FormField>

        <Text style={styles.subheading}>Variants ({draft.variants.length})</Text>
        {draft.variants.map((v, i) => {
          const stock = stockOf(v);
          return (
            <View key={v.id ?? `new-${v.size}-${v.colour}`} style={[styles.variant, i > 0 && stockStyles.divider]}>
              <View style={styles.variantTop}>
                <Text style={styles.variantName}>{variantLabel(v) || 'One size'}</Text>
                {v.id ? (
                  <Text style={stockStyles.muted}>{stock} in stock</Text>
                ) : (
                  <View style={styles.inline}>
                    <Text style={stockStyles.muted}>Starting stock</Text>
                    <QuantityBox value={v.startingStock} onChange={(startingStock) => setVariant(i, { startingStock })} label={`starting stock for ${variantLabel(v) || 'this product'}`} />
                  </View>
                )}
              </View>
              <View style={styles.inline}>
                <TextInput
                  value={v.barcode}
                  onChangeText={(barcode) => setVariant(i, { barcode })}
                  placeholder={v.id ? 'Barcode' : 'Barcode (blank = NexGain makes one)'}
                  placeholderTextColor={C.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={64}
                  accessibilityLabel={`Barcode for ${variantLabel(v) || 'this product'}`}
                  style={[stockStyles.input, styles.flex]}
                />
                <Pressable onPress={() => setScanFor(i)} accessibilityRole="button" accessibilityLabel="Scan the barcode" style={({ pressed }) => [styles.scan, pressed && styles.pressed]}>
                  <Icon name={StockIcons.barcode} color={C.accent} size={18} />
                </Pressable>
              </View>
              <View style={styles.inline}>
                <TextInput
                  value={v.sku}
                  onChangeText={(sku) => setVariant(i, { sku })}
                  placeholder="SKU (optional)"
                  placeholderTextColor={C.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={60}
                  accessibilityLabel={`SKU for ${variantLabel(v) || 'this product'}`}
                  style={[stockStyles.input, styles.flex]}
                />
                {draft.variants.length > 1 && (
                  <Pressable
                    onPress={() =>
                      stock > 0
                        ? setError(`${variantLabel(v)} still has ${stock} in stock. Sell, move or adjust them to 0 before removing it.`)
                        : setDraft((d) => ({ ...d, variants: d.variants.filter((_, j) => j !== i) }))
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${variantLabel(v) || 'this variant'}`}
                    style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
                    <Icon name={StockIcons.trash} color={C.danger} size={16} />
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </Card>

      <Card title="Reorder Point & Store" icon={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }}>
        <View style={[styles.inline, styles.between]}>
          <View style={styles.flex}>
            <Text style={styles.label}>Reorder point</Text>
            <Text style={stockStyles.muted}>Order more (and tell me) when any size or colour drops to this many.</Text>
          </View>
          <QuantityBox value={draft.lowStockLevel} onChange={(lowStockLevel) => update({ lowStockLevel })} label="reorder point" />
        </View>
        {manyStores && (
          <>
            <FormField label="Store">
              <Chips
                label="Store"
                value={draft.storeId ?? EVERY_STORE}
                onChange={(v) => update({ storeId: v === EVERY_STORE ? null : v })}
                options={[{ value: EVERY_STORE, label: 'Every store' }, ...stores.map((s) => ({ value: s.id, label: s.name }))]}
              />
            </FormField>
            {hasNewStock && (
              <FormField label="Starting stock goes into">
                <Chips label="Starting stock store" value={startingStore ?? ''} onChange={setStartingStore} options={stores.map((s) => ({ value: s.id, label: s.name }))} />
              </FormField>
            )}
          </>
        )}
      </Card>

      {error && (
        <Text style={stockStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <Button label={busy ? 'Saving…' : existing ? 'Save Product' : 'Add Product'} icon={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} onPress={save} disabled={busy} />

      <OptionSheet
        visible={sheet === 'category'}
        title="Category"
        options={[NO_CATEGORY, ...categories.map((c) => c.name)]}
        value={categoryName ?? NO_CATEGORY}
        onSelect={(name) => update({ categoryId: categories.find((c) => c.name === name)?.id ?? null })}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'supplier'}
        title="Supplier"
        options={[NO_SUPPLIER, ...suppliers.map((s) => s.name), NEW_SUPPLIER]}
        value={supplierName ?? NO_SUPPLIER}
        onSelect={(name) => (name === NEW_SUPPLIER ? setNewSupplier('') : update({ supplierId: suppliers.find((s) => s.name === name)?.id ?? null }))}
        onClose={() => setSheet(null)}
      />
      <BarcodeScanner
        visible={scanFor !== null}
        title="Scan the product's barcode"
        hint="The barcode the supplier printed on the product or its tag."
        onScan={(code) => scanFor !== null && setVariant(scanFor, { barcode: code })}
        onClose={() => setScanFor(null)}
      />
    </OwnerScreen>
  );
}

function OptionChips({ items, onRemove }: { items: string[]; onRemove: (item: string) => void }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.suggestions}>
      {items.map((s) => (
        <Pressable key={s} onPress={() => onRemove(s)} accessibilityRole="button" accessibilityLabel={`Remove ${s}`} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
          <Text style={styles.optionText}>{s}</Text>
          <Icon name={StockIcons.close} color={C.onAccent} size={10} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  between: { justifyContent: 'space-between' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  removePhoto: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.danger,
  },
  addPhoto: {
    width: 76,
    height: 76,
    borderRadius: 15,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoText: { color: C.accent, fontSize: 11, fontWeight: '600' },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { color: C.text, fontSize: 15 },
  placeholder: { color: C.textMuted },
  margin: { color: C.success, fontSize: 14, fontWeight: '700' },
  marginBad: { color: C.danger },
  label: { color: C.text, fontSize: 15, fontWeight: '600' },
  subheading: { color: C.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: Spacing.two },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 4 },
  suggestion: { minHeight: 30, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: C.border, justifyContent: 'center' },
  suggestionText: { color: C.accent, fontSize: 13, fontWeight: '600' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 30, paddingHorizontal: 10, borderRadius: 999, backgroundColor: C.accent },
  optionText: { color: C.onAccent, fontSize: 13, fontWeight: '700' },
  variant: { gap: Spacing.two, paddingVertical: Spacing.two + 2 },
  variantTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  variantName: { color: C.text, fontSize: 15, fontWeight: '700' },
  scan: { width: 44, height: 44, borderRadius: Radius.medium - 2, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentSoft },
  remove: { width: 44, height: 44, borderRadius: Radius.medium - 2, alignItems: 'center', justifyContent: 'center', backgroundColor: C.dangerSoft },
});
