// NexGain Hospitality: SAMPLE data for the Transactions page preview, made to
// look like a real cafe. Shown only when the owner taps "Preview with sample
// data", kept in the app's memory and never saved. Dates are worked out from
// today, so it always looks current.
//
//   * Recorded sales for every day of the last five weeks.
//   * A Square payout the day after each day of sales (fees taken out), and
//     one EFTPOS settlement from the bank. Yesterday's payout of $1,180
//     matches the sales of $1,214 two days ago (fees about $34).
//   * A weekly Uber Eats payout, a cash deposit, suppliers, wages, rent, power.
//   * Invoices: INV-0001 ($1,000, paid), INV-0002 and INV-0003 (both $1,000,
//     unpaid), INV-0004 ($450, overdue), INV-0005 ($2,400 with a $600
//     deposit). A $1,000 payment came in today, so the preview asks "Which
//     invoice is it for?"; a $600 payment asks "Is this the deposit for
//     INV-0005?"; and $500 by direct debit asks "What was this for?".
import type { BankAccount, BankTransaction } from '@/data/bank';
import type { SalesDoc } from '@/data/invoices';

const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export type HospitalitySample = {
  accounts: BankAccount[];
  transactions: BankTransaction[];
  /** Recorded sales per day ("YYYY-MM-DD" -> total). */
  daySales: Map<string, number>;
  invoices: SalesDoc[];
};

/** A typical day's sales by weekday (Sunday first): busy weekends, quiet Tuesdays. */
const DAY_SALES = [1640, 980, 1214, 1105, 1190, 1385, 1720];
const FEE = 0.028; // Square's fees on these sample payouts (about 2.8%, all in).

export function buildHospitalitySample(now = new Date()): HospitalitySample {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ago = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
  const account: BankAccount = { id: 'sample-account', name: 'Cafe Everyday', institution: 'Sample Bank', maskedNumber: '•••• 2468', balance: 18_240.3, currency: 'AUD' };
  let n = 0;
  const txn = (date: Date, amount: number, description: string, merchant: string | null = null, extra: Partial<BankTransaction> = {}): BankTransaction => ({
    id: `sample-hosp-${++n}`,
    accountId: account.id,
    date: key(date),
    description,
    amount,
    merchant,
    category: 'Other',
    categorySource: 'auto',
    bankCategory: null,
    confidence: null,
    categoryMethod: null,
    jobId: null,
    invoiceId: null,
    invoiceMatchedBy: null,
    categoryReviewDone: false,
    jobReviewDone: false,
    invoiceReviewDone: false,
    ...extra,
  });

  // Recorded sales, and the Square payout the next day.
  const daySales = new Map<string, number>();
  const list: BankTransaction[] = [];
  for (let d = 35; d >= 1; d--) {
    const day = ago(d);
    // A little different each week, but two days ago is always $1,214 (a Tuesday-like day).
    const sales = d === 2 ? 1214 : Math.round(DAY_SALES[day.getDay()] * (1 + ((d * 7) % 11) / 100 - 0.05));
    daySales.set(key(day), sales);
    const payoutDay = ago(d - 1);
    // Two days ago's sales: $1,180 (fees about $34). One payout is missing (the "check for missing payouts" insight).
    if (d === 9) continue;
    const payout = d === 2 ? 1180 : Math.round(sales * (1 - FEE) * 100) / 100;
    if (d === 16) list.push(txn(payoutDay, payout, 'EFTPOS SETTLEMENT 0099 MERCHANT', 'Bank EFTPOS'));
    else list.push(txn(payoutDay, payout, 'SQUARE AUSTRALIA PTY LTD SQ SETTLEMENT', 'Square'));
  }

  // Uber Eats every Monday-ish, a cash deposit.
  for (const d of [3, 10, 17, 24, 31]) list.push(txn(ago(d), 360 + ((d * 13) % 90), 'UBER EATS AUSTRALIA PAYMENT', 'Uber Eats'));
  list.push(txn(ago(6), 640, 'CASH DEPOSIT BRANCH 112', null));

  // Suppliers.
  for (const d of [2, 9, 16, 23, 30]) {
    list.push(txn(ago(d), -(820 + ((d * 17) % 140)), 'BIDFOOD BRISBANE 4401', 'Bidfood'));
    list.push(txn(ago(d + 1), -(186 + ((d * 5) % 30)), 'PAULS MILK DELIVERY', 'Pauls'));
  }
  for (const d of [5, 19, 33]) list.push(txn(ago(d), -412.5, 'CAMPOS COFFEE PTY LTD', 'Campos Coffee'));
  for (const d of [4, 11, 18, 25]) list.push(txn(ago(d), -(148 + d), 'SUNNY BREAD CO', null));
  list.push(
    txn(ago(7), -96.8, 'COLES 0423 PADDINGTON', 'Coles'),
    txn(ago(12), -264.0, 'COCA-COLA EUROPACIFIC', 'Coca-Cola'),
    txn(ago(14), -318.6, 'BIOPAK PTY LTD', 'BioPak'),
    txn(ago(20), -142.0, 'ECOLAB PTY LTD', 'Ecolab'),
    txn(ago(26), -89.9, 'BUNNINGS 6342 NEWSTEAD', 'Bunnings'),
    // NexGain can't tell what this was: "What was it for?"
    txn(ago(5), -220, 'PAYMENT TO J NGUYEN 4471', null),
  );

  // Wages (weekly), rent, power, phone.
  for (const d of [1, 8, 15, 22, 29]) list.push(txn(ago(d), -(4180 + ((d * 31) % 400)), 'PAYROLL WAGES WEEKLY', null));
  list.push(
    txn(ago(10), -5200, 'RENT - GREEN PROPERTY GROUP', null),
    txn(ago(13), -684.2, 'ORIGIN ENERGY 8812 ELECTRICITY', 'Origin Energy'),
    txn(ago(21), -129.0, 'TELSTRA BUSINESS', 'Telstra'),
  );

  // Invoices (catering and functions), all with GST: 40 guests at $25 = $1,000.
  const created = (d: number) => ago(d).toISOString();
  const due = (d: number) => key(ago(d));
  const line = (description: string, qty: number, priceIncGst: number) => ({
    id: `line-${description}`,
    description,
    qty,
    rate: Math.round((priceIncGst / 1.1) * 10000) / 10000,
  });
  const doc = (id: string, number: string, status: SalesDoc['status'], name: string, business: string, items: SalesDoc['items'], createdDay: number, dueDay: number, extra: Partial<SalesDoc> = {}): SalesDoc => ({
    id,
    kind: 'invoice',
    number,
    status,
    client: { name, email: `${name.split(' ')[0].toLowerCase()}@example.com`, phone: '', address: '', business },
    jobType: null,
    jobDate: null,
    description: '',
    items,
    dueDate: due(dueDay),
    paymentReference: number,
    gstRate: 0.1,
    createdAt: created(createdDay),
    hospitality: { deposit: null, depositPaid: false, depositPaidAt: null, paidMethod: null },
    ...extra,
  });
  const invoices: SalesDoc[] = [
    doc('sample-inv-0001', 'INV-0001', 'Paid', 'Jane Lee', '', [line('Birthday lunch, 40 guests', 40, 25)], 28, 21, {
      paidAt: ago(16).toISOString(),
      description: 'Jane’s 40th, Sat lunch',
      hospitality: { deposit: null, depositPaid: false, depositPaidAt: null, paidMethod: 'Bank transfer' },
    }),
    doc('sample-inv-0002', 'INV-0002', 'Pending', 'Sam Smith', 'Smith Co', [line('Office catering platters', 20, 50)], 9, -3, {
      description: 'Smith Co staff morning tea',
    }),
    doc('sample-inv-0003', 'INV-0003', 'Pending', 'Mia Brown', 'Brown Family', [line('Function, 40 guests', 40, 25)], 7, -5, {
      description: 'Engagement party, Sat night',
    }),
    doc('sample-inv-0004', 'INV-0004', 'Pending', 'Leo Chen', 'Chen Dental', [line('Lunch platters', 9, 50)], 25, 11),
    doc('sample-inv-0005', 'INV-0005', 'Pending', 'Ava Wilson', 'Wilson Events', [line('Wedding canapés', 120, 15), line('Room hire', 1, 600)], 4, -20, {
      description: 'Wedding reception, 120 guests',
      hospitality: { deposit: 600, depositPaid: false, depositPaidAt: null, paidMethod: null },
    }),
  ];

  // Money in for the invoices.
  list.push(
    // INV-0001's payment, already linked.
    txn(ago(16), 1000, 'DIRECT CREDIT J LEE PAYMENT', null, {
      category: 'Catering & functions',
      categorySource: 'owner',
      categoryMethod: 'owner',
      confidence: 1,
      categoryReviewDone: true,
      invoiceId: 'sample-inv-0001',
      invoiceMatchedBy: 'owner',
      invoiceReviewDone: true,
    }),
    // Two unpaid $1,000 invoices: "Which invoice is it for?"
    txn(ago(0), 1000, 'DIRECT CREDIT 448812 PAYMENT', null),
    // INV-0005's deposit: "Is this the deposit for INV-0005?"
    txn(ago(1), 600, 'OSKO PAYMENT WILSON EVENTS DEPOSIT', null),
    // Matches nothing: "We got $500 by direct debit. What was this for?"
    txn(ago(3), 500, 'DIRECT DEBIT 087123 M PATEL', null),
  );

  return { accounts: [account], transactions: list.sort((a, b) => b.date.localeCompare(a.date)), daySales, invoices };
}
