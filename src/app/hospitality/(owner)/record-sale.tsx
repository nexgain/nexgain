import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/owner/form';
import { Segmented } from '@/components/owner/invoices-ui';
import { Button, Card, goBack, OwnerScreen, PageHeader } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/payroll';
import { InvoiceForm } from '@/systems/hospitality/components/owner/invoice-form';
import { pickedEntries, SalePicker, type Quantities } from '@/systems/hospitality/components/owner/sale-picker';
import { recordSale, useMenuItems } from '@/systems/hospitality/data/menu';

type Mode = 'sale' | 'invoice';
const MODES: { value: Mode; label: string }[] = [
  { value: 'sale', label: 'Sale' },
  { value: 'invoice', label: 'Send as invoice' },
];

// Record sale: tap the items sold and how many, then Save. Each sale keeps
// the prices at the time and the date and time it was saved.
// "Send as invoice" (catering, functions, business customers): the same items,
// plus custom lines and the customer's details, saved and emailed as an invoice.
export default function RecordSaleScreen() {
  // ?mode=invoice opens straight on "Send as invoice" (from Sales › New invoice).
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'invoice' ? 'invoice' : 'sale');
  const items = useMenuItems();
  const [quantities, setQuantities] = useState<Quantities>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const entries = pickedEntries(quantities, items);
  const total = entries.reduce((sum, e) => sum + e.quantity * e.item.price, 0);
  const count = entries.reduce((sum, e) => sum + e.quantity, 0);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const sale = await recordSale(entries, { source: 'sale', note });
      setQuantities({});
      setNote('');
      setSaved(`Sale saved: ${formatMoney(sale.total)}. Ready for the next one.`);
    } catch (e) {
      setError(`The sale wasn’t saved: ${e instanceof Error ? e.message : 'please try again.'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <OwnerScreen>
      <PageHeader
        title={mode === 'invoice' ? 'New invoice' : 'Record sale'}
        subtitle={
          mode === 'invoice'
            ? 'For catering, functions and business customers. Tap + for menu items, add other lines, then send.'
            : 'Tap + for each item sold, then save.'
        }
        onBack={() => goBack('/hospitality/sales')}
      />
      <Segmented options={MODES} value={mode} onChange={setMode} />

      {saved && (
        <View style={styles.success} accessibilityRole="alert">
          <Text style={styles.successText}>{saved}</Text>
        </View>
      )}

      <SalePicker quantities={quantities} onChange={setQuantities} mode="tap" />

      {mode === 'invoice' ? (
        <InvoiceForm entries={entries} onDone={() => setQuantities({})} />
      ) : (
        <Card>
          <View style={styles.totalRow}>
            <Text style={styles.label}>
              {count} item{count === 1 ? '' : 's'}
            </Text>
            <Text style={styles.total}>{formatMoney(total)}</Text>
          </View>
          <TextField value={note} onChangeText={setNote} placeholder="Note (optional), e.g. Table 4" maxLength={500} accessibilityLabel="Note" />
          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          <Button label={busy ? 'Saving…' : 'Save sale'} onPress={save} disabled={busy || entries.length === 0} />
          {entries.length > 0 && <Button label="Clear" variant="secondary" onPress={() => setQuantities({})} disabled={busy} />}
        </Card>
      )}
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
  total: { color: C.text, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  error: { color: C.danger, fontSize: 13, fontWeight: '600' },
  success: { padding: Spacing.three, borderRadius: 12, backgroundColor: C.successSoft, borderWidth: 1, borderColor: C.successBorder },
  successText: { color: C.success, fontSize: 14, fontWeight: '600' },
});
