// NexGain has two systems. Each business uses one (businesses.system_type):
//   'service'  = System 1: trades and service businesses (jobs, quotes, invoices)
//   'bookings' = System 2, NexGain Bookings: customers book appointments
//                (barbers, salons...). Its screens live under /bookings/.
// Employees always use their business's system.
import type { Href } from 'expo-router';

export type SystemType = 'service' | 'bookings';

/** The business's system; anything unknown or missing is System 1. */
export function systemOf(business: { systemType?: SystemType | null } | null | undefined): SystemType {
  return business?.systemType === 'bookings' ? 'bookings' : 'service';
}

/** The first screen after logging in or signing up. */
export function homeFor(role: 'owner' | 'employee', business: { systemType?: SystemType | null } | null | undefined): Href {
  const bookings = systemOf(business) === 'bookings';
  if (role === 'owner') return bookings ? '/bookings/dashboard' : '/dashboard';
  return bookings ? '/bookings/home' : '/home';
}
