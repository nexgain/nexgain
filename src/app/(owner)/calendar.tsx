import { useCallback, useState } from 'react';
import { Redirect, router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EventEditor } from '@/components/owner/event-editor';
import { EventRow } from '@/components/owner/jobs-ui';
import { Button, Card, Icon, OwnerScreen, PageHeader, TabRow } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { WEEKDAY_NAMES } from '@/data/availability';
import { useBusiness } from '@/data/business';
import { addDaysKey, todayKey } from '@/data/business-time';
import { EVENT_TYPE_INFO, EVENT_TYPES, useCalendarEvents, type CalendarEvent, type EventDraft } from '@/data/calendar';
import { useClients } from '@/data/clients';
import { useCurrentEmployee } from '@/data/current-employee';
import { formatShortDate, formatWeekday } from '@/data/employee-roster';
import { useJobs, type Job } from '@/data/jobs';
import { fromDateKey } from '@/data/shifts';

const VIEWS = ['Month', 'Week', 'Day'] as const;
type View_ = (typeof VIEWS)[number];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Monday of the week containing `key`. */
function weekStart(key: string) {
  return addDaysKey(key, -((fromDateKey(key).getDay() + 6) % 7));
}

function monthStart(key: string) {
  return `${key.slice(0, 7)}-01`;
}

function addMonths(key: string, n: number) {
  const d = fromDateKey(monthStart(key));
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function dayLabel(key: string) {
  const d = fromDateKey(key);
  return `${formatWeekday(d)} ${formatShortDate(d)}`;
}

// The owner's calendar: jobs, material deliveries and other reminders. Owner only.
export default function CalendarScreen() {
  const me = useCurrentEmployee();
  const business = useBusiness();
  const events = useCalendarEvents();
  const jobs = useJobs();
  const clients = useClients();
  const today = todayKey();
  const [view, setView] = useState<View_>('Month');
  const [selected, setSelected] = useState(today);
  const [draft, setDraft] = useState<EventDraft | null>(null);

  // Opened from a job's delivery list: open that event.
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ event?: string }>();
  const [openedParam, setOpenedParam] = useState<string | null>(null);
  if (params.event && params.event !== openedParam) {
    setOpenedParam(params.event);
    const e = events.find((x) => x.id === params.event);
    if (e && e.type !== 'job') {
      setSelected(e.date);
      setDraft(draftFrom(e));
    }
  } else if (!params.event && openedParam !== null) {
    setOpenedParam(null);
  }
  useFocusEffect(useCallback(() => () => navigation.setParams({ event: undefined } as never), [navigation]));

  if (me) return <Redirect href="/home" />;

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? '';
  const jobLabel = (job: Job) => [clientName(job.clientId), job.title].filter(Boolean).join(' · ');
  const on = (key: string) => events.filter((e) => e.date === key);

  function open(e: CalendarEvent) {
    if (e.type === 'job' && e.jobId) router.push({ pathname: '/job/[id]', params: { id: e.jobId } });
    else setDraft(draftFrom(e));
  }

  function addNew() {
    setDraft({
      type: 'delivery',
      title: '',
      date: selected,
      start: '08:00',
      end: '09:00',
      jobId: null,
      address: '',
      notes: '',
      supplier: '',
      deliveryItems: '',
    });
  }

  function subtitle(e: CalendarEvent) {
    if (e.type === 'job') return clientName(e.clientId) || e.address;
    if (e.type === 'delivery') return e.supplier || e.address;
    return e.address;
  }

  const step = (dir: 1 | -1) =>
    setSelected((s) => (view === 'Month' ? addMonths(s, dir) : addDaysKey(s, view === 'Week' ? 7 * dir : dir)));

  const rangeLabel =
    view === 'Month'
      ? `${MONTH_NAMES[fromDateKey(selected).getMonth()]} ${selected.slice(0, 4)}`
      : view === 'Week'
        ? `${formatShortDate(fromDateKey(weekStart(selected)), false)} – ${formatShortDate(fromDateKey(addDaysKey(weekStart(selected), 6)))}`
        : dayLabel(selected);

  const upcoming = events
    .filter((e) => e.type !== 'other' && e.endsAt >= new Date().toISOString() && e.status !== 'completed' && e.status !== 'cancelled')
    .slice(0, 6);

  const dayList = (key: string, emptyText = 'Nothing booked.') => {
    const items = on(key);
    return items.length === 0 ? (
      <Text style={styles.muted}>{emptyText}</Text>
    ) : (
      items.map((e, i) => <EventRow key={e.id} event={e} subtitle={subtitle(e)} showDivider={i > 0} onPress={() => open(e)} />)
    );
  };

  return (
    <OwnerScreen>
      <PageHeader
        title="Calendar"
        subtitle="Jobs, deliveries and reminders in one place."
        right={<Button label="Add Event" icon={{ ios: 'plus', android: 'add', web: 'add' }} onPress={addNew} />}
      />

      <View style={styles.controls}>
        <TabRow tabs={VIEWS} active={view} onChange={setView} />
        <View style={styles.rangeNav}>
          <NavArrow direction={-1} onPress={() => step(-1)} />
          <Pressable onPress={() => setSelected(today)} accessibilityRole="button" accessibilityLabel="Go to today" style={styles.flex}>
            <Text style={styles.rangeLabel}>{rangeLabel}</Text>
          </Pressable>
          <NavArrow direction={1} onPress={() => step(1)} />
        </View>
        <View style={styles.legend}>
          {EVENT_TYPES.map((t) => (
            <View key={t} style={styles.legendItem}>
              <Icon name={EVENT_TYPE_INFO[t].icon} color={EVENT_TYPE_INFO[t].color} size={13} />
              <Text style={styles.legendText}>{EVENT_TYPE_INFO[t].label}</Text>
            </View>
          ))}
          <View style={styles.legendItem}>
            <Icon name={{ ios: 'checkmark', android: 'check', web: 'check' }} color={C.textSecondary} size={13} />
            <Text style={styles.legendText}>Completed</Text>
          </View>
        </View>
      </View>

      {view === 'Month' && (
        <>
          <MonthGrid selected={selected} today={today} events={events} onSelect={setSelected} />
          <Card title={dayLabel(selected)}>{dayList(selected, 'Nothing booked on this day. Tap "Add Event" to add a delivery or reminder.')}</Card>
        </>
      )}

      {view === 'Week' &&
        Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart(selected), i)).map((key) => (
          <Card key={key} title={`${dayLabel(key)}${key === today ? ' · Today' : ''}`}>
            {dayList(key)}
          </Card>
        ))}

      {view === 'Day' && <Card title={`${dayLabel(selected)}${selected === today ? ' · Today' : ''}`}>{dayList(selected)}</Card>}

      <Card title="Upcoming" icon={{ ios: 'clock.fill', android: 'schedule', web: 'schedule' }}>
        {upcoming.length === 0 ? (
          <Text style={styles.muted}>No upcoming jobs or deliveries.</Text>
        ) : (
          upcoming.map((e, i) => (
            <EventRow key={e.id} event={e} subtitle={subtitle(e)} showDate showDivider={i > 0} onPress={() => open(e)} />
          ))
        )}
      </Card>

      {draft && business?.id && (
        <EventEditor draft={draft} jobs={jobs} jobLabel={jobLabel} businessId={business.id} onClose={() => setDraft(null)} />
      )}
    </OwnerScreen>
  );
}

function draftFrom(e: CalendarEvent): EventDraft {
  return {
    id: e.id,
    type: e.type === 'other' ? 'other' : 'delivery',
    title: e.title,
    date: e.date,
    start: e.start,
    end: e.end,
    jobId: e.jobId,
    address: e.address,
    notes: e.notes,
    supplier: e.supplier,
    deliveryItems: e.deliveryItems,
  };
}

function NavArrow({ direction, onPress }: { direction: 1 | -1; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={direction === 1 ? 'Next' : 'Previous'}
      hitSlop={6}
      style={({ pressed }) => [styles.navArrow, pressed && styles.pressed]}>
      <Icon
        name={
          direction === 1
            ? { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
            : { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }
        }
        color={C.text}
        size={14}
      />
    </Pressable>
  );
}

function MonthGrid({
  selected,
  today,
  events,
  onSelect,
}: {
  selected: string;
  today: string;
  events: CalendarEvent[];
  onSelect: (key: string) => void;
}) {
  const first = monthStart(selected);
  const gridStart = weekStart(first);
  const month = first.slice(0, 7);
  const cells = Array.from({ length: 42 }, (_, i) => addDaysKey(gridStart, i));
  const weeks = Array.from({ length: 6 }, (_, w) => cells.slice(w * 7, w * 7 + 7)).filter((week) =>
    week.some((k) => k.startsWith(month)),
  );

  return (
    <Card>
      <View style={styles.monthRow}>
        {WEEKDAY_NAMES.map((name) => (
          <Text key={name} style={[styles.monthHeader, styles.flex]}>
            {name.slice(0, 1)}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]} style={styles.monthRow}>
          {week.map((key) => {
            const dayEvents = events.filter((e) => e.date === key);
            const inMonth = key.startsWith(month);
            const isSelected = key === selected;
            return (
              <Pressable
                key={key}
                onPress={() => onSelect(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${dayLabel(key)}, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
                style={({ pressed }) => [
                  styles.monthCell,
                  key === today && styles.monthToday,
                  isSelected && styles.monthSelected,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.monthDay, !inMonth && styles.monthDayOut, isSelected && styles.monthDaySelected]}>
                  {Number(key.slice(8))}
                </Text>
                <View style={styles.dots}>
                  {dayEvents.slice(0, 3).map((e) => {
                    const done = e.type === 'job' && (e.status === 'completed' || e.status === 'cancelled');
                    return <View key={e.id} style={[styles.dot, { backgroundColor: done ? C.textSecondary : EVENT_TYPE_INFO[e.type].color }]} />;
                  })}
                  {dayEvents.length > 3 && <Text style={styles.more}>+</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </Card>
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
  pressed: {
    opacity: 0.7,
  },
  controls: {
    gap: Spacing.three - 4,
  },
  rangeNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  rangeLabel: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  navArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceRaised,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendText: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  monthRow: {
    flexDirection: 'row',
    gap: 4,
  },
  monthHeader: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  monthCell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: Radius.medium - 4,
    backgroundColor: C.surfaceRaised,
  },
  monthToday: {
    borderWidth: 1.5,
    borderColor: C.accent,
  },
  monthSelected: {
    backgroundColor: C.accent,
  },
  monthDay: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  monthDayOut: {
    color: C.border,
  },
  monthDaySelected: {
    color: '#FFFFFF',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  more: {
    color: C.textSecondary,
    fontSize: 9,
    fontWeight: '700',
  },
});
