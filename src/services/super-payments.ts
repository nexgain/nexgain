// Paying super. ALL super payment logic lives in this file, so the screens
// never talk to a super provider (clearing house) directly. To connect a real
// provider later, write a new SuperProvider and swap it in below; nothing in
// the app's screens needs to change.
//
// Steps for each payment:
//   1. The chosen Unpaid records become Processing (saved in the database).
//   2. The provider is asked to send the money to each person's super fund.
//   3. When it's done they become Paid (with the paid date and the provider's
//      reference). If it fails they go back to Unpaid so the owner can try again.
import { employeeFullName, employeesStore } from '@/data/employees';
import { applySuperRows, superPaymentsStore, type SuperPayment, type SuperPaymentRow } from '@/data/super-payments';
import { supabase } from '@/lib/supabase';

/** One person's super in a payment, with what a provider needs to send it. */
export type SuperPaymentLine = {
  superPaymentId: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  qualifyingEarnings: number;
  fund: { name: string; usiOrAbn: string; memberNumber: string };
};

export type SuperPaymentBatch = {
  payRunId: string;
  lines: SuperPaymentLine[];
  total: number;
};

/** What a provider says back: paid straight away, or still processing (it confirms later). */
export type ProviderResult = { status: 'paid' | 'processing'; reference: string };

/** A super provider / clearing house. */
export type SuperProvider = {
  name: string;
  submit: (batch: SuperPaymentBatch) => Promise<ProviderResult>;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Pretend provider for now: no money moves. It waits a moment, then says it's paid. */
const simulatedProvider: SuperProvider = {
  name: 'Simulated (no money is sent)',
  async submit() {
    await wait(1500);
    return { status: 'paid', reference: `SIM-${Date.now().toString(36).toUpperCase()}` };
  },
};

// TODO(super provider): connect the real super provider / clearing house here.
//   - Write a SuperProvider whose submit() sends the batch to the provider's API
//     (best done from a Supabase Edge Function, so API keys never live in the app).
//   - If the provider confirms later (e.g. by webhook), return status 'processing'
//     and let the server mark the records paid with set_super_status(..., 'paid', reference).
//   - Then change the line below to use it.
const provider: SuperProvider = simulatedProvider;

/** Whether payments are only pretend for now (shown on the confirm screen). */
export const SUPER_PAYMENTS_SIMULATED = provider === simulatedProvider;

/**
 * The Unpaid super for a pay run: everyone in it, or just the chosen employees.
 * Used for the confirm screen's total and by paySuper().
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
    };
  });
  const total = Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
  return { payRunId, lines, total };
}

async function setStatus(ids: string[], status: SuperPayment['status'], reference?: string) {
  const { data, error } = await supabase.rpc('set_super_status', {
    p_ids: ids,
    p_status: status,
    p_reference: reference ?? null,
  });
  if (error) throw new Error(error.message);
  applySuperRows(data as SuperPaymentRow[]);
}

export type PaySuperResult =
  | { ok: true; status: 'paid' | 'processing'; count: number; total: number; reference: string }
  | { ok: false; message: string };

/**
 * Pays the Unpaid super for a pay run: everyone, or only `employeeIds`.
 * Sets them to Processing, sends them to the provider, then marks them Paid.
 */
export async function paySuper(payRunId: string, employeeIds?: string[]): Promise<PaySuperResult> {
  const batch = superToPay(payRunId, employeeIds);
  if (batch.lines.length === 0) return { ok: false, message: 'There is no unpaid super to pay.' };
  const ids = batch.lines.map((l) => l.superPaymentId);

  try {
    await setStatus(ids, 'processing');
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Couldn’t start the super payment. Please try again.' };
  }

  let result: ProviderResult;
  try {
    result = await provider.submit(batch);
  } catch {
    // Nothing was paid: put them back to Unpaid so the owner can try again.
    await setStatus(ids, 'unpaid').catch(() => {});
    return { ok: false, message: 'The super payment didn’t go through. Nothing was paid. Please try again.' };
  }

  if (result.status === 'paid') {
    try {
      await setStatus(ids, 'paid', result.reference);
    } catch {
      // The money has gone, so leave them as Processing rather than Unpaid (no paying twice).
      return {
        ok: false,
        message: `The super was sent (reference ${result.reference}) but couldn’t be marked as paid. Check your internet connection; it shows as Processing until then.`,
      };
    }
  }
  return { ok: true, status: result.status, count: ids.length, total: batch.total, reference: result.reference };
}
