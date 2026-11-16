import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BookingLinkCard } from '@/systems/bookings/components/owner/booking-link-card';
import { ChoiceRow, ListRow, SaveNote, WeekHours } from '@/systems/bookings/components/owner/booking-ui';
import { DateField, FormField, SwitchRow, TextField } from '@/systems/bookings/components/owner/form';
import { Button, Card, goBack, OwnerIcons, OwnerScreen, PageHeader } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { updateBusiness } from '@/data/business';
import {
  addDays,
  formatDayKey,
  formatDuration,
  TIME_ZONES,
  timeZoneLabel,
  todayIn,
  zonedParts,
  zonedToIso,
} from '@/systems/bookings/data/booking-time';
import {
  addTimeOff,
  bookingLink,
  cleanSlug,
  formatPrice,
  removeTimeOff,
  updateBookingSettings,
  useBookingServices,
  useBookingSettings,
  useBookingsLoad,
  useBookingStaff,
  useBusinessTimeZone,
  useTimeOff,
  type BookingSettings,
} from '@/systems/bookings/data/bookings';

const SLOT_CHOICES = [5, 10, 15, 20, 30, 60].map((v) => ({ value: v, label: `Every ${v} minutes` }));
const BUFFER_CHOICES = [0, 5, 10, 15, 20, 30, 45, 60].map((v) => ({ value: v, label: v ? `${v} minutes` : 'No gap' }));
const NOTICE_CHOICES = [
  { value: 0, label: 'Any time (no notice)' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
  { value: 720, label: '12 hours' },
  { value: 1440, label: '1 day' },
  { value: 2880, label: '2 days' },
];
const AHEAD_CHOICES = [7, 14, 30, 60, 90, 180, 365].map((v) => ({ value: v, label: v === 365 ? '1 year' : `${v} days` }));
const CANCEL_CHOICES = [
  { value: 0, label: 'Up to the appointment' },
  ...[1, 2, 4, 12, 24, 48, 72].map((v) => ({ value: v, label: `Up to ${v} hour${v === 1 ? '' : 's'} before` })),
];

type Message = { tone: 'ok' | 'error'; text: string } | null;

const toDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// More > Bookings settings (NexGain Bookings): the public booking link, what
// customers can book (services), when (opening hours, staff, closures) and the
// rules (gaps, notice, how far ahead, cancelling).
export default function BookingSettingsScreen() {
  const settings = useBookingSettings();
  const load = useBookingsLoad();
  const services = useBookingServices();
  const staff = useBookingStaff();
  const timeOff = useTimeOff();
  const timeZone = useBusinessTimeZone();
  const [message, setMessage] = useState<Message>(null);
  const [slugText, setSlugText] = useState<string | null>(null);
  const [policy, setPolicy] = useState<string | null>(null);
  const [closeFrom, setCloseFrom] = useState<string | null>(null);
  const [closeTo, setCloseTo] = useState<string | null>(null);
  const [closeNote, setCloseNote] = useState('');

  if (!settings) {
    return (
      <OwnerScreen>
        <PageHeader onBack={() => goBack()} title="Bookings Settings" />
        <Card>
          <Text style={styles.muted}>
            {load === 'error' ? 'Couldn’t load your booking settings. Check your internet connection and try again.' : 'Loading…'}
          </Text>
        </Card>
      </OwnerScreen>
    );
  }

  async function save(changes: Partial<BookingSettings>, ok = 'Saved.') {
    const error = await updateBookingSettings(changes);
    setMessage(error ? { tone: 'error', text: error } : { tone: 'ok', text: ok });
    return error;
  }

  const slug = slugText ?? settings.slug;
  const cleaned = cleanSlug(slug);
  const today = todayIn(timeZone);
  const closures = timeOff.filter((t) => t.staffId === null && t.status === 'approved' && t.endsAt > new Date().toISOString());

  async function saveSlug() {
    if (!cleaned) {
      setMessage({ tone: 'error', text: 'Enter a link name using letters and numbers.' });
      return;
    }
    if (cleaned === settings!.slug) {
      setSlugText(null);
      return;
    }
    const error = await save({ slug: cleaned }, 'Link changed. Your old link no longer works, so update it anywhere you shared it.');
    if (!error) setSlugText(null);
  }

  async function addClosure() {
    const from = closeFrom ?? today;
    const to = closeTo ?? from;
    if (to < from) {
      setMessage({ tone: 'error', text: 'The last day must be on or after the first day.' });
      return;
    }
    const error = await addTimeOff(null, zonedToIso(from, '00:00', timeZone), zonedToIso(addDays(to, 1), '00:00', timeZone), closeNote);
    setMessage(error ? { tone: 'error', text: error } : { tone: 'ok', text: 'Closed days added. Customers can’t book them.' });
    if (!error) {
      setCloseFrom(null);
      setCloseTo(null);
      setCloseNote('');
    }
  }

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack()}
        title="Bookings Settings"
        subtitle="What customers can book online, when, and your rules. Changes apply to your booking page straight away."
      />
      <SaveNote message={message} />

      <BookingLinkCard />

      <Card title="Online Bookings" icon={OwnerIcons.calendar}>
        <SwitchRow
          label="Take bookings online"
          hint={settings.accepting ? 'Customers can book on your booking page.' : 'Off: your booking page says you aren’t taking bookings.'}
          value={settings.accepting}
          onChange={(accepting) => save({ accepting })}
        />
        <FormField label="Your link name">
          <TextField
            value={slug}
            onChangeText={setSlugText}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={60}
            accessibilityLabel="Your link name"
          />
          {slugText !== null && cleaned !== settings.slug && (
            <>
              <Text style={styles.muted}>New link: {cleaned ? bookingLink(cleaned) : '—'}</Text>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Button label="Cancel" variant="secondary" onPress={() => setSlugText(null)} fill />
                </View>
                <View style={styles.flex}>
                  <Button label="Save link" onPress={saveSlug} fill />
                </View>
              </View>
            </>
          )}
        </FormField>
      </Card>

      <Card title="Services" icon={OwnerIcons.scissors}>
        <Text style={styles.muted}>What customers can book, how long it takes and the price.</Text>
        {services.length === 0 ? (
          <Text style={styles.muted}>No services yet. Add one so customers can book.</Text>
        ) : (
          services.map((s, i) => (
            <ListRow
              key={s.id}
              title={s.name}
              subtitle={[
                formatDuration(s.durationMinutes),
                s.price === null ? 'No price shown' : formatPrice(s.price),
                s.staffIds.length ? `${s.staffIds.length} staff` : 'Everyone',
                s.active ? null : 'Hidden',
              ]
                .filter(Boolean)
                .join(' · ')}
              muted={!s.active}
              showDivider={i > 0}
              onPress={() => router.push({ pathname: '/bookings/booking-service/[id]', params: { id: s.id } })}
            />
          ))
        )}
        <Button
          label="Add a service"
          variant="secondary"
          icon={OwnerIcons.plus}
          onPress={() => router.push({ pathname: '/bookings/booking-service/[id]', params: { id: 'new' } })}
        />
      </Card>

      <Card title="Opening Hours" icon={OwnerIcons.clock}>
        <Text style={styles.muted}>When you (the owner) can be booked, in {timeZoneLabel(timeZone)} time. Staff can be booked when they’re rostered on.</Text>
        <WeekHours
          days={settings.openingHours.map((d) => ({ on: d.open, start: d.start, end: d.end }))}
          onLabel="Open"
          offLabel="Closed"
          onChange={(days) => save({ openingHours: days.map((d) => ({ open: d.on, start: d.start, end: d.end })) })}
        />
      </Card>

      <Card title="Staff" icon={OwnerIcons.people}>
        <Text style={styles.muted}>Who customers can book and their days off. Staff can be booked when they’re rostered on (Roster).</Text>
        {staff.map((s, i) => (
          <ListRow
            key={s.id}
            title={s.isOwner ? `${s.name} (you)` : s.name}
            subtitle={!s.active ? 'Can’t be booked' : s.isOwner ? 'Bookable in your opening hours' : 'Bookable when rostered'}
            muted={!s.active}
            showDivider={i > 0}
            onPress={() => router.push({ pathname: '/bookings/booking-staff/[id]', params: { id: s.id } })}
          />
        ))}
        <Text style={styles.muted}>New team members who join with your invite code are added here automatically.</Text>
      </Card>

      <Card title="Closed Days" icon={OwnerIcons.calendar}>
        <Text style={styles.muted}>Public holidays or time away: nobody can be booked on these days.</Text>
        {closures.map((t, i) => {
          const from = zonedParts(t.startsAt, timeZone).date;
          const last = addDays(zonedParts(t.endsAt, timeZone).date, -1);
          return (
            <View key={t.id} style={[styles.closure, i > 0 && styles.divider]}>
              <View style={styles.flex}>
                <Text style={styles.title}>{from === last ? formatDayKey(from, true) : `${formatDayKey(from)} – ${formatDayKey(last)}`}</Text>
                {t.note ? <Text style={styles.muted}>{t.note}</Text> : null}
              </View>
              <Pressable
                onPress={async () => {
                  const error = await removeTimeOff(t.id);
                  setMessage(error ? { tone: 'error', text: error } : { tone: 'ok', text: 'Removed. Those days can be booked again.' });
                }}
                accessibilityRole="button"
                accessibilityLabel="Remove closed days"
                hitSlop={8}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
          );
        })}
        <View style={styles.row}>
          <View style={styles.flex}>
            <FormField label="First day">
              <DateField label="First closed day" value={toDate(closeFrom ?? today)} onChange={(d) => setCloseFrom(toKey(d))} />
            </FormField>
          </View>
          <View style={styles.flex}>
            <FormField label="Last day">
              <DateField label="Last closed day" value={toDate(closeTo ?? closeFrom ?? today)} onChange={(d) => setCloseTo(toKey(d))} />
            </FormField>
          </View>
        </View>
        <TextField value={closeNote} onChangeText={setCloseNote} placeholder="Reason (optional), e.g. Christmas" maxLength={200} />
        <Button label="Add closed days" variant="secondary" icon={OwnerIcons.plus} onPress={addClosure} />
      </Card>

      <Card title="Reminders" icon={OwnerIcons.bell}>
        <ListRow
          title={settings.remindersEnabled ? 'Reminder emails are on' : 'Reminder emails are off'}
          subtitle={settings.remindersEnabled ? `Sent ${settings.reminderHours < 24 ? `${settings.reminderHours} hour${settings.reminderHours === 1 ? '' : 's'}` : `${settings.reminderHours / 24} day${settings.reminderHours === 24 ? '' : 's'}`} before each appointment` : 'Customers aren’t reminded'}
          onPress={() => router.navigate('/bookings/reminders')}
        />
      </Card>

      <Card title="Booking Rules" icon={OwnerIcons.info}>
        <ChoiceRow
          label="Start times"
          hint="How often booking times are offered (9:00, 9:15, 9:30…)."
          choices={SLOT_CHOICES}
          value={settings.slotMinutes}
          onChange={(slotMinutes) => save({ slotMinutes })}
        />
        <ChoiceRow
          label="Gap after each booking"
          hint="Time kept free to clean up or get ready."
          choices={BUFFER_CHOICES}
          value={settings.bufferMinutes}
          onChange={(bufferMinutes) => save({ bufferMinutes })}
        />
        <ChoiceRow
          label="Minimum notice"
          hint="How soon customers can book from now."
          choices={NOTICE_CHOICES}
          value={settings.minNoticeMinutes}
          onChange={(minNoticeMinutes) => save({ minNoticeMinutes })}
        />
        <ChoiceRow
          label="Book ahead"
          hint="How far ahead customers can book."
          choices={AHEAD_CHOICES}
          value={settings.maxDaysAhead}
          onChange={(maxDaysAhead) => save({ maxDaysAhead })}
        />
        <ChoiceRow
          label="Customers can change or cancel online"
          hint="After this, they need to contact you."
          choices={CANCEL_CHOICES}
          value={settings.cancelNoticeHours}
          onChange={(cancelNoticeHours) => save({ cancelNoticeHours })}
        />
        <FormField label="Cancellation policy (shown to customers)">
          <TextField
            value={policy ?? settings.cancellationPolicy}
            onChangeText={setPolicy}
            onBlur={() => {
              if (policy !== null && policy.trim() !== settings.cancellationPolicy) save({ cancellationPolicy: policy.trim() });
            }}
            placeholder="e.g. Please give 24 hours’ notice. Missed appointments may be charged."
            multiline
            maxLength={2000}
            accessibilityLabel="Cancellation policy"
          />
        </FormField>
        <ChoiceRow
          label="Time zone"
          hint="Booking times are in this time zone, wherever your customers are."
          choices={TIME_ZONES.some((z) => z.id === timeZone) ? TIME_ZONES.map((z) => ({ value: z.id, label: z.label })) : [{ value: timeZone, label: timeZoneLabel(timeZone) }, ...TIME_ZONES.map((z) => ({ value: z.id, label: z.label }))]}
          value={timeZone}
          onChange={(timezone) => {
            updateBusiness({ timezone });
            setMessage({ tone: 'ok', text: `Time zone set to ${timeZoneLabel(timezone)}.` });
          }}
        />
      </Card>
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  closure: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  remove: { color: C.danger, fontSize: 15, fontWeight: '600' },
});
