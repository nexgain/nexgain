import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Checkbox,
  DateField,
  FieldButton,
  FormField,
  OptionSheet,
  TextField,
  TimeField,
} from '@/components/owner/form';
import { Badge, Button, Icon, OwnerIcons, TabRow } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import {
  availabilityFor,
  availabilityOn,
  type AvailabilityStatus,
  type WeeklyAvailability,
} from '@/data/availability';
import { format12h, formatShortDate, formatWeekday } from '@/data/employee-roster';
import { employeeFullName, type Employee } from '@/data/employees';
import { jobWhen } from '@/components/owner/jobs-ui';
import { useClients } from '@/data/clients';
import { unassignedJobs, useJobs, type Job } from '@/data/jobs';
import { deleteShift, fromDateKey, JOB_TYPES, saveShift, toDateKey } from '@/data/shifts';
import { toMinutes } from '@/data/time';

export type ShiftDraft = {
  id?: string;
  date: Date;
  start: string;
  end: string;
  employeeIds: string[];
  jobType: string | null;
  location: string;
  tasks: string[];
  notes: string;
  /** Job picked with "Select Job" (null for shifts not linked to a job). */
  jobId?: string | null;
};

export function newShiftDraft(date: Date, employeeIds: string[] = []): ShiftDraft {
  return {
    date,
    start: '07:00',
    end: '15:00',
    employeeIds,
    jobType: null,
    location: '',
    tasks: [],
    notes: '',
    jobId: null,
  };
}

const FILTERS = ['All', 'Available', 'Unavailable'] as const;
type Filter = (typeof FILTERS)[number];

/** Full-screen Create / Edit Shift form, with a Select Employees step. */
export function ShiftEditor({
  draft: initial,
  employees,
  availability,
  onClose,
}: {
  draft: ShiftDraft;
  employees: Employee[];
  availability: Record<string, WeeklyAvailability>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState<'form' | 'employees' | 'jobs'>('form');
  const jobs = useJobs();
  const clients = useClients();
  const linkedJob = jobs.find((j) => j.id === draft.jobId) ?? null;
  const jobClient = (job: Job) => clients.find((c) => c.id === job.clientId)?.name ?? '';

  /** Fills the shift from a job; the owner can still change anything afterwards. */
  function applyJob(job: Job) {
    const matchingType = JOB_TYPES.find((t) => t.toLowerCase() === job.title.trim().toLowerCase());
    update({
      jobId: job.id,
      date: fromDateKey(job.date),
      start: job.start,
      end: job.end,
      location: job.address,
      jobType: matchingType ?? draft.jobType ?? 'Other',
      notes: draft.notes.trim() ? draft.notes : job.description,
    });
    setStep('form');
  }
  const [jobSheetOpen, setJobSheetOpen] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const update = (changes: Partial<ShiftDraft>) => setDraft((d) => ({ ...d, ...changes }));

  const timeError =
    toMinutes(draft.end) <= toMinutes(draft.start) ? 'End time must be after the start time.' : undefined;
  const jobError = !draft.jobType ? 'Choose a job type.' : undefined;

  function addTask() {
    const text = newTask.trim();
    if (!text) return;
    update({ tasks: [...draft.tasks, text] });
    setNewTask('');
  }

  function save() {
    setSubmitted(true);
    if (timeError || jobError || !draft.jobType) return;
    saveShift({
      id: draft.id,
      date: toDateKey(draft.date),
      start: draft.start,
      end: draft.end,
      employeeIds: draft.employeeIds,
      jobType: draft.jobType,
      location: draft.location.trim(),
      tasks: draft.tasks,
      notes: draft.notes.trim(),
      jobId: draft.jobId ?? null,
    });
    onClose();
  }

  const selectedNames = employees
    .filter((e) => draft.employeeIds.includes(e.id))
    .map((e) => e.firstName);

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {step === 'jobs' ? (
          <SelectJob
            jobs={[...(linkedJob ? [linkedJob] : []), ...unassignedJobs(jobs).filter((j) => j.id !== linkedJob?.id)]}
            selectedId={draft.jobId ?? null}
            clientName={jobClient}
            onBack={() => setStep('form')}
            onSelect={applyJob}
          />
        ) : step === 'employees' ? (
          <SelectEmployees
            draft={draft}
            employees={employees}
            availability={availability}
            onBack={() => setStep('form')}
            onConfirm={(employeeIds) => {
              update({ employeeIds });
              setStep('form');
            }}
          />
        ) : (
          <>
            <Header title={draft.id ? 'Edit Shift' : 'Create Shift'} onClose={onClose} closeIcon="close" />
            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              <FormField label="Date">
                <DateField label="Date" value={draft.date} onChange={(date) => update({ date })} />
              </FormField>

              <View style={styles.row}>
                <FormField label="Start Time" style={styles.flex}>
                  <TimeField
                    label="Start Time"
                    value={draft.start}
                    onChange={(start) => update({ start })}
                    hasError={submitted && !!timeError}
                  />
                </FormField>
                <FormField label="End Time" style={styles.flex}>
                  <TimeField
                    label="End Time"
                    value={draft.end}
                    onChange={(end) => update({ end })}
                    hasError={submitted && !!timeError}
                  />
                </FormField>
              </View>
              {submitted && timeError ? <Text style={styles.error}>{timeError}</Text> : null}

              <FormField label="Employees">
                <FieldButton
                  value={
                    selectedNames.length === 0
                      ? null
                      : selectedNames.length <= 3
                        ? selectedNames.join(', ')
                        : `${selectedNames.slice(0, 3).join(', ')} +${selectedNames.length - 3}`
                  }
                  placeholder="Select employees (optional)"
                  icon={OwnerIcons.people}
                  onPress={() => setStep('employees')}
                  accessibilityLabel="Employees"
                />
              </FormField>

              <FormField label="Job Type" error={submitted ? jobError : undefined}>
                <FieldButton
                  value={draft.jobType}
                  placeholder="Select a job type"
                  icon={OwnerIcons.chevronDown}
                  onPress={() => setJobSheetOpen(true)}
                  accessibilityLabel="Job Type"
                  hasError={submitted && !!jobError}
                />
              </FormField>

              <FormField label="Address / Location">
                <View style={styles.addressRow}>
                  <View style={styles.flex}>
                    <TextField
                      value={draft.location}
                      onChangeText={(location) => update({ location })}
                      placeholder="e.g. 12 Smith St, Newtown"
                      accessibilityLabel="Address / Location"
                    />
                  </View>
                  <Pressable
                    onPress={() => setStep('jobs')}
                    accessibilityRole="button"
                    accessibilityLabel="Select Job"
                    style={({ pressed }) => [styles.selectJob, pressed && styles.pressed]}>
                    <Icon name={{ ios: 'briefcase.fill', android: 'work', web: 'work' }} color={C.accent} size={14} />
                    <Text style={styles.selectJobText}>Select Job</Text>
                  </Pressable>
                </View>
                {linkedJob && (
                  <View style={styles.linkedJob}>
                    <Icon name={{ ios: 'link', android: 'link', web: 'link' }} color={C.accent} size={14} />
                    <Text style={styles.linkedJobText} numberOfLines={2}>
                      Job: {[jobClient(linkedJob), linkedJob.title].filter(Boolean).join(' · ')}
                    </Text>
                    <Pressable
                      onPress={() => update({ jobId: null })}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Unlink job">
                      <Text style={styles.unlinkText}>Unlink</Text>
                    </Pressable>
                  </View>
                )}
              </FormField>

              <FormField label="Tasks">
                <View style={styles.tasks}>
                  {draft.tasks.map((task, i) => (
                    <View key={`${task}-${i}`} style={styles.taskRow}>
                      <Icon name={{ ios: 'checklist', android: 'task_alt', web: 'task_alt' }} color={C.accent} size={16} />
                      <Text style={styles.taskText}>{task}</Text>
                      <Pressable
                        onPress={() => update({ tasks: draft.tasks.filter((_, j) => j !== i) })}
                        hitSlop={8}
                        accessibilityLabel={`Remove task ${task}`}>
                        <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={C.textSecondary} size={14} />
                      </Pressable>
                    </View>
                  ))}
                  <View style={styles.addTaskRow}>
                    <TextInput
                      value={newTask}
                      onChangeText={setNewTask}
                      onSubmitEditing={addTask}
                      placeholder="New task"
                      placeholderTextColor={C.textSecondary}
                      returnKeyType="done"
                      style={styles.addTaskInput}
                      accessibilityLabel="New task"
                    />
                    <Pressable
                      onPress={addTask}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.addTaskButton, pressed && styles.pressed]}>
                      <Icon name={{ ios: 'plus', android: 'add', web: 'add' }} color={C.accent} size={14} />
                      <Text style={styles.addTaskText}>Add task</Text>
                    </Pressable>
                  </View>
                </View>
              </FormField>

              <FormField label="Notes (optional)">
                <TextField
                  value={draft.notes}
                  onChangeText={(notes) => update({ notes })}
                  placeholder="Anything the team should know"
                  multiline
                  accessibilityLabel="Notes"
                />
              </FormField>

              {draft.id && (
                <Pressable
                  onPress={() => {
                    deleteShift(draft.id!);
                    onClose();
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                  <Icon name={{ ios: 'trash', android: 'delete', web: 'delete' }} color={C.danger} size={16} />
                  <Text style={styles.deleteText}>Delete shift</Text>
                </Pressable>
              )}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
              <View style={styles.flex}>
                <Button label="Cancel" variant="secondary" onPress={onClose} />
              </View>
              <View style={styles.flex}>
                <Button label="Save Shift" icon={OwnerIcons.check} onPress={save} />
              </View>
            </View>

            <OptionSheet
              visible={jobSheetOpen}
              title="Job Type"
              options={JOB_TYPES}
              value={(draft.jobType as (typeof JOB_TYPES)[number]) ?? null}
              onSelect={(jobType) => update({ jobType })}
              onClose={() => setJobSheetOpen(false)}
            />
          </>
        )}
      </View>
    </Modal>
  );
}

function Header({
  title,
  subtitle,
  onClose,
  closeIcon,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  closeIcon: 'close' | 'back';
}) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onClose}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={closeIcon === 'back' ? 'Back' : 'Close'}
        style={styles.headerButton}>
        <Icon
          name={
            closeIcon === 'back'
              ? { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }
              : { ios: 'xmark', android: 'close', web: 'close' }
          }
          color={C.accent}
          size={18}
        />
      </Pressable>
      <View style={styles.headerText}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

/** Jobs that still need staff (Scheduled, not yet assigned), soonest first. */
function SelectJob({
  jobs,
  selectedId,
  clientName,
  onBack,
  onSelect,
}: {
  jobs: Job[];
  selectedId: string | null;
  clientName: (job: Job) => string;
  onBack: () => void;
  onSelect: (job: Job) => void;
}) {
  return (
    <>
      <Header title="Select Job" subtitle="Scheduled jobs that still need staff" onClose={onBack} closeIcon="back" />
      {jobs.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            No jobs waiting for staff. Jobs appear here once you confirm an accepted quote. You can still type an
            address for this shift.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.list, styles.selectBody]}>
          {jobs.map((job) => {
            const selected = job.id === selectedId;
            return (
              <Pressable
                key={job.id}
                onPress={() => onSelect(job)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${clientName(job) || job.title}, ${jobWhen(job)}`}
                style={({ pressed }) => [styles.jobRow, selected && styles.jobRowSelected, pressed && styles.pressed]}>
                <View style={styles.jobRowTop}>
                  <Text style={[styles.employeeName, styles.flex]} numberOfLines={1}>
                    {clientName(job) || job.title}
                  </Text>
                  {selected && <Badge label="Linked" tone="success" />}
                </View>
                <Text style={styles.employeeMeta}>{jobWhen(job)}</Text>
                <Text style={styles.employeeMeta} numberOfLines={1}>
                  {job.address || 'No address'}
                </Text>
                {job.description ? (
                  <Text style={styles.jobDescription} numberOfLines={2}>
                    {job.description}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </>
  );
}

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  available: 'Available',
  unavailable: 'Unavailable',
  'not-set': 'Unavailable',
};

function SelectEmployees({
  draft,
  employees,
  availability,
  onBack,
  onConfirm,
}: {
  draft: ShiftDraft;
  employees: Employee[];
  availability: Record<string, WeeklyAvailability>;
  onBack: () => void;
  onConfirm: (employeeIds: string[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string[]>(draft.employeeIds);
  const [filter, setFilter] = useState<Filter>('All');

  const withStatus = employees.map((employee) => ({
    employee,
    status: availabilityOn(availabilityFor(availability, employee.id), draft.date, draft),
  }));
  const visible = withStatus.filter(
    ({ status }) =>
      filter === 'All' || (filter === 'Available' ? status === 'available' : status !== 'available'),
  );
  const allVisibleSelected = visible.length > 0 && visible.every(({ employee }) => selected.includes(employee.id));
  const counts = {
    All: withStatus.length,
    Available: withStatus.filter((e) => e.status === 'available').length,
    Unavailable: withStatus.filter((e) => e.status !== 'available').length,
  };

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAllVisible() {
    const ids = visible.map(({ employee }) => employee.id);
    setSelected((prev) =>
      allVisibleSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])],
    );
  }

  return (
    <>
      <Header
        title="Select Employees"
        subtitle={`${formatWeekday(draft.date)} ${formatShortDate(draft.date)} · ${format12h(draft.start)} – ${format12h(draft.end)}`}
        onClose={onBack}
        closeIcon="back"
      />
      <View style={styles.selectBody}>
        <TabRow
          tabs={FILTERS.map((f) => `${f} (${counts[f]})`)}
          active={`${filter} (${counts[filter]})`}
          onChange={(tab) => setFilter(tab.split(' (')[0] as Filter)}
        />

        {employees.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              No employees yet. Once employees are added, you can assign them here.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {visible.length > 0 && (
              <Pressable
                onPress={toggleAllVisible}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: allVisibleSelected }}
                style={({ pressed }) => [styles.employeeRow, styles.selectAllRow, pressed && styles.pressed]}>
                <Checkbox checked={allVisibleSelected} />
                <Text style={styles.selectAllText}>
                  Select all {filter === 'All' ? '' : filter.toLowerCase()} ({visible.length})
                </Text>
              </Pressable>
            )}
            {visible.length === 0 && (
              <Text style={styles.emptyText}>No {filter.toLowerCase()} employees for this shift.</Text>
            )}
            {visible.map(({ employee, status }) => {
              const checked = selected.includes(employee.id);
              return (
                <Pressable
                  key={employee.id}
                  onPress={() => toggle(employee.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  style={({ pressed }) => [styles.employeeRow, pressed && styles.pressed]}>
                  <Checkbox checked={checked} />
                  <View style={styles.flex}>
                    <Text style={styles.employeeName}>{employeeFullName(employee)}</Text>
                    <Text style={styles.employeeMeta}>
                      {employee.role}
                      {status === 'not-set' ? ' · No availability set' : ''}
                    </Text>
                  </View>
                  <Badge label={STATUS_LABEL[status]} tone={status === 'available' ? 'success' : 'danger'} />
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <View style={styles.flex}>
          <Button
            label={
              selected.length === 0
                ? 'Continue without employees'
                : `Add ${selected.length} Employee${selected.length === 1 ? '' : 's'}`
            }
            icon={OwnerIcons.people}
            onPress={() => onConfirm(selected)}
          />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - 4,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: C.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  form: {
    padding: Spacing.four - 4,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
  },
  error: {
    color: C.danger,
    fontSize: 13,
    marginTop: -Spacing.two,
  },
  tasks: {
    gap: Spacing.two,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium - 2,
    backgroundColor: C.surface,
  },
  taskText: {
    flex: 1,
    color: C.text,
    fontSize: 15,
  },
  addTaskRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  addTaskInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium - 2,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceRaised,
    color: C.text,
    fontSize: 15,
  },
  addTaskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium - 2,
    borderWidth: 1,
    borderColor: C.border,
  },
  addTaskText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three - 4,
  },
  deleteText: {
    color: C.danger,
    fontSize: 15,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
    paddingHorizontal: Spacing.four - 4,
    paddingTop: Spacing.three - 4,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },
  selectBody: {
    flex: 1,
    padding: Spacing.four - 4,
    gap: Spacing.three - 4,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  employeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  selectAllRow: {
    backgroundColor: C.surfaceRaised,
  },
  selectAllText: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  employeeName: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  employeeMeta: {
    color: C.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: C.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: Spacing.four,
    maxWidth: 320,
    alignSelf: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  selectJob: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium - 2,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  selectJobText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  linkedJob: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
    padding: Spacing.two + 2,
    borderRadius: Radius.medium - 2,
    backgroundColor: 'rgba(79, 140, 255, 0.12)',
  },
  linkedJobText: {
    flex: 1,
    color: C.text,
    fontSize: 14,
  },
  unlinkText: {
    color: C.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  jobRow: {
    gap: 3,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  jobRowSelected: {
    borderColor: C.accent,
  },
  jobRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  jobDescription: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
});
