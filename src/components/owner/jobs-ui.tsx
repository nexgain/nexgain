import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, OwnerIcons } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { EVENT_TYPE_INFO, type CalendarEvent } from '@/data/calendar';
import { format12h, formatShortDate, formatWeekday } from '@/data/employee-roster';
import { employeeFullName, type Employee } from '@/data/employees';
import { JOB_STATUS_LABEL, type Job, type JobStatus } from '@/data/jobs';
import { fromDateKey } from '@/data/shifts';

const STATUS_COLORS: Record<JobStatus, { text: string; background: string }> = {
  scheduled: { text: C.accent, background: 'rgba(79, 140, 255, 0.14)' },
  assigned: { text: '#9085e9', background: 'rgba(144, 133, 233, 0.16)' },
  in_progress: { text: C.warning, background: 'rgba(245, 158, 11, 0.14)' },
  completed: { text: C.success, background: 'rgba(34, 197, 94, 0.14)' },
  cancelled: { text: C.textSecondary, background: C.surfaceRaised },
};

export function JobStatusPill({ status }: { status: JobStatus }) {
  const colors = STATUS_COLORS[status];
  return (
    <View style={[styles.pill, { backgroundColor: colors.background }]}>
      {status === 'completed' && (
        <Icon name={{ ios: 'checkmark', android: 'check', web: 'check' }} color={colors.text} size={11} />
      )}
      <Text style={[styles.pillText, { color: colors.text }]}>{JOB_STATUS_LABEL[status]}</Text>
    </View>
  );
}

/** e.g. "Tue 6 Oct 2026 · 8:00 AM – 12:00 PM" */
export function jobWhen(item: { date: string; start: string; end: string }) {
  const date = fromDateKey(item.date);
  return `${formatWeekday(date)} ${formatShortDate(date)} · ${format12h(item.start)} – ${format12h(item.end)}`;
}

export function staffNames(ids: string[], employees: Employee[]) {
  return ids
    .map((id) => employees.find((e) => e.id === id))
    .filter((e): e is Employee => !!e)
    .map(employeeFullName)
    .join(', ');
}

export function JobCard({
  job,
  clientName,
  employees,
  onPress,
}: {
  job: Job;
  clientName: string;
  employees: Employee[];
  onPress: () => void;
}) {
  const staff = staffNames(job.assignedEmployeeIds, employees);
  const done = job.status === 'completed' || job.status === 'cancelled';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${clientName || job.title}, ${JOB_STATUS_LABEL[job.status]}`}
      style={({ pressed }) => [styles.card, done && styles.cardDone, pressed && styles.pressed]}>
      <View style={styles.cardTop}>
        <View style={styles.flex}>
          <Text style={styles.client} numberOfLines={1}>
            {clientName || 'No client name'}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {job.title}
          </Text>
        </View>
        <JobStatusPill status={job.status} />
      </View>
      <Line icon={OwnerIcons.calendar} text={jobWhen(job)} />
      <Line icon={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} text={job.address || 'No address'} />
      {job.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {job.description}
        </Text>
      ) : null}
      <Line icon={OwnerIcons.people} text={staff || 'Not assigned yet'} muted={!staff} />
    </Pressable>
  );
}

function Line({ icon, text, muted }: { icon: Parameters<typeof Icon>[0]['name']; text: string; muted?: boolean }) {
  return (
    <View style={styles.line}>
      <Icon name={icon} color={C.textSecondary} size={13} />
      <Text style={[styles.lineText, muted && styles.muted]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** One calendar item: coloured icon by type; completed jobs are greyed out with a tick. */
export function EventRow({
  event,
  subtitle,
  showDate,
  onPress,
  showDivider,
}: {
  event: CalendarEvent;
  subtitle?: string;
  showDate?: boolean;
  onPress: () => void;
  showDivider?: boolean;
}) {
  const info = EVENT_TYPE_INFO[event.type];
  const completed = event.type === 'job' && event.status === 'completed';
  const cancelled = event.type === 'job' && event.status === 'cancelled';
  const color = completed || cancelled ? C.textSecondary : info.color;
  const date = fromDateKey(event.date);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${info.label}: ${event.title}${completed ? ', completed' : ''}`}
      style={({ pressed }) => [styles.eventRow, showDivider && styles.divider, pressed && styles.pressed]}>
      <View style={[styles.eventIcon, { backgroundColor: `${color}26` }]}>
        <Icon name={completed ? { ios: 'checkmark', android: 'check', web: 'check' } : info.icon} color={color} size={16} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.eventTitle, (completed || cancelled) && styles.eventTitleDone]} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {showDate ? `${formatWeekday(date)} ${formatShortDate(date, false)} · ` : ''}
          {format12h(event.start)} – {format12h(event.end)}
          {subtitle ? ` · ${subtitle}` : ''}
        </Text>
      </View>
      {completed ? (
        <Text style={[styles.tag, { color: C.success }]}>Completed</Text>
      ) : cancelled ? (
        <Text style={styles.tag}>Cancelled</Text>
      ) : (
        <Text style={[styles.tag, { color: info.color }]}>{info.label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    gap: 6,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  cardDone: {
    opacity: 0.75,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginBottom: 2,
  },
  client: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  title: {
    color: C.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lineText: {
    flex: 1,
    color: C.text,
    fontSize: 14,
  },
  description: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.two + 2,
  },
  eventIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  eventTitleDone: {
    color: C.textSecondary,
    textDecorationLine: 'line-through',
  },
  tag: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
});
