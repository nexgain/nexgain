import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, OwnerIcons } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatTimeIn, todayIn } from '@/systems/bookings/data/booking-time';
import { bookingsOnDay, formatPrice, useBookings, useBookingStaff, useBusinessTimeZone } from '@/systems/bookings/data/bookings';

/** Dashboard (NexGain Bookings): today's appointments, earliest first. */
export function TodayBookings() {
  const timeZone = useBusinessTimeZone();
  const staff = useBookingStaff();
  const today = bookingsOnDay(useBookings(), todayIn(timeZone), timeZone);
  const now = new Date();
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? '';
  const value = today.filter((b) => b.status !== 'no_show').reduce((s, b) => s + (b.price ?? 0), 0);

  return (
    <Card
      title={`Today’s Bookings (${today.length})`}
      icon={OwnerIcons.calendar}
      right={
        <Pressable onPress={() => router.navigate('/bookings/calendar')} accessibilityRole="link" hitSlop={8}>
          <Text style={styles.link}>See all</Text>
        </Pressable>
      }>
      {today.length === 0 ? (
        <EmptyState icon={OwnerIcons.calendar} message="No bookings today. Share your booking link to fill your diary." />
      ) : (
        <>
          {today.slice(0, 8).map((b, i) => {
            const done = new Date(b.endsAt) <= now || b.status !== 'confirmed';
            return (
              <Pressable
                key={b.id}
                onPress={() => router.push({ pathname: '/bookings/booking/[id]', params: { id: b.id } })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}>
                <Text style={[styles.time, done && styles.faded]}>{formatTimeIn(b.startsAt, timeZone)}</Text>
                <View style={styles.flex}>
                  <Text style={[styles.name, done && styles.faded]} numberOfLines={1}>
                    {b.customerName}
                  </Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {[b.serviceName, nameOf(b.staffId), b.status === 'no_show' ? 'No-show' : b.status === 'completed' ? 'Completed' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {today.length > 8 && <Text style={styles.muted}>And {today.length - 8} more.</Text>}
          {value > 0 && <Text style={styles.muted}>Booked value today: {formatPrice(value)}</Text>}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  link: { color: C.accent, fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  pressed: { opacity: 0.6 },
  time: { width: 72, color: C.text, fontSize: 14, fontWeight: '700' },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  faded: { color: C.textSecondary },
  muted: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  flex: { flex: 1 },
});
