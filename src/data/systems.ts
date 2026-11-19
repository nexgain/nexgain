// NexGain has four systems. Each business uses one (businesses.system_type):
//   'service'     = System 1: trades and service businesses (jobs, quotes, invoices)
//   'bookings'    = System 2, NexGain Bookings: customers book appointments
//                   (barbers, salons...). Its screens live under /bookings/.
//   'retail'      = System 3, NexGain Retail: shops and brands that sell products
//                   and track stock (clothing, chemists...). Its screens live under /retail/.
//   'hospitality' = System 4, NexGain Hospitality: cafes, restaurants and other
//                   food businesses (menu, sales, suppliers). Its screens live
//                   under /hospitality/ (many are the shared System 1 screens,
//                   see src/lib/nav.ts).
// Employees always use their business's system.
import type { Href } from 'expo-router';

export type SystemType = 'service' | 'bookings' | 'retail' | 'hospitality';

/** Turns a saved value into a system; anything unknown or missing is System 1. */
export function toSystemType(value: unknown): SystemType {
  return value === 'bookings' || value === 'retail' || value === 'hospitality' ? value : 'service';
}

/** The business's system; anything unknown or missing is System 1. */
export function systemOf(business: { systemType?: SystemType | null } | null | undefined): SystemType {
  return toSystemType(business?.systemType);
}

/** The first screen after logging in or signing up. */
export function homeFor(role: 'owner' | 'employee', business: { systemType?: SystemType | null } | null | undefined): Href {
  const system = systemOf(business);
  if (system === 'bookings') return role === 'owner' ? '/bookings/dashboard' : '/bookings/home';
  if (system === 'retail') return role === 'owner' ? '/retail/dashboard' : '/retail/home';
  if (system === 'hospitality') return role === 'owner' ? '/hospitality/dashboard' : '/hospitality/home';
  return role === 'owner' ? '/dashboard' : '/home';
}
