import type { ReactNode } from 'react';
import type { Href } from 'expo-router';

import { DesktopShell, type NavSection } from '@/components/layout/desktop-shell';
import { useBusiness } from '@/data/business';
import { useContractorInvoices } from '@/data/contractor-invoices';
import { superStatusOf, useEmployeeSuper } from '@/data/employee-super';
import { useEmployees } from '@/data/employees';
import { ownerNotifications, useNotifications } from '@/data/notifications';
import { businessUsesGst, businessUsesSuper } from '@/data/super-rules';
import { logOut } from '@/lib/auth';
import { router } from '@/lib/nav';

/**
 * Hospitality owner menu for the computer layout: the bottom tabs plus
 * everything on the More page. Phones keep the tab bar and More page.
 * (Links are written without "/hospitality"; the menu adds it, see src/lib/nav.ts.)
 */
export function HospitalityDesktopShell({ children }: { children: ReactNode }) {
  const unread = ownerNotifications(useNotifications()).filter((n) => !n.read).length;
  const toReview = useContractorInvoices().filter((i) => i.status === 'sent').length;
  const business = useBusiness();
  const superRecords = useEmployeeSuper();
  const stapledChecks = useEmployees().filter(
    (e) => superStatusOf(e, superRecords.find((r) => r.employeeId === e.id)) === 'Stapled fund check needed',
  ).length;

  const sections: NavSection[] = [
    {
      items: [
        { label: 'Dashboard', icon: { ios: 'square.grid.2x2.fill', android: 'dashboard', web: 'dashboard' }, href: '/hospitality/dashboard', match: ['/dashboard'] },
        {
          label: 'Menu',
          icon: { ios: 'fork.knife', android: 'restaurant_menu', web: 'restaurant_menu' },
          href: '/hospitality/menu-items',
          match: ['/menu-items', '/menu-item/', '/menu-categories'],
        },
        {
          label: 'Sales',
          icon: { ios: 'cart.fill', android: 'point_of_sale', web: 'point_of_sale' },
          href: '/hospitality/sales',
          match: ['/sales', '/sale/', '/record-sale', '/end-of-day'],
        },
        {
          label: 'Transactions',
          icon: { ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' },
          href: '/hospitality/transactions',
          match: ['/transactions', '/transaction/', '/spending', '/money/', '/receipt/', '/unmatched-receipts', '/accountant-export', '/expenses'],
        },
        {
          label: 'Payroll',
          icon: { ios: 'dollarsign.circle.fill', android: 'payments', web: 'payments' },
          href: '/hospitality/payroll',
          match: ['/payroll', '/payroll-bank'],
        },
      ],
    },
    {
      title: 'Business',
      items: [
        {
          label: 'Employees',
          icon: { ios: 'person.2.fill', android: 'group', web: 'group' },
          href: '/hospitality/employees' as Href,
          match: ['/employees', '/employee/', '/employee-status'],
        },
        { label: 'GST', icon: { ios: 'doc.text.fill', android: 'receipt_long', web: 'receipt_long' }, href: '/hospitality/gst', match: ['/gst'], hidden: !businessUsesGst(business) },
        {
          label: 'Super',
          icon: { ios: 'banknote.fill', android: 'savings', web: 'savings' },
          href: '/hospitality/super',
          match: ['/super'],
          badge: stapledChecks,
          hidden: !businessUsesSuper(business),
        },
        {
          label: 'Contractor Invoices',
          icon: { ios: 'doc.plaintext.fill', android: 'request_quote', web: 'request_quote' },
          href: '/hospitality/contractor-invoices',
          match: ['/contractor-invoices', '/team-invoice/'],
          badge: toReview,
        },
      ],
    },
    {
      title: 'Settings',
      items: [
        {
          label: 'Notifications',
          icon: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
          // The menu adds "/hospitality" (src/lib/nav.ts); typed routes only know '/alerts' this way.
          href: { pathname: '/alerts', params: { from: 'menu' } } as Href,
          match: ['/alerts'],
          badge: unread,
        },
        {
          label: 'Integrations',
          icon: { ios: 'puzzlepiece.extension.fill', android: 'extension', web: 'extension' },
          href: '/hospitality/integrations',
          match: ['/integrations'],
        },
        {
          label: 'Business Profile',
          icon: { ios: 'building.2.fill', android: 'store', web: 'store' },
          href: '/hospitality/business-profile',
          match: ['/business-profile'],
        },
        { label: 'More', icon: { ios: 'ellipsis.circle.fill', android: 'more_horiz', web: 'more_horiz' }, href: '/hospitality/menu', match: ['/menu'] },
      ],
    },
  ];

  return (
    <DesktopShell
      sections={sections}
      footer={{
        label: 'Log Out',
        icon: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' },
        href: '/',
        match: [],
        onPress: async () => {
          await logOut();
          router.replace('/');
        },
      }}>
      {children}
    </DesktopShell>
  );
}
