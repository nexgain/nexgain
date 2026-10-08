// What happens after someone logs in (or reopens the app while logged in):
// load their data from the database and listen for live changes. Cleared on log out.
import { availabilityStore } from '@/data/availability';
import { businessStore, clearBusiness, loadMyBusiness } from '@/data/business';
import { eventsStore, loadEvents } from '@/data/calendar';
import { clientsStore, loadClients } from '@/data/clients';
import { clearContractorInvoices, loadContractorInvoices } from '@/data/contractor-invoices';
import { jobsStore, loadJobs, loadMyAssignedJobs } from '@/data/jobs';
import { clockStore, loadClockSessions } from '@/data/clock-records';
import { currentEmployeeStore } from '@/data/current-employee';
import { invitesStore, loadInvites } from '@/data/employee-invites';
import { expensesStore, loadExpenses } from '@/data/finance';
import { applyRemoteDoc, clearBusinessPayment, clearDocs, loadBusinessPayment, loadDocs } from '@/data/invoices';
import { employeesStore, isContractor, loadOwnProfile, loadTeam } from '@/data/employees';
import { jobReportsStore } from '@/data/job-reports';
import { clearNotifications, loadNotifications, subscribeToNotifications } from '@/data/notifications';
import { loadPayRuns, payRunsStore } from '@/data/pay-runs';
import { loadPayslips, payslipsStore } from '@/data/payroll';
import { qualificationsStore } from '@/data/qualifications';
import { loadShifts, shiftsStore } from '@/data/shifts';
import { supabase } from '@/lib/supabase';

let stopListening: (() => void)[] = [];
let activeUserId: string | null = null;
let loading: Promise<void> | null = null;

/** Loads everything for this user (safe to call repeatedly; only loads once). */
export function startSession(userId: string) {
  if (activeUserId === userId && loading) return loading;
  endSession();
  activeUserId = userId;
  loading = load(userId);
  return loading;
}

/** Loads again from scratch, e.g. once sign-up has created the business or employee profile. */
export async function reloadSession() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  endSession();
  await startSession(data.user.id);
}

/** Runs a reload, keeping what's on screen if it fails (e.g. no internet). */
const refresh = (load: () => Promise<unknown>) => () => {
  load().catch(() => {});
};

async function load(userId: string) {
  const { data: role } = await supabase.rpc('my_role');
  const business = await loadMyBusiness();
  const businessName = business?.businessName ?? '';

  if (role === 'owner' && business?.id) {
    const businessId = business.id;
    const reloadTeam = refresh(() =>
      Promise.all([loadTeam(businessId, businessStore.get()?.businessName ?? businessName), loadInvites()]),
    );
    await Promise.all([
      loadTeam(businessId, businessName),
      loadInvites().catch(() => {}),
      loadDocs().catch(() => {}),
      loadBusinessPayment().catch(() => {}),
      loadExpenses().catch(() => {}),
      loadNotifications(null),
      loadShifts().catch(() => {}),
      loadClockSessions().catch(() => {}),
      loadPayslips().catch(() => {}),
      loadPayRuns().catch(() => {}),
      loadClients().catch(() => {}),
      loadJobs().catch(() => {}),
      loadEvents().catch(() => {}),
      loadContractorInvoices().catch(() => {}),
    ]);
    stopListening.push(subscribeToNotifications(userId, null));

    // Changes made on employees' phones (joining, availability, clock in/out) appear straight away.
    const filter = `business_id=eq.${businessId}`;
    const live = supabase
      .channel(`business-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees', filter }, reloadTeam)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_invites', filter }, refresh(loadInvites))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clock_sessions', filter }, refresh(loadClockSessions))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter }, refresh(loadShifts))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payslips', filter }, refresh(loadPayslips))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pay_runs', filter }, refresh(loadPayRuns))
      // Jobs change when shifts are linked to them (Assigned) and when they're booked or moved.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter }, refresh(loadJobs))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events', filter }, refresh(loadEvents))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contractor_invoices', filter }, refresh(loadContractorInvoices))
      // Customers accepting or declining quotes online, and quotes being booked as jobs.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_docs', filter }, (payload) =>
        applyRemoteDoc(payload.eventType, (payload.eventType === 'DELETE' ? payload.old : payload.new) as Parameters<typeof applyRemoteDoc>[1]),
      )
      .subscribe();
    stopListening.push(() => {
      supabase.removeChannel(live);
    });
  } else if (role === 'employee') {
    const me = await loadOwnProfile(userId, businessName);
    currentEmployeeStore.set(me);
    await Promise.all([
      loadNotifications(me?.id ?? null),
      loadShifts().catch(() => {}),
      loadClockSessions().catch(() => {}),
      loadPayslips().catch(() => {}),
      loadMyAssignedJobs().catch(() => {}),
      // Only contractors can see any (the database returns none for other workers).
      isContractor(me) ? loadContractorInvoices().catch(() => {}) : Promise.resolve(),
    ]);

    // A new roster or pay notification means there's something new to show.
    stopListening.push(
      subscribeToNotifications(userId, me?.id ?? null, (n) => {
        if (n.type === 'roster_published' || n.type === 'shift_changed') {
          refresh(loadShifts)();
          refresh(loadMyAssignedJobs)();
        }
        if (n.type === 'payslip_available') refresh(loadPayslips)();
        if (n.type === 'invoice_status') refresh(loadContractorInvoices)();
      }),
    );

    if (me) {
      // The owner changing their details (e.g. position or pay rate) shows straight away.
      const live = supabase
        .channel(`employee-${me.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'employees', filter: `id=eq.${me.id}` }, async () => {
          const updated = await loadOwnProfile(userId, businessStore.get()?.businessName ?? businessName).catch(() => null);
          if (updated) {
            // Switched to or from Contractor: the invoice tabs appear or disappear to match.
            const wasContractor = isContractor(currentEmployeeStore.get());
            currentEmployeeStore.set(updated);
            if (isContractor(updated) && !wasContractor) refresh(loadContractorInvoices)();
            if (!isContractor(updated)) clearContractorInvoices();
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter: `business_id=eq.${me.businessId}` }, () => {
          refresh(loadShifts)();
          refresh(loadMyAssignedJobs)();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payslips', filter: `employee_id=eq.${me.id}` }, refresh(loadPayslips))
        .subscribe();
      stopListening.push(() => {
        supabase.removeChannel(live);
      });
    }
  }
}

export function endSession() {
  stopListening.forEach((stop) => stop());
  stopListening = [];
  activeUserId = null;
  loading = null;
  clearBusiness();
  employeesStore.set([]);
  invitesStore.set([]);
  clearDocs();
  clearBusinessPayment();
  expensesStore.set([]);
  qualificationsStore.set({});
  currentEmployeeStore.set(null);
  clearNotifications();
  shiftsStore.set([]);
  clockStore.set([]);
  payslipsStore.set([]);
  payRunsStore.set([]);
  availabilityStore.set({});
  jobReportsStore.set([]);
  clientsStore.set([]);
  clearContractorInvoices();
  jobsStore.set([]);
  eventsStore.set([]);
}
