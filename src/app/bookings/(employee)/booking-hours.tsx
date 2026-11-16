import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, EmployeeScreen, employeeStyles } from '@/systems/bookings/components/employee/ui';
import { SaveNote } from '@/systems/bookings/components/owner/booking-ui';
import { DateField, FormField, TextField } from '@/systems/bookings/components/owner/form';
import { Button } from '@/systems/bookings/components/owner/ui';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Spacing } from '@/constants/theme';
import { useCurrentEmployee } from '@/data/current-employee';
import { useShifts } from '@/data/shifts';
import { addDays, format12h, formatDayKey, todayIn, zonedParts, zonedToIso } from '@/systems/bookings/data/booking-time';
import { myStaff, requestTimeOff, useBookingStaff, useBusinessTimeZone, useTimeOff, withdrawTimeOff } from '@/systems/bookings/data/bookings';

type Message = { tone: 'ok' | 'error'; text: string } | null;

const toDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// More > My Days Off (NexGain Bookings staff): customers can book them when
// they're rostered on; here they see their next shifts and ask for days off
// (the owner approves before customers stop seeing those times).
export default function MyDaysOffScreen() {
  const employee = useCurrentEmployee();
  const me = myStaff(useBookingStaff(), employee?.id);
  const timeZone = useBusinessTimeZone();
  const shifts = useShifts();
  const timeOff = useTimeOff().filter((t) => t.staffId === me?.id && t.status !== 'declined' && t.endsAt > new Date().toISOString());
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const [offFrom, setOffFrom] = useState<string | null>(null);
  const [offTo, setOffTo] = useState<string | null>(null);
  const [offNote, setOffNote] = useState('');

  if (!me || !employee) {
    return (
      <EmployeeScreen>
        <Card style={styles.card}>
          <Text style={styles.muted}>You’re not set up to take bookings yet. Ask your manager to turn you on in Bookings Settings.</Text>
        </Card>
      </EmployeeScreen>
    );
  }

  const today = todayIn(timeZone);
  const upcoming = shifts
    .filter((sh) => sh.employeeIds.includes(employee.id) && sh.date >= today && sh.date <= addDays(today, 13))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const report = (error: string | null, ok: string) => setMessage(error ? { tone: 'error', text: error } : { tone: 'ok', text: ok });

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
        <Text style={styles.muted}>When you’re rostered on. Your next 2 weeks:</Text>
        {upcoming.length === 0 ? (
          <Text style={styles.warning}>You’re not rostered in the next 2 weeks, so customers can’t book you yet.</Text>
        ) : (
          upcoming.map((sh) => (
            <Text key={sh.id} style={styles.line}>
              {formatDayKey(sh.date)}  {format12h(sh.start)} – {format12h(sh.end)}
            </Text>
          ))
        )}
        {!me.active && <Text style={styles.warning}>Your manager has turned off online bookings for you.</Text>}
      </Card>

      <Text style={employeeStyles.sectionLabel}>Days off</Text>
      <Card style={styles.card}>
        <Text style={styles.muted}>Can’t work a rostered day? Ask for it off. Once your manager approves, customers can’t book you then.</Text>
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
  warning: { color: C.warning, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  line: { color: C.text, fontSize: 15, lineHeight: 22, fontVariant: ['tabular-nums'] },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  withdraw: { color: C.danger, fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  off: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
});
