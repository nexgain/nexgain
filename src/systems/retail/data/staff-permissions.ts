// NexGain Retail: what each staff member can do from the Scanner, and the
// Scanner's stock actions (Sold, Received, Returned, Damaged, Count). Stored
// in Supabase (see supabase/migrations/20261127000400_retail_staff.sql); the
// database checks the permissions again on every action.
import { businessStore } from '@/data/business';
import { createStore } from '@/data/store';
import { supabase } from '@/lib/supabase';

export type StaffAction = 'sold' | 'returned' | 'received' | 'damaged' | 'count';

export type StaffPermissions = Record<StaffAction, boolean>;

/** Without settings from the owner: look up, sell and take returns. */
export const DEFAULT_PERMISSIONS: StaffPermissions = { sold: true, returned: true, received: false, damaged: false, count: false };

export const ACTION_LABELS: Record<StaffAction, { label: string; owner: string; hint: string }> = {
  sold: { label: 'Sold', owner: 'Mark items Sold', hint: 'Takes it off stock and records the sale at its price.' },
  returned: { label: 'Returned', owner: 'Take returns', hint: 'A customer brought it back: it goes back in stock.' },
  received: { label: 'Received', owner: 'Receive deliveries', hint: 'Stock that arrived: adds to stock.' },
  damaged: { label: 'Damaged', owner: 'Damaged / lost', hint: 'Broken, stolen or missing: takes it off stock.' },
  count: { label: 'Count', owner: 'Stock counts', hint: 'Set stock to the number counted (a stocktake).' },
};

export const STAFF_ACTIONS: StaffAction[] = ['sold', 'received', 'returned', 'damaged', 'count'];

type PermissionRow = { can_sell: boolean; can_return: boolean; can_receive: boolean; can_damage: boolean; can_count: boolean };

const fromRow = (r: PermissionRow | null): StaffPermissions =>
  r ? { sold: r.can_sell, returned: r.can_return, received: r.can_receive, damaged: r.can_damage, count: r.can_count } : DEFAULT_PERMISSIONS;

/** The signed-in staff member's own permissions. */
export const myPermissionsStore = createStore<StaffPermissions>(DEFAULT_PERMISSIONS);
export const useMyPermissions = () => myPermissionsStore.use();

export async function loadMyPermissions(employeeId: string | null | undefined) {
  if (!employeeId) return;
  const { data, error } = await supabase.from('retail_staff_permissions').select('*').eq('employee_id', employeeId).maybeSingle<PermissionRow>();
  if (!error) myPermissionsStore.set(fromRow(data));
}

/** Owner: one staff member's permissions. */
export async function loadPermissions(employeeId: string): Promise<StaffPermissions> {
  const { data, error } = await supabase.from('retail_staff_permissions').select('*').eq('employee_id', employeeId).maybeSingle<PermissionRow>();
  return error ? DEFAULT_PERMISSIONS : fromRow(data);
}

/** Owner: saves one staff member's permissions. Returns an error message, or null. */
export async function savePermissions(employeeId: string, p: StaffPermissions): Promise<string | null> {
  const businessId = businessStore.get()?.id;
  if (!businessId) return 'Your shop isn’t set up yet.';
  const { error } = await supabase.from('retail_staff_permissions').upsert({
    employee_id: employeeId,
    business_id: businessId,
    can_sell: p.sold,
    can_return: p.returned,
    can_receive: p.received,
    can_damage: p.damaged,
    can_count: p.count,
    updated_at: new Date().toISOString(),
  });
  return error ? 'Couldn’t save. Check your internet connection and try again.' : null;
}

/** "Sold 2 × Classic Hoodie · M. 3 left." */
export function actionDoneText(action: StaffAction, quantity: number, name: string, left: number) {
  if (action === 'count') return `Counted ${quantity} × ${name}. Stock is now ${left}.`;
  return `${ACTION_LABELS[action].label}: ${quantity} × ${name}. ${left} left.`;
}

/** A Scanner action. Returns how many are left, or an error message. */
export async function staffStockAction(
  variantId: string,
  storeId: string | null,
  action: StaffAction,
  quantity: number,
  note = '',
): Promise<{ left: number } | { error: string }> {
  const { data, error } = await supabase.rpc('staff_stock_action', { p_variant: variantId, p_store: storeId, p_kind: action, p_quantity: quantity, p_note: note });
  if (error) {
    const known = ['NXS00', 'NXS01', 'NXS03', 'NXS04', 'P0001'].includes(error.code ?? '');
    return { error: known ? error.message : /network|fetch/i.test(error.message) ? 'No internet connection. Try again.' : 'Couldn’t save that. Please try again.' };
  }
  return { left: Number((data as { left: number }).left) };
}
