import { useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

import { Card, EmployeeScreen, employeeStyles, Icon, Icons } from '@/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Radius, Spacing } from '@/constants/theme';
import {
  dateKey,
  formatShiftTime,
  formatWeekRange,
  formatWeekday,
  getRosterWeek,
  isSameDay,
  type RosterDay,
} from '@/data/employee-roster';
import { currentEmployee } from '@/data/current-employee';
import { useShifts } from '@/data/shifts';

const WEEKS = [
  { label: 'This Week', offset: 0 },
  { label: 'Next Week', offset: 1 },
] as const;

export default function RosterScreen() {
  const today = new Date();
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<number[]>([0, 0]);
  const toggleHeight = useRef(0);
  const [activeWeek, setActiveWeek] = useState(0);
  const shiftSource = { shifts: useShifts(), employeeId: currentEmployee?.id ?? null };

  // The toggle stays pinned at the top, so scroll each section to just below it.
  function selectWeek(index: number) {
    setActiveWeek(index);
    const y = sectionY.current[index] - toggleHeight.current - Spacing.two;
    scrollRef.current?.scrollTo({ y: index === 0 ? 0 : Math.max(0, y), animated: true });
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const reachedNextWeek =
      contentOffset.y + toggleHeight.current + Spacing.five >= sectionY.current[1];
    const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 4;
    const next = reachedNextWeek || atBottom ? 1 : 0;
    if (next !== activeWeek) setActiveWeek(next);
  }

  return (
    <EmployeeScreen
      title="Roster"
      scrollRef={scrollRef}
      onScroll={onScroll}
      stickyHeaderIndices={[1]}>
      <View
        style={styles.toggleBar}
        onLayout={(e) => {
          toggleHeight.current = e.nativeEvent.layout.height;
        }}>
        <View style={styles.segmented}>
          {WEEKS.map((week, i) => (
            <Pressable
              key={week.label}
              onPress={() => selectWeek(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeWeek === i }}
              style={[styles.segment, activeWeek === i && styles.segmentActive]}>
              <Text style={[styles.segmentText, activeWeek === i && styles.segmentTextActive]}>
                {week.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {WEEKS.map((week, i) => {
        const days = getRosterWeek(week.offset, today, shiftSource);
        return (
          <View
            key={week.label}
            style={styles.section}
            onLayout={(e) => {
              sectionY.current[i] = e.nativeEvent.layout.y;
            }}>
            <Text style={employeeStyles.sectionLabel}>
              {week.label} · {formatWeekRange(days)}
            </Text>
            <Card>
              {days.map((day, index) => (
                <RosterRow
                  key={dateKey(day.date)}
                  day={day}
                  isToday={isSameDay(day.date, today)}
                  showDivider={index > 0}
                />
              ))}
            </Card>
          </View>
        );
      })}
    </EmployeeScreen>
  );
}

function RosterRow({
  day,
  isToday,
  showDivider,
}: {
  day: RosterDay;
  isToday: boolean;
  showDivider: boolean;
}) {
  const { shift } = day;
  return (
    <Pressable
      disabled={!shift}
      onPress={() =>
        router.push({ pathname: '/job-details', params: { date: dateKey(day.date) } })
      }
      accessibilityRole={shift ? 'button' : undefined}
      style={({ pressed }) => [styles.row, showDivider && styles.rowDivider, pressed && styles.pressed]}>
      <View style={[styles.dateBlock, isToday && styles.dateBlockToday]}>
        <Text style={[styles.weekday, isToday && styles.todayText]}>{formatWeekday(day.date)}</Text>
        <Text style={[styles.dayNumber, isToday && styles.todayText]}>{day.date.getDate()}</Text>
      </View>

      <View style={styles.rowText}>
        {shift ? (
          <>
            <Text style={styles.shiftTime}>{formatShiftTime(shift)}</Text>
            <Text style={styles.shiftMeta}>
              {shift.role} · {shift.location}
            </Text>
          </>
        ) : (
          <Text style={styles.off}>Day off</Text>
        )}
      </View>

      <Icon name={Icons.chevron} color={C.textMuted} size={14} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggleBar: {
    backgroundColor: C.background,
    paddingVertical: Spacing.two,
    marginVertical: -Spacing.two,
  },
  segmented: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.medium,
    backgroundColor: '#E8ECF2',
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium - 4,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: C.card,
    boxShadow: '0px 1px 3px rgba(15, 23, 42, 0.12)',
  },
  segmentText: {
    color: C.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: C.primary,
  },
  section: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.three - 4,
    paddingHorizontal: Spacing.three,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  pressed: {
    opacity: 0.6,
  },
  dateBlock: {
    width: 48,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.medium - 2,
    alignItems: 'center',
    backgroundColor: C.background,
  },
  dateBlockToday: {
    backgroundColor: C.primary,
  },
  weekday: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  dayNumber: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
  },
  todayText: {
    color: '#FFFFFF',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  shiftTime: {
    color: C.text,
    fontSize: 16,
    fontWeight: '600',
  },
  shiftMeta: {
    color: C.textSecondary,
    fontSize: 13,
  },
  off: {
    color: C.textMuted,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
