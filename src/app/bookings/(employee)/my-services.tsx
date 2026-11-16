import { StyleSheet, Text } from 'react-native';

import { Card, EmployeeScreen } from '@/systems/bookings/components/employee/ui';
import { StaffPricesCard } from '@/systems/bookings/components/owner/staff-prices-card';
import { EmployeeColors as C } from '@/constants/employee-theme';
import { Spacing } from '@/constants/theme';
import { useCurrentEmployee } from '@/data/current-employee';
import { myStaff, useBookingsLoad, useBookingStaff } from '@/systems/bookings/data/bookings';

// More > My Services & Prices (NexGain Bookings staff): tick the services they
// do and set their own price. Customers who pick them see only these, at these prices.
export default function MyServicesScreen() {
  const me = myStaff(useBookingStaff(), useCurrentEmployee()?.id);
  const load = useBookingsLoad();
  return (
    <EmployeeScreen>
      {me ? (
        <StaffPricesCard person={me} mine />
      ) : (
        <Card style={styles.card}>
          <Text style={styles.muted}>
            {load === 'ready' ? 'You’re not set up to take bookings yet. Ask your manager to turn you on in Bookings Settings.' : 'Loading…'}
          </Text>
        </Card>
      )}
    </EmployeeScreen>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three },
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },
});
