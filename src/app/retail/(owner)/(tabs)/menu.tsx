import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { InviteCodeCard } from '@/systems/retail/components/owner/employee-ui';
import { ActionRow, Card, OwnerIcons, OwnerScreen, PageHeader } from '@/systems/retail/components/owner/ui';
import { useBusiness } from '@/data/business';
import { useContractorInvoices } from '@/data/contractor-invoices';
import { superStatusOf, useEmployeeSuper } from '@/data/employee-super';
import { useEmployees } from '@/data/employees';
import { ownerNotifications, useNotifications } from '@/data/notifications';
import { businessUsesGst, businessUsesSuper } from '@/data/super-rules';
import { useIsDesktop } from '@/hooks/use-desktop';
import { logOut } from '@/lib/auth';

// Owner screens that don't fit in the tab bar.
export default function OwnerMoreScreen() {
  const unread = ownerNotifications(useNotifications()).filter((n) => !n.read).length;
  const toReview = useContractorInvoices().filter((i) => i.status === 'sent').length;
  // Super: Australian businesses only.
  const usesSuper = businessUsesSuper(useBusiness());
  const usesGst = businessUsesGst(useBusiness());
  const superRecords = useEmployeeSuper();
  // Phone: Transactions and Payroll are on the tab bar, Suppliers is here. Computer: unchanged.
  const desktop = useIsDesktop();
  const stapledChecks = useEmployees().filter((e) => superStatusOf(e, superRecords.find((r) => r.employeeId === e.id)) === 'Stapled fund check needed').length;

  return (
    <OwnerScreen>
      <PageHeader title="More" />
      <InviteCodeCard />
      <Card>
        <View>
          {desktop ? (
            <>
              <ActionRow
                icon={{ ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' }}
                label="Transactions"
                onPress={() => router.navigate('/retail/transactions')}
              />
              <ActionRow
                icon={{ ios: 'dollarsign.circle.fill', android: 'payments', web: 'payments' }}
                label="Payroll"
                onPress={() => router.navigate('/retail/payroll')}
                showDivider
              />
            </>
          ) : (
            <ActionRow
              icon={{ ios: 'truck.box.fill', android: 'local_shipping', web: 'local_shipping' }}
              label="Suppliers"
              onPress={() => router.navigate('/retail/suppliers' as Href)}
            />
          )}
          <ActionRow
            icon={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
            label="AI Assistant"
            onPress={() => router.navigate('/retail/ai-assistant')}
            showDivider
          />
          <ActionRow
            icon={{ ios: 'cart.badge.plus', android: 'add_shopping_cart', web: 'add_shopping_cart' }}
            label="Review & Order Stock"
            onPress={() => router.navigate('/retail/reorder' as Href)}
            showDivider
          />
        </View>
      </Card>
      <Card>
        <View>
          <ActionRow
            icon={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }}
            label={unread > 0 ? `Notifications (${unread} new)` : 'Notifications'}
            // Typed routes only list '/retail/alerts/index' for a folder index screen. Always
            // from=menu, so a "from=dashboard" left from an earlier visit is replaced.
            onPress={() => router.navigate({ pathname: '/retail/alerts', params: { from: 'menu' } } as Href)}
          />
          <ActionRow
            icon={{ ios: 'square.grid.2x2.fill', android: 'category', web: 'category' }}
            label="Product Categories"
            onPress={() => router.navigate('/retail/categories' as Href)}
            showDivider
          />
          <ActionRow
            icon={{ ios: 'calendar.badge.clock', android: 'event_note', web: 'event_note' }}
            label="Roster"
            onPress={() => router.navigate('/retail/roster')}
            showDivider
          />
          <ActionRow
            icon={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }}
            label="Analytics & Reports"
            onPress={() => router.navigate('/retail/analytics')}
            showDivider
          />
          <ActionRow
            icon={{ ios: 'doc.plaintext.fill', android: 'request_quote', web: 'request_quote' }}
            label={toReview > 0 ? `Contractor Invoices (${toReview} to review)` : 'Contractor Invoices'}
            onPress={() => router.navigate('/retail/contractor-invoices')}
            showDivider
          />
          <ActionRow
            icon={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
            label="Employees"
            onPress={() => router.navigate('/retail/employees' as Href)}
            showDivider
          />
          {usesGst && (
            <ActionRow icon={OwnerIcons.receipt} label="GST" onPress={() => router.navigate('/retail/gst')} showDivider />
          )}
          {usesSuper && (
            <ActionRow
              icon={{ ios: 'banknote.fill', android: 'savings', web: 'savings' }}
              label={stapledChecks > 0 ? `Super (${stapledChecks} need a stapled fund check)` : 'Super'}
              onPress={() => router.navigate('/retail/super')}
              showDivider
            />
          )}
          <ActionRow
            icon={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }}
            label="Store Locations"
            onPress={() => router.navigate('/retail/stores' as Href)}
            showDivider
          />
          <ActionRow
            icon={{ ios: 'puzzlepiece.extension.fill', android: 'extension', web: 'extension' }}
            label="Integrations"
            onPress={() => router.navigate('/retail/integrations')}
            showDivider
          />
          <ActionRow
            icon={{ ios: 'building.2.fill', android: 'store', web: 'store' }}
            label="Business Profile"
            onPress={() => router.navigate('/retail/business-profile')}
            showDivider
          />
        </View>
      </Card>
      <Card>
        <ActionRow
          icon={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }}
          label="Log Out"
          onPress={async () => {
            await logOut();
            router.replace('/');
          }}
        />
      </Card>
    </OwnerScreen>
  );
}
