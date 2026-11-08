// What the AI knows about one business, in plain shapes. Shared by the AI
// Edge Functions (Deno), the app and the tests, so it must not import anything
// Deno- or React-specific. The server fills it from Supabase (see snapshot.ts),
// always for a single business.

/** "YYYY-MM-DD" in the business's time zone. */
export type DateKey = string;

export type InvoiceInfo = {
  id: string;
  number: string;
  /** Stored status: Draft, Pending, Paid (Pending past its due date = overdue). */
  status: string;
  clientId: string | null;
  clientName: string;
  total: number;
  dueDate: DateKey | null;
  createdAt: string;
  paidAt: string | null;
  /** The quote this invoice was made from (links it to a job). */
  sourceQuoteId: string | null;
};

export type QuoteInfo = {
  id: string;
  number: string;
  /** Draft, Sent, Accepted, Booked, Declined */
  status: string;
  clientId: string | null;
  clientName: string;
  total: number;
  jobType: string | null;
  jobDate: DateKey | null;
  createdAt: string;
  respondedAt: string | null;
};

export type JobInfo = {
  id: string;
  title: string;
  address: string;
  clientId: string | null;
  quoteId: string | null;
  /** The quote's number, e.g. "Q-0012", when the job came from a quote. */
  quoteNumber: string | null;
  /** scheduled, assigned, in_progress, completed, cancelled */
  status: string;
  startsAt: string;
  endsAt: string;
  assignedEmployeeIds: string[];
  /** What the client is charged (the quote's total), when known. */
  value: number | null;
};

export type ClientInfo = { id: string; name: string; email: string; phone: string; address: string };

export type EmployeeInfo = {
  id: string;
  name: string;
  role: string;
  employmentType: string;
  status: string;
  payRate: number | null;
  payType: string;
};

export type ShiftInfo = {
  id: string;
  date: DateKey;
  /** "HH:MM" */
  start: string;
  end: string;
  employeeIds: string[];
  jobId: string | null;
  jobType: string;
  location: string;
};

export type PayslipInfo = {
  id: string;
  employeeId: string;
  periodStart: DateKey;
  periodEnd: DateKey;
  payDate: DateKey | null;
  hours: number;
  gross: number;
  tax: number;
  net: number;
  super: number;
  status: string;
};

export type SuperInfo = {
  id: string;
  employeeId: string;
  amount: number;
  dueDate: DateKey;
  status: string;
};

/** Expenses the owner typed in on the Expenses page. */
export type ExpenseInfo = { id: string; date: DateKey; amount: number; category: string; description: string };

/**
 * A bank transaction (from the Transactions page, once it exists).
 * See TRANSACTIONS_AI_LINK.md for where these come from.
 */
export type Transaction = {
  id: string;
  date: DateKey;
  /** Money spent is positive; refunds are negative. */
  amount: number;
  /** As it appears on the bank statement, e.g. "BUNNINGS 6342 CAPALABA". */
  rawMerchant: string;
  /** Cleaned-up supplier name, e.g. "Bunnings" (optional; worked out from rawMerchant if empty). */
  merchant: string | null;
  /** fuel, materials, labour, tools, subscriptions, ... */
  category: string | null;
  jobId: string | null;
  description: string | null;
};

export type BusinessSnapshot = {
  businessId: string;
  businessName: string;
  /** e.g. "AU" */
  country: string | null;
  /** Month the financial year starts (7 = July). */
  financialYearStartMonth: number;
  invoices: InvoiceInfo[];
  quotes: QuoteInfo[];
  jobs: JobInfo[];
  clients: ClientInfo[];
  employees: EmployeeInfo[];
  shifts: ShiftInfo[];
  payslips: PayslipInfo[];
  superPayments: SuperInfo[];
  expenses: ExpenseInfo[];
  /** Bank transactions. Empty until the Transactions page is connected. */
  transactions: Transaction[];
  /** False until the Transactions page is connected (see transactions-adapter.ts). */
  transactionsConnected: boolean;
};

// ---------------------------------------------------------------------------
// Result cards: shown under the AI's answers and on insights
// ---------------------------------------------------------------------------

export type CardType = 'job' | 'invoice' | 'client' | 'team_member' | 'transaction' | 'insight';

/** A small card with real data and buttons that open the real screens. */
export type ResultCard =
  | { type: 'job'; id: string; title: string; reference: string | null; address: string; startsAt: string; status: string; clientName: string; staffNames: string[] }
  | { type: 'invoice'; id: string; number: string; clientName: string; total: number; dueDate: DateKey | null; status: string }
  | { type: 'client'; id: string; name: string; email: string; phone: string; address: string; unpaidTotal: number }
  | { type: 'team_member'; id: string; name: string; role: string; employmentType: string; hoursThisWeek: number | null }
  | { type: 'transaction'; id: string; date: DateKey; merchant: string; rawMerchant: string; amount: number; category: string | null; jobId: string | null }
  | { type: 'insight'; id: string; title: string; summary: string; severity: Severity };

// ---------------------------------------------------------------------------
// Insights ("business health check")
// ---------------------------------------------------------------------------

export type Severity = 'high' | 'medium' | 'low';

/** Which part of the business an insight is about. */
export type InsightArea = 'finance' | 'jobs' | 'team' | 'spending';

/**
 * Where an insight is shown (the existing AI areas):
 * - attention:       "AI Insights & Recommendations" on the Dashboard, and
 *                    "Things that need your attention" on the AI Assistant screen
 * - other:           "Other Insights" on the Dashboard (lower priority)
 * - analytics:       "AI Insights" on the Analytics page (money and trends)
 * - notification:    also sent once to the owner's Notifications (urgent ones)
 */
export type Placement = 'attention' | 'other' | 'analytics' | 'notification';

export type Insight = {
  /** Stays the same while the same problem exists, so it isn't duplicated (e.g. "overdue:<invoice id>"). */
  key: string;
  /** Which check found it, e.g. "overdue_invoices". */
  check: string;
  area: InsightArea;
  severity: Severity;
  placements: Placement[];
  title: string;
  /** What's wrong, with the real numbers. */
  summary: string;
  /** The practical fix. */
  suggestion: string;
  /** Estimated money saved or recovered by acting (when it can be worked out). */
  estimatedSaving: number | null;
  /** Things the insight is about (shown as cards with buttons). */
  related: { type: CardType; id: string }[];
  /** The numbers behind it, for the Analytics page and the AI. */
  metrics: Record<string, number | string | null>;
};
