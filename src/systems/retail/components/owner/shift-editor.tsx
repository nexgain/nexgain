// NexGain Retail: the owner's Roster form. A shop rosters staff on for a shift
// at the shop: Employee, Date, Start time, End time, Notes and, when the shop
// has more than one store, which store. No job types, addresses or tasks.
// Each employee's availability (their Availability section) is shown; someone
// who isn't available can still be rostered, with a warning.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField, FormField, TextField, TimeField } from '@/systems/retail/components/owner/form';
import { Badge, Button, Icon, OwnerIcons } from '@/systems/retail/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { availabilityFor, availabilityOn, type AvailabilityStatus, type WeeklyAvailability } from '@/data/availability';
import { businessStore } from '@/data/business';
import { format12h } from '@/data/employee-roster';
import { employeeFullName, type Employee } from '@/data/employees';
import { deleteShift, saveShift, toDateKey, useShifts, type RosterShift } from '@/data/shifts';
import { toMinutes } from '@/data/time';
import { hasManyStores, useStores, type StoreLocation } from '@/systems/retail/data/retail';

export type ShiftDraft = {
  id?: string;
  date: Date;
  start: string;
  end: string;
  /** The person rostered on (one per shift). */
  employeeIds: string[];
  /** The store's name (only asked when the shop has more than one store). */
  location: string;
  notes: string;
};

export function newShiftDraft(date: Date, employeeIds: string[] = []): ShiftDraft {
  return { date, start: '09:00', end: '17:00', employeeIds: employeeIds.slice(0, 1), location: '', notes: '' };
}

const STATUS_TEXT: Record<AvailabilityStatus, string> = {
  available: 'Available',
  unavailable: 'Not available then',
  'not-set': 'No availability set',
};

/**
 * What's stopping this shift from being saved, or null: someone must be
 * picked, the times must make sense, the store must be chosen (with more than
 * one store), and the person can't already be rostered on at an overlapping time.
 */
export function shiftProblem(
  draft: Pick<ShiftDraft, 'id' | 'date' | 'start' | 'end' | 'employeeIds' | 'location'>,
  shifts: Pick<RosterShift, 'id' | 'date' | 'start' | 'end' | 'employeeIds'>[],
  stores: Pick<StoreLocation, 'name'>[],
): string | null {
  const employeeId = draft.employeeIds[0];
  if (!employeeId) return 'Choose who you’re rostering on.';
  if (toMinutes(draft.end) <= toMinutes(draft.start)) return 'The end time must be after the start time.';
  if (stores.length > 1 && !stores.some((s) => s.name === draft.location)) return 'Choose which store this shift is at.';
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

/** Full-screen Roster form: Employee, Date, Start time, End time, Store (several stores only), Notes. */
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
  const stores = useStores();
  const manyStores = hasManyStores(stores);
  const [draft, setDraft] = useState<ShiftDraft>({
    ...initial,
    employeeIds: initial.employeeIds.slice(0, 1),
    // One store: every shift is there. Several: the shift's own store (or none picked yet).
    location: manyStores ? initial.location : (stores[0]?.name ?? initial.location),
  });
  const [submitted, setSubmitted] = useState(false);
  const update = (changes: Partial<ShiftDraft>) => setDraft((d) => ({ ...d, ...changes }));
  const problem = shiftProblem(draft, shifts, stores);

  const statusOf = (employeeId: string) => availabilityOn(availabilityFor(availability, employeeId), draft.date, draft);
  const timeError = toMinutes(draft.end) <= toMinutes(draft.start);
  const picked = draft.employeeIds[0];
  const pickedStatus = picked ? statusOf(picked) : null;

  function save() {
    setSubmitted(true);
    if (problem) return;
    saveShift({
      id: initial.id,
      date: toDateKey(draft.date),
      start: draft.start,
      end: draft.end,
      employeeIds: draft.employeeIds,
      // Retail shops have no job types. The business name is what the
      // employee's "You've been rostered on…" notification shows.
      jobType: businessStore.get()?.businessName?.trim() || 'Shift',
      location: draft.location.trim(),
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
            <Text style={styles.headerTitle}>{initial.id ? 'Edit Shift' : 'Add Shift'}</Text>
            <Text style={styles.headerSubtitle}>It shows in their Schedule tab straight away.</Text>
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
                  const selected = picked === employee.id;
                  return (
                    <Pressable
                      key={employee.id}
                      onPress={() => update({ employeeIds: [employee.id] })}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${employeeFullName(employee)}, ${STATUS_TEXT[status]}`}
                      style={({ pressed }) => [styles.employeeRow, selected && styles.employeeRowOn, pressed && styles.pressed]}>
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
            {pickedStatus && pickedStatus !== 'available' && (
              <Text style={styles.warning}>
                {pickedStatus === 'not-set'
                  ? 'They haven’t set their availability yet. Check they can work then.'
                  : 'They’ve said they’re not available for all of this time. Check with them first.'}
              </Text>
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

          {manyStores && (
            <FormField label="Store">
              <View style={styles.chips} accessibilityRole="radiogroup">
                {stores.map((s) => {
                  const on = draft.location === s.name;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => update({ location: s.name })}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={s.address ? `${s.name}, ${s.address}` : s.name}
                      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}>
                      <Icon name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} color={on ? C.onAccent : C.accent} size={14} />
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </FormField>
          )}

          <FormField label="Notes (optional)">
            <TextField
              value={draft.notes}
              onChangeText={(notes) => update({ notes })}
              placeholder="e.g. Unpack the new delivery"
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
              <Text style={styles.deleteText}>Delete shift</Text>
            </Pressable>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
          <View style={styles.flex}>
            <Button fill label="Cancel" variant="secondary" onPress={onClose} />
          </View>
          <View style={styles.flex}>
            <Button fill label="Save Shift" icon={OwnerIcons.check} onPress={save} />
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
  warning: { color: C.warning, fontSize: 13, fontWeight: '600', marginTop: Spacing.two },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  chipOn: { borderColor: C.accent, backgroundColor: C.accent },
  chipText: { color: C.text, fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: C.onAccent },
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
