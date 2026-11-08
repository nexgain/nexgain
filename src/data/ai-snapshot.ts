// Everything the free AI Assistant looks at, gathered from data the app has
// already loaded for the signed-in owner (so it's only ever their own
// business). Bank transactions come through the one shared transactions
// adapter, the same one the daily health check uses.
import { businessStore } from '@/data/business';
import { clientsStore } from '@/data/clients';
import { employeeFullName, employeesStore } from '@/data/employees';
import { expensesStore } from '@/data/finance';
import { docsStore, docTotals, type SalesDoc } from '@/data/invoices';
import { jobsStore } from '@/data/jobs';
import { payslipsStore } from '@/data/payroll';
import { shiftsStore } from '@/data/shifts';
import { superPaymentsStore } from '@/data/super-payments';
import { supabase } from '@/lib/supabase';

import { loadTransactions } from '../../supabase/functions/_shared/ai/transactions-adapter';
import type { BusinessSnapshot } from '../../supabase/functions/_shared/ai/types';

/** The client a quote or invoice is for (documents keep the client's details, not always a link). */
function clientIdOf(doc: SalesDoc) {
  const name = doc.client.name.trim().toLowerCase();
  const email = doc.client.email.trim().toLowerCase();
  return (
    clientsStore.get().find((c) => (email && c.email.trim().toLowerCase() === email) || (name && c.name.trim().toLowerCase() === name))?.id ?? null
  );
}

export async function appSnapshot(): Promise<BusinessSnapshot> {
  const business = businessStore.get();
  const docs = docsStore.get();
  const total = (d: SalesDoc) => docTotals(d.items, d.gstRate).total;
  const quotes = docs.filter((d) => d.kind === 'quote');
  const transactions = business?.id
    ? await loadTransactions(supabase, business.id)
    : { connected: false, transactions: [] };

  return {
    businessId: business?.id ?? '',
    businessName: business?.businessName ?? '',
    country: business?.country ?? null,
    financialYearStartMonth: business?.financialYearStartMonth ?? 7,
    invoices: docs
      .filter((d) => d.kind === 'invoice')
      .map((d) => ({
        id: d.id,
        number: d.number,
        status: d.status,
        clientId: clientIdOf(d),
        clientName: d.client.name,
        total: total(d),
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
      total: total(d),
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
        value: quote ? total(quote) : null,
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
    transactions: transactions.transactions,
    transactionsConnected: transactions.connected,
  };
}
