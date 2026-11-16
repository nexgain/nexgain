import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ListRow } from '@/systems/bookings/components/owner/booking-ui';
import { Button, Card, EmptyState, goBack, OwnerIcons, OwnerScreen, PageHeader } from '@/systems/bookings/components/owner/ui';
import { Colors as C, Spacing } from '@/constants/theme';
import { formatDuration } from '@/systems/bookings/data/booking-time';
import { formatPrice, useBookingServices, useBookingsLoad, useBookingStaff } from '@/systems/bookings/data/bookings';

const openService = (id: string) => router.push({ pathname: '/bookings/booking-service/[id]', params: { id } });

// More > Services & Prices (NexGain Bookings): everything customers can book,
// with its price and how long it takes. Customers see this list on the
// booking page and pick a service. Tap one to edit or delete it.
export default function ServicesScreen() {
  const services = useBookingServices();
  const staff = useBookingStaff();
  const load = useBookingsLoad();
  const shown = services.filter((s) => s.active);
  const hidden = services.filter((s) => !s.active);
  const whoDoes = (ids: string[]) =>
    ids.length === 0
      ? 'Everyone'
      : ids
          .map((id) => staff.find((s) => s.id === id)?.name.split(' ')[0])
          .filter(Boolean)
          .join(', ');

  const row = (s: (typeof services)[number], i: number) => (
    <ListRow
      key={s.id}
      title={s.name}
      subtitle={[formatDuration(s.durationMinutes), whoDoes(s.staffIds), s.description].filter(Boolean).join(' · ')}
      right={<Text style={styles.price}>{s.price === null ? 'No price' : formatPrice(s.price)}</Text>}
      muted={!s.active}
      showDivider={i > 0}
      onPress={() => openService(s.id)}
    />
  );

  return (
    <OwnerScreen>
      <PageHeader
        onBack={() => goBack()}
        title="Services & Prices"
        subtitle="What customers can book, how long it takes and the price. They pick from this list on your booking page."
        right={<Button label="Add" icon={OwnerIcons.plus} onPress={() => openService('new')} />}
      />

      <Card title={`On Your Booking Page (${shown.length})`} icon={OwnerIcons.scissors}>
        {shown.length === 0 ? (
          <EmptyState
            icon={OwnerIcons.scissors}
            message={load === 'ready' ? 'No services yet. Add your first one so customers can book.' : 'Loading your services…'}
          />
        ) : (
          shown.map(row)
        )}
        <Button label="Add a service" variant="secondary" icon={OwnerIcons.plus} onPress={() => openService('new')} />
      </Card>

      {hidden.length > 0 && (
        <Card title={`Hidden (${hidden.length})`} icon={OwnerIcons.info}>
          <Text style={styles.muted}>Customers can’t book these. Open one and turn on “Show on my booking page” to bring it back.</Text>
          <View>{hidden.map(row)}</View>
        </Card>
      )}
    </OwnerScreen>
  );
}

const styles = StyleSheet.create({
  price: { color: C.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20, paddingHorizontal: Spacing.one },
});
