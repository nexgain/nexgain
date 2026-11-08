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

describe('rostering staff from the chat', () => {
  const ask = (q: string, context = {}, s = sample) => answerQuestion(s, q, NOW, context);

  it('asks who to roster on "this job" (the last job shown), listing everyone', () => {
    const a = ask('can you roster an employee to this job', { lastJobId: 'sample-job-4521' });
    expect(a.text).toBe(
      'Yes. Who do you want to roster on House Wash (Q-4521), 11 Nov 2026, 8:00 am–11:00 am? Tick the people below, or choose All employees.',
    );
    expect(a.roster?.options.map((o) => o.name)).toEqual(['Jake Wilson', 'Mia Chen']);
    expect(a.roster?.preselected).toEqual([]);
  });

  it('asks which job when it isn\'t clear', () => {
    const a = ask('can you roster someone');
    expect(a.roster).toBeUndefined();
    expect(a.text).toMatch(/^Sure\. Which job\?/);
    expect(a.cards.map((c) => c.id)).toEqual(['sample-job-4521']);
  });

  it('ticks the people named, or everyone free', () => {
    const mia = ask('put mia on job #4521');
    expect(mia.roster?.preselected).toEqual(['sample-emp-mia']);
    expect(mia.text).toMatch(/^Roster Mia Chen on House Wash \(Q-4521\)/);
    expect(ask('roster all employees on job #4521').roster?.preselected).toEqual(['sample-emp-jake', 'sample-emp-mia']);
  });

  it("warns when someone is busy then, and won't roster on finished jobs", () => {
    const busyDay = {
      ...sample,
      shifts: [...sample.shifts, { id: 'x', date: '2026-11-11', start: '07:00', end: '09:00', employeeIds: ['sample-emp-mia'], jobId: null, jobType: 'Office clean', location: '' }],
    };
    const a = ask('assign mia to job #4521', {}, busyDay);
    expect(a.roster?.options.find((o) => o.name === 'Mia Chen')?.busy).toBe('Busy 07:00–09:00 (Office clean)');
    expect(a.text).toMatch(/Heads up: Mia is busy 07:00–09:00 \(office clean\)\./);
    expect(ask('roster jake on job #4498').text).toBe("Deck restore (Q-4498) has already finished, so there's no one to roster.");
  });

  it('still answers roster questions as questions', () => {
    expect(ask("who's rostered tomorrow?").roster).toBeUndefined();
    expect(ask('Which jobs are unassigned?').text).toMatch(/^1 upcoming job has no staff yet/);
  });
});

describe('ten more things the assistant can answer', () => {
  const ask = (q: string) => answerQuestion(sample, q, NOW);

  it("1. who's free, then offers to roster them", () => {
    expect(ask("Who's free Thursday morning?").text).toBe(
      'Free Thursday 12 Nov 2026 in the morning: Jake Wilson. Already rostered: Mia Chen (08:00–12:00 Office clean).',
    );
    const job = ask('who can do a job tomorrow at 9');
    expect(job.text).toMatch(/House Wash \(Q-4521\) .* still needs staff\. Want to roster them\?/);
    expect(job.roster?.preselected).toEqual(['sample-emp-jake', 'sample-emp-mia']);
  });

  it('2. clock-ins: lateness, hours vs rostered, who is on now', () => {
    expect(ask('Who clocked in late this week?').text).toMatch(/Jake Wilson, 20 min late on 9 Nov 2026 \(rostered 07:00, clocked in 07:20\)/);
    expect(ask('How many hours did Jake actually work vs rostered?').text).toMatch(/Jake Wilson worked 10\.8 hours, against 16 rostered so far/);
    expect(ask("who's clocked in right now").text).toBe('Clocked in right now: Jake Wilson (since 6:58 am).');
  });

  it('3. expiring licences and tickets (also in the health check)', () => {
    expect(ask('Whose White Card expires soon?').text).toMatch(/^1 licence or ticket needs attention: Jake Wilson's White Card expires 30 Nov 2026 \(in 20 days\)/);
    expect(ask('any tickets expiring?').text).toMatch(/Mia Chen's First Aid Certificate expired 5 Nov 2026/);
    const insight = runHealthCheck(sample, NOW).find((i) => i.check === 'qualification_expiring' && i.severity === 'high');
    expect(insight?.title).toBe("Mia Chen's First Aid Certificate expired 5 days ago");
  });

  it('4. job reports and incidents', () => {
    const deck = ask('What did Jake write on the deck job?');
    expect(deck.text).toMatch(/^1 job report from Jake Wilson\. 17 Oct 2026, Deck restore/);
    expect(deck.text).toMatch(/Cracked board near the back step/);
    expect(ask('Any incidents last month?').text).toMatch(/^1 incident in October 2026/);
  });

  it("5. daily briefing: what's on tomorrow", () => {
    const a = ask("What's on tomorrow?");
    expect(a.text).toMatch(/House Wash \(Q-4521\) at 24 Ocean Dr, Wellington Point \(NO STAFF YET\)/);
    expect(a.text).toMatch(/7:30 am Bunnings delivery \(Decking oil x2, sugar soap\)/);
  });

  it('6. client history and best clients', () => {
    expect(ask('When did I last do a job for Sarah?').text).toMatch(/last paid invoice was INV-1039 on 13 Oct 2026\. Next one: House Wash \(Q-4521\)/);
    expect(ask('Who are my best clients this year?').text).toMatch(/1\. Tom Nguyen \$6,200\.00 \(1 invoice\); 2\. Sarah Smith \$3,100\.00/);
    expect(ask('Does Lee pay late?').text).toMatch(/^Lee Property Group often pays late/);
  });

  it('7. quote win rate and average quote', () => {
    expect(ask('How many quotes did I win this month?').text).toBe(
      'This month (November 2026) you sent 2 quotes: 1 won ($495.00), 0 declined, 1 still waiting. That\'s a 100% win rate on the ones decided. Average quote: $1,672.50.',
    );
  });

  it("8. what's due in the next 2 weeks", () => {
    const a = ask("What's due in the next 2 weeks?");
    expect(a.text).toMatch(/plus \$2,035\.00 already overdue/);
    expect(a.text).toMatch(/contractor invoices \$2,200\.00/);
    expect(a.text).toMatch(/more going out than coming in/);
  });

  it('9. GST estimate, clearly labelled', () => {
    const a = ask('Roughly how much GST will I owe this quarter?');
    expect(a.text).toMatch(/^Rough GST estimate for 1 Oct 2026 – 31 Dec 2026: \$281\.82 GST collected/);
    expect(a.text).toMatch(/Check with your accountant or BAS agent/);
    expect(answerQuestion({ ...sample, gstRegistered: false }, 'how much gst do i owe', NOW).text).toMatch(/isn't set up as registered for GST/);
  });

  it('10. contractor invoices waiting', () => {
    expect(ask('Any contractor invoices waiting for me?').text).toBe(
      '1 invoice to review: MC-014 from Mia Chen ($880.00, due 22 Nov 2026). 1 approved invoice to pay: MC-013 from Mia Chen ($1,320.00, due 15 Nov 2026). Open More > Contractor invoices to review or pay them.',
    );
  });
});

describe('follow-up questions in a conversation', () => {
  /** Asks the questions in order, like a chat, and returns each answer. */
  const chat = (...questions: string[]) => {
    let previous: string | null = null;
    return questions.map((q) => {
      const a = answerQuestion(sample, q, NOW, { previousQuestion: previous });
      if (a.understood) previous = a.asked ?? q;
      return a;
    });
  };

  it('"Was there an incident this month?" then "When was the last one?"', () => {
    const [first, second] = chat('Was there an incident report from this month?', 'When was the last one?');
    expect(first.text).toBe('No incidents this month (November 2026).');
    expect(second.text).toMatch(/^The last incident was on 17 Oct 2026 \(24 days ago\): Deck restore at 3 Bay Rd, Cleveland, reported by Jake Wilson/);
  });

  it('swaps in a new date, supplier or person', () => {
    const [, sept, reece, last] = chat('How much did I spend at Bunnings last month?', 'What about September?', 'and Reece?', 'when was the last one?');
    expect(sept.text).toMatch(/^You spent \$2,140\.00 at Bunnings in September 2026/);
    expect(reece.text).toMatch(/^You spent \$660\.00 at Reece in September 2026/);
    expect(last.text).toBe('Your last purchase at Reece was $425.00 on 23 Oct 2026.');
    expect(chat('what hours has mia got this week', 'and jake?')[1].text).toMatch(/^Jake Wilson has 2 shifts this week/);
    expect(chat("Who's free Thursday morning?", 'what about friday?')[1].text).toMatch(/^Free Friday 13 Nov 2026 in the morning/);
    expect(chat('Whose White Card expires soon?', 'what about first aid?')[1].text).toMatch(/Mia Chen's First Aid Certificate expired/);
  });

  it('narrows down, and answers new questions as new', () => {
    expect(chat('Which invoices are overdue?', 'which ones are Lee?')[1].text).toMatch(/^1 invoice is overdue for Lee Property Group/);
    const [, briefing] = chat('Which invoices are overdue?', "What's on tomorrow?");
    expect(briefing.asked).toBeUndefined();
    expect(briefing.text).toMatch(/^Here's tomorrow/);
    expect(chat('Which invoices are overdue?', 'thanks')[1].text).toMatch(/^You're welcome!/);
  });
});
