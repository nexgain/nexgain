import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StaffPricesCard } from '@/systems/bookings/components/owner/staff-prices-card';
import { SaveNote } from '@/systems/bookings/components/owner/booking-ui';
import { DateField, FormField, SwitchRow, TextField } from '@/systems/bookings/components/owner/form';
import { Badge, Button, Card, goBack, OwnerIcons, OwnerScreen, PageHeader } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { useShifts } from '@/data/shifts';
import { addDays, format12h, formatDayKey, todayIn, zonedParts, zonedToIso } from '@/systems/bookings/data/booking-time';
import {
  addTimeOff,
  removeTimeOff,
  setOwnerWorks,
  setTimeOffStatus,
  updateStaff,
  useBookingSettings,
  useBookingStaff,
  useBusinessTimeZone,
  useTimeOff,
} from '@/systems/bookings/data/bookings';

type Message = { tone: 'ok' | 'error'; text: string } | null;

const toDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Bookings settings > a staff member: their services and prices, the name
// customers see, whether they can be booked (for the owner: "Do you do the work
// yourself?"), when they can be booked and their days off.
export default function BookingStaffScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const person = useBookingStaff().find((s) => s.id === id) ?? null;
  const settings = useBookingSettings();
  const timeZone = useBusinessTimeZone();
  const timeOff = useTimeOff().filter((t) => t.staffId === id && t.status !== 'declined' && t.endsAt > new Date().toISOString());
  const [name, setName] = useState<string | null>(null);
  const shifts = useShifts();
  const [message, setMessage] = useState<Message>(null);
  const [offFrom, setOffFrom] = useState<string | null>(null);
  const [offTo, setOffTo] = useState<string | null>(null);
  const [offNote, setOffNote] = useState('');

  if (!person || !settings) {
    return (
      <OwnerScreen>
        <PageHeader onBack={() => goBack('/bookings/booking-settings')} title="Staff" />
        <Card>
          <Text style={styles.muted}>This person can’t be found.</Text>
        </Card>
      </OwnerScreen>
    );
  }

  const report = (error: string | null, ok: string) => setMessage(error ? { tone: 'error', text: error } : { tone: 'ok', text: ok });
  const today = todayIn(timeZone);
  // Their shifts in the next 2 weeks (the roster decides when they can be booked).
  const upcoming = shifts
    .filter((sh) => person.employeeId && sh.employeeIds.includes(person.employeeId) && sh.date >= today && sh.date <= addDays(today, 13))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  async function saveName() {
    const clean = (name ?? '').trim();
    if (!clean || clean === person!.name) return setName(null);
    report(await updateStaff(person!.id, { name: clean }), 'Name saved.');
    setName(null);
  }

  async function addDaysOff() {
    const from = offFrom ?? today;
    const to = offTo ?? from;
    if (to < from) return setMessage({ tone: 'error', text: 'The last day must be on or after the first day.' });
    const error = await addTimeOff(person!.id, zonedToIso(from, '00:00', timeZone), zonedToIso(addDays(to, 1), '00:00', timeZone), offNote);
    report(error, `Days off added. ${person!.name} can’t be booked then.`);
    if (!error) {
      setOffFrom(null);
      setOffTo(null);
      setOffNote('');
    }
  }

  return (
    <OwnerScreen>
      <PageHeader onBack={() => goBack('/bookings/booking-settings')} title={person.isOwner ? `${person.name} (you)` : person.name} />
      <SaveNote message={message} />

      {person.isOwner && !person.active ? null : <StaffPricesCard person={person} />}

      <Card title="Booking Page" icon={OwnerIcons.person}>
        <FormField label="Name customers see">
          <TextField
            value={name ?? person.name}
            onChangeText={setName}
            onBlur={saveName}
            maxLength={100}
            placeholder="e.g. Sam"
            accessibilityLabel="Name customers see"
          />
        </FormField>
        {person.isOwner ? (
          <SwitchRow
            label="Do you do the work yourself?"
            hint={
              person.active
                ? 'Yes: you’re on your booking page with your own services, prices and schedule.'
                : 'No: you aren’t on your booking page and have no schedule or appointments. Customers book your staff.'
            }
            value={person.active}
            onChange={async (works) =>
              report(await setOwnerWorks(works), works ? 'Customers can book you now.' : 'You’re off the booking page. Customers book your staff.')
            }
          />
        ) : (
          <SwitchRow
            label="Can be booked online"
            hint={person.active ? 'Shown on your booking page.' : 'Hidden: customers can’t book them.'}
            value={person.active}
            onChange={async (active) => report(await updateStaff(person.id, { active }), active ? 'They can be booked again.' : 'They can’t be booked now.')}
          />
        )}
      </Card>

      <Card title="When They Can Be Booked" icon={OwnerIcons.clock}>
        {person.isOwner ? (
          <Text style={styles.muted}>
            {person.active
              ? 'You can be booked any time you’re open (Opening Hours in Bookings Settings). Add days off below for times you’re away.'
              : 'You don’t do the work yourself, so customers can’t book you. Turn on “Do you do the work yourself?” above to change that.'}
          </Text>
        ) : (
          <>
            <Text style={styles.muted}>
              Only when they’re rostered on. Add or change their shifts in the Roster and customers can book them in those hours straight away.
            </Text>
            {upcoming.length === 0 ? (
              <Text style={styles.warning}>Not rostered in the next 2 weeks, so customers can’t book them.</Text>
            ) : (
              upcoming.map((sh) => (
                <Text key={sh.id} style={styles.shift}>
                  {formatDayKey(sh.date)}  {format12h(sh.start)} – {format12h(sh.end)}
                </Text>
              ))
            )}
            <Button label="Open Roster" variant="secondary" icon={OwnerIcons.calendar} onPress={() => router.navigate('/bookings/roster')} />
          </>
        )}
      </Card>

      <Card title="Days Off" icon={OwnerIcons.calendar}>
        {timeOff.length === 0 && <Text style={styles.muted}>No days off coming up.</Text>}
        {timeOff.map((t, i) => {
          const from = zonedParts(t.startsAt, timeZone).date;
          const last = addDays(zonedParts(t.endsAt, timeZone).date, zonedParts(t.endsAt, timeZone).time === '00:00' ? -1 : 0);
          return (
            <View key={t.id} style={[styles.off, i > 0 && styles.divider]}>
              <View style={styles.offTop}>
                <View style={styles.flex}>
                  <Text style={styles.title}>{from === last ? formatDayKey(from, true) : `${formatDayKey(from)} – ${formatDayKey(last)}`}</Text>
                  {t.note ? <Text style={styles.muted}>{t.note}</Text> : null}
                </View>
                {t.status === 'pending' ? <Badge label="Asked for" tone="warning" /> : null}
              </View>
              <View style={styles.actions}>
                {t.status === 'pending' && (
                  <>
                    <Pressable onPress={async () => report(await setTimeOffStatus(t.id, 'approved'), 'Approved.')} accessibilityRole="button" hitSlop={8}>
                      <Text style={styles.approve}>Approve</Text>
                    </Pressable>
                    <Pressable onPress={async () => report(await setTimeOffStatus(t.id, 'declined'), 'Declined.')} accessibilityRole="button" hitSlop={8}>
                      <Text style={styles.remove}>Decline</Text>
                    </Pressable>
                  </>
                )}
                {t.status === 'approved' && (
                  <Pressable onPress={async () => report(await removeTimeOff(t.id), 'Removed.')} accessibilityRole="button" hitSlop={8}>
                    <Text style={styles.remove}>Remove</Text>
                  </Pressable>
                )}
              </View>
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
        <Button label="Add days off" variant="secondary" icon={OwnerIcons.plus} onPress={addDaysOff} />
      </Card>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  off: { paddingVertical: Spacing.two, gap: Spacing.one },
  offTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.four },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  approve: { color: C.success, fontSize: 15, fontWeight: '600' },
  remove: { color: C.danger, fontSize: 15, fontWeight: '600' },
  warning: { color: C.warning, fontSize: 14, fontWeight: '600' },
  shift: { color: C.text, fontSize: 15, fontVariant: ['tabular-nums'] },
});
