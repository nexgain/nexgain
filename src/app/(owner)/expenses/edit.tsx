import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/owner/confirm-dialog';
import { SelectBox } from '@/components/owner/employee-ui';
import { DateField, FormField, TextField } from '@/components/owner/form';
import { ScreenHeader } from '@/components/owner/invoices-ui';
import { Button, Card, Icon, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { deleteExpense, EXPENSE_CATEGORIES, receiptLink, saveExpense, useExpenses } from '@/data/finance';
import { fromDateKey, toDateKey } from '@/data/shifts';

type PickedFile = { uri: string; name: string; mimeType: string; size: number };
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Add an expense, or edit / delete one (opened with ?id=...).
export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useExpenses().find((e) => e.id === id) ?? null;

  const [amount, setAmount] = useState(existing ? existing.amount.toFixed(2) : '');
  const [date, setDate] = useState(existing ? fromDateKey(existing.date) : new Date());
  const [category, setCategory] = useState<string | null>(existing?.category ?? null);
  const [description, setDescription] = useState(existing?.description ?? '');
  const [receipt, setReceipt] = useState<PickedFile | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/expenses' as Href));

  if (id && !existing) {
    return (
      <OwnerScreen>
        <ScreenHeader title="Expense" onBack={back} />
        <Card>
          <Text style={styles.muted}>This expense couldn&apos;t be found.</Text>
        </Card>
      </OwnerScreen>
    );
  }

  const parsed = Number(amount.replace(/[$,\s]/g, ''));
  const errors = {
    amount: !Number.isFinite(parsed) || parsed <= 0 ? 'Enter the amount, e.g. 85.50' : undefined,
    category: !category ? 'Choose a category.' : undefined,
  };
  const hasReceipt = !!receipt || (!!existing?.receiptPath && !removeReceipt);

  function accept(file: PickedFile) {
    if (file.size > MAX_FILE_BYTES) {
      setError('That file is larger than 10MB. Please choose a smaller one.');
      return;
    }
    setError(null);
    setReceipt(file);
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera access is turned off. You can choose a photo instead.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (result.canceled) return;
    const a = result.assets[0];
    accept({ uri: a.uri, name: a.fileName ?? 'receipt.jpg', mimeType: a.mimeType ?? 'image/jpeg', size: a.fileSize ?? 0 });
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (result.canceled) return;
    const a = result.assets[0];
    accept({ uri: a.uri, name: a.fileName ?? 'receipt.jpg', mimeType: a.mimeType ?? 'image/jpeg', size: a.fileSize ?? 0 });
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
    if (result.canceled) return;
    const a = result.assets[0];
    accept({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? '', size: a.size ?? 0 });
  }

  function chooseReceipt() {
    if (Platform.OS === 'web') {
      pickFile();
      return;
    }
    Alert.alert('Add receipt', undefined, [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose Photo', onPress: pickPhoto },
      { text: 'Choose File (PDF)', onPress: pickFile },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function openReceipt() {
    if (!existing?.receiptPath) return;
    try {
      await Linking.openURL(await receiptLink(existing.receiptPath));
    } catch {
      setError('Couldn’t open the receipt. Please try again.');
    }
  }

  async function save() {
    setTried(true);
    if (errors.amount || errors.category || busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveExpense(
        {
          amount: Math.round(parsed * 100) / 100,
          date: toDateKey(date),
          category: category!,
          description,
          receipt,
          removeReceipt,
        },
        existing ?? undefined,
      );
      back();
    } catch {
      setError('Couldn’t save the expense. Check your internet connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setConfirmDelete(false);
    try {
      await deleteExpense(existing);
      back();
    } catch {
      setError('Couldn’t delete the expense. Check your internet connection and try again.');
    }
  }

  return (
    <OwnerScreen>
      <ScreenHeader title={existing ? 'Edit Expense' : 'Add Expense'} onBack={back} />

      <Card>
        <FormField label="Amount (incl. GST)" error={tried ? errors.amount : undefined}>
          <TextField value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" accessibilityLabel="Amount" />
        </FormField>
        <FormField label="Date">
          <DateField label="Date" value={date} onChange={setDate} />
        </FormField>
        <FormField label="Category" error={tried ? errors.category : undefined}>
          <SelectBox label="Category" value={category} options={EXPENSE_CATEGORIES} onChange={setCategory} />
        </FormField>
        <FormField label="Description (optional)">
          <TextField
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Diesel for the ute"
            accessibilityLabel="Description"
          />
        </FormField>
        <FormField label="Receipt (optional)">
          {hasReceipt ? (
            <View style={styles.receiptRow}>
              <Icon name={OwnerIcons.receipt} color={C.accent} size={16} />
              <Pressable
                onPress={receipt ? undefined : openReceipt}
                disabled={!!receipt}
                accessibilityRole="button"
                style={styles.flex}>
                <Text style={styles.receiptName} numberOfLines={1}>
                  {receipt ? receipt.name : 'View receipt'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setReceipt(null);
                  setRemoveReceipt(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Remove receipt"
                hitSlop={8}>
                <Icon name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} color={C.textSecondary} size={18} />
              </Pressable>
            </View>
          ) : (
            <Button
              label="Add Receipt Photo or PDF"
              icon={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }}
              variant="secondary"
              onPress={chooseReceipt}
            />
          )}
        </FormField>
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.buttons}>
        <Button label={busy ? 'Saving…' : existing ? 'Save Changes' : 'Save Expense'} icon={OwnerIcons.check} disabled={busy} onPress={save} />
        {existing && <Button label="Delete Expense" variant="secondary" onPress={() => setConfirmDelete(true)} />}
      </View>

      <ConfirmDialog
        visible={confirmDelete}
        message="Delete this expense? This can't be undone."
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
  },
  error: {
    color: C.danger,
    fontSize: 14,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceRaised,
  },
  receiptName: {
    color: C.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  buttons: {
    gap: Spacing.two,
  },
});
