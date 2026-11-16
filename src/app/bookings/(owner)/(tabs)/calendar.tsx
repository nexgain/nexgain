import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Segmented } from '@/systems/bookings/components/owner/invoices-ui';
import { Button, Card, EmptyState, Icon, OwnerIcons, OwnerScreen, PageHeader } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import {
  blockPosition,
  bookingSpan,
  dayWindow,
  HOUR_HEIGHT,
  timeAtY,
  timeOffSpans,
  weekDays,
} from '@/systems/bookings/data/booking-calendar';
import {
  addDays,
  format12h,
  formatDayKey,
  formatTimeIn,
  minutesOf,
  timeOfMinutes,
  todayIn,
  weekdayOf,
  zonedParts,
} from '@/systems/bookings/data/booking-time';
import {
  bookingsOnDay,
  formatPrice,
  useBookings,
  useBookingSettings,
  useBookingsLoad,
  useBookingStaff,
  useBusinessTimeZone,
  useTimeOff,
  type Booking,
  type BookingStaff,
} from '@/systems/bookings/data/bookings';

type CalendarView = 'day' | 'week';
const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
] as const;
const COLUMN_WIDTH = 150;
const GUTTER = 52;

const STATUS_STYLE: Record<Booking['status'], { background: string; border: string; label: string | null }> = {
  confirmed: { background: C.accentSoft, border: C.accent, label: null },
  completed: { background: C.successSoft, border: C.success, label: 'Completed' },
  no_show: { background: C.dangerSoft, border: C.danger, label: 'No-show' },
  cancelled: { background: C.neutralSoft, border: C.neutral, label: 'Cancelled' },
};

const openBooking = (id: string) => router.push({ pathname: '/bookings/booking/[id]', params: { id } });
const addBooking = (params: { date: string; staff?: string; time?: string }) =>
  router.push({ pathname: '/bookings/booking/[id]', params: { id: 'new', ...params } });

// Bookings tab (NexGain Bookings): every staff member's bookings by day or
// week. Tap a booking to see, move or cancel it; tap an empty spot (or "Add")
// to book a walk-in or phone booking by hand.
export default function BookingsCalendarScreen() {
  const timeZone = useBusinessTimeZone();
  const today = todayIn(timeZone);
  const [view, setView] = useState<CalendarView>('day');
  const [day, setDay] = useState(today);
  const [only, setOnly] = useState<string | null>(null);
  const bookings = useBookings();
  const settings = useBookingSettings();
  const load = useBookingsLoad();
  const staff = useBookingStaff();
  const timeOff = useTimeOff();

  // Active staff, plus anyone (e.g. who has since left) with a booking showing.
  const shown = staff.filter((s) => s.active || bookings.some((b) => b.staffId === s.id && b.status !== 'cancelled'));
  const columns = only ? shown.filter((s) => s.id === only) : shown;
  const step = view === 'day' ? 1 : 7;
  const label =
    view === 'day'
      ? `${day === today ? 'Today, ' : ''}${formatDayKey(day, true)}`
      : `${formatDayKey(weekDays(day)[0])} – ${formatDayKey(weekDays(day)[6])}`;

  return (
    <OwnerScreen>
      <PageHeader
        title="Bookings"
        subtitle="Everyone’s appointments. Online bookings appear here straight away."
        right={<Button label="Add" icon={OwnerIcons.plus} onPress={() => addBooking({ date: day, staff: only ?? undefined })} />}
      />

      <Segmented options={VIEWS} value={view} onChange={setView} />

      <View style={styles.nav}>
        <Pressable onPress={() => setDay(addDays(day, -step))} accessibilityRole="button" accessibilityLabel={`Previous ${view}`} hitSlop={8} style={styles.navButton}>
          <Icon name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} color={C.text} size={16} />
        </Pressable>
        <Pressable onPress={() => setDay(today)} accessibilityRole="button" accessibilityLabel="Go to today" style={styles.navLabel}>
          <Text style={styles.navText}>{label}</Text>
          {day !== today && <Text style={styles.todayLink}>Today</Text>}
        </Pressable>
        <Pressable onPress={() => setDay(addDays(day, step))} accessibilityRole="button" accessibilityLabel={`Next ${view}`} hitSlop={8} style={styles.navButton}>
          <Icon name={OwnerIcons.chevron} color={C.text} size={16} />
        </Pressable>
      </View>

      {shown.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {[{ id: null as string | null, name: 'Everyone' }, ...shown].map((s) => {
            const on = only === s.id;
            return (
              <Pressable
                key={s.id ?? 'all'}
                onPress={() => setOnly(s.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {load !== 'ready' && bookings.length === 0 ? (
        <Card>
          <Text style={styles.muted}>{load === 'error' ? 'Couldn’t load bookings. Check your internet connection.' : 'Loading bookings…'}</Text>
        </Card>
      ) : columns.length === 0 ? (
        <Card>
          <EmptyState icon={OwnerIcons.people} message="Nobody can be booked yet. Turn on staff in Bookings Settings." />
        </Card>
      ) : view === 'day' ? (
        <DayGrid
          day={day}
          today={today}
          timeZone={timeZone}
          columns={columns}
          bookings={bookings}
          openingDay={settings?.openingHours[weekdayOf(day)]}
          timeOff={timeOff}
        />
      ) : (
        <WeekList days={weekDays(day)} today={today} timeZone={timeZone} bookings={bookings.filter((b) => !only || b.staffId === only)} staff={staff} />
      )}
    </OwnerScreen>
  );
}

function DayGrid({
  day,
  today,
  timeZone,
  columns,
  bookings,
  openingDay,
  timeOff,
}: {
  day: string;
  today: string;
  timeZone: string;
  columns: BookingStaff[];
  bookings: Booking[];
  openingDay: { open: boolean; start: string; end: string } | undefined;
  timeOff: ReturnType<typeof useTimeOff>;
}) {
  const onDay = bookingsOnDay(bookings, day, timeZone).filter((b) => columns.some((c) => c.id === b.staffId));
  const window = dayWindow(openingDay, onDay.map((b) => bookingSpan(b, timeZone)));
  const hours = Array.from({ length: (window.end - window.start) / 60 }, (_, i) => window.start + i * 60);
  const height = ((window.end - window.start) / 60) * HOUR_HEIGHT;
  const now = zonedParts(new Date(), timeZone);
  const nowMinutes = minutesOf(now.time);

  return (
    <Card style={styles.gridCard}>
      {!openingDay?.open && <Text style={styles.closed}>You’re closed on {formatDayKey(day, true).split(' ')[0]}s. You can still add bookings by hand.</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={columns.length > 2}>
        <View>
          <View style={styles.headerRow}>
            <View style={{ width: GUTTER }} />
            {columns.map((s) => (
              <View key={s.id} style={[styles.columnHeader, { width: COLUMN_WIDTH }]}>
                <Text style={styles.columnName} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={styles.muted}>{onDay.filter((b) => b.staffId === s.id).length} booked</Text>
              </View>
            ))}
          </View>
          <View style={[styles.gridRow, { height }]}>
            <View style={{ width: GUTTER }}>
              {hours.map((h, i) => (
                <Text key={h} style={[styles.hourLabel, { top: i * HOUR_HEIGHT }]}>
                  {format12h(timeOfMinutes(h)).replace(':00', '')}
                </Text>
              ))}
            </View>
            {columns.map((s) => (
              <View key={s.id} style={[styles.column, { width: COLUMN_WIDTH, height }]}>
                {/* The empty space: tap to add a booking at that time (behind the bookings, not around them). */}
                <Pressable
                  onPress={(e) => addBooking({ date: day, staff: s.id, time: timeOfMinutes(timeAtY(e.nativeEvent.locationY, window)) })}
                  accessibilityRole="button"
                  accessibilityLabel={`Add a booking with ${s.name}`}
                  style={StyleSheet.absoluteFill}
                />
                {hours.map((h, i) => (
                  <View key={h} style={[styles.hourLine, { top: i * HOUR_HEIGHT }]} pointerEvents="none" />
                ))}
                {timeOffSpans(timeOff, s.id, day, timeZone).map((span, i) => {
                  const pos = blockPosition(span, window);
                  return <View key={`off-${i}`} style={[styles.timeOff, pos]} pointerEvents="none" />;
                })}
                {onDay
                  .filter((b) => b.staffId === s.id)
                  .map((b) => {
                    const pos = blockPosition(bookingSpan(b, timeZone), window);
                    const look = STATUS_STYLE[b.status];
                    return (
                      <Pressable
                        key={b.id}
                        onPress={() => openBooking(b.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${formatTimeIn(b.startsAt, timeZone)}, ${b.customerName}, ${b.serviceName}`}
                        style={[styles.block, pos, { backgroundColor: look.background, borderLeftColor: look.border }]}>
                        <Text style={styles.blockTime} numberOfLines={1}>
                          {formatTimeIn(b.startsAt, timeZone)}
                          {look.label ? ` · ${look.label}` : ''}
                        </Text>
                        {pos.height >= 34 && (
                          <Text style={styles.blockName} numberOfLines={1}>
                            {b.customerName}
                          </Text>
                        )}
                        {pos.height >= 50 && (
                          <Text style={styles.blockService} numberOfLines={1}>
                            {b.serviceName}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                {day === today && nowMinutes >= window.start && nowMinutes <= window.end && (
                  <View style={[styles.nowLine, { top: ((nowMinutes - window.start) / 60) * HOUR_HEIGHT }]} pointerEvents="none" />
                )}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <Text style={styles.muted}>Tap an empty spot to add a booking there. Grey = time off.</Text>
    </Card>
  );
}

function WeekList({
  days,
  today,
  timeZone,
  bookings,
  staff,
}: {
  days: string[];
  today: string;
  timeZone: string;
  bookings: Booking[];
  staff: BookingStaff[];
}) {
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? '';
  return (
    <>
      {days.map((d) => {
        const list = bookingsOnDay(bookings, d, timeZone);
        const takings = list.filter((b) => b.status !== 'no_show').reduce((sum, b) => sum + (b.price ?? 0), 0);
        return (
          <Card key={d}>
            <View style={styles.weekHeader}>
              <Text style={[styles.weekDay, d === today && { color: C.accent }]}>{d === today ? `Today, ${formatDayKey(d)}` : formatDayKey(d, true)}</Text>
              <Text style={styles.muted}>
                {list.length} booking{list.length === 1 ? '' : 's'}
              </Text>
            </View>
            {list.length === 0 ? (
              <Pressable onPress={() => addBooking({ date: d })} accessibilityRole="button" hitSlop={6}>
                <Text style={styles.addLink}>+ Add a booking</Text>
              </Pressable>
            ) : (
              list.map((b, i) => {
                const look = STATUS_STYLE[b.status];
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => openBooking(b.id)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.weekRow, i > 0 && styles.divider, pressed && styles.pressed]}>
                    <View style={[styles.dot, { backgroundColor: look.border }]} />
                    <Text style={styles.weekTime}>{formatTimeIn(b.startsAt, timeZone)}</Text>
                    <View style={styles.flex}>
                      <Text style={styles.columnName} numberOfLines={1}>
                        {b.customerName}
                      </Text>
                      <Text style={styles.muted} numberOfLines={1}>
                        {[b.serviceName, nameOf(b.staffId), look.label].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
            {takings > 0 && <Text style={styles.muted}>Booked value: {formatPrice(takings, { whole: takings % 1 === 0 })}</Text>}
          </Card>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  muted: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  navLabel: { flex: 1, alignItems: 'center' },
  navText: { color: C.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  todayLink: { color: C.accent, fontSize: 13, fontWeight: '600' },
  chips: { gap: Spacing.two, paddingVertical: Spacing.one },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.text, fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: C.onAccent },
  gridCard: { paddingHorizontal: Spacing.two },
  closed: { color: C.warning, fontSize: 14, fontWeight: '600' },
  headerRow: { flexDirection: 'row' },
  columnHeader: { paddingHorizontal: 6, paddingBottom: Spacing.two },
  columnName: { color: C.text, fontSize: 15, fontWeight: '600' },
  gridRow: { flexDirection: 'row' },
  hourLabel: { position: 'absolute', left: 0, color: C.textSecondary, fontSize: 11, marginTop: -7 },
  column: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: C.border },
  hourLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: C.border },
  timeOff: { position: 'absolute', left: 0, right: 0, backgroundColor: C.neutralSoft, opacity: 0.9 },
  block: {
    position: 'absolute',
    left: 3,
    right: 3,
    borderRadius: 6,
    borderLeftWidth: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  blockTime: { color: C.text, fontSize: 11, fontWeight: '700' },
  blockName: { color: C.text, fontSize: 13, fontWeight: '600' },
  blockService: { color: C.textSecondary, fontSize: 12 },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: C.danger },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekDay: { color: C.text, fontSize: 16, fontWeight: '700' },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  weekTime: { color: C.text, fontSize: 14, fontWeight: '700', width: 72 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  pressed: { opacity: 0.6 },
  flex: { flex: 1 },
  addLink: { color: C.accent, fontSize: 15, fontWeight: '600' },
});
