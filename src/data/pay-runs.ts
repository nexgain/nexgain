// Pay runs: each time the owner approves payroll, the database makes a pay run
// with the business's next payroll number (Payroll 001, 002, ...). The owner
// then downloads the bank payment file for it and, once it's been uploaded to
// the bank, marks it as paid (which tells each employee they've been paid).
// Owner only.
import { businessStore } from '@/data/business';
import { employeeFullName, employeesStore } from '@/data/employees';
import { loadPayslips, payslipsStore } from '@/data/payroll';
import { createStore } from '@/data/store';
import {
  bankFieldSetFor,
  buildPaymentFile,
  EMPTY_PAYER,
  paymentFileName,
  paymentFileTypeFor,
  payeeBankFromSaved,
  PaymentFileError,
  validatePayer,
  type PayerSettings,
  type PaymentLine,
  type SavedBankRow,
} from '@/lib/payment-files';
import { shareTextFile } from '@/lib/share-file';
import { supabase } from '@/lib/supabase';

export type PayRun = {
  id: string;
  payrollNumber: number;
  /** "YYYY-MM-DD" */
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: 'approved' | 'paid';
  employeeCount: number;
  totalNet: number;
  approvedAt: string;
  fileDownloadedAt: string | null;
  paidAt: string | null;
};

type PayRunRow = {
  id: string;
  payroll_number: number;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: 'approved' | 'paid';
  employee_count: number;
  total_net: number | string;
  approved_at: string;
  file_downloaded_at: string | null;
  paid_at: string | null;
};

function fromRow(r: PayRunRow): PayRun {
  return {
    id: r.id,
    payrollNumber: r.payroll_number,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    payDate: r.pay_date,
    status: r.status,
    employeeCount: r.employee_count,
    totalNet: Number(r.total_net),
    approvedAt: r.approved_at,
    fileDownloadedAt: r.file_downloaded_at,
    paidAt: r.paid_at,
  };
}

/** Newest first. */
export const payRunsStore = createStore<PayRun[]>([]);

export function usePayRuns() {
  return payRunsStore.use();
}

export async function loadPayRuns() {
  const { data, error } = await supabase.from('pay_runs').select('*').order('payroll_number', { ascending: false });
  if (error) throw error;
  payRunsStore.set((data as PayRunRow[]).map(fromRow));
}

function replaceRun(row: PayRunRow) {
  const run = fromRow(row);
  payRunsStore.set((all) => {
    const others = all.filter((r) => r.id !== run.id);
    return [run, ...others].sort((a, b) => b.payrollNumber - a.payrollNumber);
  });
  return run;
}

/**
 * Marks a pay run as paid: its payslips become paid and each employee gets a
 * "You've been paid!" notification with the amount, pay date and payroll number.
 */
export async function markPayRunPaid(id: string) {
  const { data, error } = await supabase.rpc('mark_pay_run_paid', { p_pay_run_id: id });
  if (error) throw new Error(error.message);
  const run = replaceRun(data as PayRunRow);
  payslipsStore.set((all) => all.map((p) => (p.payRunId === id ? { ...p, status: 'paid', paidAt: run.paidAt } : p)));
  return run;
}

// ---------------------------------------------------------------------------
// The owner's payroll bank setup (the account wages are paid from)
// ---------------------------------------------------------------------------

type PayerRow = {
  account_name: string;
  bank_code: string;
  account_number: string;
  iban: string;
  bic: string;
  bank_short_name: string;
  user_id_number: string;
  company_id: string;
  bank_name: string;
  aba_balancing: boolean;
};

export async function loadPayrollBank(): Promise<PayerSettings> {
  const business = businessStore.get();
  const country = business?.country ?? '';
  if (!business?.id) return { ...EMPTY_PAYER, country };
  const { data, error } = await supabase
    .from('payroll_bank_settings')
    .select('account_name, bank_code, account_number, iban, bic, bank_short_name, user_id_number, company_id, bank_name, aba_balancing')
    .eq('business_id', business.id)
    .maybeSingle<PayerRow>();
  if (error) throw error;
  if (!data) return { ...EMPTY_PAYER, country };
  return {
    country,
    accountName: data.account_name,
    bankCode: data.bank_code,
    accountNumber: data.account_number,
    iban: data.iban,
    bic: data.bic,
    bankShortName: data.bank_short_name,
    userIdNumber: data.user_id_number,
    companyId: data.company_id,
    bankName: data.bank_name,
    abaBalancing: data.aba_balancing,
  };
}

export async function savePayrollBank(p: PayerSettings) {
  const businessId = businessStore.get()?.id;
  if (!businessId) throw new Error('Please log in again.');
  const { error } = await supabase.from('payroll_bank_settings').upsert({
    business_id: businessId,
    account_name: p.accountName.trim(),
    bank_code: p.bankCode.replace(/[^0-9]/g, ''),
    account_number: p.accountNumber.replace(/[^0-9]/g, ''),
    iban: p.iban.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
    bic: p.bic.trim().toUpperCase(),
    bank_short_name: p.bankShortName.trim().toUpperCase(),
    user_id_number: p.userIdNumber.trim(),
    company_id: p.companyId.trim().toUpperCase(),
    bank_name: p.bankName.trim(),
    aba_balancing: p.abaBalancing,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Download payment file
// ---------------------------------------------------------------------------

export type DownloadResult =
  | { ok: true; fileName: string }
  /** No bank file for this country yet. */
  | { ok: false; reason: 'unsupported'; country: string | null }
  /** The owner's own payroll bank details aren't set up (or are incomplete). */
  | { ok: false; reason: 'setup' }
  /** These employees need to add or fix their bank details first. */
  | { ok: false; reason: 'employees'; problems: { name: string; problem: string }[] }
  | { ok: false; reason: 'error'; message: string };

/** Today in the business's time zone (Brisbane), "YYYY-MM-DD". */
export function todayKey(now = new Date()) {
  const d = new Date(now.getTime() + 10 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Builds the right bank file for the business's country from this pay run and
 * opens the share sheet. Checks everything first and explains what's missing.
 * Bank details are only held in memory while the file is made; they're never
 * logged or stored by the app.
 */
export async function downloadPaymentFile(run: PayRun): Promise<DownloadResult> {
  const business = businessStore.get();
  const country = business?.country ?? null;
  const fileType = paymentFileTypeFor(country);
  if (!fileType) return { ok: false, reason: 'unsupported', country };

  try {
    const payer = await loadPayrollBank();
    if (Object.keys(validatePayer(fileType, payer)).length > 0) return { ok: false, reason: 'setup' };

    const { data, error } = await supabase.rpc('pay_run_bank_details', { p_pay_run_id: run.id });
    if (error) return { ok: false, reason: 'error', message: error.message };
    const saved = new Map((data as (SavedBankRow & { employee_id: string })[]).map((r) => [r.employee_id, r]));

    const set = bankFieldSetFor(country);
    const people = employeesStore.get();
    const payslips = payslipsStore.get().filter((p) => p.payRunId === run.id);
    const problems: { name: string; problem: string }[] = [];
    const lines: PaymentLine[] = [];
    for (const p of payslips) {
      const employee = people.find((e) => e.id === p.employeeId);
      const name = employee ? employeeFullName(employee) : 'Former employee';
      const amountCents = Math.round(p.net * 100);
      if (amountCents <= 0) continue; // nothing to send
      const bank = payeeBankFromSaved(set, saved.get(p.employeeId) ?? null);
      if (bank.problem !== null) {
        problems.push({ name, problem: bank.problem });
        continue;
      }
      lines.push({ employeeId: p.employeeId, employeeName: name, amountCents, bank: bank.bank });
    }
    if (problems.length > 0) return { ok: false, reason: 'employees', problems };
    if (lines.length === 0) return { ok: false, reason: 'error', message: 'There is nothing to pay in this pay run.' };

    // Banks won't take a pay date in the past, so a late download moves it to today.
    const today = todayKey();
    const payDate = run.status === 'approved' && run.payDate < today ? today : run.payDate;

    const file = buildPaymentFile(
      country,
      {
        payrollNumber: run.payrollNumber,
        payDate,
        createdAt: new Date(),
        businessName: business?.businessName ?? '',
        lines,
      },
      payer,
    );
    if (!file) return { ok: false, reason: 'unsupported', country };

    const fileName = paymentFileName(business?.businessName ?? '', run.payrollNumber, payDate, file.extension);
    await shareTextFile(file.content, fileName, file.mimeType);

    // Record the download (and any new pay date) on the pay run.
    const { data: updated, error: recordError } = await supabase.rpc('record_payment_file', {
      p_pay_run_id: run.id,
      p_pay_date: payDate,
    });
    if (!recordError && updated) {
      replaceRun(updated as PayRunRow);
      if (payDate !== run.payDate) loadPayslips().catch(() => {});
    }
    return { ok: true, fileName };
  } catch (e) {
    const message =
      e instanceof PaymentFileError ? e.message : 'The file couldn’t be made. Check your internet connection and try again.';
    return { ok: false, reason: 'error', message };
  }
}
