import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SaveNote } from '@/systems/bookings/components/owner/booking-ui';
import { TextField } from '@/systems/bookings/components/owner/form';
import { Card, OwnerIcons } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatDuration } from '@/systems/bookings/data/booking-time';
import {
  currencyCode,
  formatPrice,
  priceKey,
  setStaffPrice,
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

/**
 * Employees › a person › Bookings: their own price for each service they do
 * (e.g. a senior barber charges more). Blank = the service's usual price.
 * Customers see the price for the person they pick.
 */
export function StaffPricesCard({ person }: { person: BookingStaff }) {
  const services = useBookingServices().filter((s) => s.active && (s.staffIds.length === 0 || s.staffIds.includes(person.id)));
  const prices = useStaffPrices();
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  return (
    <Card title="Their Prices" icon={OwnerIcons.money}>
      <Text style={styles.muted}>
        Leave a price blank to use the usual price. Customers see {person.isOwner ? 'your' : `${person.name.split(' ')[0]}’s`} price when they pick{' '}
        {person.isOwner ? 'you' : 'them'}.
      </Text>
      {services.length === 0 ? (
        <Text style={styles.muted}>They don’t do any services yet. Choose who does each service in Services & Prices.</Text>
      ) : (
        services.map((s, i) => <PriceRow key={s.id} service={s} person={person} own={prices.get(priceKey(person.id, s.id))} first={i === 0} onDone={setMessage} />)
      )}
      <SaveNote message={message} />
    </Card>
  );
}

function PriceRow({
  service,
  person,
  own,
  first,
  onDone,
}: {
  service: BookingService;
  person: BookingStaff;
  own: number | undefined;
  first: boolean;
  onDone: (m: { tone: 'ok' | 'error'; text: string }) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (own === undefined ? '' : String(own));

  async function save() {
    if (text === null) return;
    const parsed = parsePriceText(text);
    if (parsed === undefined) {
      onDone({ tone: 'error', text: `${service.name}: enter a price like 55 or 55.50, or leave it blank.` });
      return;
    }
    if ((parsed ?? undefined) === own) return setText(null);
    const error = await setStaffPrice(person.id, service.id, parsed);
    setText(null);
    onDone(
      error
        ? { tone: 'error', text: error }
        : { tone: 'ok', text: parsed === null ? `${service.name}: back to the usual price.` : `${service.name}: ${formatPrice(parsed)} for ${person.name}.` },
    );
  }

  return (
    <View style={[styles.row, !first && styles.divider]}>
      <View style={styles.flex}>
        <Text style={styles.title}>{service.name}</Text>
        <Text style={styles.muted}>
          {formatDuration(service.durationMinutes)} · usual {service.price === null ? 'no price' : formatPrice(service.price)}
        </Text>
      </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  flex: { flex: 1 },
  input: { width: 104 },
});
