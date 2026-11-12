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
          href: '/dashboard',
          match: ['/dashboard', '/revenue', '/expenses'],
        },
        {
          label: 'Calendar',
          icon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
          href: '/calendar',
          match: ['/calendar'],
        },
        {
          label: 'Transactions',
          icon: { ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' },
          href: '/transactions',
          match: ['/transactions', '/transaction/', '/spending', '/receipt/', '/unmatched-receipts', '/accountant-export'],
        },
        {
          label: 'Payroll',
          icon: { ios: 'dollarsign.circle.fill', android: 'payments', web: 'payments' },
          href: '/payroll',
          match: ['/payroll', '/payroll-bank'],
        },
        {
          label: 'Invoices',
          icon: { ios: 'doc.text.fill', android: 'receipt_long', web: 'receipt_long' },
          href: '/invoices',
          match: ['/invoices'],
        },
        {
          label: 'AI Assistant',
          icon: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
          href: '/ai-assistant',
          match: ['/ai-assistant'],
        },
      ],
    },
    {
      title: 'Business',
      items: [
        {
          label: 'Jobs',
          icon: { ios: 'briefcase.fill', android: 'work', web: 'work' },
          href: '/jobs',
          match: ['/jobs', '/job/'],
        },
        {
          label: 'Roster',
          icon: { ios: 'calendar.badge.clock', android: 'event_note', web: 'event_note' },
          href: '/roster',
          match: ['/roster'],
        },
        {
          label: 'Employees',
          icon: { ios: 'person.2.fill', android: 'group', web: 'group' },
          href: '/employees' as Href,
          match: ['/employees', '/employee/', '/employee-status'],
        },
        {
          label: 'GST',
          icon: { ios: 'doc.text.fill', android: 'receipt_long', web: 'receipt_long' },
          href: '/gst',
          match: ['/gst'],
          hidden: !usesGst,
        },
        {
          label: 'Super',
          icon: { ios: 'banknote.fill', android: 'savings', web: 'savings' },
          href: '/super',
          match: ['/super'],
          badge: stapledChecks,
          hidden: !usesSuper,
        },
        {
          label: 'Contractor Invoices',
          icon: { ios: 'doc.plaintext.fill', android: 'request_quote', web: 'request_quote' },
          href: '/contractor-invoices',
          match: ['/contractor-invoices', '/team-invoice/'],
          badge: toReview,
        },
        {
          label: 'Analytics & Reports',
          icon: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' },
          href: '/analytics',
          match: ['/analytics'],
        },
        {
          label: 'Reminders',
          icon: { ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' },
          href: '/reminders',
          match: ['/reminders'],
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
          href: { pathname: '/alerts', params: { from: 'menu' } } as Href,
          match: ['/alerts'],
          badge: unread,
        },
        {
          label: 'Integrations',
          icon: { ios: 'puzzlepiece.extension.fill', android: 'extension', web: 'extension' },
          href: '/integrations',
          match: ['/integrations'],
        },
        {
          label: 'Services',
          icon: { ios: 'list.bullet.rectangle.fill', android: 'list_alt', web: 'list_alt' },
          href: '/services',
          match: ['/services'],
        },
        {
          label: 'Business Profile',
          icon: { ios: 'building.2.fill', android: 'store', web: 'store' },
          href: '/business-profile',
          match: ['/business-profile'],
        },
        {
          // The More page still has the team invite code.
          label: 'More',
          icon: { ios: 'ellipsis.circle.fill', android: 'more_horiz', web: 'more_horiz' },
          href: '/menu',
          match: ['/menu'],
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
