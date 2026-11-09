// SAMPLE bank data for the Transactions page while the bank feed isn't live.
// Shown only when the owner taps "Preview with sample data" (development
// builds), kept in the app's memory and never saved. Dates are worked out from
// today, so the sample always looks current.
import type { BankAccount, BankTransaction } from '@/data/bank';

import type { ProductPurchase } from '../../supabase/functions/_shared/ai/products';
import type { JobOption, UnpaidInvoice } from '../../supabase/functions/_shared/ai/sorting';

const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n: number, now: Date) => key(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
/** A day in an earlier month (0 = this month), never in the future. */
const monthDay = (monthsBack: number, day: number, now: Date) => {
  const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, day);
  return d > now ? key(now) : key(d);
};

export type SampleBank = {
  accounts: BankAccount[];
  transactions: BankTransaction[];
  invoices: UnpaidInvoice[];
  jobs: JobOption[];
  /** Contractors' names (payments to them are Labour). */
  contractorNames: string[];
  /** Products from receipts: the same 20L chlorine, $20 last month and $24 this week. */
  purchases: ProductPurchase[];
};

export function buildSampleBank(now = new Date()): SampleBank {
  const account: BankAccount = { id: 'sample-account', name: 'Business Everyday', institution: 'Sample Bank', maskedNumber: '•••• 4321', balance: 12_480.55, currency: 'AUD' };
  let n = 0;
  const txn = (date: string, amount: number, description: string, merchant: string | null = null, bankCategory: string | null = null): BankTransaction => ({
    id: `sample-bank-${++n}`,
    accountId: account.id,
    date,
    description,
    amount,
    merchant,
    category: 'Other',
    categorySource: 'auto',
    bankCategory,
    confidence: null,
    categoryMethod: null,
    jobId: null,
    invoiceId: null,
    invoiceMatchedBy: null,
    categoryReviewDone: false,
    jobReviewDone: false,
    invoiceReviewDone: false,
  });

  const list: BankTransaction[] = [];
  // Fuel: about weekly, more this month (two trips out to Ipswich).
  for (const m of [3, 2, 1]) {
    list.push(
      txn(monthDay(m, 3, now), -92.4, 'AMPOL CAPALABA 4157', 'Ampol'),
      txn(monthDay(m, 11, now), -88.1, 'BP CONNECT CLEVELAND', 'BP'),
      txn(monthDay(m, 19, now), -95.6, 'SHELL COLES EXPRESS WYNNUM', 'Shell'),
      txn(monthDay(m, 26, now), -90.0, '7-ELEVEN 2231 BIRKDALE', '7-Eleven'),
    );
  }
  list.push(
    txn(daysAgo(1, now), -96.2, 'AMPOL CAPALABA 4157', 'Ampol'),
    txn(daysAgo(4, now), -61.35, 'CALTEX IPSWICH', 'Caltex'),
    txn(daysAgo(6, now), -58.9, 'BP IPSWICH SOUTH', 'BP'),
    txn(daysAgo(9, now), -91.7, 'SHELL COLES EXPRESS WYNNUM', 'Shell'),
    txn(daysAgo(13, now), -89.0, '7-ELEVEN 2231 BIRKDALE', '7-Eleven'),
  );
  // Materials.
  for (const m of [3, 2, 1]) {
    list.push(
      txn(monthDay(m, 5, now), -412.5, 'BUNNINGS 6342 CAPALABA', 'Bunnings'),
      txn(monthDay(m, 17, now), -186.0, 'MITRE 10 CLEVELAND', 'Mitre 10'),
    );
  }
  list.push(
    txn(daysAgo(2, now), -380.0, 'BUNNINGS 6342 CAPALABA', 'Bunnings'),
    txn(daysAgo(8, now), -142.3, 'SQ *THE BRICK SHED 8812', null, null),
  );
  // Tools.
  list.push(
    txn(monthDay(2, 14, now), -329.0, 'TOTAL TOOLS 0219 BRISBANE', 'Total Tools'),
    txn(daysAgo(10, now), -89.95, 'SYDNEY TOOLS SLACKS CREEK', 'Sydney Tools'),
  );
  // Vehicle.
  list.push(
    txn(monthDay(2, 21, now), -812.4, 'TMR REGO RENEWAL ONLINE', null),
    txn(daysAgo(12, now), -265.0, 'CAPALABA MECHANIC & TYRES', null),
    txn(daysAgo(3, now), -14.6, 'LINKT TOLL TOPUP', 'Linkt'),
  );
  // Labour: wages and a contractor.
  for (const m of [3, 2, 1]) list.push(txn(monthDay(m, 15, now), -1840.0, 'PAYROLL WAGES BATCH', null));
  list.push(
    txn(daysAgo(5, now), -1890.0, 'PAYROLL WAGES BATCH', null),
    txn(daysAgo(7, now), -660.0, 'OSKO PAYMENT MIA CHEN', null),
  );
  // Other: phone, insurance, software.
  for (const m of [3, 2, 1, 0]) {
    list.push(
      txn(monthDay(m, 1, now), -79.0, 'TELSTRA MOBILE BILL', 'Telstra'),
      txn(monthDay(m, 2, now), -70.0, 'XERO AUSTRALIA PTY LTD', 'Xero'),
    );
  }
  list.push(txn(monthDay(1, 9, now), -142.0, 'NRMA INSURANCE MONTHLY', 'NRMA'));
  // Not sure what these were for: "Needs review".
  list.push(
    txn(daysAgo(3, now), -240.0, 'JS ENTERPRISES PTY LTD', null),
    txn(daysAgo(11, now), -54.99, 'PAYPAL *EBAY MARKETPLACE', null),
  );
  // A transfer between the owner's own accounts (not counted).
  list.push(txn(daysAgo(14, now), -2000.0, 'TRANSFER TO SAVINGS 9921', null));
  // Money in: one clear invoice match, one that could be two invoices, one unmatched.
  list.push(
    txn(daysAgo(1, now), 1320.0, 'OSKO DEPOSIT T NGUYEN REF INV-2003', null),
    txn(daysAgo(2, now), 500.0, 'DIRECT CREDIT J SMITH', null),
    txn(daysAgo(6, now), 250.0, 'OSKO DEPOSIT M PATEL', null),
    txn(monthDay(1, 20, now), 3100.0, 'OSKO DEPOSIT LEE PROPERTY', null),
  );

  return {
    accounts: [account],
    transactions: list.sort((a, b) => b.date.localeCompare(a.date)),
    invoices: [
      { id: 'sample-inv-2001', number: 'INV-2001', clientName: 'Jane Smith', total: 500, reference: 'INV-2001' },
      { id: 'sample-inv-2002', number: 'INV-2002', clientName: 'Lewis Smith', total: 500, reference: 'INV-2002' },
      { id: 'sample-inv-2003', number: 'INV-2003', clientName: 'Tom Nguyen', total: 1320, reference: 'INV-2003' },
    ],
    jobs: [
      { id: 'sample-job-deck', label: 'Smith deck', date: daysAgo(1, now), status: 'scheduled', suburb: 'Capalaba' },
      { id: 'sample-job-ipswich-1', label: 'Brown house wash', date: daysAgo(4, now), status: 'completed', suburb: 'Ipswich' },
      { id: 'sample-job-ipswich-2', label: 'Patel gutters', date: daysAgo(6, now), status: 'completed', suburb: 'Ipswich' },
    ],
    contractorNames: ['Mia Chen'],
    purchases: [
      { receiptId: 'sample-receipt-1', date: monthDay(1, 12, now), supplier: 'Bunnings', description: 'Liquid Chlorine 20L', quantity: 1, unitPrice: 20 },
      { receiptId: 'sample-receipt-1', date: monthDay(1, 12, now), supplier: 'Bunnings', description: 'Treated pine 90x45 2.4m', quantity: 6, unitPrice: 12.5 },
      { receiptId: 'sample-receipt-2', date: daysAgo(2, now), supplier: 'Bunnings', description: 'LIQUID CHLORINE 20 LITRE', quantity: 2, unitPrice: 24 },
      { receiptId: 'sample-receipt-2', date: daysAgo(2, now), supplier: 'Bunnings', description: 'Treated Pine 90x45 2.4m', quantity: 10, unitPrice: 12.5 },
    ],
  };
}
