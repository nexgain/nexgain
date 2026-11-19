import { usePathname } from 'expo-router';

import { useIsDesktop } from '@/hooks/use-desktop';
import { withoutSystemPrefix } from '@/lib/nav';

/**
 * Pages listed in the computer layout's side menu. On a computer these are main
 * pages (you reach them from the menu), so they don't show a back arrow.
 * On phones they open from the More page and keep their back arrow.
 */
const TOP_LEVEL = new Set([
  // Owner
  '/dashboard',
  // Hospitality owner (its other main pages share the names above)
  '/menu-items',
  '/sales',
  '/calendar',
  '/transactions',
  '/payroll',
  '/invoices',
  '/ai-assistant',
  '/jobs',
  '/roster',
  '/employees',
  '/super',
  '/gst',
  '/contractor-invoices',
  '/analytics',
  '/reminders',
  '/alerts',
  '/integrations',
  '/services',
  '/business-profile',
  '/menu',
  // Employee
  '/home',
  '/my-roster',
  '/my-invoices',
  '/payslips',
  '/paid',
  '/notifications',
  '/profile',
  '/availability',
  '/qualifications',
  '/more',
]);

/** True on a computer when the open page is one of the side menu's main pages. */
export function useIsDesktopMenuPage() {
  const desktop = useIsDesktop();
  const pathname = usePathname();
  return desktop && TOP_LEVEL.has(withoutSystemPrefix(pathname));
}
