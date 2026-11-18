import type { ReactNode } from 'react';
import { router } from 'expo-router';

import { DesktopShell, type NavSection } from '@/components/layout/desktop-shell';
import { useCurrentEmployee } from '@/data/current-employee';
import { isContractor } from '@/data/employees';
import { employeeNotifications, useNotifications } from '@/data/notifications';
import { logOut } from '@/lib/auth';

/**
 * Employee menu for the computer layout: the same tabs as the phone tab bar
 * (contractors see Invoices and Paid instead of Payslips) plus their account pages.
 */
export function EmployeeDesktopShell({ children }: { children: ReactNode }) {
  const me = useCurrentEmployee();
  const unread = employeeNotifications(useNotifications(), me?.id ?? null).filter((n) => !n.read).length;
  const contractor = isContractor(me);

  const sections: NavSection[] = [
    {
      items: [
        {
          label: 'Home',
          icon: { ios: 'house.fill', android: 'home', web: 'home' },
          href: '/retail/home',
          match: ['/retail/home'],
        },
        {
          label: 'Scanner',
          icon: { ios: 'barcode.viewfinder', android: 'qr_code_scanner', web: 'qr_code_scanner' },
          href: '/retail/scanner',
          match: ['/retail/scanner'],
        },
        {
          label: 'Roster',
          icon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
          href: '/retail/my-roster',
          match: ['/retail/my-roster', '/retail/job-details'],
        },
        {
          label: 'Invoices',
          icon: { ios: 'doc.plaintext.fill', android: 'request_quote', web: 'request_quote' },
          href: '/retail/my-invoices',
          match: ['/retail/my-invoices', '/retail/contractor-invoice/'],
          hidden: !contractor,
        },
        {
          label: 'Payslips',
          icon: { ios: 'doc.text.fill', android: 'receipt_long', web: 'receipt_long' },
          href: '/retail/payslips',
          match: ['/retail/payslips', '/retail/payslip/'],
          hidden: contractor,
        },
        {
          label: 'Paid',
          icon: { ios: 'checkmark.seal.fill', android: 'paid', web: 'paid' },
          href: '/retail/paid',
          match: ['/retail/paid'],
          hidden: !contractor,
        },
        {
          label: 'Notifications',
          icon: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
          href: '/retail/notifications',
          match: ['/retail/notifications', '/retail/notification/'],
          badge: unread,
        },
      ],
    },
    {
      title: 'Account',
      items: [
        {
          label: 'My Profile',
          icon: { ios: 'person.fill', android: 'person', web: 'person' },
          href: '/retail/profile',
          match: ['/retail/profile', '/retail/super-details'],
        },
        {
          label: 'Availability',
          icon: { ios: 'calendar.badge.clock', android: 'event_available', web: 'event_available' },
          href: '/retail/availability',
          match: ['/retail/availability'],
        },
        {
          label: 'Qualifications',
          icon: { ios: 'rosette', android: 'workspace_premium', web: 'workspace_premium' },
          href: '/retail/qualifications',
          match: ['/retail/qualifications', '/retail/add-qualification'],
        },
        {
          // Payment, tax, employment, help and contact pages.
          label: 'More',
          icon: { ios: 'ellipsis.circle.fill', android: 'more_horiz', web: 'more_horiz' },
          href: '/retail/more',
          match: ['/retail/more', '/retail/account/'],
        },
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
