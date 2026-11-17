import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChoiceRow, SaveNote } from '@/systems/bookings/components/owner/booking-ui';
import { ConfirmDialog } from '@/systems/bookings/components/owner/confirm-dialog';
import { DateField, FormField, TextField } from '@/systems/bookings/components/owner/form';
import { Badge, Button, Card, goBack, OwnerIcons, OwnerScreen, PageHeader } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { useShifts } from '@/data/shifts';
import { format12h, formatDayKey, formatDuration, formatTimeIn, todayIn, zonedParts } from '@/systems/bookings/data/booking-time';
import { startTimes, type StartTime } from '@/systems/bookings/data/free-times';
import { titleCase, withArticle } from '@/systems/bookings/constants/booking-business-types';
import {
  addManualBooking,
  doesService,
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
  useBookingWords,
  useBusinessTimeZone,
  useStaffPrices,
  useTimeOff,
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

/**
 * The times this person can start a booking that day: only while they're
 * rostered on (the owner: opening hours), with room for the whole service
 * before their shift ends. Times that overlap another booking are included as
 * taken (greyed out). The database checks all of this again when saving.
 */
function useStartTimes(staffId: string | null, date: string, minutes: number, ignoreBookingId?: string) {
  const timeZone = useBusinessTimeZone();
  const settings = useBookingSettings();
  const person = useBookingStaff().find((s) => s.id === staffId);
  const shifts = useShifts();
  const bookings = useBookings();
  const timeOff = useTimeOff();
  if (!settings || !person) return [];
  return startTimes({
    staff: person,
    dateKey: date,
    timeZone,
    durationMinutes: minutes,
    settings,
    shifts,
    bookings,
    timeOff,
    ignoreBookingId,
  });
}

/** Tap a free time; taken times are greyed out and can't be picked. */
function TimePicker({
  times,
  value,
  onChange,
  personName,
  isOwner,
}: {
  times: StartTime[];
  value: string | null;
  onChange: (time: string) => void;
  personName: string;
  isOwner: boolean;
}) {
  const freeCount = times.filter((t) => t.free).length;
  if (times.length === 0 || freeCount === 0) {
    return (
      <Text style={styles.warning}>
        {times.length > 0
          ? `${personName} is fully booked this day. Choose another day or person.`
          : isOwner
            ? 'You’re closed this day (Bookings Settings › Opening hours). Choose another day.'
            : `${personName} isn’t rostered on this day, so they can’t be booked. Roster them on first, or choose another day.`}
      </Text>
    );
  }
  return (
    <View style={styles.times} accessibilityRole="radiogroup">
      {times.map((t) => {
        const on = t.free && t.time === value;
        return (
          <Pressable
            key={t.time}
            onPress={() => onChange(t.time)}
            disabled={!t.free}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: !t.free }}
            accessibilityLabel={`${format12h(t.time)}${t.free ? '' : ', taken'}`}
            style={({ pressed }) => [styles.time, on && styles.timeOn, !t.free && styles.timeTaken, pressed && styles.pressed]}>
            <Text style={[styles.timeText, on && styles.timeTextOn, !t.free && styles.timeTextTaken]}>{format12h(t.time)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// One booking: see it, move it, mark it Completed or No-show, or cancel it.
// With id "new": add a booking by hand (walk-in or phone booking).
export default function BookingScreen() {
  const params = useLocalSearchParams<{ id: string; date?: string; staff?: string; time?: string }>();
  return params.id === 'new' ? <NewBooking date={params.date} staffId={params.staff} time={params.time} /> : <BookingDetails id={params.id} />;
}

function NewBooking({ date: startDate, staffId: startStaff, time: startTime }: { date?: string; staffId?: string; time?: string }) {
  const timeZone = useBusinessTimeZone();
  const addTitle = `Add ${withArticle(titleCase(useBookingWords().booking))}`;
  const services = useBookingServices().filter((s) => s.active);
  const staff = useBookingStaff();
  const prices = useStaffPrices();
  const [serviceId, setServiceId] = useState<string>(
    services.find((s) => !startStaff || doesService(startStaff, s.id, prices))?.id ?? services[0]?.id ?? '',
  );
  const service = services.find((s) => s.id === serviceId) ?? null;
  const who = staffForService(service, staff, prices);
  const [staffId, setStaffId] = useState<string>(startStaff && who.some((s) => s.id === startStaff) ? startStaff : (who[0]?.id ?? ''));
  const [date, setDate] = useState(startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : todayIn(timeZone));
  const [time, setTime] = useState<string | null>(startTime && /^\d{2}:\d{2}$/.test(startTime) ? startTime : null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const times = useStartTimes(staffId, date, service?.durationMinutes ?? 0);
  // Only a free time counts (changing the service, person or day can make the picked time taken).
  const chosen = times.find((t) => t.free && t.time === time) ?? null;
  const person = staff.find((s) => s.id === staffId);

  if (services.length === 0) {
    return (
      <OwnerScreen>
        <PageHeader onBack={() => goBack('/bookings/calendar')} title={addTitle} />
        <Card>
          <Text style={styles.muted}>Add a service in Bookings Settings first.</Text>
        </Card>
      </OwnerScreen>
    );
  }

  function pickService(id: string) {
    setServiceId(id);
    const nextWho = staffForService(services.find((s) => s.id === id), staff, prices);
    if (!nextWho.some((s) => s.id === staffId)) setStaffId(nextWho[0]?.id ?? '');
  }

  async function save() {
    if (!staffId) return setMessage({ tone: 'error', text: 'Nobody does this service yet. Tick it for someone in Employees › their profile › Services & Prices.' });
    if (!chosen) return setMessage({ tone: 'error', text: 'Choose a free time.' });
    setBusy(true);
    const error = await addManualBooking({
      serviceId,
      staffId,
      startsAt: chosen.startsAt,
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
      <PageHeader onBack={() => goBack('/bookings/calendar')} title={addTitle} subtitle="For walk-ins and phone bookings." />
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
        <FormField label="Date">
          <DateField label="Booking date" value={toDate(date)} onChange={(d) => setDate(toKey(d))} />
        </FormField>
        <FormField label="Time">
          <TimePicker times={times} value={time} onChange={setTime} personName={person?.name ?? 'This person'} isOwner={!!person?.isOwner} />
        </FormField>
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
  const moveDate = date ?? local?.date ?? '2026-01-01';
  const moveStaff = staffId ?? booking?.staffId ?? null;
  const times = useStartTimes(moveStaff, moveDate, booking?.durationMinutes ?? 0, booking?.id);
  // Until another time is tapped: the booking's own time, if the day and person haven't changed.
  const moveTime = time ?? (local && moveDate === local.date && moveStaff === booking?.staffId ? local.time : null);
  const chosen = times.find((t) => t.free && t.time === moveTime) ?? null;

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
    if (!chosen) return setMessage({ tone: 'error', text: 'Choose a free time.' });
    const error = await run(() => moveBooking(booking!.id, chosen.startsAt, moveStaff ?? booking!.staffId), 'Booking moved.');
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
          {who.length > 1 && (
            <ChoiceRow label="With" choices={who.map((s) => ({ value: s.id, label: s.name }))} value={moveStaff ?? booking.staffId} onChange={setStaffId} />
          )}
          <FormField label="Date">
            <DateField label="New date" value={toDate(moveDate)} onChange={(d) => setDate(toKey(d))} />
          </FormField>
          <FormField label="Time">
            <TimePicker
              times={times}
              value={moveTime}
              onChange={setTime}
              personName={staff.find((s) => s.id === moveStaff)?.name ?? 'This person'}
              isOwner={!!staff.find((s) => s.id === moveStaff)?.isOwner}
            />
          </FormField>
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
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  time: {
    minWidth: 84,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceRaised,
    alignItems: 'center',
  },
  timeOn: { borderColor: C.accent, backgroundColor: C.accent },
  timeTaken: { opacity: 0.4, backgroundColor: C.surface },
  timeText: { color: C.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  timeTextOn: { color: C.onAccent },
  timeTextTaken: { color: C.textMuted, textDecorationLine: 'line-through' },
  pressed: { opacity: 0.7 },
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
