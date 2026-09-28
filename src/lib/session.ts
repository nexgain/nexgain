// What happens after someone logs in (or reopens the app while logged in):
// load their data from the database and listen for live changes. Cleared on log out.
import { businessStore, clearBusiness, loadMyBusiness } from '@/data/business';
import { currentEmployeeStore } from '@/data/current-employee';
import { employeesStore, loadOwnProfile, loadTeam } from '@/data/employees';
import { clearNotifications, loadNotifications, subscribeToNotifications } from '@/data/notifications';
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

async function load(userId: string) {
  const { data: role } = await supabase.rpc('my_role');
  const business = await loadMyBusiness();
  const businessName = business?.businessName ?? '';

  if (role === 'owner' && business?.id) {
    const businessId = business.id;
    await loadTeam(businessId, businessName);
    await loadNotifications(null);
    stopListening.push(subscribeToNotifications(userId, null));

    // New employees joining (or updating their details) appear straight away.
    const team = supabase
      .channel(`team-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees', filter: `business_id=eq.${businessId}` }, () => {
        loadTeam(businessId, businessStore.get()?.businessName ?? businessName).catch(() => {});
      })
      .subscribe();
    stopListening.push(() => {
      supabase.removeChannel(team);
    });
  } else if (role === 'employee') {
    const me = await loadOwnProfile(userId, businessName);
    currentEmployeeStore.set(me);
    await loadNotifications(me?.id ?? null);
    stopListening.push(subscribeToNotifications(userId, me?.id ?? null));
  }
}

export function endSession() {
  stopListening.forEach((stop) => stop());
  stopListening = [];
  activeUserId = null;
  loading = null;
  clearBusiness();
  employeesStore.set([]);
  currentEmployeeStore.set(null);
  clearNotifications();
}
