// NexGain has three systems. Each business uses one (businesses.system_type):
//   'service'     = System 1: trades and service businesses (jobs, quotes, invoices)
//   'bookings'    = System 2, NexGain Bookings: customers book appointments
//                   (barbers, salons...). Its screens live under /bookings/.
//   'hospitality' = System 3, NexGain Hospitality: cafes, restaurants and other
//                   food businesses (menu, sales, suppliers). Its screens live
//                   under /hospitality/ (many are the shared System 1 screens,
//                   see src/lib/nav.ts).
// Employees always use their business's system.
import type { Href } from 'expo-router';

export type SystemType = 'service' | 'bookings' | 'hospitality';

/** Turns a saved value into a system; anything unknown or missing is System 1. */
export function toSystemType(value: unknown): SystemType {
  return value === 'bookings' || value === 'hospitality' ? value : 'service';
}

/** The business's system; anything unknown or missing is System 1. */
export function systemOf(business: { systemType?: SystemType | null } | null | undefined): SystemType {
  return toSystemType(business?.systemType);
}

/** The first screen after logging in or signing up. */
export function homeFor(role: 'owner' | 'employee', business: { systemType?: SystemType | null } | null | undefined): Href {
  const system = systemOf(business);
  if (role === 'owner') {
    return system === 'bookings' ? '/bookings/dashboard' : system === 'hospitality' ? '/hospitality/dashboard' : '/dashboard';
  }
  return system === 'bookings' ? '/bookings/home' : system === 'hospitality' ? '/hospitality/home' : '/home';
}
