import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ConfirmDialog } from '@/systems/bookings/components/owner/confirm-dialog';
import { ChoiceRow, SaveNote } from '@/systems/bookings/components/owner/booking-ui';
import { Checkbox, FormField, SwitchRow, TextField } from '@/systems/bookings/components/owner/form';
import { Button, Card, goBack, OwnerScreen, PageHeader } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatDuration } from '@/systems/bookings/data/booking-time';
import {
  currencyCode,
  deleteService,
  saveService,
  useBookingServices,
  useBookingStaff,
  type BookingService,
} from '@/systems/bookings/data/bookings';

const DURATIONS = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180, 240, 300, 360, 480].map((v) => ({
  value: v,
  label: formatDuration(v),
}));

/** "35", "35.50" or "" (no price) from what was typed; undefined if it isn't a price. */
function parsePrice(text: string): number | null | undefined {
  const t = text.trim().replace(/^[$£€]/, '').replace(/,/g, '');
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined;
  return Number(t);
}

// Bookings settings > a service: its name, length, price and who does it.
export default function BookingServiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const services = useBookingServices();
  const staff = useBookingStaff().filter((s) => s.active);
  const existing = services.find((s) => s.id === id) ?? null;
  const isNew = id === 'new';

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [duration, setDuration] = useState(existing?.durationMinutes ?? 30);
  const [price, setPrice] = useState(existing?.price === null || existing?.price === undefined ? '' : String(existing.price));
  const [staffIds, setStaffIds] = useState<string[]>(existing?.staffIds ?? []);
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!isNew && !existing) {
    return (
      <OwnerScreen>
        <PageHeader onBack={() => goBack('/bookings/services')} title="Service" />
        <Card>
          <Text style={styles.muted}>This service no longer exists.</Text>
        </Card>
      </OwnerScreen>
    );
  }

  const everyone = staffIds.length === 0;
  function toggleStaff(staffId: string) {
    setStaffIds((ids) => (ids.includes(staffId) ? ids.filter((x) => x !== staffId) : [...ids, staffId]));
  }

  async function save() {
    const parsed = parsePrice(price);
    if (!name.trim()) return setMessage({ tone: 'error', text: 'Enter a name for the service.' });
    if (parsed === undefined) return setMessage({ tone: 'error', text: 'Enter the price as a number, e.g. 35 or 35.50, or leave it blank.' });
    setBusy(true);
    const draft: Omit<BookingService, 'id' | 'sort'> & { id: string | null } = {
      id: existing?.id ?? null,
      name,
      description,
      durationMinutes: duration,
      price: parsed,
      // Anyone who has since left isn't kept on the list.
      staffIds: staffIds.filter((sid) => staff.some((s) => s.id === sid)),
      active,
    };
    const error = await saveService(draft);
    setBusy(false);
    if (error) setMessage({ tone: 'error', text: error });
    else goBack('/bookings/services');
  }

  async function remove() {
    setConfirmDelete(false);
    if (!existing) return;
    setBusy(true);
    const error = await deleteService(existing.id);
    setBusy(false);
    if (error) setMessage({ tone: 'error', text: error });
    else router.back();
  }

  return (
    <OwnerScreen>
      <PageHeader onBack={() => goBack('/bookings/services')} title={isNew ? 'Add a Service' : 'Edit Service'} />
      <Card>
        <FormField label="Name">
          <TextField value={name} onChangeText={setName} placeholder="e.g. Skin fade" maxLength={100} accessibilityLabel="Service name" />
        </FormField>
        <FormField label="Description (optional)">
          <TextField
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Includes a wash and style"
            multiline
            maxLength={1000}
            accessibilityLabel="Service description"
          />
        </FormField>
        <ChoiceRow label="How long it takes" choices={DURATIONS} value={duration} onChange={setDuration} />
        <FormField label={`Price (${currencyCode()})`}>
          <TextField
            value={price}
            onChangeText={setPrice}
            placeholder="Leave blank to not show a price"
            keyboardType="decimal-pad"
            maxLength={10}
            accessibilityLabel="Price"
          />
        </FormField>
        <SwitchRow
          label="Show on my booking page"
          hint={active ? 'Customers can book it.' : 'Hidden: customers can’t book it.'}
          value={active}
          onChange={setActive}
        />
      </Card>

      <Card title="Who Does It">
        <Pressable
          onPress={() => setStaffIds([])}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: everyone }}
          style={styles.check}>
          <Checkbox checked={everyone} />
          <Text style={styles.title}>Everyone</Text>
        </Pressable>
        {staff.map((s) => {
          const checked = !everyone && staffIds.includes(s.id);
          return (
            <Pressable
              key={s.id}
              onPress={() => toggleStaff(s.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              style={[styles.check, styles.divider]}>
              <Checkbox checked={checked} />
              <Text style={styles.title}>{s.isOwner ? `${s.name} (you)` : s.name}</Text>
            </Pressable>
          );
        })}
        <Text style={styles.muted}>Customers only see the people who do this service.</Text>
      </Card>

      <SaveNote message={message} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button label="Cancel" variant="secondary" onPress={() => goBack('/bookings/services')} fill />
        </View>
        <View style={styles.flex}>
          <Button label={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy} fill />
        </View>
      </View>
      {!isNew && (
        <Pressable onPress={() => setConfirmDelete(true)} accessibilityRole="button" style={styles.deleteRow} hitSlop={6}>
          <Text style={styles.delete}>Delete this service</Text>
        </Pressable>
      )}
      <ConfirmDialog
        visible={confirmDelete}
        message="Delete this service? Customers won’t be able to book it. Bookings already made keep their details."
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  check: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 48 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  row: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  deleteRow: { alignItems: 'center', paddingVertical: Spacing.three },
  delete: { color: C.danger, fontSize: 15, fontWeight: '600' },
});
