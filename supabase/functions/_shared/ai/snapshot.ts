// Loads everything the AI looks at for ONE business. Every query is filtered to
// that business's id. In the chat this runs with the signed-in owner's own
// login (so Row Level Security also applies: an owner can only ever read their
// own business); the daily check uses the server client, one business at a time.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { dateKeyOf } from './dates.ts';
import { loadTransactions } from './transactions-adapter.ts';
import type { BusinessSnapshot } from './types.ts';

type Row = Record<string, unknown>;

const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const sOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** Same as docTotals() in the app: line amounts + GST. */
function docTotals(items: unknown, gstRate: unknown) {
  const list = Array.isArray(items) ? (items as { qty?: unknown; rate?: unknown }[]) : [];
  const subtotal = list.reduce((sum, i) => sum + Math.round((Number(i.qty) || 0) * (Number(i.rate) || 0) * 100) / 100, 0);
  const rate = n(gstRate) ?? 0.1;
  const sub = Math.round(subtotal * 100) / 100;
  const gst = Math.round(sub * rate * 100) / 100;
  return { gst, total: Math.round((sub + gst) * 100) / 100 };
}
const docTotal = (items: unknown, gstRate: unknown) => docTotals(items, gstRate).total;

async function rows(db: SupabaseClient, table: string, columns: string, businessId: string): Promise<Row[]> {
  const { data, error } = await db.from(table).select(columns).eq('business_id', businessId).limit(5000);
  if (error) {
    // A missing optional table (e.g. super payments not set up yet) just means no data.
    console.warn(`Could not read ${table}:`, error.message);
    return [];
  }
  return (data ?? []) as unknown as Row[];
}

export async function loadSnapshot(db: SupabaseClient, businessId: string): Promise<BusinessSnapshot | null> {
  const { data: business, error } = await db
    .from('businesses')
    .select('id, name, country, financial_year_start_month, gst_registered')
    .eq('id', businessId)
    .maybeSingle();
  if (error || !business) return null;

  const sixMonthsAgo = new Date(Date.now() - 183 * 24 * 3600_000).toISOString();
  const [docs, jobs, clients, employees, shifts, payslips, superPayments, expenses, clock, qualifications, reports, events, contractorInvoices, transactions] = await Promise.all([
    rows(db, 'sales_docs', 'id, kind, number, status, client, client_id, job_type, job_date, items, gst_rate, due_date, paid_at, created_at, responded_at, source_quote_id', businessId),
    rows(db, 'jobs', 'id, title, address, client_id, quote_id, status, scheduled_start, scheduled_end, assigned_employee_ids', businessId),
    rows(db, 'clients', 'id, name, email, phone, address', businessId),
    rows(db, 'employees', 'id, full_name, position, employment_type, status, pay_rate, pay_type, availability', businessId),
    rows(db, 'shifts', 'id, date, start_time, end_time, employee_ids, job_id, job_type, location', businessId),
    rows(db, 'payslips', 'id, employee_id, period_start, period_end, pay_date, hours, gross, tax, net, super, status', businessId),
    rows(db, 'super_payments', 'id, employee_id, super_amount, due_date, status', businessId),
    rows(db, 'expenses', 'id, date, amount, category, description', businessId),
    rows(db, 'clock_sessions', 'id, employee_id, started_at, ended_at', businessId).then((r) => r.filter((c) => s(c.started_at) >= sixMonthsAgo)),
    rows(db, 'employee_qualifications', 'id, employee_id, name, expiry_date', businessId),
    rows(db, 'job_reports', 'id, employee_id, shift_date, job_title, location, outcome, notes, issues, completed, submitted_at', businessId).then((r) =>
      r.filter((x) => s(x.submitted_at) >= sixMonthsAgo),
    ),
    rows(db, 'calendar_events', 'id, type, title, starts_at, ends_at, all_day, address, supplier, delivery_items, notes', businessId).then((r) =>
      r.filter((e) => e.type === 'delivery' || e.type === 'other'),
    ),
    rows(db, 'contractor_invoices', 'id, employee_id, number, invoice_date, due_date, status, total, gst, paid_at', businessId),
    loadTransactions(db, businessId),
  ]);

  const clientName = (r: Row) => s((r.client as Row | null)?.name) || '';
  const quotes = docs.filter((d) => d.kind === 'quote');
  const quoteById = new Map(quotes.map((q) => [s(q.id), q]));

  return {
    businessId,
    businessName: s(business.name),
    country: sOrNull(business.country),
    financialYearStartMonth: Number(business.financial_year_start_month) || 7,
    gstRegistered: business.gst_registered === true,
    invoices: docs
      .filter((d) => d.kind === 'invoice')
      .map((d) => ({
        id: s(d.id),
        number: s(d.number),
        status: s(d.status),
        clientId: sOrNull(d.client_id),
        clientName: clientName(d),
        total: docTotal(d.items, d.gst_rate),
        gst: docTotals(d.items, d.gst_rate).gst,
        dueDate: sOrNull(d.due_date),
        createdAt: s(d.created_at),
        paidAt: sOrNull(d.paid_at),
        sourceQuoteId: sOrNull(d.source_quote_id),
      })),
    quotes: quotes.map((d) => ({
      id: s(d.id),
      number: s(d.number),
      status: s(d.status),
      clientId: sOrNull(d.client_id),
      clientName: clientName(d),
      total: docTotal(d.items, d.gst_rate),
      jobType: sOrNull(d.job_type),
      jobDate: sOrNull(d.job_date),
      createdAt: s(d.created_at),
      respondedAt: sOrNull(d.responded_at),
    })),
    jobs: jobs.map((j) => {
      const quote = j.quote_id ? quoteById.get(s(j.quote_id)) : undefined;
      return {
        id: s(j.id),
        title: s(j.title),
        address: s(j.address),
        clientId: sOrNull(j.client_id),
        quoteId: sOrNull(j.quote_id),
        quoteNumber: quote ? s(quote.number) : null,
        status: s(j.status),
        startsAt: s(j.scheduled_start),
        endsAt: s(j.scheduled_end),
        assignedEmployeeIds: Array.isArray(j.assigned_employee_ids) ? (j.assigned_employee_ids as string[]) : [],
        value: quote ? docTotal(quote.items, quote.gst_rate) : null,
      };
    }),
    clients: clients.map((c) => ({ id: s(c.id), name: s(c.name), email: s(c.email), phone: s(c.phone), address: s(c.address) })),
    employees: employees.map((e) => ({
      id: s(e.id),
      name: s(e.full_name).trim(),
      role: s(e.position),
      employmentType: s(e.employment_type),
      status: s(e.status) || 'active',
      payRate: n(e.pay_rate),
      payType: s(e.pay_type) || 'hourly',
    })),
    shifts: shifts.map((sh) => ({
      id: s(sh.id),
      date: s(sh.date),
      start: s(sh.start_time),
      end: s(sh.end_time),
      employeeIds: Array.isArray(sh.employee_ids) ? (sh.employee_ids as string[]) : [],
      jobId: sOrNull(sh.job_id),
      jobType: s(sh.job_type),
      location: s(sh.location),
    })),
    payslips: payslips.map((p) => ({
      id: s(p.id),
      employeeId: s(p.employee_id),
      periodStart: s(p.period_start),
      periodEnd: s(p.period_end),
      payDate: sOrNull(p.pay_date),
      hours: n(p.hours) ?? 0,
      gross: n(p.gross) ?? 0,
      tax: n(p.tax) ?? 0,
      net: n(p.net) ?? 0,
      super: n(p.super) ?? 0,
      status: s(p.status),
    })),
    superPayments: superPayments.map((p) => ({
      id: s(p.id),
      employeeId: s(p.employee_id),
      amount: n(p.super_amount) ?? 0,
      dueDate: s(p.due_date),
      status: s(p.status),
    })),
    expenses: expenses.map((e) => ({
      id: s(e.id),
      date: /^\d{4}-\d{2}-\d{2}$/.test(s(e.date)) ? s(e.date) : dateKeyOf(s(e.date)),
      amount: n(e.amount) ?? 0,
      category: s(e.category),
      description: s(e.description),
    })),
    availability: Object.fromEntries(
      employees
        .filter((e) => Array.isArray(e.availability) && (e.availability as unknown[]).length === 7)
        .map((e) => [s(e.id), e.availability as { available: boolean; start: string; end: string }[]]),
    ),
    clockSessions: clock.map((c) => ({ id: s(c.id), employeeId: s(c.employee_id), start: s(c.started_at), end: sOrNull(c.ended_at) })),
    qualifications: qualifications.map((q) => ({ id: s(q.id), employeeId: s(q.employee_id), name: s(q.name), expiryDate: sOrNull(q.expiry_date) })),
    jobReports: reports.map((r) => ({
      id: s(r.id),
      employeeId: s(r.employee_id),
      date: sOrNull(r.shift_date) ?? dateKeyOf(s(r.submitted_at)),
      jobTitle: s(r.job_title),
      location: s(r.location),
      outcome: s(r.outcome),
      notes: s(r.notes),
      issues: s(r.issues),
      completed: r.completed === true,
      submittedAt: s(r.submitted_at),
    })),
    events: events.map((e) => ({
      id: s(e.id),
      type: s(e.type),
      title: s(e.title),
      date: dateKeyOf(s(e.starts_at)),
      start: new Date(new Date(s(e.starts_at)).getTime() + 10 * 3600_000).toISOString().slice(11, 16),
      end: new Date(new Date(s(e.ends_at)).getTime() + 10 * 3600_000).toISOString().slice(11, 16),
      allDay: e.all_day === true,
      address: s(e.address),
      supplier: s(e.supplier),
      deliveryItems: s(e.delivery_items),
      notes: s(e.notes),
    })),
    contractorInvoices: contractorInvoices.map((i) => ({
      id: s(i.id),
      employeeId: s(i.employee_id),
      number: s(i.number),
      invoiceDate: s(i.invoice_date),
      dueDate: sOrNull(i.due_date),
      status: s(i.status),
      total: n(i.total) ?? 0,
      gst: n(i.gst) ?? 0,
      paidAt: sOrNull(i.paid_at),
    })),
    transactions: transactions.transactions,
    transactionsConnected: transactions.connected,
  };
}
