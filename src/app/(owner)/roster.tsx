import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formStyles } from '@/components/owner/form';
import { newShiftDraft, ShiftEditor, type ShiftDraft } from '@/components/owner/shift-editor';
import {
  ActionRow,
  Button,
  Card,
  EmptyState,
  Icon,
  OwnerIcons,
  OwnerScreen,
  PageHeader,
  ResponsiveRow,
  TabRow,
} from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { availabilityFor, useAvailability, WEEKDAY_NAMES } from '@/data/availability';
import { format12h, formatShortDate, formatWeekday } from '@/data/employee-roster';
import { employeeFullName, useEmployees, type Employee } from '@/data/employees';
import {
  autoFillFromAvailability,
  copyPreviousWeek,
  fromDateKey,
  JOB_TYPES,
  shiftHours,
  shiftsInRange,
  toDateKey,
  useShifts,
  type RosterShift,
} from '@/data/shifts';

const VIEWS = ['Week', 'Day', 'Month'] as const;
type RosterView = (typeof VIEWS)[number];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// One colour per job type (fixed order, dark-surface categorical palette); "Other" is neutral.
const JOB_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];

function jobColor(jobType: string) {
  const index = JOB_TYPES.indexOf(jobType as (typeof JOB_TYPES)[number]);
  return JOB_COLORS[index] ?? C.textSecondary;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date: Date) {
  const d = startOfDay(date);
  return addDays(d, -((d.getDay() + 6) % 7));
}

function getRange(view: RosterView, anchor: Date) {
  if (view === 'Day') {
    const start = startOfDay(anchor);
    return { start, end: addDays(start, 1), label: `${formatWeekday(start)} ${formatShortDate(start)}` };
  }
  if (view === 'Month') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    return {
      start,
      end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1),
      label: `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`,
    };
  }
  const start = startOfWeek(anchor);
  const end = addDays(start, 7);
  return { start, end, label: `${formatShortDate(start, false)} – ${formatShortDate(addDays(end, -1))}` };
}

function step(view: RosterView, anchor: Date, direction: 1 | -1) {
  if (view === 'Day') return addDays(anchor, direction);
  if (view === 'Month') return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
  return addDays(anchor, 7 * direction);
}

function draftFromShift(shift: RosterShift): ShiftDraft {
  return { ...shift, date: fromDateKey(shift.date) };
}

export default function OwnerRosterScreen() {
  const employees = useEmployees();
  const shifts = useShifts();
  const availability = useAvailability();
  const [view, setView] = useState<RosterView>('Week');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [draft, setDraft] = useState<ShiftDraft | null>(null);
  const [showAvailability, setShowAvailability] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const range = getRange(view, anchor);
  const visibleShifts = shiftsInRange(shifts, range.start, range.end);
  const unassigned = visibleShifts.filter((s) => s.employeeIds.length === 0);
  const rosteredIds = new Set(visibleShifts.flatMap((s) => s.employeeIds));
  const totalHours = visibleShifts.reduce((sum, s) => sum + shiftHours(s) * s.employeeIds.length, 0);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));

  const today = startOfDay(new Date());
  const defaultDate = today >= range.start && today < range.end ? today : range.start;

  const openNew = (date = defaultDate, employeeIds: string[] = []) =>
    setDraft(newShiftDraft(date, employeeIds));
  const openShift = (shift: RosterShift) => setDraft(draftFromShift(shift));

  function shiftsFor(employeeId: string | null, date: Date) {
    const key = toDateKey(date);
    return visibleShifts.filter(
      (s) => s.date === key && (employeeId ? s.employeeIds.includes(employeeId) : s.employeeIds.length === 0),
    );
  }

  const weekStart = startOfWeek(anchor);

  return (
    <OwnerScreen>
      <PageHeader
        title="Roster"
        subtitle="Plan shifts and assign your team."
        right={<Button label="Add Shift" icon={{ ios: 'plus', android: 'add', web: 'add' }} onPress={() => openNew()} />}
      />

      <View style={styles.controls}>
        <TabRow tabs={VIEWS} active={view} onChange={setView} />
        <View style={styles.rangeNav}>
          <NavArrow direction={-1} onPress={() => setAnchor(step(view, anchor, -1))} />
          <Text style={styles.rangeLabel}>{range.label}</Text>
          <NavArrow direction={1} onPress={() => setAnchor(step(view, anchor, 1))} />
        </View>
      </View>

      {message && (
        <View style={styles.message}>
          <Icon name={OwnerIcons.info} color={C.accent} size={14} />
          <Text style={styles.messageText}>{message}</Text>
          <Pressable onPress={() => setMessage(null)} hitSlop={8} accessibilityLabel="Dismiss">
            <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={C.textSecondary} size={12} />
          </Pressable>
        </View>
      )}

      {view === 'Month' ? (
        <MonthGrid
          start={range.start}
          shifts={visibleShifts}
          onSelectDay={(date) => {
            setAnchor(date);
            setView('Day');
          }}
        />
      ) : employees.length === 0 ? (
        <Card>
          <EmptyState
            icon={OwnerIcons.people}
            message="No employees yet. Once employees are added they'll appear here for rostering. You can still create shifts and assign people later."
          />
        </Card>
      ) : (
        employees.map((employee) => (
          <EmployeeRow
            key={employee.id}
            employee={employee}
            days={view === 'Week' ? weekDays : [range.start]}
            shiftsFor={(date) => shiftsFor(employee.id, date)}
            onAdd={(date) => openNew(date, [employee.id])}
            onOpen={openShift}
          />
        ))
      )}

      <ResponsiveRow>
        <Card title="Unassigned Shifts" icon={OwnerIcons.info}>
          {unassigned.length === 0 ? (
            <Text style={styles.muted}>No unassigned shifts in this {view.toLowerCase()}.</Text>
          ) : (
            unassigned.map((shift, i) => (
              <Pressable
                key={shift.id}
                onPress={() => openShift(shift)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.unassignedRow, i > 0 && styles.divider, pressed && styles.pressed]}>
                <View style={[styles.colorDot, { backgroundColor: jobColor(shift.jobType) }]} />
                <View style={styles.flex}>
                  <Text style={styles.unassignedTitle}>
                    {format12h(shift.start)} – {format12h(shift.end)} · {shift.jobType}
                  </Text>
                  <Text style={styles.muted}>
                    {formatWeekday(fromDateKey(shift.date))} {formatShortDate(fromDateKey(shift.date))}
                  </Text>
                </View>
                <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={14} />
              </Pressable>
            ))
          )}
        </Card>

        <Card title="Shift Summary" icon={OwnerIcons.chart}>
          <View style={styles.summary}>
            <SummaryStat label="Total Shifts" value={`${visibleShifts.length}`} />
            <SummaryStat label="Employees Rostered" value={`${rosteredIds.size}`} />
            <SummaryStat label="Total Hours" value={`${Math.round(totalHours * 10) / 10}`} />
          </View>
        </Card>
      </ResponsiveRow>

      <Card title="Quick Actions">
        <View>
          <ActionRow icon={{ ios: 'plus', android: 'add', web: 'add' }} label="Add Shift" onPress={() => openNew()} />
          <ActionRow
            icon={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }}
            label="Copy Previous Week"
            showDivider
            onPress={() => {
              const count = copyPreviousWeek(weekStart);
              setView('Week');
              setMessage(
                count === 0
                  ? 'Nothing to copy — last week has no shifts that aren’t already here.'
                  : `Copied ${count} shift${count === 1 ? '' : 's'} from last week.`,
              );
            }}
          />
          <ActionRow
            icon={{ ios: 'wand.and.stars', android: 'auto_fix_high', web: 'auto_fix_high' }}
            label="Auto Fill (Based on Availability)"
            showDivider
            onPress={() => {
              const count = autoFillFromAvailability(
                range.start,
                range.end,
                employees.map((e) => e.id),
                availability,
              );
              setMessage(
                count === 0
                  ? 'No unassigned shifts could be filled from employee availability.'
                  : `Filled ${count} shift${count === 1 ? '' : 's'} with available employees.`,
              );
            }}
          />
          <ActionRow
            icon={{ ios: 'calendar.badge.clock', android: 'event_available', web: 'event_available' }}
            label="View Employee Availability"
            showDivider
            onPress={() => setShowAvailability(true)}
          />
        </View>
      </Card>

      {draft && (
        <ShiftEditor
          draft={draft}
          employees={employees}
          availability={availability}
          onClose={() => setDraft(null)}
        />
      )}

      <AvailabilitySheet
        visible={showAvailability}
        employees={employees}
        onClose={() => setShowAvailability(false)}
      />
    </OwnerScreen>
  );
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

function EmployeeRow({
  employee,
  days,
  shiftsFor,
  onAdd,
  onOpen,
}: {
  employee: Employee;
  days: Date[];
  shiftsFor: (date: Date) => RosterShift[];
  onAdd: (date: Date) => void;
  onOpen: (shift: RosterShift) => void;
}) {
  const hours = days.flatMap(shiftsFor).reduce((sum, s) => sum + shiftHours(s), 0);
  const single = days.length === 1;

  const cells = days.map((date) => {
    const dayShifts = shiftsFor(date);
    return (
      <View key={toDateKey(date)} style={[styles.dayCell, single && styles.dayCellWide]}>
        {!single && (
          <Text style={styles.dayLabel}>
            {formatWeekday(date)} {date.getDate()}
          </Text>
        )}
        {dayShifts.map((shift) => (
          <ShiftBlock key={shift.id} shift={shift} onPress={() => onOpen(shift)} />
        ))}
        {dayShifts.length === 0 && (
          <Pressable
            onPress={() => onAdd(date)}
            accessibilityRole="button"
            accessibilityLabel={`Add shift for ${employee.firstName} on ${formatWeekday(date)} ${date.getDate()}`}
            style={({ pressed }) => [styles.emptySlot, pressed && styles.pressed]}>
            <Icon name={{ ios: 'plus', android: 'add', web: 'add' }} color={C.textSecondary} size={14} />
            {single && <Text style={styles.muted}>Add shift</Text>}
          </Pressable>
        )}
      </View>
    );
  });

  return (
    <Card>
      <View style={styles.employeeHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {employee.firstName[0]}
            {employee.lastName[0]}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.employeeName}>{employeeFullName(employee)}</Text>
          <Text style={styles.muted}>{employee.role}</Text>
        </View>
        <Text style={styles.muted}>{Math.round(hours * 10) / 10} hrs</Text>
      </View>
      {single ? (
        cells
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekStrip}>
          {cells}
        </ScrollView>
      )}
    </Card>
  );
}

function ShiftBlock({ shift, onPress }: { shift: RosterShift; onPress: () => void }) {
  const color = jobColor(shift.jobType);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${shift.jobType} ${format12h(shift.start)} to ${format12h(shift.end)}`}
      style={({ pressed }) => [
        styles.shiftBlock,
        { borderLeftColor: color, backgroundColor: `${color}26` },
        pressed && styles.pressed,
      ]}>
      <Text style={styles.shiftTime}>
        {format12h(shift.start)} – {format12h(shift.end)}
      </Text>
      <Text style={styles.shiftJob} numberOfLines={2}>
        {shift.jobType}
      </Text>
    </Pressable>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function MonthGrid({
  start,
  shifts,
  onSelectDay,
}: {
  start: Date;
  shifts: RosterShift[];
  onSelectDay: (date: Date) => void;
}) {
  const gridStart = startOfWeek(start);
  const todayKey = toDateKey(new Date());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const weeks = Array.from({ length: 6 }, (_, w) => cells.slice(w * 7, w * 7 + 7)).filter((week) =>
    week.some((d) => d.getMonth() === start.getMonth()),
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
        <View key={toDateKey(week[0])} style={styles.monthRow}>
          {week.map((date) => {
            const key = toDateKey(date);
            const count = shifts.filter((s) => s.date === key).length;
            const inMonth = date.getMonth() === start.getMonth();
            return (
              <Pressable
                key={key}
                onPress={() => onSelectDay(date)}
                accessibilityRole="button"
                accessibilityLabel={`${formatShortDate(date)}, ${count} shifts`}
                style={({ pressed }) => [styles.monthCell, key === todayKey && styles.monthToday, pressed && styles.pressed]}>
                <Text style={[styles.monthDay, !inMonth && styles.monthDayOut]}>{date.getDate()}</Text>
                {count > 0 && inMonth && (
                  <View style={styles.monthCount}>
                    <Text style={styles.monthCountText}>{count}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
      <Text style={styles.muted}>Tap a day to see its shifts.</Text>
    </Card>
  );
}

function AvailabilitySheet({
  visible,
  employees,
  onClose,
}: {
  visible: boolean;
  employees: Employee[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const availability = useAvailability();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={formStyles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[formStyles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Text style={formStyles.sheetTitle}>Employee Availability</Text>
        <ScrollView contentContainerStyle={styles.availabilityList}>
          {employees.length === 0 && (
            <Text style={[styles.muted, styles.centered]}>
              No employees yet. Their availability will show here once they&apos;ve set it.
            </Text>
          )}
          {employees.map((employee) => {
            const week = availabilityFor(availability, employee.id);
            return (
              <View key={employee.id} style={styles.availabilityRow}>
                <Text style={styles.employeeName}>{employeeFullName(employee)}</Text>
                {week ? (
                  <View style={styles.availabilityDays}>
                    {week.map((day, i) => (
                      <View
                        key={WEEKDAY_NAMES[i]}
                        style={[styles.availabilityDay, day.available && styles.availabilityDayOn]}>
                        <Text style={[styles.availabilityDayText, day.available && styles.availabilityDayTextOn]}>
                          {WEEKDAY_NAMES[i].slice(0, 3)}
                        </Text>
                        {day.available && (
                          <Text style={styles.availabilityTime}>
                            {format12h(day.start)}
                            {'\n'}
                            {format12h(day.end)}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.muted}>No availability set yet.</Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
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
  centered: {
    textAlign: 'center',
    paddingVertical: Spacing.four,
  },
  pressed: {
    opacity: 0.7,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  controls: {
    gap: Spacing.three - 4,
  },
  rangeNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  rangeLabel: {
    flex: 1,
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
  message: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    backgroundColor: 'rgba(79, 140, 255, 0.12)',
  },
  messageText: {
    flex: 1,
    color: C.text,
    fontSize: 14,
  },
  employeeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  employeeName: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
  weekStrip: {
    gap: Spacing.two,
  },
  dayCell: {
    width: 104,
    gap: 6,
  },
  dayCellWide: {
    width: '100%',
  },
  dayLabel: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  emptySlot: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: Radius.medium - 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.border,
  },
  shiftBlock: {
    minHeight: 56,
    paddingVertical: 6,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium - 4,
    borderLeftWidth: 3,
    gap: 2,
  },
  shiftTime: {
    color: C.text,
    fontSize: 12,
    fontWeight: '700',
  },
  shiftJob: {
    color: C.textSecondary,
    fontSize: 12,
  },
  unassignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.two + 2,
  },
  unassignedTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  summary: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  summaryStat: {
    flex: 1,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    backgroundColor: C.surfaceRaised,
    gap: 2,
  },
  summaryValue: {
    color: C.text,
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
    gap: 2,
    borderRadius: Radius.medium - 4,
    backgroundColor: C.surfaceRaised,
  },
  monthToday: {
    borderWidth: 1.5,
    borderColor: C.accent,
  },
  monthDay: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  monthDayOut: {
    color: C.border,
  },
  monthCount: {
    minWidth: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: C.accent,
    alignItems: 'center',
  },
  monthCountText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  availabilityList: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  availabilityRow: {
    gap: Spacing.two,
  },
  availabilityDays: {
    flexDirection: 'row',
    gap: 4,
  },
  availabilityDay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: C.surfaceRaised,
  },
  availabilityDayOn: {
    backgroundColor: 'rgba(34, 197, 94, 0.16)',
  },
  availabilityDayText: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  availabilityDayTextOn: {
    color: C.success,
  },
  availabilityTime: {
    color: C.textSecondary,
    fontSize: 9,
    textAlign: 'center',
  },
});
