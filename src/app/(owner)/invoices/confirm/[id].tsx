import { useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { DateField, FormField, TextField, TimeField } from '@/components/owner/form';
import { ScreenHeader } from '@/components/owner/invoices-ui';
import { Button, Card, EmptyState, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import { addDaysKey, todayKey } from '@/data/business-time';
import { loadEvents } from '@/data/calendar';
import { loadClients } from '@/data/clients';
import { useCurrentEmployee } from '@/data/current-employee';
import { loadDocs, useDocs, type SalesDoc } from '@/data/invoices';
import { confirmJob, loadJobs } from '@/data/jobs';
import { fromDateKey, toDateKey } from '@/data/shifts';
import { toMinutes } from '@/data/time';

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** Work summary for the client: the quote's notes plus each line item (no prices). */
function workSummary(quote: SalesDoc) {
  const items = quote.items
    .filter((i) => i.description.trim())
    .map((i) => `• ${i.description.trim()}${i.qty && i.qty !== 1 ? ` (× ${i.qty})` : ''}`);
  return [quote.description.trim(), items.join('\n')].filter(Boolean).join('\n\n');
}

// Book an accepted quote in as a job and email the client a confirmation.
export default function ConfirmJobScreen() {
  const me = useCurrentEmployee();
  const business = useBusiness();
  const { id } = useLocalSearchParams<{ id: string }>();
  const quote = useDocs().find((d) => d.id === id);

  const [form, setForm] = useState(() => ({
    clientName: quote?.client.name ?? '',
    clientEmail: quote?.client.email ?? '',
    clientPhone: quote?.client.phone ?? '',
    address: quote?.client.address ?? '',
    title: quote?.jobType || (quote ? `Quote ${quote.number}` : ''),
    description: quote ? workSummary(quote) : '',
    date: fromDateKey(quote?.jobDate && quote.jobDate >= todayKey() ? quote.jobDate : addDaysKey(todayKey(), 1)),
    start: '08:00',
    end: '12:00',
    notes: '',
  }));
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (changes: Partial<typeof form>) => setForm((f) => ({ ...f, ...changes }));

  if (me) return <Redirect href="/home" />;

  if (!quote || quote.kind !== 'quote') {
    return (
      <OwnerScreen>
        <ScreenHeader title="Confirm Job" />
        <Card>
          <EmptyState icon={OwnerIcons.receipt} message="This quote couldn't be found." />
        </Card>
      </OwnerScreen>
    );
  }

  const errors = {
    clientName: !form.clientName.trim() ? "Enter the client's name." : null,
    clientEmail: !isEmail(form.clientEmail) ? 'Enter a valid email address so the confirmation can be sent.' : null,
    address: !form.address.trim() ? 'Enter the job address.' : null,
    title: !form.title.trim() ? 'Give the job a short title.' : null,
    time: toMinutes(form.end) <= toMinutes(form.start) ? 'The finish time must be after the start time.' : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const show = (key: keyof typeof errors) => (submitted ? (errors[key] ?? undefined) : undefined);

  async function send() {
    setSubmitted(true);
    setError(null);
    if (hasErrors || busy) return;
    setBusy(true);
    const result = await confirmJob(quote!.id, { ...form, date: toDateKey(form.date) });
    if (result.error || !result.jobId) {
      setBusy(false);
      setError(result.error ?? 'Something went wrong. Nothing was booked; please try again.');
      return;
    }
    // Show the new job, its calendar event and the Booked quote straight away.
    await Promise.all([
      loadJobs(),
      loadEvents(),
      loadClients(),
      business?.id ? loadDocs(business.id) : Promise.resolve(),
    ]).catch(() => {});
    setBusy(false);
    router.back();
    router.navigate({ pathname: '/job/[id]', params: { id: result.jobId } });
  }

  if (quote.status === 'Booked') {
    return (
      <OwnerScreen>
        <ScreenHeader title="Confirm Job" />
        <Card>
          <EmptyState icon={OwnerIcons.check} message={`Quote ${quote.number} has already been booked as a job. You'll find it on the Jobs page.`} />
        </Card>
      </OwnerScreen>
    );
  }

  return (
    <OwnerScreen>
      <ScreenHeader title="Confirm Job" />
      <Text style={styles.muted}>
        Quote {quote.number}. Pick the job date and times, check the details, then send the client a confirmation email.
        The job is added to your Jobs page and Calendar at the same time.
      </Text>

      <Card title="When" icon={OwnerIcons.calendar}>
        <FormField label="Job date">
          <DateField label="Job date" value={form.date} onChange={(date) => update({ date })} />
        </FormField>
        <View style={styles.row}>
          <FormField label="Start time" style={styles.flex}>
            <TimeField label="Start time" value={form.start} onChange={(start) => update({ start })} hasError={!!show('time')} />
          </FormField>
          <FormField label="Estimated finish" style={styles.flex}>
            <TimeField label="Estimated finish" value={form.end} onChange={(end) => update({ end })} hasError={!!show('time')} />
          </FormField>
        </View>
        {show('time') ? <Text style={styles.error}>{show('time')}</Text> : null}
        <Text style={styles.muted}>Times are Brisbane time.</Text>
      </Card>

      <Card title="Client" icon={OwnerIcons.people}>
        <FormField label="Name" error={show('clientName')}>
          <TextField value={form.clientName} onChangeText={(clientName) => update({ clientName })} accessibilityLabel="Client name" />
        </FormField>
        <FormField label="Email (the confirmation is sent here)" error={show('clientEmail')}>
          <TextField
            value={form.clientEmail}
            onChangeText={(clientEmail) => update({ clientEmail })}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Client email"
          />
        </FormField>
        <FormField label="Phone">
          <TextField value={form.clientPhone} onChangeText={(clientPhone) => update({ clientPhone })} keyboardType="phone-pad" accessibilityLabel="Client phone" />
        </FormField>
        <FormField label="Job address" error={show('address')}>
          <TextField value={form.address} onChangeText={(address) => update({ address })} accessibilityLabel="Job address" />
        </FormField>
      </Card>

      <Card title="Work" icon={OwnerIcons.receipt}>
        <FormField label="Job title" error={show('title')}>
          <TextField value={form.title} onChangeText={(title) => update({ title })} accessibilityLabel="Job title" />
        </FormField>
        <FormField label="Work summary (shown in the email and to your staff)">
          <TextField value={form.description} onChangeText={(description) => update({ description })} multiline accessibilityLabel="Work summary" />
        </FormField>
        <FormField label="Private notes (optional, only you see these)">
          <TextField value={form.notes} onChangeText={(notes) => update({ notes })} multiline accessibilityLabel="Private notes" />
        </FormField>
      </Card>

      {error && (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorTitle}>Nothing was booked</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {submitted && hasErrors && <Text style={styles.error}>Please fix the highlighted fields above.</Text>}

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={C.accent} />
          <Text style={styles.muted}>Booking the job and sending the email…</Text>
        </View>
      ) : (
        <Button label="Send Confirmation" icon={{ ios: 'paperplane.fill', android: 'send', web: 'send' }} onPress={send} />
      )}
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    color: C.danger,
    fontSize: 13,
  },
  errorBox: {
    gap: 4,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: C.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  errorTitle: {
    color: C.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  errorText: {
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
  },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
});
