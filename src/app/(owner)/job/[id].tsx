import { useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { DateField, FormField, TextField, TimeField } from '@/components/owner/form';
import { ConfirmDialog, ScreenHeader, TotalsBlock } from '@/components/owner/invoices-ui';
import { EventRow, jobWhen, JobStatusPill, staffNames } from '@/components/owner/jobs-ui';
import { Button, Card, EmptyState, goBack, Icon, OwnerIcons, OwnerScreen } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { useCalendarEvents } from '@/data/calendar';
import { useClients } from '@/data/clients';
import { useCurrentEmployee } from '@/data/current-employee';
import { formatShortDate } from '@/data/employee-roster';
import { useEmployees } from '@/data/employees';
import { docTotals, lineAmount, useDocs } from '@/data/invoices';
import {
  rescheduleJob,
  sendJobUpdateEmail,
  setJobStatus,
  updateJobNotes,
  useJobs,
  type JobStatus,
} from '@/data/jobs';
import { formatMoney } from '@/data/payroll';
import { fromDateKey, toDateKey } from '@/data/shifts';
import { toMinutes } from '@/data/time';

type Message = { tone: 'ok' | 'error'; text: string };

// One job: the quote's work details, client, staff, deliveries and notes. Owner only.
export default function JobDetailScreen() {
  const me = useCurrentEmployee();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJobs().find((j) => j.id === id);
  const clients = useClients();
  const employees = useEmployees();
  const quote = useDocs().find((d) => d.id === job?.quoteId);
  const deliveries = useCalendarEvents().filter((e) => e.type === 'delivery' && e.jobId === id);

  const [editing, setEditing] = useState<{ date: Date; start: string; end: string } | null>(null);
  const [askEmail, setAskEmail] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  if (me) return <Redirect href="/home" />;

  if (!job) {
    return (
      <OwnerScreen>
        <ScreenHeader title="Job" onBack={() => goBack('/jobs')} />
        <Card>
          <EmptyState icon={OwnerIcons.receipt} message="This job doesn't exist or has been removed." />
        </Card>
      </OwnerScreen>
    );
  }

  const client = clients.find((c) => c.id === job.clientId);
  const contact = {
    name: client?.name || quote?.client.name || '',
    phone: client?.phone || quote?.client.phone || '',
    email: client?.email || quote?.client.email || '',
    address: job.address || client?.address || '',
  };
  const staff = staffNames(job.assignedEmployeeIds, employees);
  const open = job.status !== 'completed' && job.status !== 'cancelled';
  const timeError = editing && toMinutes(editing.end) <= toMinutes(editing.start) ? 'Finish time must be after the start time.' : null;

  async function saveSchedule() {
    if (!editing || timeError || !job) return;
    setBusy(true);
    const ok = await rescheduleJob(job.id, toDateKey(editing.date), editing.start, editing.end);
    setBusy(false);
    setEditing(null);
    if (!ok) {
      setMessage({ tone: 'error', text: "Couldn't save the new time. Check your internet connection and try again." });
      return;
    }
    setMessage({ tone: 'ok', text: 'Job moved. The calendar and any linked shift have been updated.' });
    if (contact.email) setTimeout(() => setAskEmail(true), 300);
  }

  async function emailUpdate() {
    setAskEmail(false);
    setBusy(true);
    const result = await sendJobUpdateEmail(job!.id);
    setBusy(false);
    setMessage(
      result.error
        ? { tone: 'error', text: result.error }
        : { tone: 'ok', text: `Updated confirmation sent to ${contact.email}.` },
    );
  }

  async function changeStatus(status: JobStatus) {
    const ok = await setJobStatus(job!.id, status);
    setMessage(
      ok
        ? { tone: 'ok', text: status === 'completed' ? 'Job marked as completed. The calendar shows it as done.' : `Job marked as ${status.replace('_', ' ')}.` }
        : { tone: 'error', text: "Couldn't update the job. Check your internet connection and try again." },
    );
  }

  return (
    <OwnerScreen>
      <ScreenHeader title="Job Details" onBack={() => goBack('/jobs')} />

      <View style={styles.top}>
        <View style={styles.flex}>
          <Text style={styles.client}>{contact.name || 'No client name'}</Text>
          <Text style={styles.muted}>{job.title}</Text>
        </View>
        <JobStatusPill status={job.status} />
      </View>

      {message && (
        <View style={[styles.message, message.tone === 'error' && styles.messageError]} accessibilityRole="alert">
          <Text style={[styles.messageText, message.tone === 'error' && { color: C.danger }]}>{message.text}</Text>
          <Pressable onPress={() => setMessage(null)} hitSlop={8} accessibilityLabel="Dismiss">
            <Icon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={C.textSecondary} size={12} />
          </Pressable>
        </View>
      )}

      <Card title="Date & Time" icon={OwnerIcons.calendar}>
        {editing ? (
          <>
            <FormField label="Job date">
              <DateField label="Job date" value={editing.date} onChange={(date) => setEditing({ ...editing, date })} />
            </FormField>
            <View style={styles.row}>
              <FormField label="Start" style={styles.flex}>
                <TimeField label="Start" value={editing.start} onChange={(start) => setEditing({ ...editing, start })} hasError={!!timeError} />
              </FormField>
              <FormField label="Finish (estimate)" style={styles.flex}>
                <TimeField label="Finish (estimate)" value={editing.end} onChange={(end) => setEditing({ ...editing, end })} hasError={!!timeError} />
              </FormField>
            </View>
            {timeError ? <Text style={styles.error}>{timeError}</Text> : null}
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button label="Cancel" variant="secondary" onPress={() => setEditing(null)} />
              </View>
              <View style={styles.flex}>
                <Button label="Save" disabled={!!timeError || busy} onPress={saveSchedule} />
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.value}>{jobWhen(job)}</Text>
            <Text style={styles.muted}>Brisbane time</Text>
            {open && (
              <Button
                label="Change Date & Time"
                variant="secondary"
                icon={{ ios: 'pencil', android: 'edit', web: 'edit' }}
                onPress={() => setEditing({ date: fromDateKey(job.date), start: job.start, end: job.end })}
              />
            )}
          </>
        )}
      </Card>

      <Card title="Client" icon={OwnerIcons.people}>
        <Contact icon={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} value={contact.address} placeholder="No address" />
        <Contact
          icon={{ ios: 'phone.fill', android: 'call', web: 'call' }}
          value={contact.phone}
          placeholder="No phone number"
          onPress={() => Linking.openURL(`tel:${contact.phone.replace(/\s/g, '')}`)}
        />
        <Contact
          icon={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }}
          value={contact.email}
          placeholder="No email"
          onPress={() => Linking.openURL(`mailto:${contact.email}`)}
        />
      </Card>

      <Card title="Work" icon={OwnerIcons.receipt}>
        <Text style={styles.body}>{job.description || 'No work description.'}</Text>
        {quote && (
          <>
            <View style={styles.divider} />
            {quote.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={[styles.body, styles.flex]}>
                  {item.description} {item.qty !== 1 ? `× ${item.qty}` : ''}
                </Text>
                <Text style={styles.value}>{formatMoney(lineAmount(item))}</Text>
              </View>
            ))}
            <TotalsBlock {...docTotals(quote.items, quote.gstRate)} />
            <Pressable
              onPress={() => router.navigate({ pathname: '/invoices/[id]', params: { id: quote.id } })}
              accessibilityRole="link"
              hitSlop={6}>
              <Text style={styles.link}>Open quote {quote.number}</Text>
            </Pressable>
          </>
        )}
      </Card>

      <Card title="Assigned Staff" icon={OwnerIcons.people}>
        <Text style={[styles.value, !staff && styles.muted]}>{staff || 'Not assigned yet'}</Text>
        {open && (
          <Text style={styles.muted}>
            To assign staff, create a shift in the Roster and tap &quot;Select Job&quot; next to the address.
          </Text>
        )}
        {open && (
          <Button
            label="Open Roster"
            variant="secondary"
            icon={OwnerIcons.calendar}
            onPress={() => router.navigate({ pathname: '/roster', params: { from: 'job', date: job.date } })}
          />
        )}
      </Card>

      <Card title="Material Deliveries" icon={{ ios: 'shippingbox.fill', android: 'local_shipping', web: 'local_shipping' }}>
        {deliveries.length === 0 ? (
          <Text style={styles.muted}>No deliveries linked to this job. Add one from the Calendar.</Text>
        ) : (
          deliveries.map((d, i) => (
            <EventRow
              key={d.id}
              event={d}
              showDate
              subtitle={d.supplier}
              showDivider={i > 0}
              onPress={() => router.navigate({ pathname: '/calendar', params: { event: d.id } })}
            />
          ))
        )}
      </Card>

      <Card title="Notes" icon={{ ios: 'note.text', android: 'sticky_note_2', web: 'sticky_note_2' }}>
        <TextField
          value={notes ?? job.notes}
          onChangeText={setNotes}
          onBlur={() => {
            if (notes !== null && notes !== job.notes) updateJobNotes(job.id, notes);
          }}
          placeholder="Private notes about this job (only you can see these)"
          multiline
          accessibilityLabel="Job notes"
        />
      </Card>

      {busy && <ActivityIndicator color={C.accent} />}

      {open ? (
        <View style={styles.actions}>
          <Button label="Mark as Completed" icon={OwnerIcons.check} onPress={() => changeStatus('completed')} />
          {job.status !== 'in_progress' && (
            <Button label="Mark as In Progress" variant="secondary" icon={OwnerIcons.play} onPress={() => changeStatus('in_progress')} />
          )}
          <Pressable onPress={() => setConfirmCancel(true)} accessibilityRole="button" style={styles.cancelJob}>
            <Text style={styles.cancelJobText}>Cancel Job</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          {job.status === 'completed' && job.completedAt && (
            <Text style={[styles.muted, styles.centered]}>Completed {formatShortDate(new Date(job.completedAt))}</Text>
          )}
          <Button
            label="Reopen Job"
            variant="secondary"
            onPress={() => changeStatus(job.assignedEmployeeIds.length > 0 ? 'assigned' : 'scheduled')}
          />
        </View>
      )}

      <ConfirmDialog
        visible={askEmail}
        title={`Send ${contact.name || 'the client'} an updated confirmation email?`}
        confirmLabel="Send email"
        cancelLabel="Not now"
        onConfirm={emailUpdate}
        onCancel={() => setAskEmail(false)}
      />
      <ConfirmDialog
        visible={confirmCancel}
        title="Cancel this job? It stays in your records as Cancelled."
        confirmLabel="Cancel job"
        cancelLabel="Keep job"
        onConfirm={() => {
          setConfirmCancel(false);
          changeStatus('cancelled');
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </OwnerScreen>
  );
}

function Contact({
  icon,
  value,
  placeholder,
  onPress,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  value: string;
  placeholder: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={value ? onPress : undefined} disabled={!onPress || !value} style={styles.contact}>
      <Icon name={icon} color={value && onPress ? C.accent : C.textSecondary} size={15} />
      <Text style={[styles.body, styles.flex, !value && styles.muted]}>{value || placeholder}</Text>
    </Pressable>
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
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  client: {
    color: C.text,
    fontSize: 22,
    fontWeight: '700',
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
  },
  centered: {
    textAlign: 'center',
  },
  value: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  body: {
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: C.danger,
    fontSize: 13,
  },
  link: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
  },
  itemRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 30,
  },
  message: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  messageError: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  messageText: {
    flex: 1,
    color: C.text,
    fontSize: 14,
  },
  actions: {
    gap: Spacing.three - 4,
  },
  cancelJob: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  cancelJobText: {
    color: C.danger,
    fontSize: 15,
    fontWeight: '600',
  },
});
