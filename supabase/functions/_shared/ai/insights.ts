// The business health check: one shared engine that scans a business and
// returns its problems, risks and ways to save money, each with a practical fix.
// The daily "ai-insights" Edge Function saves the results to the ai_insights
// table (which the Dashboard, Analytics page and AI Assistant read), and the
// AI chat can run it too, so there's only one set of rules.
// Pure functions only: no database, so it's easy to test with sample data.
import { addDays, addMonths, daysBetween, dateKeyOf, formatDate, monthName, startOfMonth, startOfWeek, todayKey } from './dates.ts';
import { productPriceRises } from './products.ts';
import { suburbOf, travelCosts } from './sorting.ts';
import { categoryKey, merchantOf, monthlyTotals, percentChange, totalOf } from './transactions.ts';
import type { BusinessSnapshot, DateKey, Insight, InsightArea, Placement, Severity, Transaction } from './types.ts';

const round = (n: number) => Math.round(n * 100) / 100;

/** "$1,284.50" (or "$1,285" with cents: false). */
export function money(amount: number, cents = true) {
  const [whole, fraction] = Math.abs(amount).toFixed(cents ? 2 : 0).split('.');
  return `${amount < 0 ? '-' : ''}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A short, stable id for a set of things (so a changed set becomes a new insight). */
function shortHash(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Where each insight goes:
 * - high and medium ones need the owner's attention (Dashboard + AI Assistant)
 * - low ones go under "Other Insights"
 * - money and spending ones also show on the Analytics page
 * - high ones are also sent to Notifications (once)
 */
function placementsFor(area: InsightArea, severity: Severity): Placement[] {
  const p: Placement[] = [severity === 'low' ? 'other' : 'attention'];
  if (area === 'finance' || area === 'spending') p.push('analytics');
  if (severity === 'high') p.push('notification');
  return p;
}

type Draft = Omit<Insight, 'placements' | 'metrics' | 'estimatedSaving' | 'related'> &
  Partial<Pick<Insight, 'metrics' | 'estimatedSaving' | 'related' | 'placements'>>;

function insight(d: Draft): Insight {
  return {
    ...d,
    placements: d.placements ?? placementsFor(d.area, d.severity),
    metrics: d.metrics ?? {},
    estimatedSaving: d.estimatedSaving == null ? null : round(d.estimatedSaving),
    related: d.related ?? [],
  };
}

/** Business-time "HH:MM" of a timestamp, e.g. "08:30". */
const timeOf = (iso: string) => new Date(new Date(iso).getTime() + 10 * 3600_000).toISOString().slice(11, 16);
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

function when(dateKey: DateKey, today: DateKey) {
  const days = daysBetween(today, dateKey);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `on ${formatDate(dateKey)}`;
}

// ---------------------------------------------------------------------------
// Money in: invoices, late payers, quotes, revenue
// ---------------------------------------------------------------------------

function overdueInvoices(s: BusinessSnapshot, today: DateKey): Insight[] {
  const overdue = s.invoices
    .filter((i) => i.status === 'Pending' && i.dueDate && i.dueDate < today)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  if (overdue.length === 0) return [];
  const total = round(overdue.reduce((sum, i) => sum + i.total, 0));
  const oldestDays = daysBetween(overdue[0].dueDate!, today);
  const severity: Severity = oldestDays > 14 || total >= 1000 ? 'high' : 'medium';
  const names = [...new Set(overdue.map((i) => i.clientName || 'a client'))];
  return [
    insight({
      key: `overdue_invoices:${shortHash(overdue.map((i) => i.id).join(','))}`,
      check: 'overdue_invoices',
      area: 'finance',
      severity,
      title: `${plural(overdue.length, 'invoice')} overdue (${money(total)})`,
      summary: `${money(total)} is overdue from ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}. The oldest (${overdue[0].number}) was due ${plural(oldestDays, 'day')} ago.`,
      suggestion: `Send a friendly payment reminder today${oldestDays > 14 ? ', and give the oldest ones a quick call' : ''}. Adding your bank details and a "pay by" date to every invoice helps you get paid faster.`,
      estimatedSaving: total,
      related: overdue.slice(0, 5).map((i) => ({ type: 'invoice' as const, id: i.id })),
      metrics: { overdue_count: overdue.length, overdue_total: total, oldest_days_overdue: oldestDays },
    }),
  ];
}

function latePayers(s: BusinessSnapshot, today: DateKey): Insight[] {
  const out: Insight[] = [];
  const byClient = new Map<string, typeof s.invoices>();
  for (const i of s.invoices) {
    if (!i.clientId || !i.dueDate) continue;
    byClient.set(i.clientId, [...(byClient.get(i.clientId) ?? []), i]);
  }
  for (const [clientId, invoices] of byClient) {
    const lateDays = invoices
      .filter((i) => i.dueDate && (i.paidAt || (i.status === 'Pending' && i.dueDate < today)))
      .map((i) => daysBetween(i.dueDate!, i.paidAt ? dateKeyOf(i.paidAt) : today));
    if (lateDays.length < 2) continue;
    const late = lateDays.filter((d) => d > 3);
    const average = Math.round(late.reduce((a, b) => a + b, 0) / Math.max(late.length, 1));
    if (late.length < 2 || late.length / lateDays.length < 0.5 || average < 5) continue;
    const name = invoices[0].clientName || 'This client';
    out.push(
      insight({
        key: `late_payer:${clientId}`,
        check: 'late_payers',
        area: 'finance',
        severity: 'low',
        title: `${name} often pays late`,
        summary: `${late.length} of their last ${lateDays.length} invoices were paid late, by about ${plural(average, 'day')} on average.`,
        suggestion: `Send ${name} a reminder a couple of days before each due date, ask for a deposit on new jobs, or give them shorter payment terms.`,
        related: [{ type: 'client', id: clientId }],
        metrics: { late_invoices: late.length, invoices_checked: lateDays.length, average_days_late: average },
      }),
    );
  }
  return out;
}

function quoteFollowUps(s: BusinessSnapshot, today: DateKey): Insight[] {
  const out: Insight[] = [];
  const waiting = s.quotes.filter((q) => q.status === 'Sent' && !q.respondedAt && daysBetween(dateKeyOf(q.createdAt), today) >= 5);
  if (waiting.length > 0) {
    const value = round(waiting.reduce((sum, q) => sum + q.total, 0));
    out.push(
      insight({
        key: `quote_followup:${shortHash(waiting.map((q) => q.id).join(','))}`,
        check: 'quotes_not_followed_up',
        area: 'jobs',
        severity: value >= 2000 ? 'medium' : 'low',
        title: `${plural(waiting.length, 'quote')} waiting on a reply (${money(value)})`,
        summary: `${waiting.map((q) => `${q.number}${q.clientName ? ` for ${q.clientName}` : ''}`).slice(0, 3).join(', ')}${waiting.length > 3 ? ' and more' : ''} ${waiting.length === 1 ? 'was' : 'were'} sent 5+ days ago with no answer yet.`,
        suggestion: 'Give these customers a quick call or follow-up message. Quotes followed up within a week are far more likely to be accepted.',
        estimatedSaving: null,
        related: [],
        metrics: { quotes_waiting: waiting.length, quotes_value: value },
      }),
    );
  }
  const accepted = s.quotes.filter((q) => q.status === 'Accepted' && q.respondedAt && daysBetween(dateKeyOf(q.respondedAt), today) >= 2);
  if (accepted.length > 0) {
    const value = round(accepted.reduce((sum, q) => sum + q.total, 0));
    out.push(
      insight({
        key: `quote_unbooked:${shortHash(accepted.map((q) => q.id).join(','))}`,
        check: 'accepted_quotes_not_booked',
        area: 'jobs',
        severity: 'medium',
        title: `${plural(accepted.length, 'accepted quote')} not booked as a job yet`,
        summary: `${accepted.map((q) => q.number).slice(0, 3).join(', ')} (${money(value)}) ${accepted.length === 1 ? 'was' : 'were'} accepted but not confirmed as ${accepted.length === 1 ? 'a job' : 'jobs'}, so ${accepted.length === 1 ? "it isn't" : "they aren't"} on the calendar.`,
        suggestion: 'Open each quote and press "Confirm job" so it gets a date and goes on the calendar and roster.',
        metrics: { accepted_not_booked: accepted.length, value },
      }),
    );
  }
  return out;
}

/** Paid invoice money for a date range. */
function revenueIn(s: BusinessSnapshot, start: DateKey, end: DateKey) {
  return round(
    s.invoices
      .filter((i) => i.status === 'Paid' && i.paidAt)
      .filter((i) => {
        const d = dateKeyOf(i.paidAt!);
        return d >= start && d < end;
      })
      .reduce((sum, i) => sum + i.total, 0),
  );
}

function revenueDrop(s: BusinessSnapshot, today: DateKey): Insight[] {
  const out: Insight[] = [];
  const thisMonth = startOfMonth(today);
  const lastMonth = addMonths(thisMonth, -1);
  const monthBefore = addMonths(thisMonth, -2);
  const last = revenueIn(s, lastMonth, thisMonth);
  const before = revenueIn(s, monthBefore, lastMonth);
  const change = percentChange(last, before);
  if (change !== null && change <= -15 && before - last >= 200) {
    out.push(
      insight({
        key: `revenue_drop:${lastMonth.slice(0, 7)}`,
        check: 'revenue_drop',
        area: 'finance',
        severity: change <= -30 ? 'high' : 'medium',
        title: `Revenue down ${Math.abs(change)}% in ${monthName(lastMonth)}`,
        summary: `You were paid ${money(last)} in ${monthName(lastMonth)}, ${money(before - last)} less than ${monthName(monthBefore)} (${money(before)}).`,
        suggestion: 'Follow up open quotes, chase overdue invoices, and contact past customers about repeat or seasonal work to fill the gap.',
        estimatedSaving: round(before - last),
        metrics: { revenue_last_month: last, revenue_month_before: before, change_percent: change },
      }),
    );
  }
  // Month so far vs the same days last month (only once it's a fair comparison).
  const dayOfMonth = Number(today.slice(8, 10));
  if (dayOfMonth >= 10) {
    const soFar = revenueIn(s, thisMonth, addDays(today, 1));
    const sameDaysLast = revenueIn(s, lastMonth, addDays(lastMonth, dayOfMonth));
    const pace = percentChange(soFar, sameDaysLast);
    if (pace !== null && pace <= -25 && sameDaysLast - soFar >= 200) {
      out.push(
        insight({
          key: `revenue_pace:${thisMonth.slice(0, 7)}`,
          check: 'revenue_drop',
          area: 'finance',
          severity: 'medium',
          title: `This month is ${Math.abs(pace)}% behind last month`,
          summary: `${money(soFar)} paid so far this month, compared with ${money(sameDaysLast)} by the same day last month.`,
          suggestion: 'Check for invoices you can send or chase now, and quotes you can follow up this week.',
          metrics: { revenue_month_to_date: soFar, revenue_same_days_last_month: sameDaysLast, change_percent: pace },
        }),
      );
    }
  }
  return out;
}

function uninvoicedJobs(s: BusinessSnapshot, today: DateKey): Insight[] {
  const invoicedQuotes = new Set(s.invoices.map((i) => i.sourceQuoteId).filter(Boolean));
  const jobs = s.jobs.filter(
    (j) => j.status === 'completed' && j.quoteId && !invoicedQuotes.has(j.quoteId) && daysBetween(dateKeyOf(j.endsAt), today) >= 1,
  );
  if (jobs.length === 0) return [];
  const value = round(jobs.reduce((sum, j) => sum + (j.value ?? 0), 0));
  return [
    insight({
      key: `uninvoiced:${shortHash(jobs.map((j) => j.id).join(','))}`,
      check: 'completed_jobs_not_invoiced',
      area: 'finance',
      severity: value >= 1000 ? 'high' : 'medium',
      title: `${plural(jobs.length, 'finished job')} not invoiced${value > 0 ? ` (${money(value)})` : ''}`,
      summary: `${jobs.map((j) => j.title).slice(0, 3).join(', ')}${jobs.length > 3 ? ' and more' : ''} ${jobs.length === 1 ? 'is' : 'are'} marked completed but no invoice has been made from the quote.`,
      suggestion: 'Turn each quote into an invoice and send it today. The sooner it goes out, the sooner you get paid.',
      estimatedSaving: value || null,
      related: jobs.slice(0, 5).map((j) => ({ type: 'job' as const, id: j.id })),
      metrics: { jobs_not_invoiced: jobs.length, value },
    }),
  ];
}

// ---------------------------------------------------------------------------
// Jobs and the team
// ---------------------------------------------------------------------------

function unassignedJobs(s: BusinessSnapshot, now: Date, today: DateKey): Insight[] {
  const soon = s.jobs.filter((j) => {
    if (j.status === 'cancelled' || j.status === 'completed' || j.assignedEmployeeIds.length > 0) return false;
    const start = new Date(j.startsAt).getTime();
    return start > now.getTime() && start - now.getTime() <= 3 * 24 * 3600_000;
  });
  return soon.map((j) => {
    const day = dateKeyOf(j.startsAt);
    const within24h = new Date(j.startsAt).getTime() - now.getTime() <= 24 * 3600_000;
    const place = j.address ? `at ${j.address}` : `"${j.title}"`;
    return insight({
      key: `unassigned:${j.id}`,
      check: 'jobs_without_staff',
      area: 'jobs',
      severity: within24h ? 'high' : 'medium',
      title: `Job ${when(day, today)} ${place} has no one on it`,
      summary: `${j.title} starts ${when(day, today)} at ${timeOf(j.startsAt)} and no staff are rostered to it yet.`,
      suggestion: 'Open the Roster and assign someone, or move the job if nobody is free.',
      related: [{ type: 'job', id: j.id }],
      metrics: { starts_at: j.startsAt },
    });
  });
}

function scheduleClashes(s: BusinessSnapshot, today: DateKey): Insight[] {
  const out: Insight[] = [];
  const horizon = addDays(today, 14);
  const names = new Map(s.employees.map((e) => [e.id, e.name]));
  const upcoming = s.shifts.filter((sh) => sh.date >= today && sh.date < horizon);

  // Two shifts at the same time for one person.
  const perPersonDay = new Map<string, typeof upcoming>();
  for (const sh of upcoming) {
    for (const id of sh.employeeIds) {
      const key = `${id}|${sh.date}`;
      perPersonDay.set(key, [...(perPersonDay.get(key) ?? []), sh]);
    }
  }
  for (const [key, shifts] of perPersonDay) {
    const [employeeId, date] = key.split('|');
    const sorted = [...shifts].sort((a, b) => minutes(a.start) - minutes(b.start));
    for (let i = 1; i < sorted.length; i++) {
      if (minutes(sorted[i].start) < minutes(sorted[i - 1].end)) {
        const name = names.get(employeeId) ?? 'Someone';
        out.push(
          insight({
            key: `clash:${employeeId}:${date}`,
            check: 'schedule_clash',
            area: 'team',
            severity: 'high',
            title: `${name} is double-booked ${when(date, today)}`,
            summary: `${name} is rostered on "${sorted[i - 1].jobType}" (${sorted[i - 1].start}–${sorted[i - 1].end}) and "${sorted[i].jobType}" (${sorted[i].start}–${sorted[i].end}) at the same time.`,
            suggestion: 'Move one of the shifts or give it to someone else on the Roster.',
            related: [{ type: 'team_member', id: employeeId }],
          }),
        );
        break;
      }
    }
    const hours = shifts.reduce((sum, sh) => sum + Math.max(0, minutes(sh.end) - minutes(sh.start)) / 60, 0);
    if (hours > 10) {
      const name = names.get(employeeId) ?? 'Someone';
      out.push(
        insight({
          key: `long_day:${employeeId}:${date}`,
          check: 'staff_overbooked',
          area: 'team',
          severity: 'medium',
          title: `${name} is rostered ${Math.round(hours * 10) / 10} hours ${when(date, today)}`,
          summary: `That's a very long day, which means overtime costs and tired staff.`,
          suggestion: 'Share some of the work with someone who has fewer hours that day.',
          related: [{ type: 'team_member', id: employeeId }],
          metrics: { hours: Math.round(hours * 10) / 10 },
        }),
      );
    }
  }

  // Too many hours in a week.
  const week = startOfWeek(today);
  for (const weekStart of [week, addDays(week, 7)]) {
    const weekEnd = addDays(weekStart, 7);
    const hoursBy = new Map<string, number>();
    for (const sh of s.shifts.filter((x) => x.date >= weekStart && x.date < weekEnd)) {
      const h = Math.max(0, minutes(sh.end) - minutes(sh.start)) / 60;
      for (const id of sh.employeeIds) hoursBy.set(id, (hoursBy.get(id) ?? 0) + h);
    }
    for (const [employeeId, hours] of hoursBy) {
      if (hours <= 50) continue;
      const name = names.get(employeeId) ?? 'Someone';
      out.push(
        insight({
          key: `long_week:${employeeId}:${weekStart}`,
          check: 'staff_overbooked',
          area: 'team',
          severity: 'medium',
          title: `${name} has ${Math.round(hours)} hours rostered the week of ${formatDate(weekStart)}`,
          summary: `Over 50 hours in a week usually means overtime pay and a higher risk of mistakes or injury.`,
          suggestion: 'Spread some shifts to other team members to cut overtime.',
          related: [{ type: 'team_member', id: employeeId }],
          metrics: { hours: Math.round(hours) },
        }),
      );
    }
  }
  return out;
}

/** Licences, tickets and certificates that have expired or expire in the next 30 days. */
function expiringQualifications(s: BusinessSnapshot, today: DateKey): Insight[] {
  const soon = addDays(today, 30);
  const names = new Map(s.employees.filter((e) => e.status !== 'inactive').map((e) => [e.id, e.name]));
  return s.qualifications
    .filter((q) => q.expiryDate && q.expiryDate <= soon && names.has(q.employeeId))
    .map((q) => {
      const days = daysBetween(today, q.expiryDate!);
      const name = names.get(q.employeeId)!;
      const expired = days < 0;
      return insight({
        key: `qualification:${q.id}:${q.expiryDate}`,
        check: 'qualification_expiring',
        area: 'team',
        severity: expired ? 'high' : days <= 14 ? 'medium' : 'low',
        title: expired
          ? `${name}'s ${q.name} expired ${plural(-days, 'day')} ago`
          : `${name}'s ${q.name} expires ${days === 0 ? 'today' : `in ${plural(days, 'day')}`}`,
        summary: `${q.name} ${expired ? 'expired' : 'expires'} on ${formatDate(q.expiryDate!)}.${expired ? ` ${name.split(' ')[0]} shouldn't do work that needs it until it's renewed.` : ''}`,
        suggestion: `Ask ${name.split(' ')[0]} to renew it and upload the new one in their NexGain profile (Qualifications).`,
        related: [{ type: 'team_member', id: q.employeeId }],
        metrics: { expiry_date: q.expiryDate, days_left: days },
      });
    });
}

function overdueSuper(s: BusinessSnapshot, today: DateKey): Insight[] {
  const late = s.superPayments.filter((p) => p.status === 'unpaid' && p.dueDate < today);
  if (late.length === 0) return [];
  const total = round(late.reduce((sum, p) => sum + p.amount, 0));
  return [
    insight({
      key: `super_overdue:${shortHash(late.map((p) => p.id).join(','))}`,
      check: 'super_overdue',
      area: 'finance',
      severity: 'high',
      title: `${money(total)} of super is overdue`,
      summary: `Super for ${plural(new Set(late.map((p) => p.employeeId)).size, 'person', 'people')} was due by ${formatDate(late.map((p) => p.dueDate).sort()[0])} and hasn't been paid.`,
      suggestion: 'Pay it from the Super section on the Payroll page as soon as you can. Late super can attract the Super Guarantee Charge (extra interest and admin fees).',
      metrics: { super_overdue_total: total, records: late.length },
    }),
  ];
}

function labourCostShare(s: BusinessSnapshot, today: DateKey): Insight[] {
  const thisMonth = startOfMonth(today);
  const lastMonth = addMonths(thisMonth, -1);
  const revenue = revenueIn(s, lastMonth, thisMonth);
  const wages = round(
    s.payslips
      .filter((p) => {
        const d = p.payDate ?? p.periodEnd;
        return d >= lastMonth && d < thisMonth;
      })
      .reduce((sum, p) => sum + p.gross + p.super, 0),
  );
  if (revenue <= 0 || wages <= 0) return [];
  const share = Math.round((wages / revenue) * 100);
  if (share < 55) return [];
  return [
    insight({
      key: `labour_share:${lastMonth.slice(0, 7)}`,
      check: 'labour_cost_high',
      area: 'finance',
      severity: share >= 80 ? 'high' : 'medium',
      title: `Wages were ${share}% of revenue in ${monthName(lastMonth)}`,
      summary: `You paid ${money(wages)} in wages and super against ${money(revenue)} of paid invoices. For most service businesses, under 50% leaves room for profit.`,
      suggestion: 'Check your prices cover labour on each job, cut overtime where you can, and make sure finished jobs are invoiced promptly.',
      estimatedSaving: round(wages - revenue * 0.5),
      metrics: { wages, revenue, labour_percent: share },
    }),
  ];
}

// ---------------------------------------------------------------------------
// Spending (bank transactions). Skipped quietly until the Transactions page
// is connected (see transactions-adapter.ts).
// ---------------------------------------------------------------------------

const spend = (list: Transaction[]) => list.filter((t) => t.amount > 0);

function categoryIncreases(s: BusinessSnapshot, today: DateKey): Insight[] {
  const out: Insight[] = [];
  const families = new Map<string, string>();
  for (const t of spend(s.transactions)) families.set(categoryKey(t.category), t.category?.trim() || 'Uncategorised');
  for (const [key, label] of families) {
    // Materials: product prices (productPriceIncreases) say more than total spending, which goes up with busy months.
    if (key === 'uncategorised' || key === 'materials') continue;
    const months = monthlyTotals(spend(s.transactions), today, 4, { category: label });
    const last = months[3].total;
    const earlier = months.slice(0, 3).filter((m) => m.total > 0);
    if (earlier.length < 2) continue;
    const average = earlier.reduce((sum, m) => sum + m.total, 0) / earlier.length;
    const change = percentChange(last, average);
    const extra = last - average;
    if (change === null || change < 10 || extra < 100) continue;
    const name = label[0].toUpperCase() + label.slice(1);
    const isMaterials = key === 'materials';
    out.push(
      insight({
        key: `category_up:${key}:${months[3].month}`,
        check: 'spending_category_increase',
        area: 'spending',
        severity: change >= 25 ? 'medium' : 'low',
        title: `${name} up ${Math.round(change)}%, about ${money(extra, false)} more a month`,
        summary: `You spent ${money(last)} on ${label.toLowerCase()} in ${monthName(`${months[3].month}-01`)}, compared with an average of ${money(average)} a month over the 3 months before.`,
        suggestion: isMaterials
          ? 'Compare prices with another supplier, ask your main supplier for a trade discount, or look at an alternative material for common jobs.'
          : `Check what's driving the extra ${label.toLowerCase()} spending, and compare suppliers or plans.`,
        estimatedSaving: extra,
        metrics: { category: label, last_month: round(last), monthly_average_before: round(average), change_percent: Math.round(change) },
      }),
    );
  }
  return out;
}

const describe = (t: Transaction) => (t.description ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function supplierPriceIncreases(s: BusinessSnapshot, today: DateKey): Insight[] {
  const out: Insight[] = [];
  const recentFrom = addDays(today, -60);
  const olderFrom = addDays(today, -180);

  // The same item (same supplier and description) bought before and now.
  const items = new Map<string, Transaction[]>();
  for (const t of spend(s.transactions)) {
    const d = describe(t);
    if (!d) continue;
    const key = `${merchantOf(t).toLowerCase()}|${d}`;
    items.set(key, [...(items.get(key) ?? []), t]);
  }
  for (const [key, list] of items) {
    const before = list.filter((t) => t.date >= olderFrom && t.date < recentFrom);
    const recent = list.filter((t) => t.date >= recentFrom);
    if (before.length === 0 || recent.length === 0) continue;
    const oldPrice = before.reduce((sum, t) => sum + t.amount, 0) / before.length;
    const newPrice = recent.reduce((sum, t) => sum + t.amount, 0) / recent.length;
    const change = percentChange(newPrice, oldPrice);
    if (change === null || change < 8 || newPrice - oldPrice < 5) continue;
    const t = recent[0];
    out.push(
      insight({
        key: `item_price:${shortHash(key)}`,
        check: 'same_item_costs_more',
        area: 'spending',
        severity: 'low',
        title: `"${t.description}" from ${merchantOf(t)} costs ${Math.round(change)}% more`,
        summary: `You used to pay about ${money(oldPrice)}; your recent purchases averaged ${money(newPrice)}.`,
        suggestion: `Ask ${merchantOf(t)} for your old price or a trade discount, or get a quote from another supplier.`,
        estimatedSaving: (newPrice - oldPrice) * recent.length,
        related: recent.slice(0, 3).map((x) => ({ type: 'transaction' as const, id: x.id })),
        metrics: { old_price: round(oldPrice), new_price: round(newPrice), change_percent: Math.round(change) },
      }),
    );
  }

  // A supplier's typical purchase getting bigger (when there's no item detail).
  const bySupplier = new Map<string, Transaction[]>();
  for (const t of spend(s.transactions)) {
    if (describe(t)) continue;
    const key = merchantOf(t).toLowerCase();
    bySupplier.set(key, [...(bySupplier.get(key) ?? []), t]);
  }
  for (const list of bySupplier.values()) {
    const before = list.filter((t) => t.date >= olderFrom && t.date < recentFrom);
    const recent = list.filter((t) => t.date >= recentFrom);
    if (before.length < 3 || recent.length < 3) continue;
    const oldAvg = before.reduce((sum, t) => sum + t.amount, 0) / before.length;
    const newAvg = recent.reduce((sum, t) => sum + t.amount, 0) / recent.length;
    const change = percentChange(newAvg, oldAvg);
    if (change === null || change < 15) continue;
    const name = merchantOf(list[0]);
    out.push(
      insight({
        key: `supplier_price:${shortHash(name)}`,
        check: 'supplier_costs_more',
        area: 'spending',
        severity: 'low',
        title: `Purchases at ${name} are ${Math.round(change)}% bigger than before`,
        summary: `Your average spend per visit went from ${money(oldAvg)} to ${money(newAvg)} over the last 2 months.`,
        suggestion: `Check whether ${name}'s prices went up or you're buying more per job. If it's prices, compare another supplier.`,
        metrics: { average_before: round(oldAvg), average_now: round(newAvg), change_percent: Math.round(change) },
      }),
    );
  }
  return out;
}

/** The same product costing more than last time, from receipt line items (e.g. 20L chlorine $20 -> $24). */
function productPriceIncreases(s: BusinessSnapshot, today: DateKey): Insight[] {
  return productPriceRises(s.purchases ?? [], today)
    .slice(0, 5)
    .map((r) => {
      const extra = r.now.unitPrice - r.before.unitPrice;
      const sameSupplier = !r.before.supplier || !r.now.supplier || r.before.supplier.toLowerCase() === r.now.supplier.toLowerCase();
      const at = (supplier: string | null) => (supplier ? ` at ${supplier}` : '');
      return insight({
        key: `product_price:${shortHash(r.key)}:${r.now.date}`,
        check: 'product_price_increase',
        area: 'spending',
        severity: r.changePercent >= 10 ? 'medium' : 'low',
        title: `${r.product} up ${r.changePercent}%: ${money(r.before.unitPrice)} → ${money(r.now.unitPrice)}`,
        summary: `You paid ${money(r.before.unitPrice)} for ${r.product}${at(r.before.supplier)} on ${formatDate(r.before.date)}, and ${money(r.now.unitPrice)}${at(r.now.supplier)} on ${formatDate(r.now.date)}: ${money(extra)} more each.`,
        suggestion: sameSupplier
          ? `Ask ${r.now.supplier ?? 'the supplier'} about the price rise or compare another supplier, and update your quote prices so the extra cost is covered.`
          : `${r.before.supplier} was cheaper. Buy it there next time, or update your quote prices so the extra cost is covered.`,
        estimatedSaving: extra * r.now.quantity,
        metrics: { product: r.product, old_price: round(r.before.unitPrice), new_price: round(r.now.unitPrice), change_percent: r.changePercent },
      });
    });
}

function recurringCosts(s: BusinessSnapshot, today: DateKey): Insight[] {
  const from = addMonths(startOfMonth(today), -4);
  const bySupplier = new Map<string, Transaction[]>();
  for (const t of spend(s.transactions).filter((x) => x.date >= from)) {
    const key = merchantOf(t).toLowerCase();
    bySupplier.set(key, [...(bySupplier.get(key) ?? []), t]);
  }
  const recurring: { name: string; monthly: number; ids: string[] }[] = [];
  for (const list of bySupplier.values()) {
    const months = new Set(list.map((t) => t.date.slice(0, 7)));
    if (months.size < 3 || list.length > months.size + 1) continue; // about once a month
    const amounts = list.map((t) => t.amount);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (amounts.some((a) => Math.abs(a - avg) > avg * 0.1)) continue; // the same amount each time
    recurring.push({ name: merchantOf(list[0]), monthly: avg, ids: list.map((t) => t.id) });
  }
  if (recurring.length === 0) return [];
  const monthly = recurring.reduce((sum, r) => sum + r.monthly, 0);
  return [
    insight({
      key: `recurring:${shortHash(recurring.map((r) => r.name).sort().join(','))}`,
      check: 'recurring_costs',
      area: 'spending',
      severity: 'low',
      title: `${plural(recurring.length, 'regular monthly charge')} (${money(monthly)} a month)`,
      summary: `Charged every month: ${recurring.map((r) => `${r.name} ${money(r.monthly)}`).join(', ')}.`,
      suggestion: 'Check each one is still worth it. Cancelling anything you no longer use, or moving to an annual plan, saves money every month.',
      estimatedSaving: monthly * 12,
      related: recurring.flatMap((r) => r.ids.slice(0, 1)).map((id) => ({ type: 'transaction' as const, id })),
      metrics: { monthly_total: round(monthly), yearly_total: round(monthly * 12), charges: recurring.length },
    }),
  ];
}

function jobMargins(s: BusinessSnapshot): Insight[] {
  const out: Insight[] = [];
  for (const j of s.jobs) {
    if (!j.value || j.value <= 0 || j.status === 'cancelled') continue;
    const costs = totalOf(spend(s.transactions).filter((t) => t.jobId === j.id));
    if (costs <= 0) continue;
    const share = Math.round((costs / j.value) * 100);
    if (share < 70) continue;
    out.push(
      insight({
        key: `job_margin:${j.id}`,
        check: 'job_costs_eating_margin',
        area: 'spending',
        severity: share >= 100 ? 'high' : 'medium',
        title: share >= 100 ? `${j.title} cost more than it earned` : `Costs used ${share}% of ${j.title}`,
        summary: `Purchases linked to this job came to ${money(costs)} against a job value of ${money(j.value)}${share >= 100 ? ', so it lost money before labour' : ', leaving little profit after labour'}.`,
        suggestion: 'Review the quote for this kind of job: include a materials allowance or markup, and charge for variations when the job grows.',
        estimatedSaving: costs - j.value * 0.6,
        related: [{ type: 'job', id: j.id }],
        metrics: { job_value: j.value, job_costs: costs, cost_percent: share },
      }),
    );
  }
  return out;
}

/** Fuel for trips to jobs further away, e.g. "Two jobs in Ipswich added about $120 in fuel". */
function travelCharges(s: BusinessSnapshot, today: DateKey): Insight[] {
  const from = addDays(today, -30);
  const jobs = s.jobs
    .map((j) => ({ date: dateKeyOf(j.startsAt), status: j.status, suburb: suburbOf(j.address) }))
    .filter((j) => j.date >= from && j.date <= today);
  const fuel = s.transactions
    .filter((t) => t.date >= addDays(from, -2) && categoryKey(t.category) === categoryKey('Fuel'))
    .map((t) => ({ amount: -t.amount, description: [t.rawMerchant, t.description].filter(Boolean).join(' '), date: t.date }));
  return travelCosts(fuel, jobs)
    .filter((c) => c.fuel >= 50)
    .slice(0, 2)
    .map((c) => {
      const about = Math.max(10, Math.round(c.fuel / 10) * 10);
      const jobsText = c.jobs === 1 ? 'One job' : c.jobs === 2 ? 'Two jobs' : `${c.jobs} jobs`;
      return insight({
        key: `travel:${c.suburb.toLowerCase()}:${today.slice(0, 7)}`,
        check: 'travel_charges',
        area: 'spending',
        severity: 'low',
        placements: ['attention', 'analytics'],
        title: `Fuel for ${c.suburb} jobs: about ${money(about, false)}`,
        summary: `${jobsText} in ${c.suburb} added about ${money(about, false)} in fuel in the last 30 days.`,
        suggestion: `Add a travel charge to your quotes for ${c.suburb} jobs.`,
        estimatedSaving: c.fuel,
        metrics: { suburb: c.suburb, jobs: c.jobs, fuel: c.fuel },
      });
    });
}

function unusualSpending(s: BusinessSnapshot, today: DateKey): Insight[] {
  const out: Insight[] = [];
  const recentFrom = addDays(today, -14);
  const all = spend(s.transactions);
  for (const t of all.filter((x) => x.date >= recentFrom)) {
    const history = all.filter((x) => x.id !== t.id && x.date < t.date && categoryKey(x.category) === categoryKey(t.category));
    const seenSupplier = all.some((x) => x.id !== t.id && x.date < t.date && merchantOf(x).toLowerCase() === merchantOf(t).toLowerCase());
    let reason: string | null = null;
    if (history.length >= 5) {
      const sorted = history.map((x) => x.amount).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      if (t.amount >= median * 3 && t.amount - median >= 200) reason = `about ${Math.round(t.amount / median)}× your usual ${(t.category ?? 'purchase').toLowerCase()} spend of ${money(median)}`;
    }
    if (!reason && !seenSupplier && t.amount >= 1000 && all.length >= 10) reason = 'a large first-time payment to a new supplier';
    if (!reason) continue;
    out.push(
      insight({
        key: `unusual:${t.id}`,
        check: 'unusual_spending',
        area: 'spending',
        severity: 'medium',
        title: `Unusual payment: ${money(t.amount)} at ${merchantOf(t)}`,
        summary: `On ${formatDate(t.date)} you paid ${money(t.amount)} to ${merchantOf(t)}, ${reason}.`,
        suggestion: "Check it's a payment you expected. If it isn't, contact your bank straight away.",
        related: [{ type: 'transaction', id: t.id }],
        metrics: { amount: t.amount },
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/**
 * Runs every check for one business and returns what it found, most urgent first.
 * Spending checks only run once bank transactions are connected.
 */
export function runHealthCheck(s: BusinessSnapshot, now = new Date()): Insight[] {
  const today = todayKey(now);
  const found = [
    ...overdueInvoices(s, today),
    ...uninvoicedJobs(s, today),
    ...latePayers(s, today),
    ...quoteFollowUps(s, today),
    ...revenueDrop(s, today),
    ...labourCostShare(s, today),
    ...overdueSuper(s, today),
    ...expiringQualifications(s, today),
    ...unassignedJobs(s, now, today),
    ...scheduleClashes(s, today),
    // From receipts, so it works with or without a bank connected.
    ...productPriceIncreases(s, today),
  ];
  if (s.transactionsConnected && s.transactions.length > 0) {
    found.push(
      ...categoryIncreases(s, today),
      ...supplierPriceIncreases(s, today),
      ...recurringCosts(s, today),
      ...jobMargins(s),
      ...travelCharges(s, today),
      ...unusualSpending(s, today),
    );
  }
  // One per key (a check can only find each problem once).
  const unique = [...new Map(found.map((i) => [i.key, i])).values()];
  return unique.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || (b.estimatedSaving ?? 0) - (a.estimatedSaving ?? 0));
}
