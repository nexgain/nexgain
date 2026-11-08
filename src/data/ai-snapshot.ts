// Everything the free AI Assistant looks at, gathered from data the app has
// already loaded for the signed-in owner (so it's only ever their own
// business). Job reports and qualifications aren't kept in the app, so they're
// read here with the owner's login (and kept for a minute). Bank transactions
// come through the one shared transactions adapter, the same one the daily
// health check uses.
import { availabilityStore } from '@/data/availability';
import { businessStore } from '@/data/business';
import { eventsStore } from '@/data/calendar';
import { clientsStore } from '@/data/clients';
import { clockStore } from '@/data/clock-records';
import { contractorInvoicesStore } from '@/data/contractor-invoices';
import { employeeFullName, employeesStore } from '@/data/employees';
import { expensesStore } from '@/data/finance';
import { docsStore, docTotals, type SalesDoc } from '@/data/invoices';
import { jobsStore } from '@/data/jobs';
import { payslipsStore } from '@/data/payroll';
import { shiftsStore } from '@/data/shifts';
import { superPaymentsStore } from '@/data/super-payments';
import { supabase } from '@/lib/supabase';

import { loadTransactions } from '../../supabase/functions/_shared/ai/transactions-adapter';
import type { BusinessSnapshot, JobReportInfo, QualificationInfo } from '../../supabase/functions/_shared/ai/types';

/** The client a quote or invoice is for (documents keep the client's details, not always a link). */
function clientIdOf(doc: SalesDoc) {
  const name = doc.client.name.trim().toLowerCase();
  const email = doc.client.email.trim().toLowerCase();
  return (
    clientsStore.get().find((c) => (email && c.email.trim().toLowerCase() === email) || (name && c.name.trim().toLowerCase() === name))?.id ?? null
  );
}

const CACHE_MS = 60_000;
let extras: { at: number; businessId: string; reports: JobReportInfo[]; qualifications: QualificationInfo[] } | null = null;

/** Job reports (last 6 months) and qualifications, for this owner's business only. */
async function loadExtras(businessId: string) {
  if (extras && extras.businessId === businessId && Date.now() - extras.at < CACHE_MS) return extras;
  const since = new Date(Date.now() - 183 * 24 * 3600_000).toISOString().slice(0, 10);
  const [reports, qualifications] = await Promise.all([
    supabase
      .from('job_reports')
      .select('id, employee_id, shift_date, job_title, location, outcome, notes, issues, completed, submitted_at')
      .eq('business_id', businessId)
      .gte('submitted_at', since)
      .order('submitted_at', { ascending: false })
      .limit(500),
    supabase.from('employee_qualifications').select('id, employee_id, name, expiry_date').eq('business_id', businessId).limit(1000),
  ]);
  type ReportRow = {
    id: string;
    employee_id: string;
    shift_date: string | null;
    job_title: string | null;
    location: string | null;
    outcome: string;
    notes: string;
    issues: string;
    completed: boolean;
    submitted_at: string;
  };
  type QualificationRow = { id: string; employee_id: string; name: string; expiry_date: string | null };
  extras = {
    at: Date.now(),
    businessId,
    reports: ((reports.data ?? []) as ReportRow[]).map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      date: r.shift_date ?? r.submitted_at.slice(0, 10),
      jobTitle: r.job_title ?? '',
      location: r.location ?? '',
      outcome: r.outcome,
      notes: r.notes,
      issues: r.issues,
      completed: r.completed,
      submittedAt: r.submitted_at,
    })),
    qualifications: ((qualifications.data ?? []) as QualificationRow[]).map((q) => ({
      id: q.id,
      employeeId: q.employee_id,
      name: q.name,
      expiryDate: q.expiry_date,
    })),
  };
  return extras;
}

export async function appSnapshot(): Promise<BusinessSnapshot> {
  const business = businessStore.get();
  const docs = docsStore.get();
  const totals = (d: SalesDoc) => docTotals(d.items, d.gstRate);
  const quotes = docs.filter((d) => d.kind === 'quote');
  const [transactions, more] = await Promise.all([
    business?.id ? loadTransactions(supabase, business.id) : Promise.resolve({ connected: false, transactions: [] }),
    business?.id ? loadExtras(business.id).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    businessId: business?.id ?? '',
    businessName: business?.businessName ?? '',
    country: business?.country ?? null,
    financialYearStartMonth: business?.financialYearStartMonth ?? 7,
    gstRegistered: business?.gstRegistered ?? false,
    invoices: docs
      .filter((d) => d.kind === 'invoice')
      .map((d) => ({
        id: d.id,
        number: d.number,
        status: d.status,
        clientId: clientIdOf(d),
        clientName: d.client.name,
        total: totals(d).total,
        gst: totals(d).gst,
        dueDate: d.dueDate,
        createdAt: d.createdAt,
        paidAt: d.paidAt ?? null,
        sourceQuoteId: d.sourceQuoteId ?? null,
      })),
    quotes: quotes.map((d) => ({
      id: d.id,
      number: d.number,
      status: d.status,
      clientId: clientIdOf(d),
      clientName: d.client.name,
      total: totals(d).total,
      jobType: d.jobType,
      jobDate: d.jobDate,
      createdAt: d.createdAt,
      respondedAt: d.respondedAt ?? null,
    })),
    jobs: jobsStore.get().map((j) => {
      const quote = j.quoteId ? quotes.find((q) => q.id === j.quoteId) : undefined;
      return {
        id: j.id,
        title: j.title,
        address: j.address,
        clientId: j.clientId,
        quoteId: j.quoteId,
        quoteNumber: quote?.number ?? null,
        status: j.status,
        startsAt: j.startsAt,
        endsAt: j.endsAt,
        assignedEmployeeIds: j.assignedEmployeeIds,
        value: quote ? totals(quote).total : null,
      };
    }),
    clients: clientsStore.get().map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, address: c.address })),
    employees: employeesStore.get().map((e) => ({
      id: e.id,
      name: employeeFullName(e),
      role: e.role,
      employmentType: e.employmentType,
      status: e.status,
      payRate: e.payRate,
      payType: e.payType,
    })),
    shifts: shiftsStore.get().map((sh) => ({
      id: sh.id,
      date: sh.date,
      start: sh.start,
      end: sh.end,
      employeeIds: sh.employeeIds,
      jobId: sh.jobId ?? null,
      jobType: sh.jobType,
      location: sh.location,
    })),
    payslips: payslipsStore.get().map((p) => ({
      id: p.id,
      employeeId: p.employeeId,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      payDate: p.payDate,
      hours: p.hours,
      gross: p.gross,
      tax: p.tax,
      net: p.net,
      super: p.super,
      status: p.status,
    })),
    superPayments: superPaymentsStore.get().map((p) => ({
      id: p.id,
      employeeId: p.employeeId,
      amount: p.superAmount,
      dueDate: p.dueDate,
      status: p.status,
    })),
    expenses: expensesStore.get().map((e) => ({ id: e.id, date: e.date, amount: e.amount, category: e.category, description: e.description })),
    availability: availabilityStore.get(),
    clockSessions: clockStore
      .get()
      .filter((c) => c.employeeId)
      .map((c) => ({ id: c.id, employeeId: c.employeeId!, start: c.start.toISOString(), end: c.end ? c.end.toISOString() : null })),
    qualifications: more?.qualifications ?? [],
    jobReports: more?.reports ?? [],
    events: eventsStore
      .get()
      .filter((e) => e.type !== 'job' && e.type !== 'quote')
      .map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        date: e.date,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        address: e.address,
        supplier: e.supplier,
        deliveryItems: e.deliveryItems,
        notes: e.notes,
      })),
    contractorInvoices: contractorInvoicesStore.get().map((i) => ({
      id: i.id,
      employeeId: i.employeeId,
      number: i.number,
      invoiceDate: i.invoiceDate,
      dueDate: i.dueDate,
      status: i.status,
      total: i.total,
      gst: i.gst,
      paidAt: i.paidAt,
    })),
    transactions: transactions.transactions,
    transactionsConnected: transactions.connected,
  };
}
