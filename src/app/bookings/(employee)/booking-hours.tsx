import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, EmployeeScreen, employeeStyles } from '@/systems/bookings/components/employee/ui';
import { SaveNote, WeekHours } from '@/systems/bookings/components/owner/booking-ui';
import { DateField, FormField, SwitchRow, TextField } from '@/systems/bookings/components/owner/form';
import { Button } from '@/systems/bookings/components/owner/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Spacing } from '@/constants/theme';
import { useCurrentEmployee } from '@/data/current-employee';
import { addDays, format12h, formatDayKey, LONG_DAYS, todayIn, zonedParts, zonedToIso } from '@/systems/bookings/data/booking-time';
import {
  myStaff,
  requestHours,
  requestTimeOff,
  useBookingSettings,
  useBookingStaff,
  useBusinessTimeZone,
  useTimeOff,
  withdrawTimeOff,
  type StaffDay,
} from '@/systems/bookings/data/bookings';

type Message = { tone: 'ok' | 'error'; text: string } | null;

const toDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "Mon 9:00 am – 5:00 pm" lines for a week of hours. */
function weekSummary(days: { on: boolean; start: string; end: string }[]) {
  return days.map((d, i) => `${LONG_DAYS[i].slice(0, 3)}  ${d.on ? `${format12h(d.start)} – ${format12h(d.end)}` : 'Not working'}`);
}

// More > My Booking Hours & Days Off (NexGain Bookings staff): when customers
// can book them, and asking for new hours or time off. The owner approves
// before anything changes for customers.
export default function BookingHoursScreen() {
  const me = myStaff(useBookingStaff(), useCurrentEmployee()?.id);
  const settings = useBookingSettings();
  const timeZone = useBusinessTimeZone();
  const timeOff = useTimeOff().filter((t) => t.staffId === me?.id && t.status !== 'declined' && t.endsAt > new Date().toISOString());
  const [editing, setEditing] = useState<StaffDay[] | null | undefined>(undefined); // undefined = not editing
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const [offFrom, setOffFrom] = useState<string | null>(null);
  const [offTo, setOffTo] = useState<string | null>(null);
  const [offNote, setOffNote] = useState('');

  if (!me || !settings) {
    return (
      <EmployeeScreen>
        <Card style={styles.card}>
          <Text style={styles.muted}>You’re not set up to take bookings yet. Ask your manager to turn you on in Bookings Settings.</Text>
        </Card>
      </EmployeeScreen>
    );
  }

  const opening = settings.openingHours.map((d) => ({ on: d.open, start: d.start, end: d.end }));
  const current = me.hours ? me.hours.map((d) => ({ on: d.working, start: d.start, end: d.end })) : opening;
  const today = todayIn(timeZone);
  const report = (error: string | null, ok: string) => setMessage(error ? { tone: 'error', text: error } : { tone: 'ok', text: ok });

  async function sendHours() {
    setBusy(true);
    const error = await requestHours(me!.id, editing ?? null);
    setBusy(false);
    report(error, 'Sent to your manager. Your hours change once they approve.');
    if (!error) setEditing(undefined);
  }

  async function askTimeOff() {
    const from = offFrom ?? today;
    const to = offTo ?? from;
    if (to < from) return setMessage({ tone: 'error', text: 'The last day must be on or after the first day.' });
    setBusy(true);
    const error = await requestTimeOff(me!.id, zonedToIso(from, '00:00', timeZone), zonedToIso(addDays(to, 1), '00:00', timeZone), offNote);
    setBusy(false);
    report(error, 'Sent to your manager. Customers can still book you until they approve it.');
    if (!error) {
      setOffFrom(null);
      setOffTo(null);
      setOffNote('');
    }
  }

  return (
    <EmployeeScreen>
      <SaveNote message={message} />

      <Text style={employeeStyles.sectionLabel}>When customers can book you</Text>
      <Card style={styles.card}>
        <Text style={styles.muted}>{me.hours ? 'Your own hours:' : 'Your hours are the business’s opening hours:'}</Text>
        {weekSummary(current).map((line) => (
          <Text key={line} style={styles.line}>
            {line}
          </Text>
        ))}
        {me.hoursRequestedAt && (
          <View style={styles.pending}>
            <Text style={styles.pendingTitle}>Waiting for your manager</Text>
            <Text style={styles.muted}>
              You asked for {me.requestedHours ? 'new hours' : 'the opening hours'}
              {me.requestedHours ? `:\n${weekSummary(me.requestedHours.map((d) => ({ on: d.working, start: d.start, end: d.end }))).join('\n')}` : '.'}
            </Text>
            <Pressable
              onPress={async () => report(await requestHours(me.id, null, true), 'Request withdrawn.')}
              accessibilityRole="button"
              hitSlop={6}>
              <Text style={styles.withdraw}>Withdraw request</Text>
            </Pressable>
          </View>
        )}
        {editing === undefined ? (
          <Button label="Ask for different hours" variant="secondary" onPress={() => setEditing(me.hours ?? null)} />
        ) : (
          <View style={styles.editor}>
            <SwitchRow
              label="Same as opening hours"
              value={editing === null}
              onChange={(same) => setEditing(same ? null : opening.map((d) => ({ working: d.on, start: d.start, end: d.end })))}
            />
            {editing && (
              <WeekHours
                days={editing.map((d) => ({ on: d.working, start: d.start, end: d.end }))}
                onLabel="Working"
                offLabel="Not working"
                onChange={(days) => setEditing(days.map((d) => ({ working: d.on, start: d.start, end: d.end })))}
              />
            )}
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button label="Cancel" variant="secondary" onPress={() => setEditing(undefined)} fill />
              </View>
              <View style={styles.flex}>
                <Button label="Send to manager" onPress={sendHours} disabled={busy} fill />
              </View>
            </View>
          </View>
        )}
      </Card>

      <Text style={employeeStyles.sectionLabel}>Days off</Text>
      <Card style={styles.card}>
        {timeOff.length === 0 && <Text style={styles.muted}>No days off coming up.</Text>}
        {timeOff.map((t, i) => {
          const from = zonedParts(t.startsAt, timeZone).date;
          const end = zonedParts(t.endsAt, timeZone);
          const last = addDays(end.date, end.time === '00:00' ? -1 : 0);
          return (
            <View key={t.id} style={[styles.off, i > 0 && styles.divider]}>
              <View style={styles.flex}>
                <Text style={styles.title}>{from === last ? formatDayKey(from, true) : `${formatDayKey(from)} – ${formatDayKey(last)}`}</Text>
                <Text style={[styles.muted, t.status === 'pending' && { color: C.warning }]}>
                  {t.status === 'pending' ? 'Waiting for your manager' : 'Approved'}
                  {t.note ? ` · ${t.note}` : ''}
                </Text>
              </View>
              {t.status === 'pending' && (
                <Pressable onPress={async () => report(await withdrawTimeOff(t.id), 'Request withdrawn.')} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.withdraw}>Withdraw</Text>
                </Pressable>
              )}
            </View>
          );
        })}
        <View style={styles.row}>
          <View style={styles.flex}>
            <FormField label="First day">
              <DateField label="First day off" value={toDate(offFrom ?? today)} onChange={(d) => setOffFrom(toKey(d))} />
            </FormField>
          </View>
          <View style={styles.flex}>
            <FormField label="Last day">
              <DateField label="Last day off" value={toDate(offTo ?? offFrom ?? today)} onChange={(d) => setOffTo(toKey(d))} />
            </FormField>
          </View>
        </View>
        <TextField value={offNote} onChangeText={setOffNote} placeholder="Reason (optional), e.g. Holiday" maxLength={500} />
        <Button label="Ask for time off" variant="secondary" onPress={askTimeOff} disabled={busy} />
      </Card>
    </EmployeeScreen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, gap: Spacing.two },
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },
  line: { color: C.text, fontSize: 15, lineHeight: 22, fontVariant: ['tabular-nums'] },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  pending: { gap: Spacing.one, padding: Spacing.three, borderRadius: 12, backgroundColor: C.warningSoft, marginTop: Spacing.two },
  pendingTitle: { color: C.warning, fontSize: 15, fontWeight: '700' },
  withdraw: { color: C.danger, fontSize: 15, fontWeight: '600', marginTop: Spacing.one },
  editor: { gap: Spacing.two, marginTop: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  flex: { flex: 1 },
  off: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
});
