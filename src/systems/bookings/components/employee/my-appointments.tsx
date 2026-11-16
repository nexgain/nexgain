import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, employeeStyles, Icon, Icons } from '@/systems/bookings/components/employee/ui';
import { ShareLinkBox } from '@/systems/bookings/components/share-link';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Radius, Spacing } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import { useCurrentEmployee } from '@/data/current-employee';
import { addDays, formatDayKey, formatDuration, formatTimeIn, todayIn } from '@/systems/bookings/data/booking-time';
import {
  bookingLink,
  bookingsOnDay,
  formatPrice,
  markMyBooking,
  myStaff,
  useBookings,
  useBookingSettings,
  useBookingsLoad,
  useBookingStaff,
  useBusinessTimeZone,
  type Booking,
} from '@/systems/bookings/data/bookings';

const STATUS: Record<Booking['status'], { label: string; color: string; background: string } | null> = {
  confirmed: null,
  completed: { label: 'Completed', color: C.success, background: C.successSoft },
  no_show: { label: 'No-show', color: C.danger, background: C.dangerSoft },
  cancelled: { label: 'Cancelled', color: C.neutral, background: C.neutralSoft },
};

/**
 * Schedule tab (NexGain Bookings): this employee's appointments, day by day.
 * New bookings appear straight away (live). Once an appointment has started
 * they mark it Completed or No-show.
 */
export function MyAppointments() {
  const timeZone = useBusinessTimeZone();
  const today = todayIn(timeZone);
  const me = myStaff(useBookingStaff(), useCurrentEmployee()?.id);
  const load = useBookingsLoad();
  const settings = useBookingSettings();
  const businessName = useBusiness()?.businessName ?? 'us';
  const all = useBookings().filter((b) => b.staffId === me?.id);
  const [day, setDay] = useState(today);
  const days = Array.from({ length: 15 }, (_, i) => addDays(today, i - 1));
  const list = bookingsOnDay(all, day, timeZone);

  if (!me) {
    return (
      <Card style={styles.card}>
        <Text style={styles.muted}>
          {load === 'ready' ? 'You’re not set up to take bookings yet. Ask your manager to turn you on in Bookings Settings.' : 'Loading your appointments…'}
        </Text>
      </Card>
    );
  }

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
        {days.map((d) => {
          const count = bookingsOnDay(all, d, timeZone).length;
          const on = d === day;
          return (
            <Pressable
              key={d}
              onPress={() => setDay(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${formatDayKey(d, true)}, ${count} appointment${count === 1 ? '' : 's'}`}
              style={[styles.day, on && styles.dayOn]}>
              <Text style={[styles.dayName, on && styles.dayTextOn]}>
                {d === today ? 'Today' : d === addDays(today, -1) ? 'Yest.' : formatDayKey(d).split(' ')[0]}
              </Text>
              <Text style={[styles.dayNumber, on && styles.dayTextOn]}>{Number(d.slice(8))}</Text>
              <Text style={[styles.dayCount, on && styles.dayTextOn]}>{count ? `${count} booked` : '—'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={employeeStyles.sectionLabel}>
        {formatDayKey(day, true)} · {list.length} appointment{list.length === 1 ? '' : 's'}
      </Text>
      {list.length === 0 ? (
        <Card style={styles.card}>
          <Text style={styles.muted}>No appointments this day.</Text>
        </Card>
      ) : (
        list.map((b) => <AppointmentCard key={b.id} booking={b} timeZone={timeZone} />)
      )}

      {settings && (
        <>
          <Text style={employeeStyles.sectionLabel}>My booking link</Text>
          <Card style={styles.card}>
            <Text style={styles.muted}>
              Share this so customers can book you directly. It opens the booking page with you already picked.
            </Text>
            <ShareLinkBox link={bookingLink(settings.slug, me.id)} shareText={`Book with ${me.name} at ${businessName}`} />
          </Card>
        </>
      )}

      <Pressable onPress={() => router.push('/bookings/booking-hours')} accessibilityRole="link" style={styles.hoursLink} hitSlop={6}>
        <Icon name={Icons.chevron} color={C.primary} size={12} />
        <Text style={styles.link}>My days off</Text>
      </Pressable>
    </View>
  );
}

function AppointmentCard({ booking: b, timeZone }: { booking: Booking; timeZone: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = new Date(b.startsAt) <= new Date();
  const status = STATUS[b.status];

  async function mark(next: 'completed' | 'no_show' | 'confirmed') {
    setBusy(true);
    setError(null);
    const problem = await markMyBooking(b.id, next);
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <Card style={[styles.card, b.status === 'cancelled' && styles.faded]}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text style={styles.time}>
            {formatTimeIn(b.startsAt, timeZone)} – {formatTimeIn(b.endsAt, timeZone)}
          </Text>
          <Text style={styles.name}>{b.customerName}</Text>
        </View>
        {status && (
          <View style={[styles.badge, { backgroundColor: status.background }]}>
            <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
          </View>
        )}
      </View>
      <Text style={styles.detail}>
        {b.serviceName} · {formatDuration(b.durationMinutes)}
        {b.price !== null ? ` · ${formatPrice(b.price)}` : ''}
      </Text>
      {b.notes ? <Text style={styles.notes}>Notes: {b.notes}</Text> : null}
      {b.status === 'confirmed' &&
        (started ? (
          <View style={styles.buttons}>
            <Pressable
              onPress={() => mark('completed')}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, styles.done, pressed && styles.pressed]}>
              <Text style={styles.doneText}>Completed</Text>
            </Pressable>
            <Pressable
              onPress={() => mark('no_show')}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, styles.noShow, pressed && styles.pressed]}>
              <Text style={styles.noShowText}>No-show</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.muted}>You can mark it Completed or No-show once it starts.</Text>
        ))}
      {(b.status === 'completed' || b.status === 'no_show') && (
        <Pressable onPress={() => mark('confirmed')} disabled={busy} accessibilityRole="button" hitSlop={6}>
          <Text style={styles.link}>Undo</Text>
        </Pressable>
      )}
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  card: { padding: Spacing.three },
  days: { gap: Spacing.two, paddingVertical: Spacing.one },
  day: {
    width: 72,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  dayOn: { backgroundColor: C.primary, borderColor: C.primary },
  dayName: { color: C.textSecondary, fontSize: 12, fontWeight: '600' },
  dayNumber: { color: C.text, fontSize: 20, fontWeight: '700' },
  dayCount: { color: C.textSecondary, fontSize: 11 },
  dayTextOn: { color: C.onPrimary },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  flex: { flex: 1 },
  time: { color: C.primary, fontSize: 14, fontWeight: '700' },
  name: { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 2 },
  detail: { color: C.text, fontSize: 15, marginTop: Spacing.one },
  notes: { color: C.textSecondary, fontSize: 14, marginTop: Spacing.one, lineHeight: 20 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill },
  badgeText: { fontSize: 12, fontWeight: '700' },
  buttons: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  button: { flex: 1, minHeight: 44, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center' },
  done: { backgroundColor: C.success },
  doneText: { color: C.onPrimary, fontSize: 15, fontWeight: '700' },
  noShow: { backgroundColor: C.dangerSoft, borderWidth: 1, borderColor: C.dangerBorder },
  noShowText: { color: C.danger, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  faded: { opacity: 0.6 },
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20, marginTop: Spacing.one },
  link: { color: C.primary, fontSize: 15, fontWeight: '600', marginTop: Spacing.two },
  hoursLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  error: { color: C.danger, fontSize: 14, fontWeight: '600', marginTop: Spacing.two },
});
