import { useEffect, useState } from 'react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/owner/confirm-dialog';
import { FieldButton, FormField, OptionSheet, OWNER_PICKER_THEME, TextField } from '@/components/owner/form';
import { sendDoc } from '@/components/owner/invoice-pdf';
import { KIND_LABEL, ScreenHeader, TotalsBlock } from '@/components/owner/invoices-ui';
import { emptyItem, ItemsEditor, toNumber, type EditItem } from '@/components/owner/items-editor';
import { Button, Card, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { useNativePicker } from '@/components/pickers/use-native-picker';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatShortDate, formatWeekday } from '@/data/employee-roster';
import {
  businessPaymentStore,
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

const STEPS = ['Client & Job Details', 'Add Items', 'Review & Send'] as const;

// Typed routes only list '/invoices/index' for a folder index screen.
const INVOICES_HOME = '/invoices' as Href;

type Draft = {
  client: Client;
  jobType: string | null;
  jobDate: Date | null;
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
          description: '',
          items: [emptyItem()],
          dueDate: null,
        },
  );

  const [initialDraft] = useState(draft);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(initialDraft);

  const update = (changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes }));
  const updateClient = (changes: Partial<Client>) =>
    setDraft((d) => ({ ...d, client: { ...d.client, ...changes } }));

  const items = draft.items
    .map((i) => ({ id: i.id, description: i.description.trim(), qty: toNumber(i.qty), rate: toNumber(i.rate) }))
    .filter((i) => i.description || i.qty || i.rate);
  const totals = docTotals(items);

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
      description: draft.description.trim(),
      items,
      dueDate: draft.dueDate ? toDateKey(draft.dueDate) : null,
      paymentReference: existing?.paymentReference ?? '',
    });
  }

  function saveDraft() {
    persist(existing?.status ?? 'Draft');
    leave();
  }

  async function saveAndSend() {
    const problems = [
      !draft.client.name.trim() && 'Add a client name.',
      items.length === 0 && 'Add at least one item.',
      items.some((i) => !i.description) && 'Every item needs a description.',
    ].filter(Boolean) as string[];
    setErrors(problems);
    if (problems.length > 0) return;

    const keepStatus = existing && ['Paid', 'Accepted'].includes(existing.status);
    const id = persist(keepStatus ? existing.status : kind === 'invoice' ? 'Pending' : 'Sent');
    const saved = docsStore.get().find((d) => d.id === id);
    router.replace({ pathname: '/invoices/[id]', params: { id } });
    if (saved) {
      try {
        await sendDoc(saved, businessPaymentStore.get());
      } catch {
        // Share sheet dismissed or unavailable; the document is still saved.
      }
    }
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

      <StepIndicator step={step} onSelect={setStep} />

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
            <ReviewRow label="Job" value={[draft.jobType, draft.jobDate && formatShortDate(draft.jobDate)].filter(Boolean).join(' · ') || '—'} />
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
          <Button label="Save as Draft" variant="secondary" onPress={saveDraft} />
        </View>
        <View style={styles.flex}>
          {step < 2 ? (
            <Button label={`Next: ${STEPS[step + 1]}`} onPress={() => setStep(step + 1)} />
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

      <OptionSheet
        visible={jobSheetOpen}
        title="Job Type"
        options={JOB_TYPES}
        value={(draft.jobType as (typeof JOB_TYPES)[number]) ?? null}
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
    color: '#FFFFFF',
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
  error: {
    color: C.danger,
    fontSize: 14,
  },
});
