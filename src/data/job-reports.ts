// Job reports written by employees after a shift. Submitting a
// report also notifies the owner. In memory only until a database is connected.
import { addNotification } from '@/data/notifications';
import { createStore } from '@/data/store';

export const JOB_OUTCOMES = ['Went well', 'Minor issues', "Didn't go well"] as const;
export type JobOutcome = (typeof JOB_OUTCOMES)[number];

export const REPORT_TEXT_LIMIT = 500;

export type JobReport = {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  /** Shift date "YYYY-MM-DD" (one shift per employee per day). */
  date: string;
  jobTitle: string | null;
  location: string | null;
  time: string | null;
  outcome: JobOutcome;
  notes: string;
  issues: string;
  photos: string[];
  completed: boolean;
  submittedAt: string;
};

export const jobReportsStore = createStore<JobReport[]>([]);

export function useJobReports() {
  return jobReportsStore.use();
}

/** Whether a report should alert the owner as an incident rather than log quietly. */
export function needsAttention(report: Pick<JobReport, 'outcome' | 'issues'>) {
  return report.outcome !== 'Went well' || report.issues.trim().length > 0;
}

export function submitJobReport(report: Omit<JobReport, 'id' | 'submittedAt'>) {
  const saved: JobReport = {
    ...report,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    submittedAt: new Date().toISOString(),
  };
  jobReportsStore.set((all) => [saved, ...all]);

  const who = report.employeeName ?? 'An employee';
  const job = report.jobTitle ?? 'a job';
  const flagged = needsAttention(report);
  const details = [
    { label: 'Job', value: report.jobTitle ?? 'No job assigned' },
    { label: 'Location', value: report.location || '—' },
    { label: 'Reported by', value: report.employeeName ?? 'Unknown (not signed in)' },
    { label: 'Time', value: report.time ?? '—' },
    { label: 'Outcome', value: report.outcome },
    { label: 'Job completed', value: report.completed ? 'Yes' : 'No' },
  ];
  const body = [
    report.issues.trim() && `Issues:\n${report.issues.trim()}`,
    report.notes.trim() && `Job notes:\n${report.notes.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const relatedShift = report.jobTitle
    ? { date: report.date, title: report.jobTitle, subtitle: [report.location, report.time].filter(Boolean).join(' · ') }
    : undefined;

  if (flagged) {
    // Minor issues / didn't go well / issues written: an incident that needs the owner's attention.
    const serious = report.outcome === "Didn't go well";
    addNotification({
      audience: 'owner',
      type: serious ? 'incident_report' : 'report_flagged',
      title: serious ? 'Incident report submitted' : 'Job report flagged for review',
      summary: `${who} reported ${report.outcome.toLowerCase()} on ${job}`,
      body: body || 'No further details were given.',
      status: 'Needs attention',
      details,
      photos: report.photos,
      relatedShift,
    });
  } else {
    // Went well with no issues: log quietly (already marked as read).
    addNotification({
      audience: 'owner',
      type: 'job_completed',
      title: 'Job report submitted',
      summary: `${who} completed ${job} — went well`,
      body: body || 'No notes were added.',
      details,
      photos: report.photos,
      relatedShift,
      read: true,
    });
  }
  return saved.id;
}
