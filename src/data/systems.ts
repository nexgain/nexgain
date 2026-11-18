// NexGain has three systems. Each business uses one (businesses.system_type):
//   'service'  = System 1: trades and service businesses (jobs, quotes, invoices)
//   'bookings' = System 2, NexGain Bookings: customers book appointments
//                (barbers, salons...). Its screens live under /bookings/.
//   'retail'   = System 3, NexGain Retail: shops and brands that sell products
//                and track stock (clothing, chemists...). Its screens live under /retail/.
// Employees always use their business's system.
import type { Href } from 'expo-router';

export type SystemType = 'service' | 'bookings' | 'retail';

/** The business's system; anything unknown or missing is System 1. */
export function systemOf(business: { systemType?: SystemType | null } | null | undefined): SystemType {
  const type = business?.systemType;
  return type === 'bookings' || type === 'retail' ? type : 'service';
}

/** The first screen after logging in or signing up. */
export function homeFor(role: 'owner' | 'employee', business: { systemType?: SystemType | null } | null | undefined): Href {
  const system = systemOf(business);
  if (system === 'bookings') return role === 'owner' ? '/bookings/dashboard' : '/bookings/home';
  if (system === 'retail') return role === 'owner' ? '/retail/dashboard' : '/retail/home';
  return role === 'owner' ? '/dashboard' : '/home';
}
