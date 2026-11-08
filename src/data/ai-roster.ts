// Rostering staff on a job from the AI Assistant, the same way the Roster page
// does it: the people go on the shift linked to the job (a new one is made if
// the job doesn't have one yet). The database then marks the job as Assigned
// and sends each newly rostered person a "New shift assigned" notification.
import { employeeFullName, employeesStore } from '@/data/employees';
import { jobsStore } from '@/data/jobs';
import { JOB_TYPES, saveShift, shiftsStore } from '@/data/shifts';

export type RosterResult = { ok: true; names: string[] } | { ok: false; message: string };

export function rosterOnJob(jobId: string, employeeIds: string[]): RosterResult {
  const job = jobsStore.get().find((j) => j.id === jobId);
  if (!job) return { ok: false, message: "I couldn't find that job any more. It may have been deleted." };
  if (job.status === 'cancelled' || job.status === 'completed') return { ok: false, message: 'That job is finished or cancelled, so nobody was rostered.' };
  if (employeeIds.length === 0) return { ok: false, message: 'Tick at least one person first.' };

  const existing = shiftsStore.get().find((s) => s.jobId === jobId);
  const adding = employeeIds.filter((id) => !(existing?.employeeIds ?? []).includes(id));
  if (adding.length === 0) return { ok: false, message: 'Everyone you picked is already rostered on this job.' };

  if (existing) {
    saveShift({ ...existing, employeeIds: [...existing.employeeIds, ...adding] });
  } else {
    const jobType = JOB_TYPES.find((t) => t.toLowerCase() === job.title.trim().toLowerCase()) ?? 'Other';
    saveShift({
      date: job.date,
      start: job.start,
      end: job.end,
      employeeIds: adding,
      jobType,
      location: job.address,
      tasks: [],
      notes: job.description,
      jobId: job.id,
    });
  }
  // Show it as Assigned straight away (the database does the same).
  jobsStore.set((all) =>
    all.map((j) =>
      j.id === jobId
        ? {
            ...j,
            assignedEmployeeIds: [...new Set([...j.assignedEmployeeIds, ...adding])],
            status: j.status === 'scheduled' ? 'assigned' : j.status,
          }
        : j,
    ),
  );
  const people = employeesStore.get();
  return {
    ok: true,
    names: adding.map((id) => {
      const e = people.find((p) => p.id === id);
      return e ? employeeFullName(e) : 'Team member';
    }),
  };
}
