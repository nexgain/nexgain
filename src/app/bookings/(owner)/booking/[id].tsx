import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChoiceRow, SaveNote } from '@/systems/bookings/components/owner/booking-ui';
import { ConfirmDialog } from '@/systems/bookings/components/owner/confirm-dialog';
import { DateField, FormField, TextField, TimeField } from '@/systems/bookings/components/owner/form';
import { Badge, Button, Card, goBack, OwnerIcons, OwnerScreen, PageHeader } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import {
  formatDayKey,
  formatDuration,
  formatTimeIn,
  minutesOf,
  todayIn,
  weekdayOf,
  zonedParts,
  zonedToIso,
} from '@/systems/bookings/data/booking-time';
import {
  addManualBooking,
  formatPrice,
  depositText,
  moveBooking,
  reminderText,
  setBookingStatus,
  staffForService,
  useBookings,
  useBookingServices,
  useBookingSettings,
  useBookingStaff,
  useBusinessTimeZone,
  type BookingStatus,
} from '@/systems/bookings/data/bookings';

type Message = { tone: 'ok' | 'error'; text: string } | null;

const STATUS_BADGE: Record<BookingStatus, { label: string; tone: 'info' | 'success' | 'danger' | 'neutral' }> = {
  confirmed: { label: 'Booked', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  no_show: { label: 'No-show', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

const toDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A gentle note when a time is outside opening hours or the person's hours (the owner can still book it). */
function useHoursNote(date: string, time: string, staffId: string | null, minutes: number) {
  const settings = useBookingSettings();
  const person = useBookingStaff().find((s) => s.id === staffId);
  if (!settings || !time) return null;
  const day = weekdayOf(date);
  const open = settings.openingHours[day];
  const start = minutesOf(time);
  if (!open.open) return 'You’re usually closed this day.';
  if (start < minutesOf(open.start) || start + minutes > minutesOf(open.end)) return 'This is outside your opening hours.';
  const own = person?.hours?.[day];
  if (own && (!own.working || start < minutesOf(own.start) || start + minutes > minutesOf(own.end))) {
    return `${person!.name} doesn’t usually work then.`;
  }
  return null;
}

// One booking: see it, move it, mark it Completed or No-show, or cancel it.
// With id "new": add a booking by hand (walk-in or phone booking).
export default function BookingScreen() {
  const params = useLocalSearchParams<{ id: string; date?: string; staff?: string; time?: string }>();
  return params.id === 'new' ? <NewBooking date={params.date} staffId={params.staff} time={params.time} /> : <BookingDetails id={params.id} />;
}

function NewBooking({ date: startDate, staffId: startStaff, time: startTime }: { date?: string; staffId?: string; time?: string }) {
  const timeZone = useBusinessTimeZone();
  const services = useBookingServices().filter((s) => s.active);
  const staff = useBookingStaff();
  const [serviceId, setServiceId] = useState<string>(
    services.find((s) => !startStaff || s.staffIds.length === 0 || s.staffIds.includes(startStaff))?.id ?? services[0]?.id ?? '',
  );
  const service = services.find((s) => s.id === serviceId) ?? null;
  const who = staffForService(service, staff);
  const [staffId, setStaffId] = useState<string>(startStaff && who.some((s) => s.id === startStaff) ? startStaff : (who[0]?.id ?? ''));
  const [date, setDate] = useState(startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : todayIn(timeZone));
  const [time, setTime] = useState(startTime && /^\d{2}:\d{2}$/.test(startTime) ? startTime : '09:00');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const hoursNote = useHoursNote(date, time, staffId, service?.durationMinutes ?? 0);

  if (services.length === 0) {
    return (
      <OwnerScreen>
        <PageHeader onBack={() => goBack('/bookings/calendar')} title="Add a Booking" />
        <Card>
          <Text style={styles.muted}>Add a service in Bookings Settings first.</Text>
        </Card>
      </OwnerScreen>
    );
  }

  function pickService(id: string) {
    setServiceId(id);
    const nextWho = staffForService(services.find((s) => s.id === id), staff);
    if (!nextWho.some((s) => s.id === staffId)) setStaffId(nextWho[0]?.id ?? '');
  }

  async function save() {
    if (!staffId) return setMessage({ tone: 'error', text: 'Nobody can do this service. Check its staff in Bookings Settings.' });
    setBusy(true);
    const error = await addManualBooking({
      serviceId,
      staffId,
      startsAt: zonedToIso(date, time, timeZone),
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
      notes,
    });
    setBusy(false);
    if (error) setMessage({ tone: 'error', text: error });
    else goBack('/bookings/calendar');
  }

  return (
    <OwnerScreen>
      <PageHeader onBack={() => goBack('/bookings/calendar')} title="Add a Booking" subtitle="For walk-ins and phone bookings." />
      <Card>
        <ChoiceRow
          label="Service"
          choices={services.map((s) => ({
            value: s.id,
            label: `${s.name} · ${formatDuration(s.durationMinutes)}${s.price !== null ? ` · ${formatPrice(s.price)}` : ''}`,
          }))}
          value={serviceId}
          onChange={pickService}
        />
        <ChoiceRow label="With" choices={who.map((s) => ({ value: s.id, label: s.name }))} value={staffId} onChange={setStaffId} />
        <View style={styles.row}>
          <View style={styles.flex}>
            <FormField label="Date">
              <DateField label="Booking date" value={toDate(date)} onChange={(d) => setDate(toKey(d))} />
            </FormField>
          </View>
          <View style={styles.flex}>
            <FormField label="Time">
              <TimeField label="Booking time" value={time} onChange={setTime} />
            </FormField>
          </View>
        </View>
        {hoursNote && <Text style={styles.warning}>{hoursNote} You can still book it.</Text>}
      </Card>
      <Card title="Customer" icon={OwnerIcons.person}>
        <FormField label="Name">
          <TextField value={name} onChangeText={setName} placeholder="Customer’s name" maxLength={100} accessibilityLabel="Customer name" />
        </FormField>
        <FormField label="Mobile (optional)">
          <TextField value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={30} accessibilityLabel="Customer mobile" />
        </FormField>
        <FormField label="Email (optional)">
          <TextField
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            maxLength={200}
            accessibilityLabel="Customer email"
          />
        </FormField>
        <FormField label="Notes (optional)">
          <TextField value={notes} onChangeText={setNotes} multiline maxLength={1000} accessibilityLabel="Notes" />
        </FormField>
      </Card>
      <SaveNote message={message} />
      <Button label={busy ? 'Saving…' : 'Add booking'} onPress={save} disabled={busy} />
    </OwnerScreen>
  );
}

function BookingDetails({ id }: { id: string }) {
  const timeZone = useBusinessTimeZone();
  const booking = useBookings().find((b) => b.id === id) ?? null;
  const staff = useBookingStaff();
  const service = useBookingServices().find((s) => s.id === booking?.serviceId) ?? null;
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const local = booking ? zonedParts(booking.startsAt, timeZone) : null;
  const hoursNote = useHoursNote(date ?? local?.date ?? '2026-01-01', time ?? local?.time ?? '', staffId ?? booking?.staffId ?? null, booking?.durationMinutes ?? 0);

  if (!booking || !local) {
    return (
      <OwnerScreen>
        <PageHeader onBack={() => goBack('/bookings/calendar')} title="Booking" />
        <Card>
          <Text style={styles.muted}>This booking can’t be found.</Text>
        </Card>
      </OwnerScreen>
    );
  }

  const person = staff.find((s) => s.id === booking.staffId);
  const badge = STATUS_BADGE[booking.status];
  const started = new Date(booking.startsAt) <= new Date();
  const who = staffForService(service, staff);

  async function run(action: () => Promise<string | null>, ok: string) {
    setBusy(true);
    const error = await action();
    setBusy(false);
    setMessage(error ? { tone: 'error', text: error } : { tone: 'ok', text: ok });
    return error;
  }

  async function saveMove() {
    const error = await run(
      () => moveBooking(booking!.id, zonedToIso(date ?? local!.date, time ?? local!.time, timeZone), staffId ?? booking!.staffId),
      'Booking moved.',
    );
    if (!error) setMoving(false);
  }

  return (
    <OwnerScreen>
      <PageHeader onBack={() => goBack('/bookings/calendar')} title={booking.customerName} right={<Badge label={badge.label} tone={badge.tone} />} />
      <SaveNote message={message} />
      <Card title="Appointment" icon={OwnerIcons.calendar}>
        <Detail label="Service" value={`${booking.serviceName} (${formatDuration(booking.durationMinutes)})`} />
        <Detail label="With" value={person?.name ?? '—'} />
        <Detail label="When" value={`${formatDayKey(local.date, true)}, ${formatTimeIn(booking.startsAt, timeZone)} – ${formatTimeIn(booking.endsAt, timeZone)}`} />
        <Detail label="Price" value={booking.price === null ? 'No price' : formatPrice(booking.price)} />
        <Detail
          label="Booked"
          value={booking.source === 'online' ? `Online${booking.staffChosen ? '' : ' (anyone available)'}` : 'By you'}
        />
        {booking.status === 'cancelled' && (
          <Detail label="Cancelled by" value={booking.cancelledBy === 'customer' ? 'The customer (online)' : 'You'} />
        )}
        {booking.notes ? <Detail label="Notes" value={booking.notes} /> : null}
        {depositText(booking) ? <Detail label="Deposit" value={depositText(booking)!} /> : null}
        {booking.cancellationFee > 0 ? (
          <Detail
            label="Cancellation fee"
            value={`${formatPrice(booking.cancellationFee)} ${booking.feeStatus === 'charged' ? 'charged' : booking.feeStatus === 'failed' ? 'couldn’t be charged' : 'to collect'}`}
          />
        ) : null}
        {reminderText(booking) ? <Detail label="Reminder" value={reminderText(booking)!} /> : null}
      </Card>

      <Card title="Customer" icon={OwnerIcons.person}>
        <Text style={styles.value}>{booking.customerName}</Text>
        {booking.customerPhone ? (
          <Pressable onPress={() => Linking.openURL(`tel:${booking.customerPhone.replace(/[^0-9+]/g, '')}`)} accessibilityRole="link" hitSlop={6}>
            <Text style={styles.link}>{booking.customerPhone}</Text>
          </Pressable>
        ) : null}
        {booking.customerEmail ? (
          <Pressable onPress={() => Linking.openURL(`mailto:${booking.customerEmail}`)} accessibilityRole="link" hitSlop={6}>
            <Text style={styles.link}>{booking.customerEmail}</Text>
          </Pressable>
        ) : null}
      </Card>

      {booking.status === 'confirmed' && moving && (
        <Card title="Move Booking" icon={OwnerIcons.clock}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <FormField label="Date">
                <DateField label="New date" value={toDate(date ?? local.date)} onChange={(d) => setDate(toKey(d))} />
              </FormField>
            </View>
            <View style={styles.flex}>
              <FormField label="Time">
                <TimeField label="New time" value={time ?? local.time} onChange={setTime} />
              </FormField>
            </View>
          </View>
          {who.length > 1 && (
            <ChoiceRow label="With" choices={who.map((s) => ({ value: s.id, label: s.name }))} value={staffId ?? booking.staffId} onChange={setStaffId} />
          )}
          {hoursNote && <Text style={styles.warning}>{hoursNote} You can still move it there.</Text>}
          <Text style={styles.muted}>The customer isn’t told automatically. Let them know about the new time.</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button label="Cancel" variant="secondary" onPress={() => setMoving(false)} fill />
            </View>
            <View style={styles.flex}>
              <Button label="Save" onPress={saveMove} disabled={busy} fill />
            </View>
          </View>
        </Card>
      )}

      {booking.status === 'confirmed' ? (
        <View style={styles.actions}>
          {started && (
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button label="Completed" icon={OwnerIcons.check} onPress={() => run(() => setBookingStatus(booking.id, 'completed'), 'Marked as completed.')} fill />
              </View>
              <View style={styles.flex}>
                <Button label="No-show" variant="secondary" onPress={() => run(() => setBookingStatus(booking.id, 'no_show'), 'Marked as a no-show.')} fill />
              </View>
            </View>
          )}
          {!moving && <Button label="Move booking" variant="secondary" icon={OwnerIcons.clock} onPress={() => setMoving(true)} />}
          <Pressable onPress={() => setConfirmCancel(true)} accessibilityRole="button" style={styles.cancelRow} hitSlop={6}>
            <Text style={styles.cancel}>Cancel booking</Text>
          </Pressable>
        </View>
      ) : (
        <Button
          label={booking.status === 'cancelled' ? 'Restore booking' : 'Undo (back to booked)'}
          variant="secondary"
          onPress={() => run(() => setBookingStatus(booking.id, 'confirmed'), 'Back to booked.')}
        />
      )}

      <ConfirmDialog
        visible={confirmCancel}
        message={`Cancel ${booking.customerName}’s booking? The time becomes free for others. The customer isn’t told automatically, so let them know.${booking.paymentStatus === 'paid' ? ` Refund their ${formatPrice(booking.depositAmount)} deposit from your payment account (test mode: nothing to refund).` : ''}`}
        confirmLabel="Cancel booking"
        onConfirm={() => {
          setConfirmCancel(false);
          run(() => setBookingStatus(booking.id, 'cancelled'), 'Booking cancelled.');
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </OwnerScreen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },
  warning: { color: C.warning, fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  detail: { gap: 2 },
  detailLabel: { color: C.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { color: C.text, fontSize: 15, fontWeight: '600' },
  link: { color: C.accent, fontSize: 15, fontWeight: '600' },
  actions: { gap: Spacing.two },
  cancelRow: { alignItems: 'center', paddingVertical: Spacing.three },
  cancel: { color: C.danger, fontSize: 15, fontWeight: '600' },
});
