import { usePathname } from 'expo-router';

import { useIsDesktop } from '@/hooks/use-desktop';

/**
 * Pages listed in the computer layout's side menu. On a computer these are main
 * pages (you reach them from the menu), so they don't show a back arrow.
 * On phones they open from the More page and keep their back arrow.
 */
const TOP_LEVEL = new Set([
  // Owner
  '/retail/dashboard',
  '/retail/products',
  '/retail/orders',
  '/retail/suppliers',
  '/retail/transactions',
  '/retail/payroll',
  '/retail/ai-assistant',
  '/retail/roster',
  '/retail/employees',
  '/retail/super',
  '/retail/gst',
  '/retail/contractor-invoices',
  '/retail/analytics',
  '/retail/alerts',
  '/retail/integrations',
  '/retail/categories',
  '/retail/stores',
  '/retail/business-profile',
  '/retail/menu',
  // Employee
  '/retail/home',
  '/retail/scanner',
  '/retail/my-roster',
  '/retail/my-invoices',
  '/retail/payslips',
  '/retail/paid',
  '/retail/notifications',
  '/retail/profile',
  '/retail/availability',
  '/retail/qualifications',
  '/retail/more',
]);

/** True on a computer when the open page is one of the side menu's main pages. */
export function useIsDesktopMenuPage() {
  const desktop = useIsDesktop();
  const pathname = usePathname();
  return desktop && TOP_LEVEL.has(pathname);
}
