import { useEffect, useState } from 'react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { BackHandler, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/owner/confirm-dialog';
import { Checkbox, FieldButton, FormField, OptionSheet, OWNER_PICKER_THEME, TextField } from '@/components/owner/form';
import { KIND_LABEL, ScreenHeader, TotalsBlock } from '@/components/owner/invoices-ui';
import { emptyItem, ItemsEditor, toNumber, type EditItem } from '@/components/owner/items-editor';
import { Button, Card, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { useNativePicker } from '@/components/pickers/use-native-picker';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { format12h, formatShortDate, formatWeekday } from '@/data/employee-roster';
import {
  docsStore,
  docTotals,
  lineAmount,
  saveDoc,
  type Client,
  type DocKind,
  type DocStatus,
} from '@/data/invoices';
import { formatMoney } from '@/data/payroll';
import { fromDateKey, JOB_TYPES, toDateKey } from '@/data/shifts';
import { currentGstRate, updateBusiness, useBusiness } from '@/data/business';
import { dateToTime, timeToDate, toMinutes } from '@/data/time';

const STEPS = ['Client & Job Details', 'Add Items', 'Review & Send'] as const;

// Typed routes only list '/invoices/index' for a folder index screen.
const INVOICES_HOME = '/invoices' as Href;

type Draft = {
  client: Client;
  jobType: string | null;
  jobDate: Date | null;
  /** Quotes only: "HH:MM" start time and estimated finish (both optional). */
  jobStart: string | null;
  jobEnd: string | null;
  description: string;
  items: EditItem[];
  dueDate: Date | null;
};

/** New / edit screen for both quotes and invoices (?kind=quote|invoice, or ?id= to edit). */
export default function NewDocScreen() {
  const params = useLocalSearchParams<{ kind?: string; id?: string; step?: string }>();
  const existing = params.id ? docsStore.get().find((d) => d.id === params.id) : undefined;
  const kind: DocKind = existing?.kind ?? (params.kind === 'invoice' ? 'invoice' : 'quote');
  const label = KIND_LABEL[kind];

  const [step, setStep] = useState(() => Math.min(2, Math.max(0, Number(params.step ?? 0) || 0)));
  const [jobSheetOpen, setJobSheetOpen] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft>(() =>
    existing
      ? {
          client: existing.client,
          jobType: existing.jobType,
          jobDate: existing.jobDate ? fromDateKey(existing.jobDate) : null,
          jobStart: existing.jobStart ?? null,
          jobEnd: existing.jobEnd ?? null,
          description: existing.description,
          items: existing.items.map((i) => ({
            id: i.id,
            description: i.description,
            qty: String(i.qty),
            rate: String(i.rate),
          })),
          dueDate: existing.dueDate ? fromDateKey(existing.dueDate) : null,
        }
      : {
          client: { name: '', phone: '', email: '', address: '' },
          jobType: null,
          jobDate: null,
          jobStart: null,
          jobEnd: null,
          description: '',
          items: [emptyItem()],
          dueDate: null,
        },
  );

  const [initialDraft] = useState(draft);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // The step the owner was heading to when the "no time selected" pop-up opened.
  const [noTimeTarget, setNoTimeTarget] = useState<number | null>(null);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(initialDraft);

  // Job types come from the services chosen at sign-up (editable under More > Services).
  const business = useBusiness();
  const jobOptions: readonly string[] = business?.services.length ? business.services : JOB_TYPES;

  const update = (changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes }));
  const updateClient = (changes: Partial<Client>) =>
    setDraft((d) => ({ ...d, client: { ...d.client, ...changes } }));

  const items = draft.items
    .map((i) => ({ id: i.id, description: i.description.trim(), qty: toNumber(i.qty), rate: toNumber(i.rate) }))
    .filter((i) => i.description || i.qty || i.rate);
  // Keep an existing document's GST rate; new ones follow the business's GST registration.
  const gstRate = existing?.gstRate ?? currentGstRate();
  const totals = docTotals(items, gstRate);
  const isQuote = kind === 'quote';
  const timeError =
    isQuote && draft.jobStart && draft.jobEnd && toMinutes(draft.jobEnd) <= toMinutes(draft.jobStart)
      ? 'The finish time must be after the start time.'
      : null;

  // Leaving "Client & Job Details" on a quote with no time: ask first, unless the
  // owner ticked "Don't show this again".
  function goToStep(target: number) {
    if (target > step && step === 0 && timeError) return;
    if (isQuote && step === 0 && target > 0 && !draft.jobStart && !business?.hideNoTimeWarning) {
      setNoTimeTarget(target);
      return;
    }
    setStep(target);
  }

  function answerNoTime(moveOn: boolean, dontShowAgain: boolean) {
    if (dontShowAgain) updateBusiness({ hideNoTimeWarning: true });
    if (moveOn && noTimeTarget !== null) setStep(noTimeTarget);
    setNoTimeTarget(null);
  }

  function persist(status: DocStatus) {
    return saveDoc({
      id: existing?.id,
      kind,
      status,
      client: {
        name: draft.client.name.trim(),
        phone: draft.client.phone.trim(),
        email: draft.client.email.trim(),
        address: draft.client.address.trim(),
      },
      jobType: draft.jobType,
      jobDate: draft.jobDate ? toDateKey(draft.jobDate) : null,
      jobStart: isQuote ? draft.jobStart : null,
      jobEnd: isQuote && draft.jobStart ? draft.jobEnd : null,
      description: draft.description.trim(),
      items,
      dueDate: draft.dueDate ? toDateKey(draft.dueDate) : null,
      paymentReference: existing?.paymentReference ?? '',
      gstRate,
    });
  }

  function saveDraft() {
    persist(existing?.status ?? 'Draft');
    leave();
  }

  function saveAndSend() {
    const problems = [
      !draft.client.name.trim() && 'Add a client name.',
      items.length === 0 && 'Add at least one item.',
      items.some((i) => !i.description) && 'Every item needs a description.',
      timeError,
    ].filter(Boolean) as string[];
    setErrors(problems);
    if (problems.length > 0) return;

    // The status changes to Sent / Pending once the email has actually been sent.
    const id = persist(existing?.status ?? 'Draft');
    // The details screen opens the owner's email app with it ready to send.
    router.replace({ pathname: '/invoices/[id]', params: { id, send: '1' } });
  }

  // Closes this screen but stays in the Invoices stack (back to the list, or to the
  // quote's details when editing). router.back() alone could jump to another tab.
  function leave() {
    if (router.canDismiss()) router.dismiss();
    else router.replace(INVOICES_HOME);
  }

  // Back goes one step at a time; the draft lives in this screen, so every step keeps
  // what was typed. On the first step, ask before leaving if anything would be lost.
  function goBack() {
    if (step > 0) setStep(step - 1);
    else if (hasChanges) setConfirmDiscard(true);
    else leave();
  }

  // Closing the screen throws away everything typed; always land on the Invoices list.
  function discard() {
    setConfirmDiscard(false);
    router.dismissTo(INVOICES_HOME);
  }

  // Android's system back button behaves like the back arrow.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  });

  const title = existing ? `Edit ${existing.number}` : `New ${label.one}`;

  return (
    <OwnerScreen>
      <ScreenHeader
        title={title}
        onBack={goBack}
        right={
          <Pressable onPress={saveDraft} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.saveDraftLink}>Save Draft</Text>
          </Pressable>
        }
      />

      <StepIndicator step={step} onSelect={goToStep} />

      {step === 0 && (
        <>
          <Card title="Client Details" icon={OwnerIcons.people}>
            <FormField label="Client Name">
              <TextField value={draft.client.name} onChangeText={(name) => updateClient({ name })} accessibilityLabel="Client Name" autoCapitalize="words" />
            </FormField>
            <FormField label="Phone">
              <TextField value={draft.client.phone} onChangeText={(phone) => updateClient({ phone })} accessibilityLabel="Phone" keyboardType="phone-pad" />
            </FormField>
            <FormField label="Email">
              <TextField
                value={draft.client.email}
                onChangeText={(email) => updateClient({ email })}
                accessibilityLabel="Email"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </FormField>
            <FormField label="Address">
              <TextField value={draft.client.address} onChangeText={(address) => updateClient({ address })} accessibilityLabel="Address" />
            </FormField>
          </Card>

          <Card title="Job Details" icon={OwnerIcons.calendar}>
            <FormField label="Job Type">
              <FieldButton
                value={draft.jobType}
                placeholder="Select a job type"
                icon={OwnerIcons.chevronDown}
                onPress={() => setJobSheetOpen(true)}
                accessibilityLabel="Job Type"
              />
            </FormField>
            <FormField label="Job Date">
              <OptionalDateField label="Job Date" value={draft.jobDate} onChange={(jobDate) => update({ jobDate })} />
            </FormField>
            {isQuote && (
              <>
                <View style={styles.timeRow}>
                  <FormField label="Start Time" style={styles.flex}>
                    <OptionalTimeField
                      label="Start Time"
                      value={draft.jobStart}
                      fallback="08:00"
                      onChange={(jobStart) => update({ jobStart })}
                      hasError={!!timeError}
                    />
                  </FormField>
                  <FormField label="Estimated Finish" style={styles.flex}>
                    <OptionalTimeField
                      label="Estimated Finish"
                      value={draft.jobEnd}
                      fallback={draft.jobStart ?? '12:00'}
                      onChange={(jobEnd) => update({ jobEnd })}
                      hasError={!!timeError}
                    />
                  </FormField>
                </View>
                {timeError ? <Text style={styles.error}>{timeError}</Text> : null}
                {(draft.jobStart || draft.jobEnd) && (
                  <Pressable onPress={() => update({ jobStart: null, jobEnd: null })} accessibilityRole="button" hitSlop={6}>
                    <Text style={styles.clearTime}>Clear time</Text>
                  </Pressable>
                )}
                <Text style={styles.muted}>Once it&apos;s sent, the quote goes on your calendar on this date and time.</Text>
              </>
            )}
            <FormField label="Description">
              <TextField value={draft.description} onChangeText={(description) => update({ description })} multiline accessibilityLabel="Description" />
            </FormField>
          </Card>
        </>
      )}

      {step === 1 && (
        <Card title="Items" icon={OwnerIcons.receipt}>
          <ItemsEditor items={draft.items} onChange={(next) => update({ items: next })} />
          <TotalsBlock {...totals} />
        </Card>
      )}

      {step === 2 && (
        <>
          <Card title="Review" icon={OwnerIcons.check}>
            <ReviewRow label="Client" value={draft.client.name || '—'} />
            <ReviewRow label="Contact" value={[draft.client.phone, draft.client.email].filter(Boolean).join(' · ') || '—'} />
            <ReviewRow label="Address" value={draft.client.address || '—'} />
            <ReviewRow
              label="Job"
              value={
                [draft.jobType, draft.jobDate && formatShortDate(draft.jobDate), isQuote && timeText(draft.jobStart, draft.jobEnd)]
                  .filter(Boolean)
                  .join(' · ') || '—'
              }
            />
            {draft.description ? <ReviewRow label="Description" value={draft.description} /> : null}
          </Card>

          <Card title={`Items (${items.length})`} icon={OwnerIcons.receipt}>
            {items.length === 0 ? (
              <Text style={styles.muted}>No items yet.</Text>
            ) : (
              items.map((i) => (
                <View key={i.id} style={styles.reviewItem}>
                  <Text style={styles.reviewItemText} numberOfLines={2}>
                    {i.description || 'Untitled item'}
                  </Text>
                  <Text style={styles.muted}>
                    {i.qty} × {formatMoney(i.rate)}
                  </Text>
                  <Text style={styles.reviewAmount}>{formatMoney(lineAmount(i))}</Text>
                </View>
              ))
            )}
            <TotalsBlock {...totals} />
          </Card>

          <Card title={kind === 'invoice' ? 'Due Date' : 'Valid Until'} icon={OwnerIcons.calendar}>
            <OptionalDateField
              label={kind === 'invoice' ? 'Due Date' : 'Valid Until'}
              value={draft.dueDate}
              onChange={(dueDate) => update({ dueDate })}
            />
          </Card>

          {errors.length > 0 && (
            <View style={styles.errors}>
              {errors.map((e) => (
                <Text key={e} style={styles.error}>
                  {e}
                </Text>
              ))}
            </View>
          )}
        </>
      )}

      <View style={styles.footer}>
        <View style={styles.flex}>
          <Button fill label="Save as Draft" variant="secondary" onPress={saveDraft} />
        </View>
        <View style={styles.flex}>
          {step < 2 ? (
            <Button label={`Next: ${STEPS[step + 1]}`} onPress={() => goToStep(step + 1)} />
          ) : (
            <Button label={`Save & Send ${label.one}`} icon={OwnerIcons.check} onPress={saveAndSend} />
          )}
        </View>
      </View>

      <Pressable
        onPress={() => setConfirmDiscard(true)}
        accessibilityRole="button"
        hitSlop={8}
        style={({ pressed }) => [styles.discard, pressed && styles.pressed]}>
        <Text style={styles.discardText}>{existing ? 'Discard Changes' : `Discard ${label.one}`}</Text>
      </Pressable>

      <ConfirmDialog
        visible={confirmDiscard}
        message={
          existing
            ? "Are you sure you want to discard your changes? Everything you've changed will be lost."
            : `Are you sure you want to discard this ${label.one.toLowerCase()}? Everything you've entered will be lost.`
        }
        confirmLabel="Discard"
        onConfirm={discard}
        onCancel={() => setConfirmDiscard(false)}
      />

      {noTimeTarget !== null && <NoTimeDialog onAnswer={answerNoTime} />}

      <OptionSheet
        visible={jobSheetOpen}
        title="Job Type"
        options={jobOptions}
        value={draft.jobType}
        onSelect={(jobType) => update({ jobType })}
        onClose={() => setJobSheetOpen(false)}
      />
    </OwnerScreen>
  );
}

function StepIndicator({ step, onSelect }: { step: number; onSelect: (step: number) => void }) {
  return (
    <View style={styles.steps}>
      {STEPS.map((name, i) => {
        const state = i < step ? 'done' : i === step ? 'current' : 'todo';
        return (
          <Pressable
            key={name}
            onPress={() => onSelect(i)}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === step }}
            accessibilityLabel={`Step ${i + 1}: ${name}`}
            style={styles.step}>
            <View style={[styles.stepBar, state !== 'todo' && styles.stepBarActive]} />
            <View style={styles.stepLabelRow}>
              <View style={[styles.stepNumber, state !== 'todo' && styles.stepNumberActive]}>
                <Text style={[styles.stepNumberText, state !== 'todo' && styles.stepNumberTextActive]}>
                  {state === 'done' ? '✓' : i + 1}
                </Text>
              </View>
              <Text style={[styles.stepName, state === 'current' && styles.stepNameCurrent]} numberOfLines={2}>
                {name}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function OptionalDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
}) {
  const picker = useNativePicker({
    mode: 'date',
    value: value ?? new Date(),
    onChange,
    title: label,
    theme: OWNER_PICKER_THEME,
  });
  return (
    <>
      <FieldButton
        value={value ? `${formatWeekday(value)} ${formatShortDate(value)}` : null}
        placeholder="Select date"
        icon={OwnerIcons.calendar}
        onPress={picker.open}
        accessibilityLabel={label}
      />
      {picker.element}
    </>
  );
}

/** "8:00 AM – 12:00 PM", "8:00 AM", or "" with no start time. */
function timeText(start: string | null, end: string | null) {
  if (!start) return '';
  return end ? `${format12h(start)} – ${format12h(end)}` : format12h(start);
}

function OptionalTimeField({
  label,
  value,
  fallback,
  onChange,
  hasError,
}: {
  label: string;
  value: string | null;
  /** Where the picker starts when no time is set yet. */
  fallback: string;
  onChange: (time: string) => void;
  hasError?: boolean;
}) {
  const picker = useNativePicker({
    mode: 'time',
    value: timeToDate(value ?? fallback),
    onChange: (d) => onChange(dateToTime(d)),
    title: label,
    theme: OWNER_PICKER_THEME,
  });
  return (
    <>
      <FieldButton
        value={value ? format12h(value) : null}
        placeholder="Select time"
        icon={OwnerIcons.clock}
        onPress={picker.open}
        accessibilityLabel={label}
        hasError={hasError}
      />
      {picker.element}
    </>
  );
}

/** "You haven't selected a time" pop-up, with Yes / No and "Don't show this again". */
function NoTimeDialog({ onAnswer }: { onAnswer: (moveOn: boolean, dontShowAgain: boolean) => void }) {
  const [dontShow, setDontShow] = useState(false);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => onAnswer(false, dontShow)}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog} accessibilityRole="alert">
          <Text style={styles.dialogTitle}>You haven&apos;t selected a time for this job.</Text>
          <Text style={styles.dialogText}>Do you want to continue without a time?</Text>
          <Pressable
            onPress={() => setDontShow((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dontShow }}
            style={styles.dontShow}>
            <Checkbox checked={dontShow} />
            <Text style={styles.dialogText}>Don&apos;t show this again</Text>
          </Pressable>
          <View style={styles.dialogButtons}>
            <View style={styles.flex}>
              <Button fill label="No" variant="secondary" onPress={() => onAnswer(false, dontShow)} />
            </View>
            <View style={styles.flex}>
              <Button fill label="Yes" onPress={() => onAnswer(true, dontShow)} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
  },
  saveDraftLink: {
    color: C.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  steps: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  step: {
    flex: 1,
    gap: Spacing.two,
  },
  stepBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
  },
  stepBarActive: {
    backgroundColor: C.accent,
  },
  stepLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceRaised,
  },
  stepNumberActive: {
    backgroundColor: C.accent,
  },
  stepNumberText: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  stepNumberTextActive: {
    color: C.onAccent,
  },
  stepName: {
    flex: 1,
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  stepNameCurrent: {
    color: C.text,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
    marginTop: Spacing.two,
  },
  discard: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  discardText: {
    color: C.danger,
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
  reviewRow: {
    gap: 2,
  },
  reviewLabel: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  reviewValue: {
    color: C.text,
    fontSize: 15,
  },
  reviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  reviewItemText: {
    flex: 1,
    color: C.text,
    fontSize: 15,
  },
  reviewAmount: {
    minWidth: 80,
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  errors: {
    gap: 4,
  },
  timeRow: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
  },
  clearTime: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  dialogBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: C.overlay,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    gap: Spacing.three,
    padding: Spacing.four - 4,
    borderRadius: Radius.large,
    backgroundColor: C.surface,
  },
  dialogTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  dialogText: {
    color: C.text,
    fontSize: 15,
  },
  dontShow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 32,
  },
  dialogButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  error: {
    color: C.danger,
    fontSize: 14,
  },
});
