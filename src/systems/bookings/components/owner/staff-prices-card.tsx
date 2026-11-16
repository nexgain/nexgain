import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SaveNote } from '@/systems/bookings/components/owner/booking-ui';
import { Checkbox, TextField } from '@/systems/bookings/components/owner/form';
import { Card, OwnerIcons } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatDuration } from '@/systems/bookings/data/booking-time';
import {
  currencyCode,
  doesService,
  formatPrice,
  priceKey,
  setStaffService,
  sortedServices,
  useBookingServices,
  useStaffPrices,
  type BookingService,
  type BookingStaff,
} from '@/systems/bookings/data/bookings';

/** "55", "55.50", "$55" -> 55; "" -> null (usual price); anything else -> undefined. */
export function parsePriceText(text: string): number | null | undefined {
  const t = text.trim().replace(/^[$£€]/, '').replace(/,/g, '');
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined;
  return Number(t);
}

type Note = { tone: 'ok' | 'error'; text: string };

/**
 * A person's Services & Prices: tick the services they do and set their own
 * price for each (blank = the usual price). Customers only see the services a
 * person ticked, at that person's price. `mine` = the person is looking at their own.
 */
export function StaffPricesCard({ person, mine = false }: { person: BookingStaff; mine?: boolean }) {
  const services = sortedServices(useBookingServices()).filter((s) => s.active);
  const prices = useStaffPrices();
  const [message, setMessage] = useState<Note | null>(null);
  const first = person.name.split(' ')[0];
  const ticked = services.filter((s) => doesService(person.id, s.id, prices)).length;

  return (
    <Card title={mine ? 'My Services & Prices' : 'Services & Prices'} icon={OwnerIcons.money}>
      <Text style={styles.muted}>
        {mine ? 'Tick the services you do and set your price.' : `Tick the services ${first} does and set ${person.isOwner ? 'your' : 'their'} price.`} Leave a price blank
        to use the usual price. Customers only see the ticked services when they pick {mine || person.isOwner ? 'you' : first}.
      </Text>
      {services.length === 0 ? (
        <Text style={styles.muted}>There are no services yet. {mine ? 'Ask the owner to add them' : 'Add them'} in Services & Prices.</Text>
      ) : (
        <>
          {ticked === 0 && (
            <Text style={styles.warn}>{mine ? 'You don’t' : `${first} doesn’t`} do any services yet, so customers can’t book {mine ? 'you' : 'them'}.</Text>
          )}
          {services.map((s, i) => (
            <ServiceRow
              key={s.id}
              service={s}
              person={person}
              does={doesService(person.id, s.id, prices)}
              own={prices.get(priceKey(person.id, s.id)) ?? null}
              first={i === 0}
              onDone={setMessage}
            />
          ))}
        </>
      )}
      <SaveNote message={message} />
    </Card>
  );
}

function ServiceRow({
  service,
  person,
  does,
  own,
  first,
  onDone,
}: {
  service: BookingService;
  person: BookingStaff;
  does: boolean;
  own: number | null;
  first: boolean;
  onDone: (m: Note) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = text ?? (own === null ? '' : String(own));

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const parsed = text === null ? own : parsePriceText(text);
    const error = await setStaffService(person.id, service.id, !does, parsed === undefined ? null : parsed);
    setBusy(false);
    setText(null);
    onDone(error ? { tone: 'error', text: error } : { tone: 'ok', text: `${service.name}: ${does ? 'removed' : 'added'}.` });
  }

  async function save() {
    if (text === null) return;
    const parsed = parsePriceText(text);
    if (parsed === undefined) {
      onDone({ tone: 'error', text: `${service.name}: enter a price like 55 or 55.50, or leave it blank.` });
      return;
    }
    if (parsed === own) return setText(null);
    const error = await setStaffService(person.id, service.id, true, parsed);
    setText(null);
    onDone(
      error
        ? { tone: 'error', text: error }
        : { tone: 'ok', text: parsed === null ? `${service.name}: back to the usual price.` : `${service.name}: ${formatPrice(parsed)} for ${person.name}.` },
    );
  }

  return (
    <View style={[styles.row, !first && styles.divider]}>
      <Pressable
        onPress={toggle}
        disabled={busy}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: does, disabled: busy }}
        accessibilityLabel={`${person.name} does ${service.name}`}
        style={styles.tick}>
        <Checkbox checked={does} />
        <View style={styles.flex}>
          <Text style={[styles.title, !does && styles.off]}>{service.name}</Text>
          <Text style={styles.muted}>
            {formatDuration(service.durationMinutes)} · usual {service.price === null ? 'no price' : formatPrice(service.price)}
          </Text>
        </View>
      </Pressable>
      {does && (
        <View style={styles.input}>
          <TextField
            value={shown}
            onChangeText={setText}
            onBlur={save}
            onSubmitEditing={save}
            placeholder={service.price === null ? '—' : String(service.price)}
            keyboardType="decimal-pad"
            returnKeyType="done"
            maxLength={10}
            accessibilityLabel={`${person.name}’s price for ${service.name} (${currencyCode()})`}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  warn: { color: C.warning, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  off: { color: C.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  tick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  flex: { flex: 1 },
  input: { width: 104 },
});
