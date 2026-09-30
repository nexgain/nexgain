// Jobs: booked from accepted quotes (see Confirm Job), shown on the owner's
// Jobs page and Calendar, and assigned to staff through the Roster. Stored
// online ("jobs" table). The database keeps each job's calendar event and any
// linked shifts in step with it, so there's only one source of truth.
// Employees only ever load their own assigned jobs, without prices or notes.
import { localParts, toTimestamp, todayKey } from '@/data/business-time';
import { createStore } from '@/data/store';
import { warnSaveFailed } from '@/lib/ids';
import { supabase } from '@/lib/supabase';

export const JOB_STATUSES = ['scheduled', 'assigned', 'in_progress', 'completed', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  scheduled: 'Scheduled',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export type Job = {
  id: string;
  quoteId: string | null;
  clientId: string | null;
  title: string;
  description: string;
  address: string;
  /** Brisbane date "YYYY-MM-DD" and times "HH:MM". */
  date: string;
  start: string;
  end: string;
  startsAt: string;
  endsAt: string;
  status: JobStatus;
  assignedEmployeeIds: string[];
  completedAt: string | null;
  notes: string;
  createdAt: string;
};

type JobRow = {
  id: string;
  quote_id?: string | null;
  client_id?: string | null;
  title: string;
  description: string;
  address: string;
  scheduled_start: string;
  scheduled_end: string;
  status: JobStatus;
  assigned_employee_ids?: string[];
  completed_at?: string | null;
  notes?: string;
  created_at?: string;
};

function fromRow(row: JobRow): Job {
  const start = localParts(row.scheduled_start);
  const end = localParts(row.scheduled_end);
  return {
    id: row.id,
    quoteId: row.quote_id ?? null,
    clientId: row.client_id ?? null,
    title: row.title,
    description: row.description,
    address: row.address,
    date: start.date,
    start: start.time,
    end: end.time,
    startsAt: row.scheduled_start,
    endsAt: row.scheduled_end,
    status: row.status,
    assignedEmployeeIds: row.assigned_employee_ids ?? [],
    completedAt: row.completed_at ?? null,
    notes: row.notes ?? '',
    createdAt: row.created_at ?? row.scheduled_start,
  };
}

export const jobsStore = createStore<Job[]>([]);

export function useJobs() {
  return jobsStore.use();
}

const byStart = (a: Job, b: Job) => a.startsAt.localeCompare(b.startsAt);

/** The owner's jobs. */
export async function loadJobs() {
  const { data, error } = await supabase.from('jobs').select('*').order('scheduled_start');
  if (error) throw error;
  jobsStore.set((data as JobRow[]).map(fromRow));
}

/** An employee's own assigned jobs (address, time and work description only). */
export async function loadMyAssignedJobs() {
  const { data, error } = await supabase.rpc('my_assigned_jobs');
  if (error) throw error;
  jobsStore.set((data as JobRow[]).map(fromRow).sort(byStart));
}

function patch(id: string, local: Partial<Job>, columns: Record<string, unknown>) {
  jobsStore.set((all) => all.map((j) => (j.id === id ? { ...j, ...local } : j)).sort(byStart));
  return supabase
    .from('jobs')
    .update(columns)
    .eq('id', id)
    .then(({ error }) => {
      warnSaveFailed('job', error);
      return !error;
    });
}

/** Moves a job. Its calendar event and any linked shift move with it. */
export function rescheduleJob(id: string, date: string, start: string, end: string) {
  const startsAt = toTimestamp(date, start);
  const endsAt = toTimestamp(date, end);
  return patch(id, { date, start, end, startsAt, endsAt }, { scheduled_start: startsAt, scheduled_end: endsAt });
}

export function setJobStatus(id: string, status: JobStatus) {
  const completedAt = status === 'completed' ? new Date().toISOString() : null;
  return patch(id, { status, completedAt }, { status, completed_at: completedAt });
}

export function updateJobNotes(id: string, notes: string) {
  return patch(id, { notes }, { notes });
}

export type ConfirmJobInput = {
  title: string;
  description: string;
  address: string;
  date: string;
  start: string;
  end: string;
  notes: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
};

async function callConfirmJob(body: Record<string, unknown>): Promise<{ jobId?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('confirm-job', { body });
  if (error) {
    // The function's own message (e.g. why the email failed), when there is one.
    const context = (error as { context?: Response }).context;
    const message = context && typeof context.json === 'function' ? (await context.json().catch(() => null))?.error : null;
    return {
      error:
        message ??
        (/not found|404|Failed to send/i.test(error.message)
          ? "Couldn't reach the email service. Check your internet connection, and that the confirm-job function is set up in Supabase."
          : error.message),
    };
  }
  return data as { jobId: string };
}

/**
 * Books a job from an accepted quote and emails the client. Either everything
 * happens (job, calendar event, quote marked Booked, email sent) or nothing does.
 */
export async function confirmJob(quoteId: string, input: ConfirmJobInput) {
  return callConfirmJob({
    mode: 'confirm',
    quoteId,
    job: {
      title: input.title.trim(),
      description: input.description.trim(),
      address: input.address.trim(),
      start: toTimestamp(input.date, input.start),
      end: toTimestamp(input.date, input.end),
      notes: input.notes.trim(),
      clientName: input.clientName.trim(),
      clientEmail: input.clientEmail.trim(),
      clientPhone: input.clientPhone.trim(),
    },
  });
}

/** Emails the client the job's current date and time. */
export async function sendJobUpdateEmail(jobId: string) {
  return callConfirmJob({ mode: 'update', jobId });
}

/** Jobs still needing staff, soonest first (for the Roster's "Select Job"). */
export function unassignedJobs(jobs: Job[], today = todayKey()) {
  return jobs.filter((j) => j.status === 'scheduled' && j.assignedEmployeeIds.length === 0 && j.date >= today).sort(byStart);
}
