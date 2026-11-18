import type { ReactNode } from 'react';
import { router, type Href } from 'expo-router';

import { DesktopShell, type NavSection } from '@/components/layout/desktop-shell';
import { useBusiness } from '@/data/business';
import { useContractorInvoices } from '@/data/contractor-invoices';
import { superStatusOf, useEmployeeSuper } from '@/data/employee-super';
import { useEmployees } from '@/data/employees';
import { ownerNotifications, useNotifications } from '@/data/notifications';
import { businessUsesGst, businessUsesSuper } from '@/data/super-rules';
import { logOut } from '@/lib/auth';

/**
 * Owner menu for the computer layout: the bottom tabs plus everything on the
 * More page, with the same counts. Phones keep the tab bar and More page.
 */
export function OwnerDesktopShell({ children }: { children: ReactNode }) {
  const unread = ownerNotifications(useNotifications()).filter((n) => !n.read).length;
  const toReview = useContractorInvoices().filter((i) => i.status === 'sent').length;
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
          label: 'Home',
          icon: { ios: 'house.fill', android: 'home', web: 'home' },
          href: '/retail/dashboard',
          match: ['/retail/dashboard', '/retail/revenue', '/retail/expenses', '/retail/reorder'],
        },
        {
          label: 'Products',
          icon: { ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' },
          href: '/retail/products' as Href,
          match: ['/retail/products', '/retail/product/', '/retail/stock-item/', '/retail/receive', '/retail/stocktake', '/retail/import-products', '/retail/stock-history'],
        },
        {
          label: 'Orders',
          icon: { ios: 'cart.fill', android: 'shopping_cart', web: 'shopping_cart' },
          href: '/retail/orders' as Href,
          match: ['/retail/orders', '/retail/order/'],
        },
        {
          label: 'Suppliers',
          icon: { ios: 'truck.box.fill', android: 'local_shipping', web: 'local_shipping' },
          href: '/retail/suppliers' as Href,
          match: ['/retail/suppliers'],
        },
        {
          label: 'Transactions',
          icon: { ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' },
          href: '/retail/transactions',
          match: ['/retail/transactions', '/retail/transaction/', '/retail/spending', '/retail/receipt/', '/retail/unmatched-receipts', '/retail/accountant-export'],
        },
        {
          label: 'Payroll',
          icon: { ios: 'dollarsign.circle.fill', android: 'payments', web: 'payments' },
          href: '/retail/payroll',
          match: ['/retail/payroll', '/retail/payroll-bank'],
        },
        {
          label: 'AI Assistant',
          icon: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
          href: '/retail/ai-assistant',
          match: ['/retail/ai-assistant'],
        },
      ],
    },
    {
      title: 'Business',
      items: [
        {
          label: 'Roster',
          icon: { ios: 'calendar.badge.clock', android: 'event_note', web: 'event_note' },
          href: '/retail/roster',
          match: ['/retail/roster'],
        },
        {
          label: 'Employees',
          icon: { ios: 'person.2.fill', android: 'group', web: 'group' },
          href: '/retail/employees' as Href,
          match: ['/retail/employees', '/retail/employee/', '/retail/employee-status'],
        },
        {
          label: 'GST',
          icon: { ios: 'doc.text.fill', android: 'receipt_long', web: 'receipt_long' },
          href: '/retail/gst',
          match: ['/retail/gst'],
          hidden: !usesGst,
        },
        {
          label: 'Super',
          icon: { ios: 'banknote.fill', android: 'savings', web: 'savings' },
          href: '/retail/super',
          match: ['/retail/super'],
          badge: stapledChecks,
          hidden: !usesSuper,
        },
        {
          label: 'Contractor Invoices',
          icon: { ios: 'doc.plaintext.fill', android: 'request_quote', web: 'request_quote' },
          href: '/retail/contractor-invoices',
          match: ['/retail/contractor-invoices', '/retail/team-invoice/'],
          badge: toReview,
        },
        {
          label: 'Analytics & Reports',
          icon: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' },
          href: '/retail/analytics',
          match: ['/retail/analytics'],
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
          href: { pathname: '/retail/alerts', params: { from: 'menu' } } as Href,
          match: ['/retail/alerts'],
          badge: unread,
        },
        {
          label: 'Product Categories',
          icon: { ios: 'square.grid.2x2.fill', android: 'category', web: 'category' },
          href: '/retail/categories' as Href,
          match: ['/retail/categories'],
        },
        {
          label: 'Store Locations',
          icon: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
          href: '/retail/stores' as Href,
          match: ['/retail/stores'],
        },
        {
          label: 'Integrations',
          icon: { ios: 'puzzlepiece.extension.fill', android: 'extension', web: 'extension' },
          href: '/retail/integrations',
          match: ['/retail/integrations'],
        },
        {
          label: 'Business Profile',
          icon: { ios: 'building.2.fill', android: 'store', web: 'store' },
          href: '/retail/business-profile',
          match: ['/retail/business-profile'],
        },
        {
          // The More page still has the team invite code.
          label: 'More',
          icon: { ios: 'ellipsis.circle.fill', android: 'more_horiz', web: 'more_horiz' },
          href: '/retail/menu',
          match: ['/retail/menu'],
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
