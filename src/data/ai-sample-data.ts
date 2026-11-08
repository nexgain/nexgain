// SAMPLE business data for testing the AI and previewing its insights. Never
// saved to the database: the tests use it, and in development the AI
// Assistant's "Preview with sample data" shows it on screen only.
// Dates are worked out from "now", so the sample always looks current
// (e.g. there's always a job tomorrow with no staff).
import { addDays, addMonths, startOfMonth, todayKey } from '../../supabase/functions/_shared/ai/dates';
import type { BusinessSnapshot, Transaction } from '../../supabase/functions/_shared/ai/types';

/** A timestamp for a business-time date and time ("YYYY-MM-DD", "HH:MM"). */
const at = (date: string, time: string) => new Date(`${date}T${time}:00+10:00`).toISOString();

let txnCount = 0;
const txn = (date: string, amount: number, rawMerchant: string, category: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: `sample-txn-${++txnCount}`,
  date,
  amount,
  rawMerchant,
  merchant: null,
  category,
  jobId: null,
  description: null,
  ...extra,
});

export function buildSampleSnapshot(now = new Date()): BusinessSnapshot {
  txnCount = 0;
  const today = todayKey(now);
  const thisMonth = startOfMonth(today);
  const m = (back: number, day: number) => addDays(addMonths(thisMonth, -back), day - 1); // a day in an earlier month

  // Materials: about $2,860 a month for 3 months, then about 11% more last month
  // (including the detergent and the deck job's materials below).
  const materials: Transaction[] = [];
  for (const back of [4, 3, 2]) {
    materials.push(
      txn(m(back, 3), 1180, 'BUNNINGS 6342 CAPALABA', 'Materials'),
      txn(m(back, 12), 960, 'VISA DEBIT PURCHASE CARD 4587 BUNNINGS WAREHOUSE 2210 CANNON HILL', 'Materials'),
      txn(m(back, 22), 660, 'REECE PLUMBING 0331 MURARRIE QLD', 'Materials'),
    );
  }
  materials.push(
    txn(m(1, 2), 1100, 'BUNNINGS 6342 CAPALABA', 'Materials'),
    txn(m(1, 9), 900, 'BUNNINGS 6342 CAPALABA QLD AU', 'Materials'),
    txn(m(1, 23), 425, 'REECE PLUMBING 0331 MURARRIE QLD', 'Materials'),
    txn(addDays(today, -3), 412.5, 'BUNNINGS 6342 CAPALABA', 'Materials'),
  );

  // The same item now costs more (pressure-washer detergent: $89 -> $104).
  const detergent = [
    txn(m(4, 6), 89, 'BUNNINGS 6342 CAPALABA', 'Materials', { description: 'Pressure washer detergent 20L' }),
    txn(m(3, 6), 89, 'BUNNINGS 6342 CAPALABA', 'Materials', { description: 'Pressure washer detergent 20L' }),
    txn(m(1, 6), 104, 'BUNNINGS 6342 CAPALABA', 'Materials', { description: 'Pressure washer detergent 20L' }),
    txn(m(0, 1), 104, 'BUNNINGS 6342 CAPALABA', 'Materials', { description: 'Pressure washer detergent 20L' }),
  ];

  // Fuel every week.
  const fuel: Transaction[] = [];
  for (let d = 1; d <= 140; d += 7) fuel.push(txn(addDays(today, -d), 92 + (d % 3) * 6, 'AMPOL CAPALABA 4157 CAPALABA QLD', 'Fuel'));

  // Monthly subscriptions.
  const subs: Transaction[] = [];
  for (const back of [3, 2, 1, 0]) {
    subs.push(
      txn(m(back, 1), 70, 'XERO AUSTRALIA PTY LTD', 'Subscriptions'),
      txn(m(back, 1), 49, 'SQ *ROUTEPLANNER PRO 8812', 'Subscriptions'),
    );
  }

  // Costs linked to a job that ate its margin.
  const jobCosts = [
    txn(m(1, 18), 640, 'BUNNINGS 6342 CAPALABA', 'Materials', { jobId: 'sample-job-deck', description: 'Decking oil and timber' }),
    txn(m(1, 19), 380, 'SQ *BAYSIDE LABOUR HIRE 5521', 'Labour', { jobId: 'sample-job-deck', description: 'Labourer, 1 day' }),
  ];

  // Materials bought for the House Wash job (Q-4521).
  jobCosts.push(
    txn(addDays(today, -1), 86.4, 'BUNNINGS 6342 CAPALABA', 'Materials', { jobId: 'sample-job-4521', description: 'Sugar soap and degreaser' }),
  );

  // Something unusual this week.
  const unusual = [txn(addDays(today, -2), 1850, 'TOTAL TOOLS 0219 BRISBANE', 'Tools', { description: 'Petrol pressure washer' })];
  const tools = [m(4, 15), m(3, 15), m(2, 15), m(1, 15), m(1, 27)].map((d) => txn(d, 85, 'TOTAL TOOLS 0219 BRISBANE', 'Tools'));

  const tomorrow = addDays(today, 1);
  return {
    businessId: 'sample-business',
    businessName: 'Sample Cleaning Co',
    country: 'AU',
    financialYearStartMonth: 7,
    clients: [
      { id: 'sample-client-smith', name: 'Sarah Smith', email: 'sarah@example.com', phone: '0400 111 222', address: '24 Ocean Dr, Wellington Point' },
      { id: 'sample-client-lee', name: 'Lee Property Group', email: 'accounts@leeproperty.example', phone: '07 3000 1234', address: '8 Main St, Capalaba' },
      { id: 'sample-client-nguyen', name: 'Tom Nguyen', email: 'tom@example.com', phone: '0400 333 444', address: '3 Bay Rd, Cleveland' },
    ],
    invoices: [
      // Overdue now.
      { id: 'sample-inv-1', number: 'INV-1042', status: 'Pending', clientId: 'sample-client-lee', clientName: 'Lee Property Group', total: 1650, dueDate: addDays(today, -21), createdAt: at(addDays(today, -35), '09:00'), paidAt: null, sourceQuoteId: null },
      { id: 'sample-inv-2', number: 'INV-1047', status: 'Pending', clientId: 'sample-client-smith', clientName: 'Sarah Smith', total: 385, dueDate: addDays(today, -4), createdAt: at(addDays(today, -18), '09:00'), paidAt: null, sourceQuoteId: null },
      // Lee usually pays late.
      { id: 'sample-inv-3', number: 'INV-1021', status: 'Paid', clientId: 'sample-client-lee', clientName: 'Lee Property Group', total: 1420, dueDate: m(3, 10), createdAt: at(m(3, 1), '09:00'), paidAt: at(m(3, 28), '10:00'), sourceQuoteId: null },
      { id: 'sample-inv-4', number: 'INV-1033', status: 'Paid', clientId: 'sample-client-lee', clientName: 'Lee Property Group', total: 1380, dueDate: m(2, 8), createdAt: at(m(2, 1), '09:00'), paidAt: at(m(2, 24), '10:00'), sourceQuoteId: null },
      // Revenue: strong two months ago, weaker last month.
      { id: 'sample-inv-5', number: 'INV-1030', status: 'Paid', clientId: 'sample-client-nguyen', clientName: 'Tom Nguyen', total: 6200, dueDate: m(2, 14), createdAt: at(m(2, 1), '09:00'), paidAt: at(m(2, 12), '10:00'), sourceQuoteId: null },
      { id: 'sample-inv-6', number: 'INV-1039', status: 'Paid', clientId: 'sample-client-smith', clientName: 'Sarah Smith', total: 3100, dueDate: m(1, 14), createdAt: at(m(1, 1), '09:00'), paidAt: at(m(1, 13), '10:00'), sourceQuoteId: null },
    ],
    quotes: [
      { id: 'sample-quote-4521', number: 'Q-4521', status: 'Booked', clientId: 'sample-client-smith', clientName: 'Sarah Smith', total: 495, jobType: 'House Wash', jobDate: tomorrow, createdAt: at(addDays(today, -9), '09:00'), respondedAt: at(addDays(today, -7), '09:00') },
      { id: 'sample-quote-deck', number: 'Q-4498', status: 'Booked', clientId: 'sample-client-nguyen', clientName: 'Tom Nguyen', total: 1100, jobType: 'Deck restore', jobDate: m(1, 17), createdAt: at(addDays(today, -40), '09:00'), respondedAt: at(addDays(today, -38), '09:00') },
      { id: 'sample-quote-waiting', number: 'Q-4530', status: 'Sent', clientId: 'sample-client-lee', clientName: 'Lee Property Group', total: 2850, jobType: 'Window cleaning (12 units)', jobDate: null, createdAt: at(addDays(today, -8), '09:00'), respondedAt: null },
    ],
    jobs: [
      { id: 'sample-job-4521', title: 'House Wash', address: '24 Ocean Dr, Wellington Point', clientId: 'sample-client-smith', quoteId: 'sample-quote-4521', quoteNumber: 'Q-4521', status: 'scheduled', startsAt: at(tomorrow, '08:00'), endsAt: at(tomorrow, '11:00'), assignedEmployeeIds: [], value: 495 },
      { id: 'sample-job-deck', title: 'Deck restore', address: '3 Bay Rd, Cleveland', clientId: 'sample-client-nguyen', quoteId: 'sample-quote-deck', quoteNumber: 'Q-4498', status: 'completed', startsAt: at(m(1, 17), '07:00'), endsAt: at(m(1, 17), '15:00'), assignedEmployeeIds: ['sample-emp-jake'], value: 1100 },
    ],
    employees: [
      { id: 'sample-emp-jake', name: 'Jake Wilson', role: 'Cleaner', employmentType: 'Full-time', status: 'active', payRate: 32, payType: 'hourly' },
      { id: 'sample-emp-mia', name: 'Mia Chen', role: 'Cleaner', employmentType: 'Casual', status: 'active', payRate: 36, payType: 'hourly' },
    ],
    shifts: [
      // Mia is double-booked the day after tomorrow.
      { id: 'sample-shift-1', date: addDays(today, 2), start: '08:00', end: '12:00', employeeIds: ['sample-emp-mia'], jobId: null, jobType: 'Office clean', location: 'Capalaba' },
      { id: 'sample-shift-2', date: addDays(today, 2), start: '11:00', end: '15:00', employeeIds: ['sample-emp-mia'], jobId: null, jobType: 'End of lease', location: 'Cleveland' },
    ],
    payslips: [],
    superPayments: [],
    expenses: [],
    transactions: [...materials, ...detergent, ...fuel, ...subs, ...jobCosts, ...unusual, ...tools],
    transactionsConnected: true,
  };
}
