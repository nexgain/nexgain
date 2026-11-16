import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChoiceRow, SaveNote } from '@/systems/bookings/components/owner/booking-ui';
import { FormField, SwitchRow } from '@/systems/bookings/components/owner/form';
import { Segmented } from '@/systems/bookings/components/owner/invoices-ui';
import { Button, Card, goBack, OwnerScreen, PageHeader } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { updateBusiness, useBusiness } from '@/data/business';
import {
  EMAIL_PROVIDER,
  emailAccounts,
  findAccount,
  useConnectedAccounts,
  useRefreshConnectedAccountsOnFocus,
  type Provider,
} from '@/data/connected-accounts';
import { formatDayKey, formatTimeIn, zonedParts } from '@/systems/bookings/data/booking-time';
import {
  reminderProblems,
  updateBookingSettings,
  useBookings,
  useBookingSettings,
  useBusinessTimeZone,
} from '@/systems/bookings/data/bookings';

type EmailProvider = Extract<Provider, 'google' | 'microsoft'>;
const PROVIDER_CHOICES: { value: EmailProvider; label: string }[] = [
  { value: 'google', label: 'Gmail' },
  { value: 'microsoft', label: 'Outlook' },
];
const HOURS_CHOICES = [1, 2, 4, 12, 24, 48, 72].map((h) => ({
  value: h,
  label: h < 24 ? `${h} hour${h === 1 ? '' : 's'} before` : `${h / 24} day${h === 24 ? '' : 's'} before (${h} hours)`,
}));

// More > Reminders (NexGain Bookings): automatic reminder emails to customers
// before their appointment, from the owner's own Gmail or Outlook. The server
// sends them every 15 minutes, even when the app is closed.
export default function BookingRemindersScreen() {
  const business = useBusiness();
  const settings = useBookingSettings();
  const timeZone = useBusinessTimeZone();
  const problems = reminderProblems(useBookings());
  const accounts = emailAccounts(useConnectedAccounts());
  useRefreshConnectedAccountsOnFocus();
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  if (!business || !settings) {
    return (
      <OwnerScreen>
        <PageHeader onBack={() => goBack()} title="Reminders" />
        <Card>
          <Text style={styles.muted}>Loading…</Text>
        </Card>
      </OwnerScreen>
    );
  }

  // The same choice the server makes (_shared/booking-mail.ts ownerMailAccount).
  const sender =
    findAccount(accounts, business.reminders.provider ?? undefined) ?? findAccount(accounts, EMAIL_PROVIDER[business.emailApp]) ?? accounts[0];
  const save = async (changes: Parameters<typeof updateBookingSettings>[0]) => {
    const error = await updateBookingSettings(changes);
    setMessage(error ? { tone: 'error', text: error } : { tone: 'ok', text: 'Saved.' });
  };

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack()}
        title="Reminders"
        subtitle="Customers get an email before their appointment, from your own Gmail or Outlook. Sent automatically, even when the app is closed."
      />
      <SaveNote message={message} />

      <Card title="Appointment Reminders" icon={{ ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' }}>
        <SwitchRow
          label="Send reminders to customers"
          hint={settings.remindersEnabled ? 'On for every booking with an email address.' : 'Off: no reminders are sent.'}
          value={settings.remindersEnabled}
          onChange={(remindersEnabled) => save({ remindersEnabled })}
        />
        <ChoiceRow
          label="When"
          hint="Bookings made after this point don’t get one: their confirmation email was just sent."
          choices={HOURS_CHOICES}
          value={settings.reminderHours}
          onChange={(reminderHours) => save({ reminderHours })}
        />
        <Text style={styles.muted}>
          The reminder has the appointment details and, while it can still be changed online, a link to change or cancel it.
        </Text>
      </Card>

      <Card title="Sent From" icon={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }}>
        {!sender ? (
          <>
            <Text style={styles.warning}>Connect Gmail or Outlook so reminders and booking confirmations can be emailed. Until then, none can go out.</Text>
            <Button label="Connect Gmail or Outlook" variant="secondary" onPress={() => router.navigate('/bookings/integrations')} />
          </>
        ) : accounts.length > 1 ? (
          <FormField label="Send from">
            <Segmented
              options={PROVIDER_CHOICES}
              value={sender.provider as EmailProvider}
              onChange={(provider) => updateBusiness({ reminders: { ...business.reminders, provider } })}
            />
            <Text style={styles.muted}>{sender.email}</Text>
          </FormField>
        ) : (
          <Text style={styles.muted}>Sent from {sender.email}</Text>
        )}
      </Card>

      <Card title="Couldn't Send" icon={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}>
        {problems.length === 0 ? (
          <Text style={styles.muted}>No problems. Any upcoming appointment whose reminder can’t be sent shows here, with the reason.</Text>
        ) : (
          problems.map((b, i) => (
            <Pressable
              key={b.id}
              onPress={() => router.push({ pathname: '/bookings/booking/[id]', params: { id: b.id } })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.problem, i > 0 && styles.divider, pressed && styles.pressed]}>
              <View style={styles.flex}>
                <Text style={styles.title}>
                  {b.customerName} · {formatDayKey(zonedParts(b.startsAt, timeZone).date)}, {formatTimeIn(b.startsAt, timeZone)}
                </Text>
                <Text style={styles.reason}>{b.reminderReason}</Text>
              </View>
            </Pressable>
          ))
        )}
      </Card>
      <Pressable onPress={() => router.navigate('/bookings/booking-settings')} accessibilityRole="link" hitSlop={6}>
        <Text style={styles.link}>Bookings Settings</Text>
      </Pressable>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },
  warning: { color: C.warning, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  reason: { color: C.danger, fontSize: 13, lineHeight: 18 },
  problem: { paddingVertical: Spacing.two },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  pressed: { opacity: 0.6 },
  flex: { flex: 1 },
  link: { color: C.accent, fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
