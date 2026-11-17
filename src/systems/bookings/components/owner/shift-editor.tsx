// NexGain Bookings: the owner's Roster form. The owner isn't creating a job,
// just rostering someone on at the business for the day: Employee, Date, Start
// time, End time and Notes. Customers can book that person between the start
// and end times (see private.free_slots in the database). Only employees who
// are available then (their Availability section) can be picked.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField, FormField, TextField, TimeField } from '@/systems/bookings/components/owner/form';
import { Badge, Button, Icon, OwnerIcons } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { availabilityFor, availabilityOn, type AvailabilityStatus, type WeeklyAvailability } from '@/data/availability';
import { businessStore } from '@/data/business';
import { format12h } from '@/data/employee-roster';
import { employeeFullName, type Employee } from '@/data/employees';
import { deleteShift, saveShift, toDateKey, useShifts, type RosterShift } from '@/data/shifts';
import { toMinutes } from '@/data/time';

export type ShiftDraft = {
  id?: string;
  date: Date;
  start: string;
  end: string;
  /** The person rostered on (one per roster entry). */
  employeeIds: string[];
  notes: string;
};

export function newShiftDraft(date: Date, employeeIds: string[] = []): ShiftDraft {
  return { date, start: '09:00', end: '17:00', employeeIds: employeeIds.slice(0, 1), notes: '' };
}

const STATUS_TEXT: Record<AvailabilityStatus, string> = {
  available: 'Available',
  unavailable: 'Not available then',
  'not-set': 'No availability set',
};

/**
 * What's stopping this roster entry from being saved, or null. The person must
 * be available for the whole time (their Availability section) and can't
 * already be rostered on at an overlapping time that day.
 */
export function rosterProblem(
  draft: Pick<ShiftDraft, 'id' | 'date' | 'start' | 'end' | 'employeeIds'>,
  shifts: Pick<RosterShift, 'id' | 'date' | 'start' | 'end' | 'employeeIds'>[],
  availability: Record<string, WeeklyAvailability>,
): string | null {
  const employeeId = draft.employeeIds[0];
  if (!employeeId) return 'Choose who you’re rostering on.';
  if (toMinutes(draft.end) <= toMinutes(draft.start)) return 'The end time must be after the start time.';
  const status = availabilityOn(availabilityFor(availability, employeeId), draft.date, draft);
  if (status === 'not-set') return 'This person hasn’t set their availability yet, so they can’t be rostered.';
  if (status === 'unavailable') return 'This person isn’t available for all of that time. Check their availability.';
  const key = toDateKey(draft.date);
  const clash = shifts.find(
    (s) =>
      s.id !== draft.id &&
      s.date === key &&
      s.employeeIds.includes(employeeId) &&
      toMinutes(s.start) < toMinutes(draft.end) &&
      toMinutes(draft.start) < toMinutes(s.end),
  );
  if (clash) return `They’re already rostered on ${format12h(clash.start)} – ${format12h(clash.end)} that day.`;
  return null;
}

/** Full-screen Roster form: Employee, Date, Start time, End time, Notes. */
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
  const shifts = useShifts();
  const [draft, setDraft] = useState<ShiftDraft>({ ...initial, employeeIds: initial.employeeIds.slice(0, 1) });
  const [submitted, setSubmitted] = useState(false);
  const update = (changes: Partial<ShiftDraft>) => setDraft((d) => ({ ...d, ...changes }));
  const problem = rosterProblem(draft, shifts, availability);

  const statusOf = (employeeId: string) => availabilityOn(availabilityFor(availability, employeeId), draft.date, draft);
  const timeError = toMinutes(draft.end) <= toMinutes(draft.start);

  function save() {
    setSubmitted(true);
    if (problem) return;
    saveShift({
      id: initial.id,
      date: toDateKey(draft.date),
      start: draft.start,
      end: draft.end,
      employeeIds: draft.employeeIds,
      // Booking businesses have no job types. The business name is what the
      // employee's "You've been rostered on…" notification shows.
      jobType: businessStore.get()?.businessName?.trim() || 'Work',
      location: '',
      tasks: [],
      notes: draft.notes.trim(),
      jobId: null,
    });
    onClose();
  }

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={styles.headerButton}>
            <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={C.accent} size={18} />
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.headerTitle}>{initial.id ? 'Edit Roster' : 'Roster Someone On'}</Text>
            <Text style={styles.headerSubtitle}>Customers can book them between the start and end times.</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <FormField label="Employee">
            {employees.length === 0 ? (
              <Text style={styles.muted}>No employees yet. Invite your team in Employees first.</Text>
            ) : (
              <View style={styles.list} accessibilityRole="radiogroup">
                {employees.map((employee) => {
                  const status = statusOf(employee.id);
                  const selected = draft.employeeIds[0] === employee.id;
                  // Only people who are available can be picked (the one already on this entry stays shown as picked).
                  const disabled = status !== 'available' && !selected;
                  return (
                    <Pressable
                      key={employee.id}
                      onPress={() => update({ employeeIds: [employee.id] })}
                      disabled={disabled}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled }}
                      accessibilityLabel={`${employeeFullName(employee)}, ${STATUS_TEXT[status]}`}
                      style={({ pressed }) => [
                        styles.employeeRow,
                        selected && styles.employeeRowOn,
                        disabled && styles.employeeRowOff,
                        pressed && styles.pressed,
                      ]}>
                      <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.radioDot} />}</View>
                      <View style={styles.flex}>
                        <Text style={styles.employeeName}>{employeeFullName(employee)}</Text>
                        {employee.role ? <Text style={styles.employeeMeta}>{employee.role}</Text> : null}
                      </View>
                      <Badge label={STATUS_TEXT[status]} tone={status === 'available' ? 'success' : 'neutral'} />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </FormField>

          <FormField label="Date">
            <DateField label="Date" value={draft.date} onChange={(date) => update({ date })} />
          </FormField>

          <View style={styles.row}>
            <FormField label="Start Time" style={styles.flex}>
              <TimeField label="Start Time" value={draft.start} onChange={(start) => update({ start })} hasError={submitted && timeError} />
            </FormField>
            <FormField label="End Time" style={styles.flex}>
              <TimeField label="End Time" value={draft.end} onChange={(end) => update({ end })} hasError={submitted && timeError} />
            </FormField>
          </View>

          <FormField label="Notes (optional)">
            <TextField
              value={draft.notes}
              onChangeText={(notes) => update({ notes })}
              placeholder="Anything they should know"
              multiline
              accessibilityLabel="Notes"
            />
          </FormField>

          {submitted && problem ? <Text style={styles.error}>{problem}</Text> : null}

          {initial.id && (
            <Pressable
              onPress={() => {
                deleteShift(initial.id!);
                onClose();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
              <Icon name={{ ios: 'trash', android: 'delete', web: 'delete' }} color={C.danger} size={16} />
              <Text style={styles.deleteText}>Take off the roster</Text>
            </Pressable>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
          <View style={styles.flex}>
            <Button fill label="Cancel" variant="secondary" onPress={onClose} />
          </View>
          <View style={styles.flex}>
            <Button fill label="Save" icon={OwnerIcons.check} onPress={save} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  flex: { flex: 1 },
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
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  headerSubtitle: { color: C.textSecondary, fontSize: 13, marginTop: 2 },
  form: { padding: Spacing.four - 4, gap: Spacing.three, width: '100%', maxWidth: 640, alignSelf: 'center' },
  row: { flexDirection: 'row', gap: Spacing.three - 4 },
  muted: { color: C.textSecondary, fontSize: 14 },
  error: { color: C.danger, fontSize: 14, fontWeight: '600' },
  list: { gap: Spacing.two },
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
  employeeRowOn: { borderColor: C.accent, backgroundColor: C.accentSoft },
  employeeRowOff: { opacity: 0.5 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: C.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  employeeName: { color: C.text, fontSize: 15, fontWeight: '600' },
  employeeMeta: { color: C.textSecondary, fontSize: 13, marginTop: 2 },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three - 4,
  },
  deleteText: { color: C.danger, fontSize: 15, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
    paddingHorizontal: Spacing.four - 4,
    paddingTop: Spacing.three - 4,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },
  pressed: { opacity: 0.7 },
});
