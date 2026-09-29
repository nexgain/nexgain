// Job reports written by employees after a shift. Submitting a report saves it
// online ("job_reports" table) and the database notifies the owner.
import { currentEmployeeStore } from '@/data/current-employee';
import { createStore } from '@/data/store';
import { newId, warnSaveFailed } from '@/lib/ids';
import { supabase } from '@/lib/supabase';

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
    id: newId(),
    submittedAt: new Date().toISOString(),
  };
  jobReportsStore.set((all) => [saved, ...all]);
  // Saved online in the background; the database then notifies the owner
  // (flagged as an incident if there were issues).
  saveOnline(saved).catch((error: Error) => warnSaveFailed('job report', error));
  return saved.id;
}

async function saveOnline(report: JobReport) {
  const businessId = currentEmployeeStore.get()?.businessId;
  if (!report.employeeId || !businessId) return;

  // Photos go to private storage that only this employee and their owner can open.
  const photoPaths: string[] = [];
  for (const [i, uri] of report.photos.entries()) {
    try {
      const response = await fetch(uri);
      const type = response.headers.get('content-type') ?? 'image/jpeg';
      const ext = type.split('/')[1]?.split(';')[0] || 'jpg';
      const path = `${businessId}/${report.employeeId}/reports/${report.id}-${i + 1}.${ext}`;
      const { error } = await supabase.storage
        .from('employee-documents')
        .upload(path, await response.arrayBuffer(), { contentType: type });
      if (error) throw error;
      photoPaths.push(path);
    } catch (error) {
      warnSaveFailed('a job report photo', error as Error);
    }
  }

  const { error } = await supabase.from('job_reports').insert({
    id: report.id,
    business_id: businessId,
    employee_id: report.employeeId,
    shift_date: report.date,
    job_title: report.jobTitle,
    location: report.location,
    time_text: report.time,
    outcome: report.outcome,
    notes: report.notes,
    issues: report.issues,
    photos: photoPaths,
    completed: report.completed,
  });
  if (error) throw error;
}
