// The AI Assistant's tools and health check, tested on SAMPLE data only
// (src/data/ai-sample-data.ts). Nothing here touches the real database.
import { describe, expect, it } from '@jest/globals';

import { buildSampleSnapshot } from '@/data/ai-sample-data';

import { answerQuestion } from '../../../supabase/functions/_shared/ai/answer';
import { resolvePeriod } from '../../../supabase/functions/_shared/ai/dates';
import { runHealthCheck } from '../../../supabase/functions/_shared/ai/insights';
import { runTool, TRANSACTIONS_NOT_CONNECTED } from '../../../supabase/functions/_shared/ai/tools';
import { cleanMerchantName, matchesSupplier } from '../../../supabase/functions/_shared/ai/transactions';
import type { Transaction } from '../../../supabase/functions/_shared/ai/types';

// Tuesday 10 November 2026, 10am in Brisbane.
const NOW = new Date('2026-11-10T00:00:00Z');
const sample = buildSampleSnapshot(NOW);
const tool = (name: string, input: Record<string, unknown> = {}) =>
  runTool(sample, name, input, NOW).result as Record<string, any>;
const sum = (list: Transaction[]) => Math.round(list.reduce((t, x) => t + x.amount, 0) * 100) / 100;

describe('messy bank names', () => {
  it('cleans them up into supplier names', () => {
    expect(cleanMerchantName('BUNNINGS 6342 CAPALABA')).toBe('Bunnings');
    expect(cleanMerchantName('VISA DEBIT PURCHASE CARD 4587 BUNNINGS WAREHOUSE 2210 CANNON HILL')).toBe('Bunnings');
    expect(cleanMerchantName('REECE PLUMBING 0331 MURARRIE QLD')).toBe('Reece');
    expect(cleanMerchantName('SQ *BAYSIDE LABOUR HIRE 5521')).toBe('Bayside Labour Hire');
    expect(cleanMerchantName("EFTPOS JOE'S CAFE 1234 BRISBANE QLD")).toBe("Joe's Cafe");
  });

  it('matches suppliers loosely', () => {
    const t = { merchant: null, rawMerchant: 'BUNNINGS 6342 CAPALABA' };
    expect(matchesSupplier(t, 'Bunnings')).toBe(true);
    expect(matchesSupplier(t, 'bunnings warehouse')).toBe(true);
    expect(matchesSupplier(t, 'Bunings')).toBe(true); // a typo
    expect(matchesSupplier(t, 'Reece')).toBe(false);
  });
});

describe('dates in plain English (Brisbane time)', () => {
  it('understands last month, this week, since July and the financial year', () => {
    expect(resolvePeriod('last_month', NOW)).toMatchObject({ start: '2026-10-01', end: '2026-11-01', label: 'October 2026' });
    expect(resolvePeriod('this_week', NOW)).toMatchObject({ start: '2026-11-09', end: '2026-11-11' });
    expect(resolvePeriod('since:2026-07-01', NOW)).toMatchObject({ start: '2026-07-01', end: '2026-11-11' });
    expect(resolvePeriod('this_financial_year', NOW)).toMatchObject({ start: '2026-07-01', end: '2026-11-11' });
    expect(resolvePeriod('last_financial_year', NOW)).toMatchObject({ start: '2025-07-01', end: '2026-07-01' });
    expect(resolvePeriod('next tuesday', NOW)).toBeNull();
  });

  it("uses Brisbane's date even when it's still yesterday in UTC", () => {
    // 11pm UTC on 9 Nov is already 9am on 10 Nov in Brisbane.
    expect(resolvePeriod('today', new Date('2026-11-09T23:00:00Z'))).toMatchObject({ start: '2026-11-10' });
  });
});

describe('the questions owners ask', () => {
  it('"How much did I spend at Bunnings last month?"', () => {
    const r = tool('get_spend_by_supplier', { supplier: 'bunnings', period: 'last_month' });
    const expected = sample.transactions.filter((t) => t.rawMerchant.includes('BUNNINGS') && t.date.startsWith('2026-10'));
    expect(r.supplier).toBe('Bunnings');
    expect(r.period).toBe('October 2026');
    expect(r.total).toBe(sum(expected));
    expect(r.purchases).toBe(expected.length);
    // ...compared with September, for "X% more than September".
    const sept = sample.transactions.filter((t) => t.rawMerchant.includes('BUNNINGS') && t.date.startsWith('2026-09'));
    expect(r.compared_with).toMatchObject({ period: 'September 2026', total: sum(sept) });
    expect(r.compared_with.change_percent).toBeCloseTo(((sum(expected) - sum(sept)) / sum(sept)) * 100, 0);
  });

  it('"What did I spend on fuel this week?"', () => {
    const r = tool('get_spend_by_supplier', { category: 'fuel', period: 'this_week' });
    const expected = sample.transactions.filter((t) => t.category === 'Fuel' && t.date >= '2026-11-09' && t.date <= '2026-11-10');
    expect(expected.length).toBeGreaterThan(0);
    expect(r.total).toBe(sum(expected));
    expect(r.transactions.every((t: any) => t.supplier === 'Ampol')).toBe(true);
  });

  it('"Who\'s my biggest supplier this year?"', () => {
    const r = tool('get_spending_trends', { group_by: 'supplier', period: 'this_year' });
    expect(r.groups[0].name).toBe('Bunnings');
    expect(r.groups[0].total).toBeGreaterThan(r.groups[1].total);
  });

  it('"How much did job #4521 cost me in materials?"', () => {
    const jobs = tool('search_jobs', { query: '#4521' });
    expect(jobs.count).toBe(1);
    expect(jobs.jobs[0]).toMatchObject({ title: 'House Wash', quote_number: 'Q-4521', address: '24 Ocean Dr, Wellington Point' });
    const r = tool('get_spend_by_supplier', { job_id: jobs.jobs[0].id, category: 'materials' });
    expect(r.total).toBe(86.4);
    expect(r.purchases).toBe(1);
  });

  it('"Have material costs increased?"', () => {
    const r = tool('get_spending_trends', { group_by: 'category', category: 'materials', period: 'last_month' });
    expect(r.groups[0].name).toBe('Materials');
    expect(r.groups[0].change_percent).toBeGreaterThan(10);
    const insight = runHealthCheck(sample, NOW).find((i) => i.check === 'spending_category_increase' && i.metrics.category === 'Materials');
    expect(insight?.title).toMatch(/^Materials up 11%, about \$310 more a month$/);
    expect(insight?.suggestion).toMatch(/compare prices with another supplier/i);
  });

  it('finds overdue invoices and unstaffed jobs, with cards that open the real screens', () => {
    expect(tool('search_invoices', { status: 'overdue' })).toMatchObject({ count: 2, total: 2035 });
    expect(tool('search_jobs', { unassigned_only: true }).jobs[0].title).toBe('House Wash');
    const shown = runTool(sample, 'show_cards', { cards: [{ type: 'job', id: 'sample-job-4521' }, { type: 'invoice', id: 'nope' }] }, NOW);
    expect(shown.cards).toEqual([expect.objectContaining({ type: 'job', reference: 'Q-4521', title: 'House Wash', staffNames: [] })]);
    expect(shown.result).toEqual({ shown: 1, not_found: 1 });
  });

  it('never throws on bad input', () => {
    expect(tool('search_jobs', { period: 'whenever' }).error).toMatch(/couldn't understand the period/);
    expect(tool('no_such_tool').error).toMatch(/Unknown tool/);
  });
});

describe('the business health check', () => {
  const insights = runHealthCheck(sample, NOW);
  const find = (check: string) => insights.find((i) => i.check === check);

  it('spots problems across the whole business, each with a fix', () => {
    const job = find('jobs_without_staff');
    expect(job?.title).toBe('Job tomorrow at 24 Ocean Dr, Wellington Point has no one on it');
    expect(job?.severity).toBe('high');
    expect(find('overdue_invoices')?.title).toBe('2 invoices overdue ($2,035.00)');
    expect(find('late_payers')?.title).toBe('Lee Property Group often pays late');
    expect(find('quotes_not_followed_up')?.summary).toMatch(/Q-4530 for Lee Property Group was sent 5\+ days ago/);
    expect(find('schedule_clash')?.title).toMatch(/^Mia Chen is double-booked/);
    expect(find('revenue_drop')?.title).toBe('Revenue down 59.1% in October 2026');
    expect(find('completed_jobs_not_invoiced')?.title).toBe('1 finished job not invoiced ($1,100.00)');
    for (const i of insights) expect(i.suggestion.length).toBeGreaterThan(20);
  });

  it('finds the spending problems in the sample transactions', () => {
    expect(find('same_item_costs_more')?.title).toBe('"Pressure washer detergent 20L" from Bunnings costs 17% more');
    expect(find('recurring_costs')?.title).toBe('2 regular monthly charges ($119.00 a month)');
    expect(find('job_costs_eating_margin')?.title).toBe('Costs used 93% of Deck restore');
    expect(find('unusual_spending')?.title).toBe('Unusual payment: $1,850.00 at Total Tools');
  });

  it('sends each insight to the right place', () => {
    // Urgent: Dashboard + AI Assistant attention list, and a notification.
    expect(find('jobs_without_staff')?.placements).toEqual(['attention', 'notification']);
    // Money: also on the Analytics page.
    expect(find('overdue_invoices')?.placements).toEqual(['attention', 'analytics', 'notification']);
    // Lower priority: Dashboard "Other Insights" (and Analytics, for money).
    expect(find('recurring_costs')?.placements).toEqual(['other', 'analytics']);
    // Most urgent first.
    expect(insights[0].severity).toBe('high');
    expect(insights[insights.length - 1].severity).toBe('low');
  });
});

describe('before the Transactions page exists', () => {
  const noBank = { ...buildSampleSnapshot(NOW), transactions: [], transactionsConnected: false };

  it('says so politely instead of erroring', () => {
    for (const name of ['search_transactions', 'get_spend_by_supplier', 'get_spending_trends']) {
      expect(runTool(noBank, name, { supplier: 'bunnings', group_by: 'supplier' }, NOW).result).toEqual({
        connected: false,
        message: TRANSACTIONS_NOT_CONNECTED,
      });
    }
    expect(TRANSACTIONS_NOT_CONNECTED).toBe("Your Transactions page isn't connected yet, so I can't see spending data.");
  });

  it('skips the spending checks quietly and still runs the rest', () => {
    const found = runHealthCheck(noBank, NOW);
    expect(found.some((i) => i.area === 'spending')).toBe(false);
    expect(found.some((i) => i.check === 'overdue_invoices')).toBe(true);
  });

  it('copes with a brand-new business with no data at all', () => {
    const empty = { ...noBank, invoices: [], quotes: [], jobs: [], clients: [], employees: [], shifts: [] };
    expect(runHealthCheck(empty, NOW)).toEqual([]);
    expect(runTool(empty, 'get_revenue_and_profit', { period: 'last_month', group_by: 'month' }, NOW).result).toMatchObject({
      revenue: 0,
      profit: 0,
    });
  });
});

describe('the free AI Assistant (no paid AI)', () => {
  const ask = (q: string, s = sample) => answerQuestion(s, q, NOW);

  it('answers the five spending questions', () => {
    expect(ask('How much did I spend at Bunnings last month?').text).toBe(
      "You spent $2,744.00 at Bunnings in October 2026 across 4 purchases. That's 28% more than September 2026 ($2,140.00).",
    );
    expect(ask('What did I spend on fuel this week?').text).toBe('You spent $98.00 on fuel this week (since 9 Nov 2026) across 1 purchase.');
    expect(ask("Who's my biggest supplier this year?").text).toMatch(/^Your biggest supplier this year \(2026\) is Bunnings: \$9,944\.90 across 15 purchases\./);
    expect(ask('How much did job #4521 cost me in materials?').text).toBe(
      "House Wash (Q-4521) has cost you $86.40 in materials across 1 purchase. The job is worth $495.00, so that's 17% of its price.",
    );
    expect(ask('Have material costs increased?').text).toMatch(/^Yes\. You spent \$3,169\.00 on materials in October 2026, 13% more than September 2026 \(\$2,800\.00\)\./);
  });

  it('understands casual wording and dates', () => {
    expect(ask('what did i blow at bunnings in october').text).toMatch(/^You spent \$2,744\.00 at Bunnings in October 2026/);
    expect(ask('bunnings spend since july?').text).toMatch(/since 1 Jul 2026/);
    expect(ask('who owes me money').text).toMatch(/^2 invoices are overdue, totalling \$2,035\.00/);
    expect(ask('Which jobs have no staff?').text).toMatch(/House Wash \(Q-4521\) on 11 Nov 2026 at 24 Ocean Dr/);
    expect(ask('what hours has mia got this week').text).toMatch(/^Mia Chen has 2 shifts this week/);
    expect(ask('has bunnings gone up').text).toMatch(/^Yes\. You spent \$2,744\.00 at Bunnings/);
  });

  it('gives cards that link to the real records', () => {
    const job = ask('How much did job #4521 cost me in materials?');
    expect(job.cards.map((c) => c.type)).toEqual(['job', 'transaction']);
    expect(ask('Which invoices are overdue?').cards.map((c) => c.id)).toEqual(['sample-inv-1', 'sample-inv-2']);
  });

  it('says when it has nothing, rather than guessing', () => {
    expect(ask('how much did i spend at mitre 10 last month').text).toBe("I couldn't find any purchases at Mitre 10 in October 2026.");
    const noBank = { ...sample, transactions: [], transactionsConnected: false };
    expect(ask('How much did I spend at Bunnings last month?', noBank).text).toBe(TRANSACTIONS_NOT_CONNECTED);
    const unknown = ask('what is the meaning of life');
    expect(unknown.understood).toBe(false);
    expect(unknown.text).toMatch(/Try one of these/);
  });
});
