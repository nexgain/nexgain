import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Avatar,
  Card,
  EmployeeScreen,
  employeeStyles,
  Icon,
  IconBadge,
  Icons,
} from '@/components/employee/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Radius, Spacing } from '@/constants/theme';
import {
  dateKey,
  formatShiftTime,
  formatShortDate,
  formatWeekday,
  getNextShift,
  getShiftForDate,
} from '@/data/employee-roster';
import { clockIn, clockOut, useClockSessions } from '@/data/clock-records';
import { employeeInitials, useCurrentEmployee } from '@/data/current-employee';
import { getPayPeriods, hoursInPeriod } from '@/data/payroll';
import { useShifts } from '@/data/shifts';

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

function formatClockTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatHours(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const currentEmployee = useCurrentEmployee();
  const now = useNow();
  // Clock records live in the shared store so Owner Payroll reads the same data.
  // They're in memory only for now and reset when the app restarts.
  const employeeId = currentEmployee?.id ?? null;
  const allSessions = useClockSessions();
  const sessions = allSessions.filter((s) => s.employeeId === employeeId);

  const isClockedIn = sessions.at(-1)?.end === null;

  // Today only (from midnight): sessions that started today, or are still running
  // from last night. Older days stay in payroll and timesheets but aren't shown here.
  const today = { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end: now };
  const todaysSessions = sessions.filter((s) => (s.end ?? now) > today.start);
  // Time worked today; a shift that started before midnight only counts from midnight.
  const workedMs = hoursInPeriod(sessions, employeeId, today, now) * 60 * 60 * 1000;

  function toggleClock() {
    const time = new Date();
    if (isClockedIn) {
      clockOut(employeeId, time);
    } else {
      clockIn(employeeId, time);
    }
  }

  const currentSession = isClockedIn ? sessions.at(-1) : undefined;
  const lastSession = sessions.at(-1);
  const shiftSource = { shifts: useShifts(), employeeId };
  const todaysShift = getShiftForDate(dateKey(now), now, shiftSource)?.shift ?? null;
  const nextShift = getNextShift(now, shiftSource);
  const thisWeek = getPayPeriods(now, 1)[0];
  const weekMs = hoursInPeriod(allSessions, employeeId, thisWeek, now) * 60 * 60 * 1000;

  return (
    <EmployeeScreen>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>
            {greetingFor(now)}
            {currentEmployee ? `, ${currentEmployee.firstName}` : ''}
          </Text>
          <Text style={styles.date}>
            {now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
            {formatClockTime(now)}
          </Text>
        </View>
        <Pressable onPress={() => router.navigate('/more')} accessibilityLabel="Open profile">
          <Avatar initials={employeeInitials(currentEmployee)} size={44} />
        </Pressable>
      </View>

      {/* Today's shift */}
      <Pressable
        onPress={() =>
          router.push({ pathname: '/job-details', params: { date: dateKey(now) } })
        }
        accessibilityRole="button"
        style={({ pressed }) => pressed && styles.pressed}>
        <Card style={styles.shiftCard}>
          <IconBadge name={Icons.work} />
          <View style={styles.flex}>
            <Text style={styles.cardLabel}>Today&apos;s shift</Text>
            <Text style={styles.shiftTime}>
              {todaysShift ? formatShiftTime(todaysShift) : 'No shift scheduled'}
            </Text>
            {todaysShift && (
              <Text style={styles.shiftMeta}>
                {todaysShift.role} · {todaysShift.location}
              </Text>
            )}
          </View>
          <Icon name={Icons.chevron} color={C.textMuted} size={14} />
        </Card>
      </Pressable>

      {/* Clock in / clock out */}
      <Card style={styles.clockCard}>
        <View style={[styles.statusPill, isClockedIn && styles.statusPillActive]}>
          <View style={[styles.statusDot, isClockedIn && styles.statusDotActive]} />
          <Text style={[styles.statusText, isClockedIn && styles.statusTextActive]}>
            {isClockedIn ? 'Currently working' : 'Not clocked in'}
          </Text>
        </View>

        <Text style={[styles.timer, !isClockedIn && styles.timerIdle]}>
          {formatDuration(currentSession ? now.getTime() - currentSession.start.getTime() : 0)}
        </Text>

        <Text style={styles.clockMeta}>
          {currentSession
            ? `Started at ${formatClockTime(currentSession.start)}${currentEmployee ? ` · ${currentEmployee.site}` : ''}`
            : lastSession?.end
              ? `Last clocked out at ${formatClockTime(lastSession.end)}`
              : 'Tap Clock In when your shift starts'}
        </Text>

        <Pressable
          onPress={toggleClock}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.clockButton,
            isClockedIn ? styles.clockOutButton : styles.clockInButton,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.clockButtonText}>{isClockedIn ? 'Clock Out' : 'Clock In'}</Text>
        </Pressable>
      </Card>

      {/* Hours */}
      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Text style={styles.cardLabel}>Today&apos;s hours</Text>
          <Text style={styles.statValue}>{formatHours(workedMs)}</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.cardLabel}>This week&apos;s hours</Text>
          <Text style={styles.statValue}>{formatHours(weekMs)}</Text>
        </Card>
      </View>

      {/* Next shift */}
      <Card style={styles.shiftCard}>
        <IconBadge name={Icons.calendar} />
        <View style={styles.flex}>
          <Text style={styles.cardLabel}>Next shift</Text>
          {nextShift?.shift ? (
            <>
              <Text style={styles.shiftTime}>
                {formatWeekday(nextShift.date)} {formatShortDate(nextShift.date, false)}
              </Text>
              <Text style={styles.shiftMeta}>
                {formatShiftTime(nextShift.shift)} · {nextShift.shift.role}
              </Text>
            </>
          ) : (
            <Text style={styles.shiftTime}>No shift scheduled</Text>
          )}
        </View>
      </Card>

      {/* Today's clock-in history */}
      {todaysSessions.length > 0 && (
        <Card style={styles.activityCard}>
          <Text style={employeeStyles.sectionLabel}>Today&apos;s activity</Text>
          {todaysSessions.map((s, i) => (
            <View key={i} style={styles.sessionRow}>
              <Text style={styles.sessionText}>
                {formatClockTime(s.start)} – {s.end ? formatClockTime(s.end) : 'now'}
              </Text>
              <Text style={styles.sessionDuration}>
                {formatDuration((s.end ?? now).getTime() - s.start.getTime())}
              </Text>
            </View>
          ))}
        </Card>
      )}
    </EmployeeScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
  },
  headerText: {
    flex: 1,
  },
  greeting: {
    color: C.text,
    fontSize: 26,
    fontWeight: '700',
  },
  date: {
    color: C.textSecondary,
    fontSize: 15,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  cardLabel: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  shiftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three,
  },
  shiftTime: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  shiftMeta: {
    color: C.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  clockCard: {
    alignItems: 'center',
    padding: Spacing.four - 4,
    gap: Spacing.two,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: 999,
    backgroundColor: C.background,
  },
  statusPillActive: {
    backgroundColor: C.successSoft,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.textMuted,
  },
  statusDotActive: {
    backgroundColor: C.success,
  },
  statusText: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  statusTextActive: {
    color: C.success,
  },
  timer: {
    color: C.text,
    fontSize: 44,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: Spacing.one,
  },
  timerIdle: {
    color: C.textMuted,
  },
  clockMeta: {
    color: C.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  clockButton: {
    alignSelf: 'stretch',
    marginTop: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Radius.medium,
    alignItems: 'center',
  },
  clockInButton: {
    backgroundColor: C.primary,
  },
  clockOutButton: {
    backgroundColor: C.danger,
  },
  clockButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
  },
  statCard: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  statValue: {
    color: C.text,
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  activityCard: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sessionText: {
    color: C.text,
    fontSize: 15,
  },
  sessionDuration: {
    color: C.textSecondary,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
});
