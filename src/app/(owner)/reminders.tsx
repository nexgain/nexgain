import { useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField, SwitchRow, TextField } from '@/components/owner/form';
import { Segmented } from '@/components/owner/invoices-ui';
import { Badge, Button, Card, goBack, Icon, OwnerIcons, OwnerScreen, PageHeader } from '@/components/owner/ui';
import { Colors as C, Radius, Spacing } from '@/constants/theme';
import { updateBusiness, useBusiness, type ReminderSettings } from '@/data/business';
import { useClients } from '@/data/clients';
import {
  EMAIL_PROVIDER,
  emailAccounts,
  findAccount,
  useConnectedAccounts,
  useRefreshConnectedAccountsOnFocus,
  type Provider,
} from '@/data/connected-accounts';
import { jobWhen } from '@/components/owner/jobs-ui';
import { useJobs } from '@/data/jobs';
import {
  DEFAULT_REMINDER_MESSAGE,
  DEFAULT_REMINDER_SUBJECT,
  REMINDER_TAGS,
  reminderProblems,
  sendTestReminder,
  useReminders,
} from '@/data/reminders';

type EmailProvider = Extract<Provider, 'google' | 'microsoft'>;

const PROVIDER_CHOICES: { value: EmailProvider; label: string }[] = [
  { value: 'google', label: 'Gmail' },
  { value: 'microsoft', label: 'Outlook' },
];

type Message = { tone: 'ok' | 'error'; text: string };

// More > Reminders: automatic reminder emails to clients, a week before and the day
// before each job at 9:00 am. The server sends them (even with the app closed);
// this screen changes the settings and lists any that couldn't be sent.
export default function RemindersScreen() {
  const business = useBusiness();
  // Email accounts only: business apps like Square can't send reminders.
  const accounts = emailAccounts(useConnectedAccounts());
  // The same connection list the server sends with, checked fresh each time this screen opens.
  useRefreshConnectedAccountsOnFocus();
  const jobs = useJobs();
  const clients = useClients();
  const problems = reminderProblems(jobs, useReminders());

  const [subject, setSubject] = useState(business?.reminders.subject || DEFAULT_REMINDER_SUBJECT);
  const [message, setMessage] = useState(business?.reminders.message || DEFAULT_REMINDER_MESSAGE);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<Message | null>(null);

  if (!business) {
    return (
      <OwnerScreen>
        <PageHeader onBack={() => goBack()} title="Reminders" />
        <Card>
          <Text style={styles.muted}>Finish owner sign-up to set up reminders.</Text>
        </Card>
      </OwnerScreen>
    );
  }

  const settings = business.reminders;
  const save = (changes: Partial<ReminderSettings>) => updateBusiness({ reminders: { ...settings, ...changes } });
  // The same choice the server makes (send-reminders pickAccount).
  const sender =
    findAccount(accounts, settings.provider ?? undefined) ?? findAccount(accounts, EMAIL_PROVIDER[business.emailApp]) ?? accounts[0];
  const both = accounts.length > 1;

  // Wording that matches the default is saved as blank, so it follows any future improvements.
  function changeSubject(text: string) {
    setSubject(text);
    save({ subject: text.trim() === DEFAULT_REMINDER_SUBJECT ? '' : text });
  }
  function changeMessage(text: string) {
    setMessage(text);
    save({ message: text.trim() === DEFAULT_REMINDER_MESSAGE ? '' : text });
  }
  function restoreDefault() {
    setSubject(DEFAULT_REMINDER_SUBJECT);
    setMessage(DEFAULT_REMINDER_MESSAGE);
    save({ subject: '', message: '' });
  }

  async function sendTest() {
    setTesting(true);
    setResult(null);
    const sent = await sendTestReminder(subject, message);
    setTesting(false);
    setResult(sent.error ? { tone: 'error', text: sent.error } : { tone: 'ok', text: `Test reminder sent to ${sent.to}. Check your inbox.` });
  }

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack()}
        title="Reminders"
        subtitle="Clients get an email at 9:00 am (Brisbane time) before their job, from your own Gmail or Outlook. They're sent automatically, even when the app is closed."
      />

      <Card title="Automatic Reminders" icon={{ ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' }}>
        <SwitchRow
          label="Send reminders to clients"
          hint={settings.enabled ? 'On for every job, unless you turn it off on the job.' : 'Off: no reminders are sent.'}
          value={settings.enabled}
          onChange={(enabled) => save({ enabled })}
        />
        <View style={styles.divider} />
        {!sender ? (
          <>
            <Text style={styles.warning}>
              Connect Gmail or Outlook so reminders can be sent from your email address. Until then, reminders can&apos;t go out.
            </Text>
            <Button label="Connect Gmail or Outlook" variant="secondary" onPress={() => router.navigate('/integrations')} />
          </>
        ) : both ? (
          <FormField label="Send reminders from">
            <Segmented options={PROVIDER_CHOICES} value={sender.provider as EmailProvider} onChange={(provider) => save({ provider })} />
            <Text style={styles.muted}>{sender.email}</Text>
          </FormField>
        ) : (
          <Text style={styles.muted}>Sent from {sender.email}</Text>
        )}
      </Card>

      <Card title="When" icon={OwnerIcons.clock}>
        <SwitchRow
          label="1 week before"
          hint="9:00 am, 7 days before the job. Skipped for jobs booked less than a week ahead."
          value={settings.weekBefore}
          onChange={(weekBefore) => save({ weekBefore })}
        />
        <View style={styles.divider} />
        <SwitchRow
          label="1 day before"
          hint="9:00 am the day before. Jobs booked after that get it straight away."
          value={settings.dayBefore}
          onChange={(dayBefore) => save({ dayBefore })}
        />
        {!settings.enabled && (
          <Text style={styles.muted}>Reminders are off, so none are sent yet. These choices apply once you turn them on.</Text>
        )}
      </Card>

      <Card title="Message" icon={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }}>
        <FormField label="Subject">
          <TextField
            value={subject}
            onChangeText={changeSubject}
            onBlur={() => !subject.trim() && changeSubject(DEFAULT_REMINDER_SUBJECT)}
            accessibilityLabel="Reminder subject"
          />
        </FormField>
        <FormField label="Message">
          <TextField
            value={message}
            onChangeText={changeMessage}
            onBlur={() => !message.trim() && changeMessage(DEFAULT_REMINDER_MESSAGE)}
            multiline
            style={styles.message}
            accessibilityLabel="Reminder message"
          />
        </FormField>
        <Text style={styles.muted}>
          These are filled in for each job: {REMINDER_TAGS.join(' ')}. A line is left out when what it needs is blank (for example,
          no business phone saved).
        </Text>
        <Pressable onPress={restoreDefault} accessibilityRole="button" hitSlop={6}>
          <Text style={styles.link}>Restore default wording</Text>
        </Pressable>
        {!business.phone.trim() && (
          <Pressable onPress={() => router.navigate('/business-profile')} accessibilityRole="link" hitSlop={6}>
            <Text style={styles.link}>Add your business phone number in Business Profile</Text>
          </Pressable>
        )}
        <View style={styles.divider} />
        <Button
          label="Send test reminder"
          variant="secondary"
          icon={{ ios: 'paperplane.fill', android: 'send', web: 'send' }}
          disabled={testing || !sender}
          onPress={sendTest}
        />
        {testing && <ActivityIndicator color={C.accent} />}
        {result && (
          <Text style={[styles.result, result.tone === 'error' && { color: C.danger }]} accessibilityRole="alert">
            {result.text}
          </Text>
        )}
      </Card>

      <Card title="Couldn't Send" icon={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}>
        {problems.length === 0 ? (
          <Text style={styles.muted}>No problems. Any upcoming job whose reminder can&apos;t be sent shows here, with the reason.</Text>
        ) : (
          problems.map(({ job, reminder }, i) => (
            <Pressable
              key={reminder.id}
              onPress={() => router.navigate({ pathname: '/job/[id]', params: { id: job.id } })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.problem, i > 0 && styles.problemDivider, pressed && styles.pressed]}>
              <View style={styles.flex}>
                <Text style={styles.problemTitle}>{clients.find((c) => c.id === job.clientId)?.name || job.title}</Text>
                <Text style={styles.muted}>
                  {job.title} · {jobWhen(job)}
                </Text>
                <Text style={styles.problemReason}>{reminder.reason}</Text>
              </View>
              <Badge label={reminder.kind === 'week' ? '1 week' : '1 day'} tone="danger" />
              <Icon name={OwnerIcons.chevron} color={C.textSecondary} size={14} />
            </Pressable>
          ))
        )}
      </Card>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  muted: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  warning: {
    color: C.warning,
    fontSize: 14,
    lineHeight: 20,
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
  message: {
    minHeight: 260,
  },
  result: {
    color: C.success,
    fontSize: 14,
  },
  problem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
  },
  problemDivider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  pressed: {
    opacity: 0.7,
  },
  problemTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  problemReason: {
    color: C.danger,
    fontSize: 13,
    marginTop: 2,
  },
});
