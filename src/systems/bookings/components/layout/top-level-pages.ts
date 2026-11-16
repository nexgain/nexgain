import { usePathname } from 'expo-router';

import { useIsDesktop } from '@/hooks/use-desktop';

/**
 * Pages listed in the computer layout's side menu. On a computer these are main
 * pages (you reach them from the menu), so they don't show a back arrow.
 * On phones they open from the More page and keep their back arrow.
 */
const TOP_LEVEL = new Set([
  // Owner
  '/bookings/dashboard',
  '/bookings/calendar',
  '/bookings/transactions',
  '/bookings/payroll',
  '/bookings/ai-assistant',
  '/bookings/jobs',
  '/bookings/roster',
  '/bookings/employees',
  '/bookings/super',
  '/bookings/gst',
  '/bookings/contractor-invoices',
  '/bookings/analytics',
  '/bookings/reminders',
  '/bookings/alerts',
  '/bookings/integrations',
  '/bookings/business-profile',
  '/bookings/services',
  '/bookings/deposits',
  '/bookings/booking-settings',
  '/bookings/menu',
  // Employee
  '/bookings/home',
  '/bookings/my-roster',
  '/bookings/my-invoices',
  '/bookings/payslips',
  '/bookings/paid',
  '/bookings/notifications',
  '/bookings/profile',
  '/bookings/availability',
  '/bookings/qualifications',
  '/bookings/more',
]);

/** True on a computer when the open page is one of the side menu's main pages. */
export function useIsDesktopMenuPage() {
  const desktop = useIsDesktop();
  const pathname = usePathname();
  return desktop && TOP_LEVEL.has(pathname);
}
