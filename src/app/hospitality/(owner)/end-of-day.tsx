import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DateField, FormField, TextField } from '@/components/owner/form';
import { Button, Card, goBack, OwnerScreen, PageHeader } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/payroll';
import { pickedEntries, SalePicker, type Quantities } from '@/systems/hospitality/components/owner/sale-picker';
import { recordSale, useMenuItems, useSales } from '@/systems/hospitality/data/menu';
import { addDays, dateKey, salesIn, startOfDay } from '@/systems/hospitality/data/sales-stats';

// End of day: type how many of each item sold on a day, saved as one entry
// for that day. (Hour-of-day charts leave these out: they have no time.)
export default function EndOfDayScreen() {
  const items = useMenuItems();
  const sales = useSales();
  const [day, setDay] = useState(startOfDay(new Date()));
  const [quantities, setQuantities] = useState<Quantities>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const entries = pickedEntries(quantities, items);
  const total = entries.reduce((sum, e) => sum + e.quantity * e.item.price, 0);
  const future = day > startOfDay(new Date());
  const alreadyThatDay = salesIn(sales, day, addDays(day, 1)).filter((s) => s.source === 'day').length;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      // Saved at the end of that day (in the phone's time).
      const soldAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 0);
      const sale = await recordSale(entries, { source: 'day', soldAt, note });
      setQuantities({});
      setNote('');
      setSaved(`Saved ${formatMoney(sale.total)} of sales for ${dateKey(day) === dateKey(new Date()) ? 'today' : day.toLocaleDateString()}.`);
    } catch (e) {
      setError(`Not saved: ${e instanceof Error ? e.message : 'please try again.'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <OwnerScreen>
      <PageHeader title="End of day sales" subtitle="Type how many of each item sold that day." onBack={() => goBack('/hospitality/sales')} />

      <Card>
        <FormField label="Day">
          <DateField label="Sales day" value={day} onChange={(d) => setDay(startOfDay(d))} />
        </FormField>
        {future && <Text style={styles.error}>That day hasn’t happened yet.</Text>}
        {alreadyThatDay > 0 && (
          <Text style={styles.warning}>
            You’ve already saved {alreadyThatDay === 1 ? 'an end-of-day entry' : `${alreadyThatDay} end-of-day entries`} for this day. Saving again adds to it.
          </Text>
        )}
      </Card>

      {saved && (
        <View style={styles.success} accessibilityRole="alert">
          <Text style={styles.successText}>{saved}</Text>
        </View>
      )}

      <SalePicker quantities={quantities} onChange={setQuantities} mode="type" />

      <Card>
        <View style={styles.totalRow}>
          <Text style={styles.label}>Day total</Text>
          <Text style={styles.total}>{formatMoney(total)}</Text>
        </View>
        <TextField value={note} onChangeText={setNote} placeholder="Note (optional)" maxLength={500} accessibilityLabel="Note" />
        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        <Button label={busy ? 'Saving…' : 'Save day’s sales'} onPress={save} disabled={busy || future || entries.length === 0} />
      </Card>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
  total: { color: C.text, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  error: { color: C.danger, fontSize: 13, fontWeight: '600' },
  warning: { color: C.warning, fontSize: 13, lineHeight: 18 },
  success: { padding: Spacing.three, borderRadius: 12, backgroundColor: C.successSoft, borderWidth: 1, borderColor: C.successBorder },
  successText: { color: C.success, fontSize: 14, fontWeight: '600' },
});
