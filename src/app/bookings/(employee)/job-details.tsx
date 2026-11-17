// NexGain Bookings: a staff member's shift for one day. Booking businesses have
// no jobs, addresses, tasks or job reports: it's the time they're rostered on
// (when customers can book them), the owner's notes, and their bookings that day.
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, employeeStyles, IconBadge, Icons } from '@/systems/bookings/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Spacing } from '@/constants/theme';
import { dateKey, formatShiftTime, getShiftForDate, shiftDurationMs } from '@/data/employee-roster';
import { useCurrentEmployee } from '@/data/current-employee';
import { useShifts } from '@/data/shifts';
import { useDesktopPageStyle } from '@/hooks/use-desktop';
import { bookingWords, plural, titleCase } from '@/systems/bookings/constants/booking-business-types';
import { formatDuration, formatTimeIn } from '@/systems/bookings/data/booking-time';
import {
  bookingsOnDay,
  myStaff,
  useBookings,
  useBookingSettings,
  useBookingStaff,
  useBusinessTimeZone,
} from '@/systems/bookings/data/bookings';

export default function ShiftDetailsScreen() {
  const desktopPage = useDesktopPageStyle('form');
  const currentEmployee = useCurrentEmployee();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const shifts = useShifts();
  const shiftDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : dateKey(new Date());
  const day = getShiftForDate(shiftDate, new Date(), { shifts, employeeId: currentEmployee?.id ?? null });
  const shift = day?.shift ?? null;
  // The owner's notes for this roster entry.
  const notes =
    shifts
      .filter((s) => s.date === shiftDate && currentEmployee && s.employeeIds.includes(currentEmployee.id))
      .map((s) => s.notes.trim())
      .filter(Boolean)
      .join('\n') || null;

  const timeZone = useBusinessTimeZone();
  const words = bookingWords(useBookingSettings()?.businessTypes);
  const me = myStaff(useBookingStaff(), currentEmployee?.id);
  const myBookings = bookingsOnDay(
    useBookings().filter((b) => b.staffId === me?.id),
    shiftDate,
    timeZone,
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, desktopPage]}>
      <Card style={styles.infoCard}>
        <Text style={styles.date}>
          {(day?.date ?? new Date()).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <Text style={styles.title}>{shift ? 'Rostered on' : 'Not rostered on'}</Text>

        <View style={styles.detailRow}>
          <IconBadge name={Icons.clock} />
          <View style={styles.flex}>
            <Text style={styles.detailLabel}>Time</Text>
            <Text style={styles.detailValue}>
              {shift ? `${formatShiftTime(shift)} · ${shiftDurationMs(shift) / 3_600_000}h` : '—'}
            </Text>
          </View>
        </View>
        <Text style={styles.muted}>
          {shift
            ? `Customers can book you between these times. A ${words.booking} can’t run past the end time.`
            : 'Customers can’t book you this day.'}
        </Text>
      </Card>

      {notes && (
        <>
          <Text style={[employeeStyles.sectionLabel, styles.sectionGap]}>Notes</Text>
          <Card style={styles.infoCard}>
            <Text style={styles.notes}>{notes}</Text>
          </Card>
        </>
      )}

      <Text style={[employeeStyles.sectionLabel, styles.sectionGap]}>
        Your {plural(words.booking)} ({myBookings.length})
      </Text>
      <Card style={styles.infoCard}>
        {myBookings.length === 0 ? (
          <Text style={styles.muted}>No {plural(words.booking)} booked yet.</Text>
        ) : (
          myBookings.map((b, i) => (
            <View key={b.id} style={[styles.bookingRow, i > 0 && styles.divider]}>
              <Text style={styles.bookingTime}>
                {formatTimeIn(b.startsAt, timeZone)} – {formatTimeIn(b.endsAt, timeZone)}
              </Text>
              <View style={styles.flex}>
                <Text style={styles.detailValue}>{b.customerName}</Text>
                <Text style={styles.muted}>
                  {b.serviceName} · {formatDuration(b.durationMinutes)}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>
      <Text style={styles.footnote}>{titleCase(words.customer)}s book you on your business’s booking link.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { padding: Spacing.four - 4, gap: Spacing.three },
  flex: { flex: 1 },
  infoCard: { padding: Spacing.three, gap: Spacing.three - 4 },
  date: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
  title: { color: C.text, fontSize: 24, fontWeight: '700', marginTop: -Spacing.two },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4 },
  detailLabel: { color: C.textSecondary, fontSize: 12 },
  detailValue: { color: C.text, fontSize: 15, fontWeight: '600' },
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },
  notes: { color: C.text, fontSize: 15, lineHeight: 22 },
  sectionGap: { marginTop: Spacing.two },
  bookingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, paddingVertical: Spacing.two },
  bookingTime: { color: C.text, fontSize: 14, fontWeight: '700', width: 132, fontVariant: ['tabular-nums'] },
  divider: { borderTopWidth: 1, borderTopColor: C.border },
  footnote: { color: C.textMuted, fontSize: 13, textAlign: 'center' },
});
