// "Export for my accountant": for a date range, makes
//   - a PDF report (totals, income, expenses with categories and GST, wages),
//   - a CSV spreadsheet of the same rows,
//   - a zip of every receipt, named by date and supplier,
// then opens an email with all three attached (or the share sheet, with
// everything in one zip, when there's no email app or it's too big to email).
import { zipSync, type Zippable } from 'fflate';
import { File, Paths } from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { INCOME_CATEGORY, TRANSFERS_CATEGORY, type TransactionItem } from '@/data/bank';
import type { BusinessProfile } from '@/data/business';
import { formatShortDate } from '@/data/employee-roster';
import { employeeFullName, type Employee } from '@/data/employees';
import { WAGES_CATEGORY } from '@/data/finance';
import { docTotals, type SalesDoc } from '@/data/invoices';
import { formatMoney, type PayslipRecord } from '@/data/payroll';
import { indexReceipts, needsReceipt, receiptFileUrl, receiptFor, type Receipt } from '@/data/receipts';
import { fromDateKey, toDateKey } from '@/data/shifts';
import { escapeHtml } from '@/lib/share-pdf';

/** Emails over this size are often refused, so bigger exports go to the share sheet instead. */
const EMAIL_LIMIT_BYTES = 20 * 1024 * 1024;

export type ExportRange = { start: Date; end: Date; label: string };

export type ExportInput = {
  range: ExportRange;
  business: BusinessProfile | null;
  items: TransactionItem[];
  receipts: Receipt[];
  payslips: PayslipRecord[];
  employees: Employee[];
  docs: SalesDoc[];
  bankConnected: boolean;
};

type Row = {
  type: 'Income' | 'Expense' | 'Wages';
  date: Date;
  description: string;
  category: string;
  /** Including GST. Wages: gross pay. */
  amount: number;
  gst: number | null;
  taxWithheld?: number;
  super?: number;
  /** Yes / Missing / Not needed */
  receipt: string;
  receiptFile: string;
};

const round = (n: number) => Math.round(n * 100) / 100;
const inRange = (d: Date, r: ExportRange) => d >= r.start && d < r.end;
const safeName = (text: string) => text.replace(/[\\/:*?"<>|#%&{}$!'@+`=]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

/** "1 Jul 2025 – 30 Jun 2026" */
export function rangeText(r: ExportRange) {
  const last = new Date(r.end.getTime() - 24 * 60 * 60 * 1000);
  return `${formatShortDate(r.start)} – ${formatShortDate(last)}`;
}

/** Works out every row of the report. Also the receipt files to put in the zip. */
export function buildRows(input: ExportInput) {
  const { range, items, receipts, payslips, employees, docs, bankConnected } = input;
  const index = indexReceipts(receipts);
  const rows: Row[] = [];
  const files: { receipt: Receipt; name: string }[] = [];
  const usedNames = new Set<string>();

  const fileNameFor = (receipt: Receipt, date: Date, supplier: string) => {
    const ext = receipt.fileType === 'pdf' ? 'pdf' : 'jpg';
    const base = `${toDateKey(date)} ${safeName(supplier) || 'Receipt'}`;
    let name = `${base}.${ext}`;
    for (let n = 2; usedNames.has(name); n++) name = `${base} (${n}).${ext}`;
    usedNames.add(name);
    files.push({ receipt, name });
    return name;
  };

  const periodItems = items.filter((i) => inRange(i.date, range) && i.category !== TRANSFERS_CATEGORY);
  const periodPayslips = payslips.filter((p) => inRange(p.paidAt ? new Date(p.paidAt) : fromDateKey(p.payDate ?? p.periodEnd), range));

  // Income: from the bank when it's connected (so paid invoices aren't counted twice), otherwise paid invoices.
  if (bankConnected) {
    for (const i of periodItems.filter((i) => i.amount > 0)) {
      rows.push({ type: 'Income', date: i.date, description: i.title, category: i.category, amount: i.amount, gst: null, receipt: '', receiptFile: '' });
    }
  } else {
    for (const d of docs.filter((d) => d.kind === 'invoice' && d.status === 'Paid' && d.paidAt && inRange(new Date(d.paidAt), range))) {
      const totals = docTotals(d.items, d.gstRate);
      rows.push({
        type: 'Income',
        date: new Date(d.paidAt!),
        description: [d.number, d.client.name].filter(Boolean).join(' – ') || 'Invoice',
        category: INCOME_CATEGORY,
        amount: totals.total,
        gst: totals.gst,
        receipt: '',
        receiptFile: '',
      });
    }
  }

  // Expenses: money out (wages from payroll are listed under Wages instead, so not counted twice).
  for (const i of periodItems.filter((i) => i.amount < 0)) {
    if (i.category === WAGES_CATEGORY && periodPayslips.length > 0) continue;
    const isWages = i.category === WAGES_CATEGORY;
    const receipt = receiptFor(i, index);
    const supplier = receipt?.supplier || i.title;
    rows.push({
      type: isWages ? 'Wages' : 'Expense',
      date: i.date,
      description: supplier,
      category: i.category,
      amount: -i.amount,
      gst: receipt?.gst ?? null,
      receipt: receipt || i.expense?.receiptPath ? 'Yes' : needsReceipt(i) ? 'Missing' : 'Not needed',
      receiptFile: receipt ? fileNameFor(receipt, i.date, supplier) : '',
    });
  }

  // Wages from payroll.
  const names = new Map(employees.map((e) => [e.id, employeeFullName(e)]));
  for (const p of periodPayslips) {
    rows.push({
      type: 'Wages',
      date: p.paidAt ? new Date(p.paidAt) : fromDateKey(p.payDate ?? p.periodEnd),
      description: `${names.get(p.employeeId) ?? 'Former employee'} (pay period from ${formatShortDate(fromDateKey(p.periodStart))})`,
      category: WAGES_CATEGORY,
      amount: p.gross,
      gst: null,
      taxWithheld: p.tax,
      super: p.super,
      receipt: 'Not needed',
      receiptFile: '',
    });
  }

  // Receipts in the period not linked to a transaction yet.
  for (const r of receipts) {
    if (r.bankTransactionId || r.expenseId || !r.date) continue;
    const date = fromDateKey(r.date);
    if (!inRange(date, range)) continue;
    rows.push({
      type: 'Expense',
      date,
      description: `${r.supplier ?? 'Receipt'} (receipt not matched to a bank transaction)`,
      category: r.category ?? 'Other',
      amount: r.total ?? 0,
      gst: r.gst,
      receipt: 'Yes',
      receiptFile: fileNameFor(r, date, r.supplier ?? 'Receipt'),
    });
  }

  const order = { Income: 0, Expense: 1, Wages: 2 };
  rows.sort((a, b) => order[a.type] - order[b.type] || a.date.getTime() - b.date.getTime());
  return { rows, files };
}

function totalsOf(rows: Row[]) {
  const sum = (list: Row[], pick: (r: Row) => number) => round(list.reduce((s, r) => s + pick(r), 0));
  const income = rows.filter((r) => r.type === 'Income');
  const expenses = rows.filter((r) => r.type === 'Expense');
  const wages = rows.filter((r) => r.type === 'Wages');
  return {
    income: sum(income, (r) => r.amount),
    incomeGst: sum(income, (r) => r.gst ?? 0),
    expenses: sum(expenses, (r) => r.amount),
    gstCredits: sum(expenses, (r) => r.gst ?? 0),
    wages: sum(wages, (r) => r.amount),
    taxWithheld: sum(wages, (r) => r.taxWithheld ?? 0),
    super: sum(wages, (r) => r.super ?? 0),
    missing: expenses.filter((r) => r.receipt === 'Missing').length,
  };
}

const csvCell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function buildCsv(rows: Row[]) {
  const header = ['Type', 'Date', 'Description', 'Category', 'Amount (incl. GST)', 'GST', 'Tax withheld', 'Super', 'Receipt', 'Receipt file'];
  const lines = rows.map((r) =>
    [
      r.type,
      toDateKey(r.date),
      r.description,
      r.category,
      r.amount.toFixed(2),
      r.gst === null ? '' : r.gst.toFixed(2),
      r.taxWithheld === undefined ? '' : r.taxWithheld.toFixed(2),
      r.super === undefined ? '' : r.super.toFixed(2),
      r.receipt,
      r.receiptFile,
    ]
      .map(csvCell)
      .join(','),
  );
  // The byte order mark lets Excel open the file with the right characters.
  return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`;
}

export function buildReportHtml(input: ExportInput, rows: Row[]) {
  const t = totalsOf(rows);
  const name = input.business?.businessName || 'Your business';
  const abn = input.business?.abn ? `ABN ${escapeHtml(input.business.abn)}` : '';
  const money = (n: number | null | undefined) => (n === null || n === undefined ? '' : escapeHtml(formatMoney(n)));
  const table = (type: Row['type'], title: string) => {
    const list = rows.filter((r) => r.type === type);
    if (list.length === 0) return `<h2>${title}</h2><p class="muted">None in this period.</p>`;
    const wages = type === 'Wages';
    const head = wages
      ? '<th>Date</th><th>Employee</th><th class="n">Gross</th><th class="n">Tax withheld</th><th class="n">Super</th>'
      : `<th>Date</th><th>Description</th><th>Category</th><th class="n">Amount</th><th class="n">GST</th>${type === 'Expense' ? '<th>Receipt</th>' : ''}`;
    const body = list
      .map((r) =>
        wages
          ? `<tr><td>${toDateKey(r.date)}</td><td>${escapeHtml(r.description)}</td><td class="n">${money(r.amount)}</td><td class="n">${money(r.taxWithheld)}</td><td class="n">${money(r.super)}</td></tr>`
          : `<tr><td>${toDateKey(r.date)}</td><td>${escapeHtml(r.description)}</td><td>${escapeHtml(r.category)}</td><td class="n">${money(r.amount)}</td><td class="n">${money(r.gst)}</td>${
              type === 'Expense' ? `<td class="${r.receipt === 'Missing' ? 'warn' : ''}">${escapeHtml(r.receipt)}</td>` : ''
            }</tr>`,
      )
      .join('');
    return `<h2>${title}</h2><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  };

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111827; font-size: 10px; margin: 28px; }
    h1 { font-size: 20px; margin: 0; }
    h2 { font-size: 14px; margin: 22px 0 6px; color: #1E3A8A; }
    .muted { color: #6B7280; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; }
    .box { border: 1px solid #E5E7EB; border-radius: 8px; padding: 8px; }
    .box b { display: block; font-size: 13px; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; background: #F3F4F6; padding: 5px 6px; font-size: 9px; }
    td { border-bottom: 1px solid #E5E7EB; padding: 4px 6px; vertical-align: top; }
    .n { text-align: right; white-space: nowrap; }
    .warn { color: #B45309; font-weight: 700; }
  </style></head><body>
    <h1>${escapeHtml(name)}</h1>
    <div class="muted">${abn}</div>
    <p><b>Report for your accountant</b> · ${escapeHtml(input.range.label)} (${escapeHtml(rangeText(input.range))})</p>
    <div class="summary">
      <div class="box">Income<b>${money(t.income)}</b></div>
      <div class="box">Expenses<b>${money(t.expenses)}</b></div>
      <div class="box">GST on expenses (from receipts)<b>${money(t.gstCredits)}</b></div>
      <div class="box">Wages (gross)<b>${money(t.wages)}</b></div>
      <div class="box">Tax withheld (PAYG)<b>${money(t.taxWithheld)}</b></div>
      <div class="box">Super<b>${money(t.super)}</b></div>
      <div class="box">GST on income<b>${t.incomeGst ? money(t.incomeGst) : '<span class="muted">See invoices</span>'}</b></div>
      <div class="box">Receipts missing (over $82.50)<b class="${t.missing ? 'warn' : ''}">${t.missing}</b></div>
    </div>
    ${table('Income', 'Income')}
    ${table('Expense', 'Expenses')}
    ${table('Wages', 'Wages')}
    <p class="muted" style="margin-top:18px">Made with NexGain on ${escapeHtml(formatShortDate(new Date()))}. Amounts include GST.
    GST on expenses is taken from the receipts; it's blank where there's no receipt or the receipt didn't show it.
    Receipt photos are in the attached zip, named by date and supplier.</p>
  </body></html>`;
}

export type ExportProgress = (text: string) => void;

/** Makes the files and opens an email (or the share sheet). Returns how it was sent. */
export async function exportForAccountant(input: ExportInput, onProgress: ExportProgress): Promise<'email' | 'share'> {
  const { rows, files } = buildRows(input);
  const fyName = safeName(input.range.label);
  const base = `${safeName(input.business?.businessName || 'NexGain')} ${fyName}`;

  onProgress('Making the PDF report…');
  const { uri: printed } = await Print.printToFileAsync({ html: buildReportHtml(input, rows), width: 595, height: 842 });
  const pdf = new File(Paths.cache, `${base} report.pdf`);
  await new File(printed).move(pdf, { overwrite: true });

  onProgress('Making the spreadsheet…');
  const csv = new File(Paths.cache, `${base} transactions.csv`);
  csv.create({ overwrite: true });
  csv.write(buildCsv(rows));

  const zipContents: Zippable = {};
  for (let i = 0; i < files.length; i++) {
    onProgress(`Adding receipts (${i + 1} of ${files.length})…`);
    try {
      const res = await fetch(await receiptFileUrl(files[i].receipt.filePath));
      if (!res.ok) continue;
      // Photos and PDFs are already compressed, so they're stored as they are (level 0).
      zipContents[`Receipts/${files[i].name}`] = [new Uint8Array(await res.arrayBuffer()), { level: 0 }];
    } catch {
      // A receipt that can't be downloaded is left out; the rest still go.
    }
  }

  onProgress('Packing the files…');
  const receiptsZip = new File(Paths.cache, `${base} receipts.zip`);
  receiptsZip.create({ overwrite: true });
  receiptsZip.write(zipSync(zipContents));

  const totalSize = (pdf.size ?? 0) + (csv.size ?? 0) + (receiptsZip.size ?? 0);
  const subject = `${input.business?.businessName || 'Business'} – records for ${input.range.label}`;
  const body = `Hi,\n\nHere are our records for ${input.range.label} (${rangeText(input.range)}):\n- the PDF report\n- the spreadsheet (CSV) of income, expenses (with categories and GST) and wages\n- a zip of the receipts, named by date and supplier\n\nThanks!`;

  if (totalSize < EMAIL_LIMIT_BYTES && (await MailComposer.isAvailableAsync())) {
    await MailComposer.composeAsync({ subject, body, attachments: [pdf.uri, csv.uri, receiptsZip.uri] });
    return 'email';
  }

  // No email app set up, or too big to email: everything in one zip for the share sheet
  // (Gmail, Outlook, Google Drive, Save to Files...).
  onProgress('Packing everything into one file…');
  const everything = new File(Paths.cache, `${base} for accountant.zip`);
  everything.create({ overwrite: true });
  everything.write(
    zipSync({
      ...zipContents,
      [pdf.name]: [await pdf.bytes(), { level: 0 }],
      [csv.name]: await csv.bytes(),
    }),
  );
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(everything.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive', dialogTitle: subject });
  return 'share';
}
