// Paying super. ALL super payment logic lives in this file, so the screens
// never talk to a super clearing house directly. When one is connected, only
// paySuper() below needs to change; the Pay Super button stays the same.
//
// For now NO money is sent and nothing is marked as paid: paySuper() gathers
// what a clearing house will need, logs it (in development only) and returns
// a "coming soon" message for the screen to show.
import { employeeFullName, employeesStore } from '@/data/employees';
import { superPaymentsStore } from '@/data/super-payments';

/** One person's super in a payment, with what a clearing house needs to send it. */
export type SuperPaymentLine = {
  superPaymentId: string;
  employeeId: string;
  employeeName: string;
  /** Super owed for this pay run. */
  amount: number;
  qualifyingEarnings: number;
  /** Empty strings where the employee hasn't added them yet. */
  fund: { name: string; usiOrAbn: string; memberNumber: string };
  /** "YYYY-MM-DD" */
  dueDate: string;
};

export type SuperPaymentBatch = {
  payRunId: string;
  lines: SuperPaymentLine[];
  total: number;
};

/**
 * The Unpaid super for a pay run: everyone in it, or just the chosen employees,
 * with each person's name, super fund details (if we have them) and amount owed.
 */
export function superToPay(payRunId: string, employeeIds?: string[]): SuperPaymentBatch {
  const records = superPaymentsStore
    .get()
    .filter((s) => s.payRunId === payRunId && s.status === 'unpaid' && (!employeeIds || employeeIds.includes(s.employeeId)));
  const people = employeesStore.get();
  const lines = records.map((s): SuperPaymentLine => {
    const e = people.find((p) => p.id === s.employeeId);
    return {
      superPaymentId: s.id,
      employeeId: s.employeeId,
      employeeName: e ? employeeFullName(e) : 'Former employee',
      amount: s.superAmount,
      qualifyingEarnings: s.qualifyingEarnings,
      fund: { name: e?.superFund ?? '', usiOrAbn: e?.superFundUsi ?? '', memberNumber: e?.superMemberNumber ?? '' },
      dueDate: s.dueDate,
    };
  });
  const total = Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
  return { payRunId, lines, total };
}

export const SUPER_COMING_SOON_MESSAGE =
  "Super payments are coming soon. This will send super to your employees' funds once we connect a clearing house.";

export type PaySuperResult =
  | { status: 'coming-soon'; message: string; batch: SuperPaymentBatch }
  | { status: 'nothing-to-pay'; message: string };

/**
 * Pays the Unpaid super for a pay run: everyone, or only `employeeIds`.
 * Not connected yet: it only gathers and logs the details.
 */
export async function paySuper(payRunId: string, employeeIds?: string[]): Promise<PaySuperResult> {
  const batch = superToPay(payRunId, employeeIds);
  if (batch.lines.length === 0) return { status: 'nothing-to-pay', message: 'There is no unpaid super to pay.' };

  // TODO: connect clearing house API here.
  //   1. Send `batch` to the clearing house (best from a Supabase Edge Function,
  //      so the API keys never live in the app).
  //   2. Mark the records Processing, then Paid when the clearing house confirms:
  //      supabase.rpc('set_super_status', { p_ids, p_status: 'processing' | 'paid', p_reference })
  //      (that database function already exists; see the super_payments migration).
  //   3. Return a 'paid' / 'processing' result instead of 'coming-soon'.

  // Development only: never log people's super details in the released app.
  if (__DEV__) {
    console.log('[paySuper] Not connected to a clearing house yet. Would send:', JSON.stringify(batch, null, 2));
  }
  return { status: 'coming-soon', message: SUPER_COMING_SOON_MESSAGE, batch };
}
