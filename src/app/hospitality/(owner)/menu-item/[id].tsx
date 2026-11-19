import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/owner/confirm-dialog';
import { DateField, FieldButton, FormField, OptionSheet, SwitchRow, TextField } from '@/components/owner/form';
import { Button, Card, goBack, OwnerIcons, OwnerScreen, PageHeader } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/payroll';
import { MenuPhoto, profitText } from '@/systems/hospitality/components/owner/menu-ui';
import {
  deleteItem,
  removeMenuPhoto,
  saveItem,
  uploadMenuPhoto,
  useHospitalityLoaded,
  useMenuCategories,
  useMenuItems,
  validateItem,
  type MenuItemDraft,
} from '@/systems/hospitality/data/menu';
import { addDays, dateKey } from '@/systems/hospitality/data/sales-stats';

const NO_CATEGORY = 'No category';
const money = (n: number | null) => (n === null ? '' : String(n));
const parseMoney = (text: string) => {
  const t = text.replace(/[$,\s]/g, '');
  return t === '' ? null : Number(t);
};
const fromKey = (key: string | null, fallback: Date) => {
  if (!key) return fallback;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Add or edit one menu item: name, category, sell price, optional cost to
// make (shows the profit and margin), photo, description, on sale / hidden,
// and specials with start and end dates. /hospitality/menu-item/new adds one.
export default function MenuItemScreen() {
  const { id, category } = useLocalSearchParams<{ id: string; category?: string }>();
  const loaded = useHospitalityLoaded();
  const categories = [...useMenuCategories()].sort((a, b) => a.sort - b.sort);
  const existing = useMenuItems().find((i) => i.id === id) ?? null;
  const isNew = id === 'new';

  if (!isNew && !existing) {
    return (
      <OwnerScreen>
        <PageHeader title="Menu item" onBack={() => goBack('/hospitality/menu-items')} />
        {loaded ? <Text style={styles.muted}>This item isn’t on the menu any more.</Text> : <ActivityIndicator color={C.accent} />}
      </OwnerScreen>
    );
  }
  return (
    <ItemForm
      key={existing?.id ?? 'new'}
      initial={
        existing ?? {
          categoryId: categories.find((c) => c.id === category)?.id ?? categories[0]?.id ?? null,
          name: '',
          description: '',
          price: 0,
          cost: null,
          photoPath: null,
          active: true,
          isSpecial: false,
          specialStart: null,
          specialEnd: null,
        }
      }
      categories={categories}
    />
  );
}

function ItemForm({ initial, categories }: { initial: MenuItemDraft; categories: { id: string; name: string }[] }) {
  const [draft, setDraft] = useState<MenuItemDraft>(initial);
  const [priceText, setPriceText] = useState(initial.id ? money(initial.price) : '');
  const [costText, setCostText] = useState(money(initial.cost));
  const [pickCategory, setPickCategory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Photos uploaded on this screen but not saved (removed again if they're replaced or the item isn't saved).
  const [uploaded, setUploaded] = useState<string[]>([]);

  const price = parseMoney(priceText);
  const cost = parseMoney(costText);
  const full: MenuItemDraft = { ...draft, price: price ?? NaN, cost };
  const problem = priceText.trim() === '' ? 'Enter a sell price.' : validateItem(full);
  const profit = price !== null && cost !== null && Number.isFinite(price) && Number.isFinite(cost) ? profitText({ price, cost }) : null;
  const categoryName = categories.find((c) => c.id === draft.categoryId)?.name ?? NO_CATEGORY;
  const update = (changes: Partial<MenuItemDraft>) => setDraft((d) => ({ ...d, ...changes }));

  async function pickPhoto(camera: boolean) {
    setError(null);
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 };
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('NexGain needs camera access to take a photo. You can allow it in your phone’s Settings.');
        return;
      }
    }
    const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    setPhotoBusy(true);
    try {
      const path = await uploadMenuPhoto(result.assets[0].uri, result.assets[0].mimeType ?? 'image/jpeg');
      setUploaded((u) => [...u, path]);
      update({ photoPath: path });
    } catch (e) {
      setError(`The photo couldn’t be uploaded: ${e instanceof Error ? e.message : 'please try again.'}`);
    } finally {
      setPhotoBusy(false);
    }
  }

  function leave() {
    // Photos added here but not saved with the item.
    uploaded.forEach(removeMenuPhoto);
    goBack('/hospitality/menu-items');
  }

  async function save() {
    setTried(true);
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      await saveItem(full);
      // The old photo (replaced or removed) and any other unused uploads.
      if (initial.photoPath && initial.photoPath !== full.photoPath) removeMenuPhoto(initial.photoPath);
      uploaded.filter((p) => p !== full.photoPath).forEach(removeMenuPhoto);
      goBack('/hospitality/menu-items');
    } catch (e) {
      setError(`Couldn’t save: ${e instanceof Error ? e.message : 'please try again.'}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setConfirmDelete(false);
    if (!initial.id) return;
    setBusy(true);
    try {
      await deleteItem(initial.id);
      goBack('/hospitality/menu-items');
    } catch (e) {
      setError(`Couldn’t delete: ${e instanceof Error ? e.message : 'please try again.'}`);
      setBusy(false);
    }
  }

  const today = new Date();
  return (
    <OwnerScreen>
      <PageHeader title={initial.id ? 'Edit item' : 'New menu item'} onBack={leave} />

      <Card>
        <View style={styles.photoRow}>
          <MenuPhoto path={draft.photoPath} size={72} />
          <View style={styles.photoButtons}>
            {photoBusy ? (
              <ActivityIndicator color={C.accent} />
            ) : (
              <>
                <Pressable onPress={() => pickPhoto(true)} accessibilityRole="button" hitSlop={6}>
                  <Text style={styles.link}>Take photo</Text>
                </Pressable>
                <Pressable onPress={() => pickPhoto(false)} accessibilityRole="button" hitSlop={6}>
                  <Text style={styles.link}>Choose photo</Text>
                </Pressable>
                {draft.photoPath && (
                  <Pressable onPress={() => update({ photoPath: null })} accessibilityRole="button" hitSlop={6}>
                    <Text style={styles.remove}>Remove photo</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        </View>

        <FormField label="Name" error={tried && !draft.name.trim() ? 'Type the item’s name.' : undefined}>
          <TextField value={draft.name} onChangeText={(name) => update({ name })} placeholder="e.g. Flat White" maxLength={100} accessibilityLabel="Name" />
        </FormField>

        <FormField label="Category">
          <FieldButton value={categoryName} icon={OwnerIcons.chevronDown} onPress={() => setPickCategory(true)} accessibilityLabel="Category" />
        </FormField>

        <View style={styles.twoCol}>
          <FormField label="Sell price ($)" style={styles.flex} error={tried && problem?.includes('price') ? problem : undefined}>
            <TextField value={priceText} onChangeText={setPriceText} placeholder="0.00" keyboardType="decimal-pad" accessibilityLabel="Sell price" />
          </FormField>
          <FormField label="Cost to make ($)" style={styles.flex} error={tried && problem?.includes('cost') ? problem : undefined}>
            <TextField value={costText} onChangeText={setCostText} placeholder="Optional" keyboardType="decimal-pad" accessibilityLabel="Cost to make (optional)" />
          </FormField>
        </View>
        <Text style={styles.muted}>
          {profit
            ? `Profit per item: ${profit}.`
            : 'Optional: what one costs you to make. NexGain then shows your profit and margin per item. (It isn’t stock tracking.)'}
        </Text>

        <FormField label="Description (optional)">
          <TextField
            value={draft.description}
            onChangeText={(description) => update({ description })}
            placeholder="e.g. Double shot, choice of milk"
            maxLength={500}
            multiline
            accessibilityLabel="Description"
          />
        </FormField>
      </Card>

      <Card>
        <SwitchRow label="On sale" hint="Turn off to hide it (86’d, sold out or out of season)." value={draft.active} onChange={(active) => update({ active })} />
        <SwitchRow
          label="Special / limited time"
          hint="Shown as a special between the dates you choose."
          value={draft.isSpecial}
          onChange={(isSpecial) =>
            update(
              isSpecial
                ? { isSpecial, specialStart: draft.specialStart ?? dateKey(today), specialEnd: draft.specialEnd ?? dateKey(addDays(today, 13)) }
                : { isSpecial },
            )
          }
        />
        {draft.isSpecial && (
          <View style={styles.twoCol}>
            <FormField label="Starts" style={styles.flex}>
              <DateField label="Special starts" value={fromKey(draft.specialStart, today)} onChange={(d) => update({ specialStart: dateKey(d) })} />
            </FormField>
            <FormField label="Ends" style={styles.flex} error={tried && problem?.includes('end date') ? problem : undefined}>
              <DateField label="Special ends" value={fromKey(draft.specialEnd, today)} onChange={(d) => update({ specialEnd: dateKey(d) })} />
            </FormField>
          </View>
        )}
      </Card>

      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {tried && problem && !error && <Text style={styles.error}>{problem}</Text>}

      <Button label={busy ? 'Saving…' : initial.id ? 'Save changes' : 'Add to menu'} onPress={save} disabled={busy || photoBusy} />
      {initial.id && <Button label="Delete item" variant="secondary" onPress={() => setConfirmDelete(true)} disabled={busy} />}
      {initial.id && price !== null && Number.isFinite(price) && <Text style={styles.footnote}>Past sales keep the price they sold at ({formatMoney(initial.price)} before).</Text>}

      <OptionSheet
        visible={pickCategory}
        title="Category"
        options={[...categories.map((c) => c.name), NO_CATEGORY]}
        value={categoryName}
        onSelect={(name) => update({ categoryId: categories.find((c) => c.name === name)?.id ?? null })}
        onClose={() => setPickCategory(false)}
      />
      <ConfirmDialog
        visible={confirmDelete}
        message={`Delete ${initial.name} from the menu? Past sales of it are kept.`}
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  twoCol: { flexDirection: 'row', gap: Spacing.three - 4 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  photoButtons: { gap: Spacing.two },
  link: { color: C.accent, fontSize: 14, fontWeight: '700' },
  remove: { color: C.danger, fontSize: 14, fontWeight: '600' },
  muted: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  error: { color: C.danger, fontSize: 13, fontWeight: '600' },
  footnote: { color: C.textSecondary, fontSize: 12, textAlign: 'center' },
});
