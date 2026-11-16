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
          href: '/bookings/home',
          match: ['/bookings/home'],
        },
        {
          label: 'Schedule',
          icon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
          href: '/bookings/my-roster',
          match: ['/bookings/my-roster', '/bookings/job-details', '/bookings/job-report'],
        },
        {
          label: 'Invoices',
          icon: { ios: 'doc.plaintext.fill', android: 'request_quote', web: 'request_quote' },
          href: '/bookings/my-invoices',
          match: ['/bookings/my-invoices', '/bookings/contractor-invoice/'],
          hidden: !contractor,
        },
        {
          label: 'Payslips',
          icon: { ios: 'doc.text.fill', android: 'receipt_long', web: 'receipt_long' },
          href: '/bookings/payslips',
          match: ['/bookings/payslips', '/bookings/payslip/'],
          hidden: contractor,
        },
        {
          label: 'Paid',
          icon: { ios: 'checkmark.seal.fill', android: 'paid', web: 'paid' },
          href: '/bookings/paid',
          match: ['/bookings/paid'],
          hidden: !contractor,
        },
        {
          label: 'Notifications',
          icon: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
          href: '/bookings/notifications',
          match: ['/bookings/notifications', '/bookings/notification/'],
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
          href: '/bookings/profile',
          match: ['/bookings/profile', '/bookings/super-details'],
        },
        {
          label: 'Availability',
          icon: { ios: 'calendar.badge.clock', android: 'event_available', web: 'event_available' },
          href: '/bookings/availability',
          match: ['/bookings/availability'],
        },
        {
          label: 'Qualifications',
          icon: { ios: 'rosette', android: 'workspace_premium', web: 'workspace_premium' },
          href: '/bookings/qualifications',
          match: ['/bookings/qualifications', '/bookings/add-qualification'],
        },
        {
          // Payment, tax, employment, help and contact pages.
          label: 'More',
          icon: { ios: 'ellipsis.circle.fill', android: 'more_horiz', web: 'more_horiz' },
          href: '/bookings/more',
          match: ['/bookings/more', '/bookings/account/'],
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
