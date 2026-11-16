import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ShareLinkBox } from '@/systems/bookings/components/share-link';
import { Card, OwnerIcons } from '@/systems/bookings/components/owner/ui';
import { Colors as C } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import { bookingLink, useBookingSettings, useBookingsLoad, type BookingStaff } from '@/systems/bookings/data/bookings';

export { QrCode } from '@/systems/bookings/components/share-link';

/**
 * "Share My Booking Link": the business's public booking page with Copy,
 * Share and a QR code (for the shop window, business cards or flyers).
 * Customers book there without the app.
 */
export function BookingLinkCard({ showSettingsLink = false }: { showSettingsLink?: boolean }) {
  const business = useBusiness();
  const settings = useBookingSettings();
  const load = useBookingsLoad();

  if (!settings) {
    return (
      <Card title="Share My Booking Link" icon={OwnerIcons.link}>
        <Text style={styles.muted}>
          {load === 'loading' || load === 'idle'
            ? 'Loading your booking link…'
            : 'Your booking page isn’t set up yet. Check your internet connection, or ask NexGain support to run the bookings setup.'}
        </Text>
      </Card>
    );
  }

  return (
    <Card title="Share My Booking Link" icon={OwnerIcons.link}>
      <Text style={styles.muted}>
        Customers book here without downloading anything. Put it in your Instagram bio, on your website, or in messages.
      </Text>
      <ShareLinkBox link={bookingLink(settings.slug)} shareText={`Book with ${business?.businessName ?? 'us'} online`} />
      {!settings.accepting && (
        <Text style={styles.warning}>Online bookings are turned off, so this page says you aren’t taking bookings.</Text>
      )}
      {showSettingsLink && (
        <Pressable onPress={() => router.navigate('/bookings/booking-settings')} accessibilityRole="link" hitSlop={6}>
          <Text style={styles.toggle}>Bookings settings</Text>
        </Pressable>
      )}
    </Card>
  );
}

/** A staff member's personal booking link (opens the booking page with them already picked). */
export function StaffLinkCard({ person }: { person: BookingStaff }) {
  const business = useBusiness();
  const settings = useBookingSettings();
  if (!settings) return null;
  return (
    <Card title={person.isOwner ? 'Your Personal Booking Link' : `${person.name}’s Booking Link`} icon={OwnerIcons.link}>
      <Text style={styles.muted}>
        Opens your booking page with {person.isOwner ? 'you' : person.name} already picked, showing only the services{' '}
        {person.isOwner ? 'you do' : 'they do'}.
      </Text>
      {!person.active && <Text style={styles.warning}>They can’t be booked online right now, so customers won’t see them.</Text>}
      <ShareLinkBox
        link={bookingLink(settings.slug, person.id)}
        shareText={`Book with ${person.name} at ${business?.businessName ?? 'our business'}`}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },
  warning: { color: C.warning, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  toggle: { color: C.accent, fontSize: 15, fontWeight: '600' },
});
