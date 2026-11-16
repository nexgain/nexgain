import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ListRow, SaveNote } from '@/systems/bookings/components/owner/booking-ui';
import { Button, Card, EmptyState, goBack, Icon, OwnerIcons, OwnerScreen, PageHeader } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatDuration } from '@/systems/bookings/data/booking-time';
import {
  formatPrice,
  moveService,
  sortedServices,
  staffForService,
  useBookingServices,
  useBookingsLoad,
  useBookingStaff,
  useStaffPrices,
  type BookingService,
} from '@/systems/bookings/data/bookings';

const openService = (id: string) => router.push({ pathname: '/bookings/booking-service/[id]', params: { id } });

/** Services in groups by category, in the order customers see them. */
function byCategory(list: BookingService[]) {
  const groups: { name: string; items: BookingService[] }[] = [];
  for (const s of list) {
    const name = s.category.trim() || 'Services';
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, items: [] }));
    g.items.push(s);
  }
  return groups;
}

// More > Services & Prices (NexGain Bookings): everything customers can book,
// grouped by category, with the usual price and how long it takes. Customers
// see this list (in this order) on the booking page. Tap one to edit or delete it.
export default function ServicesScreen() {
  const services = sortedServices(useBookingServices());
  const staff = useBookingStaff();
  const prices = useStaffPrices();
  const load = useBookingsLoad();
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const shown = services.filter((s) => s.active);
  const hidden = services.filter((s) => !s.active);

  const whoDoes = (s: BookingService) => {
    const who = staffForService(s, staff, prices);
    if (who.length === 0) return 'Nobody does it yet';
    if (who.length === staff.filter((x) => x.active).length && who.length > 1) return 'Everyone';
    return who.map((x) => x.name.split(' ')[0]).join(', ');
  };

  async function move(id: string, direction: -1 | 1) {
    const error = await moveService(id, direction);
    setMessage(error ? { tone: 'error', text: error } : null);
  }

  const list = (items: BookingService[]) =>
    byCategory(items).map((g, gi, groups) => (
      <View key={g.name}>
        {groups.length > 1 && <Text style={[styles.group, gi > 0 && styles.groupGap]}>{g.name}</Text>}
        {g.items.map((s, i) => (
          <View key={s.id} style={[styles.line, i > 0 && styles.divider]}>
            <View style={styles.flex}>
              <ListRow
                title={s.name}
                subtitle={[formatDuration(s.durationMinutes), whoDoes(s), s.description].filter(Boolean).join(' · ')}
                right={<Text style={styles.price}>{s.price === null ? 'No price' : formatPrice(s.price)}</Text>}
                muted={!s.active}
                onPress={() => openService(s.id)}
              />
            </View>
            {g.items.length > 1 && (
              <View style={styles.arrows}>
                <Arrow label={`Move ${s.name} up`} up disabled={i === 0} onPress={() => move(s.id, -1)} />
                <Arrow label={`Move ${s.name} down`} disabled={i === g.items.length - 1} onPress={() => move(s.id, 1)} />
              </View>
            )}
          </View>
        ))}
      </View>
    ));

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack()}
        title="Services & Prices"
        subtitle="What customers can book, how long it takes and the usual price. Each person can set their own price on their profile."
        right={<Button label="Add" icon={OwnerIcons.plus} onPress={() => openService('new')} />}
      />

      <Card title={`On Your Booking Page (${shown.length})`} icon={OwnerIcons.scissors}>
        {shown.length === 0 ? (
          <EmptyState
            icon={OwnerIcons.scissors}
            message={load === 'ready' ? 'No services yet. Add your first one so customers can book.' : 'Loading your services…'}
          />
        ) : (
          list(shown)
        )}
        <SaveNote message={message} />
        <Button label="Add a service" variant="secondary" icon={OwnerIcons.plus} onPress={() => openService('new')} />
      </Card>

      {hidden.length > 0 && (
        <Card title={`Hidden (${hidden.length})`} icon={OwnerIcons.info}>
          <Text style={styles.muted}>Customers can’t book these. Open one and turn on “Show on my booking page” to bring it back.</Text>
          <View>{list(hidden)}</View>
        </Card>
      )}
    </OwnerScreen>
  );
}

function Arrow({ label, up, disabled, onPress }: { label: string; up?: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={({ pressed }) => [styles.arrow, pressed && styles.pressed, disabled && styles.off]}>
      <Icon name={up ? OwnerIcons.chevronUp : OwnerIcons.chevronDown} color={C.textSecondary} size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  price: { color: C.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20, paddingHorizontal: Spacing.one },
  group: { color: C.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: Spacing.one },
  groupGap: { marginTop: Spacing.three },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  flex: { flex: 1 },
  arrows: { gap: 2 },
  arrow: { width: 36, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: C.surfaceRaised },
  pressed: { opacity: 0.6 },
  off: { opacity: 0.3 },
});
