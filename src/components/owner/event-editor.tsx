import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField, FieldButton, FormField, OptionSheet, TextField, TimeField } from '@/components/owner/form';
import { ConfirmDialog } from '@/components/owner/invoices-ui';
import { jobWhen } from '@/components/owner/jobs-ui';
import { Button, Icon, OwnerIcons, TabRow } from '@/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { deleteEvent, saveEvent, type EventDraft } from '@/data/calendar';
import type { Job } from '@/data/jobs';
import { fromDateKey, toDateKey } from '@/data/shifts';
import { toMinutes } from '@/data/time';

const TYPES = ['Material Delivery', 'Other'] as const;
const NO_JOB = 'No linked job';

/** Add / edit a material delivery or other reminder on the calendar. */
export function EventEditor({
  draft: initial,
  jobs,
  jobLabel,
  businessId,
  onClose,
}: {
  draft: EventDraft;
  jobs: Job[];
  /** e.g. "Jane Smith · House Wash" */
  jobLabel: (job: Job) => string;
  businessId: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [jobSheet, setJobSheet] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = (changes: Partial<EventDraft>) => setDraft((d) => ({ ...d, ...changes }));

  const isDelivery = draft.type === 'delivery';
  const titleError = !draft.title.trim() ? (isDelivery ? "Say what's being delivered, e.g. Timber for deck" : 'Enter a title.') : null;
  const timeError = toMinutes(draft.end) < toMinutes(draft.start) ? 'End time must be after the start time.' : null;

  // Only jobs that are still happening can have deliveries linked.
  const linkable = jobs.filter((j) => j.status !== 'cancelled' && (j.status !== 'completed' || j.id === draft.jobId));
  const jobOptions = linkable.map((j) => `${jobLabel(j)} · ${jobWhen(j)}`);
  const linkedIndex = linkable.findIndex((j) => j.id === draft.jobId);
  const linkedLabel = linkedIndex >= 0 ? jobOptions[linkedIndex] : null;

  function save() {
    setSubmitted(true);
    if (titleError || timeError) return;
    saveEvent(
      {
        ...draft,
        title: draft.title.trim(),
        supplier: isDelivery ? draft.supplier.trim() : '',
        deliveryItems: isDelivery ? draft.deliveryItems.trim() : '',
        address: draft.address.trim(),
        notes: draft.notes.trim(),
      },
      businessId,
    );
    onClose();
  }

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={styles.headerButton}>
            <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={C.accent} size={18} />
          </Pressable>
          <Text style={styles.headerTitle}>{draft.id ? 'Edit Event' : 'Add Event'}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <TabRow
            tabs={TYPES}
            active={isDelivery ? 'Material Delivery' : 'Other'}
            onChange={(t) => update({ type: t === 'Other' ? 'other' : 'delivery' })}
          />

          <FormField label={isDelivery ? "What's being delivered" : 'Title'} error={submitted && titleError ? titleError : undefined}>
            <TextField
              value={draft.title}
              onChangeText={(title) => update({ title })}
              placeholder={isDelivery ? 'e.g. Timber for deck' : 'e.g. Van service'}
              accessibilityLabel={isDelivery ? "What's being delivered" : 'Title'}
            />
          </FormField>

          <FormField label="Date">
            <DateField label="Date" value={fromDateKey(draft.date)} onChange={(d) => update({ date: toDateKey(d) })} />
          </FormField>
          <View style={styles.row}>
            <FormField label="Start" style={styles.flex}>
              <TimeField label="Start" value={draft.start} onChange={(start) => update({ start })} hasError={submitted && !!timeError} />
            </FormField>
            <FormField label="End" style={styles.flex}>
              <TimeField label="End" value={draft.end} onChange={(end) => update({ end })} hasError={submitted && !!timeError} />
            </FormField>
          </View>
          {submitted && timeError ? <Text style={styles.error}>{timeError}</Text> : null}

          {isDelivery && (
            <>
              <FormField label="Supplier">
                <TextField
                  value={draft.supplier}
                  onChangeText={(supplier) => update({ supplier })}
                  placeholder="e.g. Bunnings Trade"
                  accessibilityLabel="Supplier"
                />
              </FormField>
              <FormField label="Items / quantities (optional)">
                <TextField
                  value={draft.deliveryItems}
                  onChangeText={(deliveryItems) => update({ deliveryItems })}
                  placeholder="e.g. 40 × treated pine 90x45, 2 boxes of screws"
                  multiline
                  accessibilityLabel="Delivery items"
                />
              </FormField>
            </>
          )}

          <FormField label="Linked job (optional)">
            <FieldButton
              value={linkedLabel}
              placeholder={NO_JOB}
              icon={OwnerIcons.chevronDown}
              onPress={() => setJobSheet(true)}
              accessibilityLabel="Linked job"
            />
          </FormField>

          <FormField label="Address (optional)">
            <TextField
              value={draft.address}
              onChangeText={(address) => update({ address })}
              placeholder="Where it's happening"
              accessibilityLabel="Event address"
            />
          </FormField>

          <FormField label="Notes (optional)">
            <TextField
              value={draft.notes}
              onChangeText={(notes) => update({ notes })}
              placeholder="Anything to remember"
              multiline
              accessibilityLabel="Event notes"
            />
          </FormField>

          {draft.id && (
            <Pressable onPress={() => setConfirmDelete(true)} accessibilityRole="button" style={styles.deleteButton}>
              <Icon name={{ ios: 'trash', android: 'delete', web: 'delete' }} color={C.danger} size={16} />
              <Text style={styles.deleteText}>Delete event</Text>
            </Pressable>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
          <View style={styles.flex}>
            <Button label="Cancel" variant="secondary" onPress={onClose} />
          </View>
          <View style={styles.flex}>
            <Button label="Save Event" icon={OwnerIcons.check} onPress={save} />
          </View>
        </View>

        <OptionSheet
          visible={jobSheet}
          title="Linked job"
          options={[NO_JOB, ...jobOptions]}
          value={linkedLabel ?? NO_JOB}
          onSelect={(option) => {
            const job = option === NO_JOB ? null : linkable[jobOptions.indexOf(option)];
            // Deliveries usually go to the job's site.
            update({ jobId: job?.id ?? null, address: job && !draft.address.trim() ? job.address : draft.address });
          }}
          onClose={() => setJobSheet(false)}
        />
        <ConfirmDialog
          visible={confirmDelete}
          title="Delete this event?"
          confirmLabel="Delete"
          cancelLabel="Keep"
          onConfirm={() => {
            deleteEvent(draft.id!);
            onClose();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      </View>
    </Modal>
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
  row: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
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
  headerTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
  },
  form: {
    padding: Spacing.four - 4,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  error: {
    color: C.danger,
    fontSize: 13,
    marginTop: -Spacing.two,
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
});
