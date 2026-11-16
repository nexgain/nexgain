import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Card, employeeStyles } from '@/systems/bookings/components/employee/ui';
import { ShareLinkBox } from '@/systems/bookings/components/share-link';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Spacing } from '@/constants/theme';
import { useBusiness } from '@/data/business';
import { bookingLink, useBookingSettings } from '@/systems/bookings/data/bookings';

/**
 * Staff Home and Schedule (NexGain Bookings): the business's one booking link,
 * with Copy, Share and a QR code. Customers pick who they'd like on the page.
 */
export function BusinessLinkCard({ showServicesLink = false }: { showServicesLink?: boolean }) {
  const settings = useBookingSettings();
  const businessName = useBusiness()?.businessName ?? 'us';
  if (!settings) return null;
  return (
    <>
      <Text style={employeeStyles.sectionLabel}>Booking link</Text>
      <Card style={styles.card}>
        <Text style={styles.muted}>Share this so customers can book online. They can pick you on the page.</Text>
        <ShareLinkBox link={bookingLink(settings.slug)} shareText={`Book with ${businessName} online`} />
        {!settings.accepting && <Text style={styles.warning}>Online bookings are turned off at the moment.</Text>}
        {showServicesLink && (
          <Pressable onPress={() => router.push('/bookings/my-services')} accessibilityRole="link" hitSlop={6}>
            <Text style={styles.link}>My services & prices</Text>
          </Pressable>
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, gap: Spacing.two },
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },
  warning: { color: C.warning, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  link: { color: C.primary, fontSize: 15, fontWeight: '600' },
});
