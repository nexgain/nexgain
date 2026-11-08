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
    gstRegistered: true,
    clients: [
      { id: 'sample-client-smith', name: 'Sarah Smith', email: 'sarah@example.com', phone: '0400 111 222', address: '24 Ocean Dr, Wellington Point' },
      { id: 'sample-client-lee', name: 'Lee Property Group', email: 'accounts@leeproperty.example', phone: '07 3000 1234', address: '8 Main St, Capalaba' },
      { id: 'sample-client-nguyen', name: 'Tom Nguyen', email: 'tom@example.com', phone: '0400 333 444', address: '3 Bay Rd, Cleveland' },
    ],
    invoices: [
      // Overdue now.
      { id: 'sample-inv-1', number: 'INV-1042', status: 'Pending', clientId: 'sample-client-lee', clientName: 'Lee Property Group', total: 1650, gst: 150, dueDate: addDays(today, -21), createdAt: at(addDays(today, -35), '09:00'), paidAt: null, sourceQuoteId: null },
      { id: 'sample-inv-2', number: 'INV-1047', status: 'Pending', clientId: 'sample-client-smith', clientName: 'Sarah Smith', total: 385, gst: 35, dueDate: addDays(today, -4), createdAt: at(addDays(today, -18), '09:00'), paidAt: null, sourceQuoteId: null },
      // Lee usually pays late.
      { id: 'sample-inv-3', number: 'INV-1021', status: 'Paid', clientId: 'sample-client-lee', clientName: 'Lee Property Group', total: 1420, gst: 129.09, dueDate: m(3, 10), createdAt: at(m(3, 1), '09:00'), paidAt: at(m(3, 28), '10:00'), sourceQuoteId: null },
      { id: 'sample-inv-4', number: 'INV-1033', status: 'Paid', clientId: 'sample-client-lee', clientName: 'Lee Property Group', total: 1380, gst: 125.45, dueDate: m(2, 8), createdAt: at(m(2, 1), '09:00'), paidAt: at(m(2, 24), '10:00'), sourceQuoteId: null },
      // Revenue: strong two months ago, weaker last month.
      { id: 'sample-inv-5', number: 'INV-1030', status: 'Paid', clientId: 'sample-client-nguyen', clientName: 'Tom Nguyen', total: 6200, gst: 563.64, dueDate: m(2, 14), createdAt: at(m(2, 1), '09:00'), paidAt: at(m(2, 12), '10:00'), sourceQuoteId: null },
      { id: 'sample-inv-6', number: 'INV-1039', status: 'Paid', clientId: 'sample-client-smith', clientName: 'Sarah Smith', total: 3100, gst: 281.82, dueDate: m(1, 14), createdAt: at(m(1, 1), '09:00'), paidAt: at(m(1, 13), '10:00'), sourceQuoteId: null },
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
      // Jake worked yesterday (clocked in 20 minutes late) and is working today.
      { id: 'sample-shift-jake-1', date: addDays(today, -1), start: '07:00', end: '15:00', employeeIds: ['sample-emp-jake'], jobId: null, jobType: 'Pressure Wash', location: 'Capalaba' },
      { id: 'sample-shift-jake-2', date: today, start: '07:00', end: '15:00', employeeIds: ['sample-emp-jake'], jobId: null, jobType: 'Window Clean', location: 'Cleveland' },
      // Mia is double-booked the day after tomorrow.
      { id: 'sample-shift-1', date: addDays(today, 2), start: '08:00', end: '12:00', employeeIds: ['sample-emp-mia'], jobId: null, jobType: 'Office clean', location: 'Capalaba' },
      { id: 'sample-shift-2', date: addDays(today, 2), start: '11:00', end: '15:00', employeeIds: ['sample-emp-mia'], jobId: null, jobType: 'End of lease', location: 'Cleveland' },
    ],
    payslips: [],
    superPayments: [],
    expenses: [
      { id: 'sample-exp-1', date: addDays(today, -6), amount: 330, category: 'Equipment & tools', description: 'Hose reel' },
    ],
    // Jake: weekdays 6am–4pm. Mia: mornings only, Monday to Saturday.
    availability: {
      'sample-emp-jake': [0, 1, 2, 3, 4, 5, 6].map((d) => ({ available: d < 5, start: '06:00', end: '16:00' })),
      'sample-emp-mia': [0, 1, 2, 3, 4, 5, 6].map((d) => ({ available: d < 6, start: '07:00', end: '12:00' })),
    },
    clockSessions: [
      { id: 'sample-clock-1', employeeId: 'sample-emp-jake', start: at(addDays(today, -1), '07:20'), end: at(addDays(today, -1), '15:05') },
      { id: 'sample-clock-2', employeeId: 'sample-emp-jake', start: at(today, '06:58'), end: null },
    ],
    qualifications: [
      { id: 'sample-qual-1', employeeId: 'sample-emp-jake', name: 'White Card', expiryDate: addDays(today, 20) },
      { id: 'sample-qual-2', employeeId: 'sample-emp-mia', name: 'First Aid Certificate', expiryDate: addDays(today, -5) },
      { id: 'sample-qual-3', employeeId: 'sample-emp-mia', name: 'White Card', expiryDate: null },
    ],
    jobReports: [
      { id: 'sample-report-1', employeeId: 'sample-emp-jake', date: m(1, 17), jobTitle: 'Deck restore', location: '3 Bay Rd, Cleveland', outcome: 'Minor issues', notes: 'Two coats of oil done. Client happy with the colour.', issues: 'Cracked board near the back step. Told the client; may need replacing.', completed: true, submittedAt: at(m(1, 17), '15:30') },
      { id: 'sample-report-2', employeeId: 'sample-emp-jake', date: addDays(today, -1), jobTitle: 'Pressure Wash', location: 'Capalaba', outcome: 'Went well', notes: 'Driveway and paths done.', issues: '', completed: true, submittedAt: at(addDays(today, -1), '15:10') },
    ],
    events: [
      { id: 'sample-event-1', type: 'delivery', title: 'Bunnings delivery', date: tomorrow, start: '07:30', end: '08:00', allDay: false, address: '12 Depot St, Capalaba', supplier: 'Bunnings', deliveryItems: 'Decking oil x2, sugar soap', notes: '' },
    ],
    contractorInvoices: [
      { id: 'sample-cinv-1', employeeId: 'sample-emp-mia', number: 'MC-014', invoiceDate: addDays(today, -2), dueDate: addDays(today, 12), status: 'sent', total: 880, gst: 80, paidAt: null },
      { id: 'sample-cinv-2', employeeId: 'sample-emp-mia', number: 'MC-013', invoiceDate: addDays(today, -9), dueDate: addDays(today, 5), status: 'approved', total: 1320, gst: 120, paidAt: null },
    ],
    transactions: [...materials, ...detergent, ...fuel, ...subs, ...jobCosts, ...unusual, ...tools],
    transactionsConnected: true,
  };
}
