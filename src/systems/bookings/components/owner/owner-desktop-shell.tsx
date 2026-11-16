import type { ReactNode } from 'react';
import { router, type Href } from 'expo-router';

import { DesktopShell, type NavSection } from '@/components/layout/desktop-shell';
import { useBusiness } from '@/data/business';
import { useContractorInvoices } from '@/data/contractor-invoices';
import { superStatusOf, useEmployeeSuper } from '@/data/employee-super';
import { useEmployees } from '@/data/employees';
import { useJobs } from '@/data/jobs';
import { ownerNotifications, useNotifications } from '@/data/notifications';
import { reminderProblems, useReminders } from '@/data/reminders';
import { businessUsesGst, businessUsesSuper } from '@/data/super-rules';
import { logOut } from '@/lib/auth';

/**
 * Owner menu for the computer layout: the bottom tabs plus everything on the
 * More page, with the same counts. Phones keep the tab bar and More page.
 */
export function OwnerDesktopShell({ children }: { children: ReactNode }) {
  const unread = ownerNotifications(useNotifications()).filter((n) => !n.read).length;
  const toReview = useContractorInvoices().filter((i) => i.status === 'sent').length;
  const cantSend = reminderProblems(useJobs(), useReminders()).length;
  const business = useBusiness();
  const usesSuper = businessUsesSuper(business);
  const usesGst = businessUsesGst(business);
  const superRecords = useEmployeeSuper();
  const stapledChecks = useEmployees().filter(
    (e) => superStatusOf(e, superRecords.find((r) => r.employeeId === e.id)) === 'Stapled fund check needed',
  ).length;

  const sections: NavSection[] = [
    {
      items: [
        {
          label: 'Dashboard',
          icon: { ios: 'square.grid.2x2.fill', android: 'dashboard', web: 'dashboard' },
          href: '/bookings/dashboard',
          match: ['/bookings/dashboard', '/bookings/revenue', '/bookings/expenses'],
        },
        {
          label: 'Bookings',
          icon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
          href: '/bookings/calendar',
          match: ['/bookings/calendar', '/bookings/booking/'],
        },
        {
          label: 'Transactions',
          icon: { ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' },
          href: '/bookings/transactions',
          match: ['/bookings/transactions', '/bookings/transaction/', '/bookings/spending', '/bookings/receipt/', '/bookings/unmatched-receipts', '/bookings/accountant-export'],
        },
        {
          label: 'Payroll',
          icon: { ios: 'dollarsign.circle.fill', android: 'payments', web: 'payments' },
          href: '/bookings/payroll',
          match: ['/bookings/payroll', '/bookings/payroll-bank'],
        },
        {
          label: 'Invoices',
          icon: { ios: 'doc.text.fill', android: 'receipt_long', web: 'receipt_long' },
          href: '/bookings/invoices',
          match: ['/bookings/invoices'],
        },
        {
          label: 'AI Assistant',
          icon: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
          href: '/bookings/ai-assistant',
          match: ['/bookings/ai-assistant'],
        },
      ],
    },
    {
      title: 'Business',
      items: [
        {
          label: 'Jobs',
          icon: { ios: 'briefcase.fill', android: 'work', web: 'work' },
          href: '/bookings/jobs',
          match: ['/bookings/jobs', '/bookings/job/'],
        },
        {
          label: 'Roster',
          icon: { ios: 'calendar.badge.clock', android: 'event_note', web: 'event_note' },
          href: '/bookings/roster',
          match: ['/bookings/roster'],
        },
        {
          label: 'Employees',
          icon: { ios: 'person.2.fill', android: 'group', web: 'group' },
          href: '/bookings/employees' as Href,
          match: ['/bookings/employees', '/bookings/employee/', '/bookings/employee-status'],
        },
        {
          label: 'GST',
          icon: { ios: 'doc.text.fill', android: 'receipt_long', web: 'receipt_long' },
          href: '/bookings/gst',
          match: ['/bookings/gst'],
          hidden: !usesGst,
        },
        {
          label: 'Super',
          icon: { ios: 'banknote.fill', android: 'savings', web: 'savings' },
          href: '/bookings/super',
          match: ['/bookings/super'],
          badge: stapledChecks,
          hidden: !usesSuper,
        },
        {
          label: 'Contractor Invoices',
          icon: { ios: 'doc.plaintext.fill', android: 'request_quote', web: 'request_quote' },
          href: '/bookings/contractor-invoices',
          match: ['/bookings/contractor-invoices', '/bookings/team-invoice/'],
          badge: toReview,
        },
        {
          label: 'Analytics & Reports',
          icon: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' },
          href: '/bookings/analytics',
          match: ['/bookings/analytics'],
        },
        {
          label: 'Reminders',
          icon: { ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' },
          href: '/bookings/reminders',
          match: ['/bookings/reminders'],
          badge: cantSend,
        },
      ],
    },
    {
      title: 'Settings',
      items: [
        {
          label: 'Notifications',
          icon: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
          // Same as the More page: from=menu so the back button returns sensibly.
          href: { pathname: '/bookings/alerts', params: { from: 'menu' } } as Href,
          match: ['/bookings/alerts'],
          badge: unread,
        },
        {
          label: 'Integrations',
          icon: { ios: 'puzzlepiece.extension.fill', android: 'extension', web: 'extension' },
          href: '/bookings/integrations',
          match: ['/bookings/integrations'],
        },
        {
          label: 'Services',
          icon: { ios: 'list.bullet.rectangle.fill', android: 'list_alt', web: 'list_alt' },
          href: '/bookings/services',
          match: ['/bookings/services'],
        },
        {
          label: 'Business Profile',
          icon: { ios: 'building.2.fill', android: 'store', web: 'store' },
          href: '/bookings/business-profile',
          match: ['/bookings/business-profile'],
        },
        {
          // The More page still has the team invite code.
          label: 'More',
          icon: { ios: 'ellipsis.circle.fill', android: 'more_horiz', web: 'more_horiz' },
          href: '/bookings/menu',
          match: ['/bookings/menu'],
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
