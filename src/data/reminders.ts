// Automatic job reminders: clients get an email at 9:00 am a week before and the
// day before their job, from the owner's connected Gmail or Outlook. The server
// sends them (supabase/functions/send-reminders, run every 15 minutes), so they go
// out even when the app is closed. The app only shows what was sent ("job_reminders"
// table, read only) and changes the settings (see ReminderSettings in business.ts).
import type { BusinessProfile } from '@/data/business';
import { addDaysKey, localParts, toTimestamp } from '@/data/business-time';
import { functionError } from '@/data/connected-accounts';
import { format12h, formatShortDate } from '@/data/employee-roster';
import type { Job } from '@/data/jobs';
import { createStore } from '@/data/store';
import { supabase } from '@/lib/supabase';

export type ReminderKind = 'week' | 'day';

export const REMINDER_KINDS: { kind: ReminderKind; days: number; label: string }[] = [
  { kind: 'week', days: 7, label: '1 week before' },
  { kind: 'day', days: 1, label: '1 day before' },
];

/** Reminders go out at this time (business time), the set number of days before the job. */
export const REMINDER_TIME = '09:00';

// Keep in step with DEFAULT_SUBJECT / DEFAULT_MESSAGE in supabase/functions/send-reminders.
export const DEFAULT_REMINDER_SUBJECT = 'Reminder: your booking with {business_name} on {job_date}';
export const DEFAULT_REMINDER_MESSAGE = `Hi {client_name},

This is a friendly reminder about your upcoming booking with {business_name}.

Date: {job_date}
Time: {job_time}
Address: {address}
Job: {job_title}

If you need to change anything, just reply to this email.

Thanks,
{business_name}
Phone: {business_phone}
Email: {business_email}`;

/** The tags the owner can use in the wording; the server fills them in. */
export const REMINDER_TAGS = [
  '{client_name}',
  '{business_name}',
  '{job_title}',
  '{job_date}',
  '{job_time}',
  '{address}',
  '{business_phone}',
  '{business_email}',
];

export type JobReminder = {
  id: string;
  jobId: string;
  kind: ReminderKind;
  /** The job start time this reminder was for (a moved job gets new reminders). */
  jobStart: string;
  status: 'sending' | 'sent' | 'failed' | 'skipped';
  reason: string;
  sentTo: string;
  sentAt: string | null;
};

type ReminderRow = {
  id: string;
  job_id: string;
  kind: ReminderKind;
  job_start: string;
  status: JobReminder['status'];
  reason: string;
  sent_to: string;
  sent_at: string | null;
};

export const remindersStore = createStore<JobReminder[]>([]);

export function useReminders() {
  return remindersStore.use();
}

/** The owner's reminders for jobs from the last month on (older ones aren't shown anywhere). */
export async function loadReminders() {
  const since = new Date(Date.now() - 31 * 24 * 3600_000).toISOString();
  const { data, error } = await supabase
    .from('job_reminders')
    .select('id, job_id, kind, job_start, status, reason, sent_to, sent_at')
    .gte('job_start', since);
  if (error) throw error;
  remindersStore.set(
    (data as ReminderRow[]).map((r) => ({
      id: r.id,
      jobId: r.job_id,
      kind: r.kind,
      jobStart: r.job_start,
      status: r.status,
      reason: r.reason,
      sentTo: r.sent_to,
      sentAt: r.sent_at,
    })),
  );
}

export function clearReminders() {
  remindersStore.set([]);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon 26 Oct, 9:00 AM" in business time. */
export function shortWhen(iso: string) {
  const { date, time } = localParts(iso);
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  return `${WEEKDAYS[day.getDay()]} ${formatShortDate(day, false)}, ${format12h(time)}`;
}

/** When this reminder is due: 9:00 am, the set number of days before the job's date. */
export function reminderDueAt(job: Job, days: number) {
  return toTimestamp(addDaysKey(job.date, -days), REMINDER_TIME);
}

const sameTime = (a: string, b: string) => Date.parse(a) === Date.parse(b);

/** The reminder sent (or tried) for the job's current time, if any. */
function reminderFor(job: Job, kind: ReminderKind, reminders: JobReminder[]) {
  return reminders.find((r) => r.jobId === job.id && r.kind === kind && sameTime(r.jobStart, job.startsAt));
}

export type ReminderLine = {
  kind: ReminderKind;
  label: string;
  text: string;
  tone: 'success' | 'info' | 'danger' | 'neutral';
};

/**
 * What the job screen shows for each reminder the business sends. Empty when
 * reminders are off for the business or the job (the screen says so instead).
 */
export function reminderLines(job: Job, business: BusinessProfile, reminders: JobReminder[], now = new Date()): ReminderLine[] {
  const settings = business.reminders;
  if (!settings.enabled || !job.remindersEnabled) return [];
  const open = job.status === 'scheduled' || job.status === 'assigned';

  return REMINDER_KINDS.filter(({ kind }) => (kind === 'week' ? settings.weekBefore : settings.dayBefore)).map(
    ({ kind, days, label }) => {
      const line = (text: string, tone: ReminderLine['tone']): ReminderLine => ({ kind, label, text, tone });
      const sent = reminderFor(job, kind, reminders);
      if (sent?.status === 'sent') {
        return line(`Sent ${sent.sentAt ? shortWhen(sent.sentAt) : ''}${sent.sentTo ? ` to ${sent.sentTo}` : ''}`, 'success');
      }
      if (sent?.status === 'sending') return line('Sending now…', 'info');
      if (sent) return line(`Couldn't send: ${sent.reason}`, 'danger');

      if (!open) return line('Not sent', 'neutral');
      const due = reminderDueAt(job, days);
      if (now.getTime() < Date.parse(due)) return line(`Scheduled for ${shortWhen(due)}`, 'info');
      if (now.getTime() >= Date.parse(job.startsAt)) return line('Not sent', 'neutral');
      // Matches the server: the week reminder is only sent up to 12 hours late.
      if (kind === 'week' && now.getTime() >= Date.parse(due) + 12 * 3600_000) {
        return line('Not sent: the job was booked less than a week ahead', 'neutral');
      }
      return line('Sending in the next 15 minutes', 'info');
    },
  );
}

export type ReminderProblem = { job: Job; reminder: JobReminder };

/** Upcoming jobs whose reminder couldn't be sent, soonest first (shown on the Reminders screen). */
export function reminderProblems(jobs: Job[], reminders: JobReminder[], now = new Date()): ReminderProblem[] {
  return reminders
    .filter((r) => r.status === 'failed' || r.status === 'skipped')
    .flatMap((reminder) => {
      const job = jobs.find((j) => j.id === reminder.jobId);
      const relevant =
        job &&
        job.remindersEnabled &&
        (job.status === 'scheduled' || job.status === 'assigned') &&
        sameTime(reminder.jobStart, job.startsAt) &&
        Date.parse(job.startsAt) > now.getTime();
      return relevant ? [{ job, reminder }] : [];
    })
    .sort((a, b) => a.job.startsAt.localeCompare(b.job.startsAt));
}

/** Sends a sample reminder (with the wording on screen) to the owner's own business email. */
export async function sendTestReminder(subject: string, message: string): Promise<{ to?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke<{ sent: boolean; to: string }>('send-reminders', {
    body: { test: true, subject, message },
  });
  if (error || !data?.sent) {
    return { error: (await functionError(error, "Couldn't send the test reminder. Please try again.")).message };
  }
  return { to: data.to };
}
