// The AI Assistant's tools: what Claude can look up to answer questions. Every
// tool reads from one business's snapshot (loaded by the server for the
// signed-in owner only, see snapshot.ts), so it can never see another
// business. Tools return real numbers only; the AI is told to quote nothing else.
// Pure functions (no database), shared with the tests.
import {
  addDays,
  dateKeyOf,
  formatDate,
  inRange,
  monthName,
  PERIODS,
  previousPeriod,
  resolvePeriod,
  startOfWeek,
  todayKey,
  type DateRange,
} from './dates.ts';
import { money, runHealthCheck } from './insights.ts';
import { filterTransactions, merchantOf, percentChange, spendingBreakdown, spendSummary, totalOf } from './transactions.ts';
import type { BusinessSnapshot, CardType, ResultCard, Transaction } from './types.ts';

const round = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Tool definitions (sent to Claude)
// ---------------------------------------------------------------------------

const PERIOD_HELP = `A period: one of ${PERIODS.join(', ')}; or "since:YYYY-MM-DD" (e.g. "since July" -> since:2026-07-01), "month:YYYY-MM", or "YYYY-MM-DD..YYYY-MM-DD" (both days included). The financial year runs 1 July – 30 June. Dates are in the business's time zone.`;

const period = { type: 'string', description: PERIOD_HELP };

export const TRANSACTIONS_NOT_CONNECTED =
  "Your Transactions page isn't connected yet, so I can't see spending data.";

/** JSON-schema tool definitions in the Anthropic Messages API format. */
export const TOOL_DEFINITIONS = [
  {
    name: 'search_jobs',
    description:
      'Find jobs by text (title, address, client name, quote number or job id), client, address, date period or status. Use unassigned_only to find jobs with no staff rostered. Returns each job with its date, address, client, status and assigned staff.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free text, e.g. "24 Ocean Dr", "house wash", "4521".' },
        client: { type: 'string', description: 'Client name (partial is fine).' },
        period,
        status: { type: 'string', enum: ['scheduled', 'assigned', 'in_progress', 'completed', 'cancelled', 'upcoming', 'any'] },
        unassigned_only: { type: 'boolean' },
        limit: { type: 'integer', description: 'Max results (default 10).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'search_invoices',
    description:
      'Find invoices (or quotes) by status (overdue, unpaid, paid, draft), client, amount or date period. Returns totals plus each document. "Overdue" = unpaid and past its due date.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['invoice', 'quote'], description: 'Default invoice.' },
        status: {
          type: 'string',
          enum: ['overdue', 'unpaid', 'paid', 'draft', 'sent', 'accepted', 'declined', 'booked', 'any'],
        },
        client: { type: 'string' },
        min_amount: { type: 'number' },
        max_amount: { type: 'number' },
        period: { type: 'string', description: `${PERIOD_HELP} Filters by the date the invoice was created (or paid, for status paid).` },
        limit: { type: 'integer' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'search_clients',
    description: 'Find clients by name, email, phone or address. Returns contact details, how many jobs they have, and their unpaid and overdue totals.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'integer' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_team_and_schedule',
    description:
      "Who's working when: each team member's shifts and hours for a period, plus gaps (upcoming jobs with no staff, team members with no shifts) and clashes.",
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', description: `${PERIOD_HELP} Default this_week. "next week" = YYYY-MM-DD..YYYY-MM-DD for next Monday to Sunday.` },
        employee: { type: 'string', description: 'A team member name (partial is fine).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_payroll_summary',
    description: 'Approved payroll for a period: total wages (gross), tax, net pay and super, per person and in total, plus any unpaid or overdue super.',
    input_schema: { type: 'object', properties: { period }, additionalProperties: false },
  },
  {
    name: 'get_revenue_and_profit',
    description:
      'Money in and out for a period: revenue (paid invoices), costs (wages + super from payroll, and expenses entered on the Expenses page), and profit, optionally broken down by month or by job, compared with the period before.',
    input_schema: {
      type: 'object',
      properties: { period, group_by: { type: 'string', enum: ['none', 'month', 'job'] } },
      additionalProperties: false,
    },
  },
  {
    name: 'search_transactions',
    description:
      'Find bank transactions by supplier (messy bank names are matched loosely, e.g. "bunnings" matches "BUNNINGS 6342 CAPALABA"), category (fuel, materials, labour, tools, subscriptions...), linked job id, amount, text or period.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        supplier: { type: 'string' },
        category: { type: 'string' },
        job_id: { type: 'string', description: 'A job id from search_jobs.' },
        min_amount: { type: 'number' },
        max_amount: { type: 'number' },
        period,
        limit: { type: 'integer' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_spend_by_supplier',
    description:
      'Total spending filtered by supplier, category, job and/or period: returns the total, number of purchases, the list, and the same figures for the period before (for "X% more than last month"). Use for "how much did I spend at Bunnings last month", "fuel this week", "how much did job X cost in materials".',
    input_schema: {
      type: 'object',
      properties: {
        supplier: { type: 'string' },
        category: { type: 'string' },
        job_id: { type: 'string' },
        period,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_spending_trends',
    description:
      'Spending grouped by category or by supplier for a period, each compared with the period before (biggest first). Use for "who\'s my biggest supplier this year" or "have material costs increased" (also look at month-by-month totals in the result).',
    input_schema: {
      type: 'object',
      properties: {
        group_by: { type: 'string', enum: ['category', 'supplier'] },
        period,
        category: { type: 'string', description: 'Only this category (e.g. materials).' },
        supplier: { type: 'string' },
      },
      required: ['group_by'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_business_insights',
    description:
      'Runs the business health check: overdue invoices, late payers, jobs without staff, quotes not followed up, schedule clashes, revenue drops, overdue super, high labour costs and spending problems, each with a suggested fix and estimated saving.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'show_cards',
    description:
      'Show result cards under your answer so the owner can tap through to the real screen. Use the ids from earlier tool results. Show the most relevant (up to 6).',
    input_schema: {
      type: 'object',
      properties: {
        cards: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['job', 'invoice', 'client', 'team_member', 'transaction', 'insight'] },
              id: { type: 'string' },
            },
            required: ['type', 'id'],
            additionalProperties: false,
          },
        },
      },
      required: ['cards'],
      additionalProperties: false,
    },
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]['name'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Input = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const lim = (v: unknown, fallback = 10) => Math.min(Math.max(Math.round(num(v) ?? fallback), 1), 50);
const has = (text: string, query: string) => text.toLowerCase().includes(query.toLowerCase());

function periodOf(s: BusinessSnapshot, value: unknown, now: Date, fallback?: string): DateRange | { error: string } | null {
  const p = str(value) ?? fallback;
  if (!p) return null;
  return resolvePeriod(p, now, s.financialYearStartMonth) ?? { error: `I couldn't understand the period "${p}". ${PERIOD_HELP}` };
}

const clientName = (s: BusinessSnapshot, id: string | null) => s.clients.find((c) => c.id === id)?.name ?? '';
const employeeName = (s: BusinessSnapshot, id: string) => s.employees.find((e) => e.id === id)?.name ?? 'Former team member';

function invoiceStatus(i: BusinessSnapshot['invoices'][number], today: string) {
  return i.status === 'Pending' && i.dueDate && i.dueDate < today ? 'Overdue' : i.status;
}

function shiftHours(sh: BusinessSnapshot['shifts'][number]) {
  const [sh1, sm1] = sh.start.split(':').map(Number);
  const [eh, em] = sh.end.split(':').map(Number);
  return Math.max(0, eh * 60 + (em || 0) - (sh1 * 60 + (sm1 || 0))) / 60;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** A card for one thing, built from real data (null if it doesn't exist). */
export function buildCard(s: BusinessSnapshot, type: CardType, id: string, now = new Date()): ResultCard | null {
  const today = todayKey(now);
  switch (type) {
    case 'job': {
      const j = s.jobs.find((x) => x.id === id);
      return j
        ? {
            type,
            id,
            title: j.title,
            reference: j.quoteNumber,
            address: j.address,
            startsAt: j.startsAt,
            status: j.status,
            clientName: clientName(s, j.clientId),
            staffNames: j.assignedEmployeeIds.map((e) => employeeName(s, e)),
          }
        : null;
    }
    case 'invoice': {
      const i = s.invoices.find((x) => x.id === id);
      if (i) return { type, id, number: i.number, clientName: i.clientName, total: i.total, dueDate: i.dueDate, status: invoiceStatus(i, today) };
      const q = s.quotes.find((x) => x.id === id);
      return q ? { type, id, number: q.number, clientName: q.clientName, total: q.total, dueDate: null, status: q.status } : null;
    }
    case 'client': {
      const c = s.clients.find((x) => x.id === id);
      if (!c) return null;
      const unpaid = s.invoices.filter((i) => i.clientId === id && i.status === 'Pending').reduce((sum, i) => sum + i.total, 0);
      return { type, id, name: c.name, email: c.email, phone: c.phone, address: c.address, unpaidTotal: round(unpaid) };
    }
    case 'team_member': {
      const e = s.employees.find((x) => x.id === id);
      if (!e) return null;
      const week = { start: startOfWeek(today), end: addDays(startOfWeek(today), 7) };
      const hours = s.shifts.filter((sh) => sh.employeeIds.includes(id) && inRange(sh.date, week)).reduce((sum, sh) => sum + shiftHours(sh), 0);
      return { type, id, name: e.name, role: e.role, employmentType: e.employmentType, hoursThisWeek: Math.round(hours * 10) / 10 };
    }
    case 'transaction': {
      const t = s.transactions.find((x) => x.id === id);
      return t
        ? { type, id, date: t.date, merchant: merchantOf(t), rawMerchant: t.rawMerchant, amount: t.amount, category: t.category, jobId: t.jobId }
        : null;
    }
    case 'insight': {
      const i = runHealthCheck(s, now).find((x) => x.key === id);
      return i ? { type, id, title: i.title, summary: i.summary, severity: i.severity } : null;
    }
  }
}

// ---------------------------------------------------------------------------
// Running a tool
// ---------------------------------------------------------------------------

const transactionView = (t: Transaction) => ({
  id: t.id,
  date: t.date,
  supplier: merchantOf(t),
  bank_text: t.rawMerchant,
  amount: t.amount,
  category: t.category,
  job_id: t.jobId,
  description: t.description,
});

export type ToolOutcome = {
  /** What Claude sees. */
  result: unknown;
  /** Cards the owner should see (only from show_cards). */
  cards?: ResultCard[];
};

/** Runs one tool for this business. Never throws: problems come back as { error }. */
export function runTool(s: BusinessSnapshot, name: string, input: Input, now = new Date()): ToolOutcome {
  try {
    return { ...runToolInner(s, name, input ?? {}, now) };
  } catch (e) {
    return { result: { error: `That lookup failed: ${e instanceof Error ? e.message : 'unknown problem'}.` } };
  }
}

function runToolInner(s: BusinessSnapshot, name: string, input: Input, now: Date): ToolOutcome {
  const today = todayKey(now);
  switch (name) {
    case 'search_jobs': {
      const range = periodOf(s, input.period, now);
      if (range && 'error' in range) return { result: range };
      const q = str(input.query)?.replace(/^#/, '');
      const client = str(input.client);
      const status = str(input.status) ?? 'any';
      const jobs = s.jobs
        .filter((j) => !range || inRange(dateKeyOf(j.startsAt), range))
        .filter((j) => !client || has(clientName(s, j.clientId), client))
        .filter((j) =>
          status === 'any'
            ? true
            : status === 'upcoming'
              ? j.startsAt >= now.toISOString() && j.status !== 'cancelled' && j.status !== 'completed'
              : j.status === status,
        )
        .filter((j) => !input.unassigned_only || (j.assignedEmployeeIds.length === 0 && j.status !== 'cancelled' && j.status !== 'completed'))
        .filter(
          (j) =>
            !q ||
            [j.title, j.address, clientName(s, j.clientId), j.quoteNumber ?? '', j.id].some((field) => has(field, q)),
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      return {
        result: {
          count: jobs.length,
          period: range?.label ?? null,
          jobs: jobs.slice(0, lim(input.limit)).map((j) => ({
            id: j.id,
            title: j.title,
            quote_number: j.quoteNumber,
            address: j.address,
            client: clientName(s, j.clientId),
            date: formatDate(dateKeyOf(j.startsAt)),
            starts_at: j.startsAt,
            ends_at: j.endsAt,
            status: j.status,
            staff: j.assignedEmployeeIds.map((e) => employeeName(s, e)),
            value: j.value,
          })),
        },
      };
    }

    case 'search_invoices': {
      const kind = str(input.kind) === 'quote' ? 'quote' : 'invoice';
      const status = str(input.status) ?? 'any';
      const client = str(input.client);
      const min = num(input.min_amount);
      const max = num(input.max_amount);
      const range = periodOf(s, input.period, now);
      if (range && 'error' in range) return { result: range };
      if (kind === 'quote') {
        const quotes = s.quotes
          .filter((q) => status === 'any' || q.status.toLowerCase() === status)
          .filter((q) => !client || has(q.clientName, client))
          .filter((q) => (min == null || q.total >= min) && (max == null || q.total <= max))
          .filter((q) => !range || inRange(dateKeyOf(q.createdAt), range));
        return {
          result: {
            count: quotes.length,
            total: round(quotes.reduce((sum, q) => sum + q.total, 0)),
            quotes: quotes.slice(0, lim(input.limit)).map((q) => ({
              id: q.id,
              number: q.number,
              client: q.clientName,
              total: q.total,
              status: q.status,
              sent: formatDate(dateKeyOf(q.createdAt)),
              job_date: q.jobDate,
            })),
          },
        };
      }
      const invoices = s.invoices
        .filter((i) => {
          const st = invoiceStatus(i, today);
          if (status === 'any') return true;
          if (status === 'overdue') return st === 'Overdue';
          if (status === 'unpaid') return i.status === 'Pending';
          return i.status.toLowerCase() === status;
        })
        .filter((i) => !client || has(i.clientName, client))
        .filter((i) => (min == null || i.total >= min) && (max == null || i.total <= max))
        .filter((i) => !range || inRange(status === 'paid' && i.paidAt ? dateKeyOf(i.paidAt) : dateKeyOf(i.createdAt), range))
        .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
      return {
        result: {
          count: invoices.length,
          total: round(invoices.reduce((sum, i) => sum + i.total, 0)),
          invoices: invoices.slice(0, lim(input.limit)).map((i) => ({
            id: i.id,
            number: i.number,
            client: i.clientName,
            total: i.total,
            status: invoiceStatus(i, today),
            due_date: i.dueDate,
            days_overdue: invoiceStatus(i, today) === 'Overdue' ? Math.round((Date.parse(today) - Date.parse(i.dueDate!)) / 86400000) : 0,
            paid_at: i.paidAt ? dateKeyOf(i.paidAt) : null,
          })),
        },
      };
    }

    case 'search_clients': {
      const q = str(input.query);
      const clients = s.clients.filter((c) => !q || [c.name, c.email, c.phone, c.address].some((f) => has(f, q)));
      return {
        result: {
          count: clients.length,
          clients: clients.slice(0, lim(input.limit)).map((c) => {
            const invoices = s.invoices.filter((i) => i.clientId === c.id);
            return {
              id: c.id,
              name: c.name,
              email: c.email,
              phone: c.phone,
              address: c.address,
              jobs: s.jobs.filter((j) => j.clientId === c.id).length,
              unpaid_total: round(invoices.filter((i) => i.status === 'Pending').reduce((sum, i) => sum + i.total, 0)),
              overdue_total: round(invoices.filter((i) => invoiceStatus(i, today) === 'Overdue').reduce((sum, i) => sum + i.total, 0)),
              paid_total: round(invoices.filter((i) => i.status === 'Paid').reduce((sum, i) => sum + i.total, 0)),
            };
          }),
        },
      };
    }

    case 'get_team_and_schedule': {
      const range = periodOf(s, input.period, now, 'this_week');
      if (!range || 'error' in range) return { result: range ?? { error: 'No period.' } };
      // "This week" means the whole week, including days still to come.
      const span = str(input.period) == null || str(input.period) === 'this_week' ? { ...range, end: addDays(startOfWeek(today), 7) } : range;
      const who = str(input.employee);
      const people = s.employees.filter((e) => e.status !== 'inactive' && (!who || has(e.name, who)));
      const shifts = s.shifts.filter((sh) => inRange(sh.date, span));
      const team = people.map((e) => {
        const mine = shifts.filter((sh) => sh.employeeIds.includes(e.id)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
        return {
          id: e.id,
          name: e.name,
          role: e.role,
          employment_type: e.employmentType,
          hours: Math.round(mine.reduce((sum, sh) => sum + shiftHours(sh), 0) * 10) / 10,
          shifts: mine.map((sh) => ({ date: sh.date, start: sh.start, end: sh.end, job: sh.jobType, location: sh.location })),
        };
      });
      const unstaffed = s.jobs.filter(
        (j) => inRange(dateKeyOf(j.startsAt), span) && j.assignedEmployeeIds.length === 0 && j.status !== 'cancelled' && j.status !== 'completed',
      );
      return {
        result: {
          period: span.label,
          team,
          not_rostered: team.filter((t) => t.shifts.length === 0).map((t) => t.name),
          jobs_without_staff: unstaffed.map((j) => ({ id: j.id, title: j.title, address: j.address, starts_at: j.startsAt })),
          clashes: runHealthCheck(s, now)
            .filter((i) => i.check === 'schedule_clash' || i.check === 'staff_overbooked')
            .map((i) => i.title),
        },
      };
    }

    case 'get_payroll_summary': {
      const range = periodOf(s, input.period, now, 'this_month');
      if (!range || 'error' in range) return { result: range ?? { error: 'No period.' } };
      const slips = s.payslips.filter((p) => inRange(p.payDate ?? p.periodEnd, range));
      const sum = (pick: (p: (typeof slips)[number]) => number) => round(slips.reduce((t, p) => t + pick(p), 0));
      const perPerson = new Map<string, { name: string; gross: number; tax: number; net: number; super: number; hours: number }>();
      for (const p of slips) {
        const row = perPerson.get(p.employeeId) ?? { name: employeeName(s, p.employeeId), gross: 0, tax: 0, net: 0, super: 0, hours: 0 };
        row.gross += p.gross;
        row.tax += p.tax;
        row.net += p.net;
        row.super += p.super;
        row.hours += p.hours;
        perPerson.set(p.employeeId, row);
      }
      const unpaidSuper = s.superPayments.filter((p) => p.status !== 'paid');
      return {
        result: {
          period: range.label,
          payslips: slips.length,
          total_wages_gross: sum((p) => p.gross),
          total_tax: sum((p) => p.tax),
          total_net: sum((p) => p.net),
          total_super: sum((p) => p.super),
          people: [...perPerson.entries()].map(([id, r]) => ({
            id,
            name: r.name,
            hours: round(r.hours),
            gross: round(r.gross),
            tax: round(r.tax),
            net: round(r.net),
            super: round(r.super),
          })),
          super_unpaid_total: round(unpaidSuper.reduce((t, p) => t + p.amount, 0)),
          super_overdue_total: round(unpaidSuper.filter((p) => p.dueDate < today).reduce((t, p) => t + p.amount, 0)),
          note: 'Tax figures are estimates based on current tax brackets.',
        },
      };
    }

    case 'get_revenue_and_profit': {
      const range = periodOf(s, input.period, now, 'this_month');
      if (!range || 'error' in range) return { result: range ?? { error: 'No period.' } };
      const figures = (r: Pick<DateRange, 'start' | 'end'>) => {
        const revenue = round(
          s.invoices.filter((i) => i.status === 'Paid' && i.paidAt && inRange(dateKeyOf(i.paidAt), r)).reduce((t, i) => t + i.total, 0),
        );
        const wages = round(s.payslips.filter((p) => inRange(p.payDate ?? p.periodEnd, r)).reduce((t, p) => t + p.gross + p.super, 0));
        const expenses = round(s.expenses.filter((e) => inRange(e.date, r)).reduce((t, e) => t + e.amount, 0));
        return { revenue, wages_and_super: wages, expenses, profit: round(revenue - wages - expenses) };
      };
      const now_ = figures(range);
      const before = previousPeriod(range);
      const prev = figures(before);
      const result: Record<string, unknown> = {
        period: range.label,
        ...now_,
        compared_with: { period: before.label, ...prev, revenue_change_percent: percentChange(now_.revenue, prev.revenue) },
        expenses_by_category: Object.entries(
          s.expenses.filter((e) => inRange(e.date, range)).reduce<Record<string, number>>((acc, e) => {
            acc[e.category] = round((acc[e.category] ?? 0) + e.amount);
            return acc;
          }, {}),
        ).map(([category, total]) => ({ category, total })),
        note: 'Revenue = paid invoices. Costs = wages and super from approved payroll plus expenses entered on the Expenses page (bank transactions are not included).',
      };
      const groupBy = str(input.group_by);
      if (groupBy === 'month') {
        const months: Record<string, unknown>[] = [];
        let start = `${range.start.slice(0, 7)}-01`;
        while (start < range.end) {
          const next = `${new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 1)).toISOString().slice(0, 10)}`;
          months.push({ month: monthName(start), ...figures({ start: start < range.start ? range.start : start, end: next < range.end ? next : range.end }) });
          start = next;
        }
        result.by_month = months;
      } else if (groupBy === 'job') {
        result.by_job = s.jobs
          .filter((j) => inRange(dateKeyOf(j.startsAt), range) && j.status !== 'cancelled')
          .map((j) => {
            const costs = totalOf(s.transactions.filter((t) => t.jobId === j.id && t.amount > 0));
            return {
              id: j.id,
              title: j.title,
              value: j.value,
              linked_costs: s.transactionsConnected ? costs : null,
              profit_before_labour: s.transactionsConnected && j.value != null ? round(j.value - costs) : null,
            };
          });
      }
      return { result };
    }

    case 'search_transactions':
    case 'get_spend_by_supplier':
    case 'get_spending_trends': {
      if (!s.transactionsConnected) return { result: { connected: false, message: TRANSACTIONS_NOT_CONNECTED } };
      const range = periodOf(s, input.period, now, name === 'get_spending_trends' ? 'this_month' : undefined);
      if (range && 'error' in range) return { result: range };
      const filter = {
        supplier: str(input.supplier),
        category: str(input.category),
        jobId: str(input.job_id),
        text: str(input.query),
        minAmount: num(input.min_amount),
        maxAmount: num(input.max_amount),
      };
      if (name === 'search_transactions') {
        const list = filterTransactions(s.transactions, { ...filter, range });
        return {
          result: {
            period: range?.label ?? 'all time',
            count: list.length,
            total: totalOf(list),
            transactions: list.slice(0, lim(input.limit, 15)).map(transactionView),
          },
        };
      }
      if (name === 'get_spend_by_supplier') {
        const summary = spendSummary(s.transactions, { ...filter, range });
        const label = filter.supplier ? merchantOf(summary.transactions[0] ?? { merchant: filter.supplier, rawMerchant: filter.supplier }) : null;
        return {
          result: {
            period: range?.label ?? 'all time',
            supplier: label,
            category: filter.category,
            job_id: filter.jobId,
            total: summary.total,
            purchases: summary.count,
            transactions: summary.transactions.slice(0, 15).map(transactionView),
            compared_with: summary.comparison
              ? {
                  period: summary.comparison.label,
                  total: summary.comparison.total,
                  purchases: summary.comparison.count,
                  change_percent: summary.comparison.changePercent,
                }
              : null,
          },
        };
      }
      const groupBy = str(input.group_by) === 'supplier' ? 'supplier' : 'category';
      const groups = spendingBreakdown(s.transactions, groupBy, range ?? resolvePeriod('this_month', now)!, filter);
      const monthly = (() => {
        const out: { month: string; total: number }[] = [];
        for (let i = 5; i >= 0; i--) {
          const start = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1)).toISOString().slice(0, 10);
          const end = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 1)).toISOString().slice(0, 10);
          out.push({ month: monthName(start), total: totalOf(filterTransactions(s.transactions, { ...filter, range: { start, end } })) });
        }
        return out;
      })();
      return {
        result: {
          period: range?.label ?? null,
          group_by: groupBy,
          groups: groups.slice(0, 15).map((g) => ({
            name: g.name,
            total: g.total,
            purchases: g.count,
            previous_period_total: g.previousTotal,
            change_percent: g.changePercent,
          })),
          monthly_totals_last_6_months: monthly,
        },
      };
    }

    case 'get_business_insights': {
      const insights = runHealthCheck(s, now);
      return {
        result: {
          count: insights.length,
          transactions_connected: s.transactionsConnected,
          insights: insights.map((i) => ({
            id: i.key,
            severity: i.severity,
            area: i.area,
            title: i.title,
            summary: i.summary,
            suggestion: i.suggestion,
            estimated_saving: i.estimatedSaving,
            related: i.related,
          })),
        },
      };
    }

    case 'show_cards': {
      const wanted = Array.isArray(input.cards) ? (input.cards as { type?: unknown; id?: unknown }[]) : [];
      const cards = wanted
        .slice(0, 6)
        .map((c) => (typeof c.type === 'string' && typeof c.id === 'string' ? buildCard(s, c.type as CardType, c.id, now) : null))
        .filter((c): c is ResultCard => c !== null);
      return { result: { shown: cards.length, not_found: wanted.length - cards.length }, cards };
    }

    default:
      return { result: { error: `Unknown tool "${name}".` } };
  }
}

/** Shown in money answers (so the format matches the rest of the app). */
export { money };
