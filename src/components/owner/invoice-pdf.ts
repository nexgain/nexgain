import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { formatShortDate } from '@/data/employee-roster';
import { businessStore, type BusinessProfile } from '@/data/business';
import {
  docNumberLabel,
  docTotals,
  gstLabel,
  lineAmount,
  quoteLinkToken,
  type BusinessPayment,
  type SalesDoc,
} from '@/data/invoices';
import { formatMoney } from '@/data/payroll';
import { fromDateKey } from '@/data/shifts';
import { openEmailDraft, type EmailResult } from '@/lib/email';

function escape(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

const dateText = (key: string | null) => (key ? formatShortDate(fromDateKey(key)) : '—');
const paidDateText = (doc: SalesDoc) => (doc.paidAt ? formatShortDate(new Date(doc.paidAt)) : '—');

type HtmlOptions = {
  /** Receipt version of a paid invoice: same design, with paid details instead of payment instructions. */
  receipt?: boolean;
};

/** Quotes: business logo and details top right, with the quote number small underneath. */
function quoteHeader(doc: SalesDoc, business: BusinessProfile | null) {
  const name = business?.businessName.trim() ?? '';
  const number = doc.number.replace(/^[A-Z]+-/, '#'); // "Q-0001" -> "#0001"
  return `<div class="quote-biz">
      ${business?.logo ? `<img class="logo" src="${escape(business.logo)}" alt="">` : ''}
      ${name ? `<div class="biz-name">${escape(name)}</div>` : ''}
      ${business?.abn ? `<div class="muted">ABN ${escape(business.abn)}</div>` : ''}
      ${business?.email ? `<div class="muted">${escape(business.email)}</div>` : ''}
      <div class="doc-number">Quote ${escape(number)}</div>
    </div>`;
}

/** Invoices and receipts: business logo and details top left, then the title. */
function invoiceHeader(doc: SalesDoc, business: BusinessProfile | null, receipt: boolean) {
  const biz = business
    ? `<div class="biz">${business.logo ? `<img src="${business.logo}" alt="">` : ''}<div><strong>${escape(business.businessName)}</strong>${business.abn ? `<br>ABN ${escape(business.abn)}` : ''}${business.email ? `<br>${escape(business.email)}` : ''}</div></div>`
    : '';
  if (receipt) {
    return `${biz}<div class="title-row"><h1>Receipt for ${escape(doc.number)}</h1><span class="paid-badge">PAID</span></div>`;
  }
  return `${biz}<h1>Invoice ${escape(doc.number)}</h1>`;
}

export function buildDocHtml(doc: SalesDoc, payment: BusinessPayment, { receipt = false }: HtmlOptions = {}) {
  const { subtotal, gst, total } = docTotals(doc.items, doc.gstRate);
  const business = businessStore.get();
  const header = doc.kind === 'quote' ? quoteHeader(doc, business) : invoiceHeader(doc, business, receipt);
  const dateLine = receipt
    ? `Paid: ${paidDateText(doc)}`
    : `${doc.kind === 'invoice' ? 'Due' : 'Valid until'}: ${dateText(doc.dueDate)}`;
  const paymentSection = receipt
    ? `<h3>Payment received</h3>
      <div>Amount paid: ${formatMoney(total)}<br>Date paid: ${paidDateText(doc)}<br>
      Reference: ${escape(doc.paymentReference || doc.number)}</div>`
    : doc.kind === 'invoice'
      ? `<h3>Payment details</h3>
      <div>Account name: ${escape(payment.accountName || '—')}<br>BSB: ${escape(payment.bsb || '—')}<br>
      Account number: ${escape(payment.account || '—')}<br>${payment.bank ? `Bank: ${escape(payment.bank)}<br>` : ''}
      Reference: ${escape(doc.paymentReference || doc.number)}</div>`
      : '';
  const rows = doc.items
    .map(
      (item) => `<tr>
        <td>${escape(item.description)}</td>
        <td class="num">${item.qty}</td>
        <td class="num">${formatMoney(item.rate)}</td>
        <td class="num">${formatMoney(lineAmount(item))}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; padding: 32px; font-size: 13px; }
    h1 { font-size: 26px; margin: 0; color: #2563eb; }
    .biz { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .biz img { width: 56px; height: 56px; object-fit: contain; border-radius: 8px; }
    .quote-biz { text-align: right; margin-bottom: 16px; }
    .logo { max-width: 160px; max-height: 72px; object-fit: contain; display: block; margin: 0 0 8px auto; }
    .biz-name { font-size: 18px; font-weight: bold; }
    .doc-number { font-size: 12px; color: #555; margin-top: 4px; }
    .muted { color: #555; }
    .row { display: flex; justify-content: space-between; margin: 24px 0; gap: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { text-align: left; border-bottom: 2px solid #ddd; padding: 8px 4px; font-size: 11px; text-transform: uppercase; color: #555; }
    td { border-bottom: 1px solid #eee; padding: 8px 4px; vertical-align: top; }
    .num { text-align: right; white-space: nowrap; }
    .totals { margin-left: auto; width: 260px; margin-top: 16px; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .grand { font-weight: bold; font-size: 16px; border-top: 2px solid #111; margin-top: 4px; padding-top: 8px !important; }
    h3 { margin: 24px 0 8px; font-size: 14px; }
    .title-row { display: flex; align-items: center; gap: 12px; }
    .paid-badge { background: #16a34a; color: #fff; font-weight: bold; font-size: 13px; letter-spacing: 1px; padding: 4px 12px; border-radius: 999px; }
  </style></head><body>
    ${header}
    <div class="muted">${dateLine}</div>
    <div class="row">
      <div>
        <strong>Bill to</strong><br>
        ${escape(doc.client.name || '—')}<br>
        ${doc.client.address ? `${escape(doc.client.address)}<br>` : ''}
        ${doc.client.phone ? `${escape(doc.client.phone)}<br>` : ''}
        ${doc.client.email ? escape(doc.client.email) : ''}
      </div>
      <div>
        <strong>Job</strong><br>
        ${escape(doc.jobType ?? '—')}<br>
        ${dateText(doc.jobDate)}
      </div>
    </div>
    ${doc.description ? `<div class="muted">${escape(doc.description)}</div>` : ''}
    <table>
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted">No items</td></tr>'}</tbody>
    </table>
    <div class="totals">
      <div><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
      <div><span>${gstLabel(doc.gstRate)}</span><span>${formatMoney(gst)}</span></div>
      <div class="grand"><span>Total</span><span>${formatMoney(total)}</span></div>
    </div>
    ${paymentSection}
  </body></html>`;
}

/** Creates the PDF, named e.g. "Quote-0001.pdf" (what the customer sees as the attachment). */
async function makePdf(doc: SalesDoc, payment: BusinessPayment, options: HtmlOptions = {}) {
  const { uri } = await Print.printToFileAsync({ html: buildDocHtml(doc, payment, options) });
  const kind = options.receipt ? 'Receipt' : doc.kind === 'invoice' ? 'Invoice' : 'Quote';
  const name = `${kind}-${doc.number.replace(/^[A-Za-z]+-/, '').replace(/[^\w-]/g, '')}.pdf`;
  try {
    // Make a copy with the nice name and attach that copy. (The printed file stays
    // where it is, so there is always a real file to fall back on.)
    const named = new File(Paths.cache, name);
    if (named.exists) named.delete();
    new File(uri).copy(named);
    return named.exists ? named.uri : uri;
  } catch {
    // Keep the printed file's own name if it can't be renamed.
    return uri;
  }
}

/**
 * Phone: creates a PDF and opens the share sheet (Save to Files, AirDrop...).
 * Web: opens the browser print dialog, where it can be saved as a PDF.
 */
export async function downloadPdf(doc: SalesDoc, payment: BusinessPayment) {
  if (Platform.OS === 'web') {
    await Print.printToFileAsync({ html: buildDocHtml(doc, payment) });
    return;
  }
  const uri = await makePdf(doc, payment);
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `${doc.number}.pdf`,
  });
}

const emailApp = () => businessStore.get()?.emailApp ?? 'other';
const businessName = () => businessStore.get()?.businessName.trim() || 'us';
const greeting = (doc: SalesDoc) => `Hi ${doc.client.name.trim() || 'there'},`;

/** Address of the customer's quote page for this link code. */
export function quotePageLink(token: string) {
  const base = process.env.EXPO_PUBLIC_QUOTE_PAGE_URL;
  if (!base) throw new Error("The quote page address isn't set up (EXPO_PUBLIC_QUOTE_PAGE_URL in .env).");
  return `${base.replace(/\/?$/, '/')}?q=${encodeURIComponent(token)}`;
}

/** The quote email: PDF attached, with a link to the customer's page to accept or decline. */
export function quoteEmailText(doc: SalesDoc, link: string) {
  const business = businessName();
  return {
    subject: `Quote ${docNumberLabel(doc)} from ${business}`,
    body: `${greeting(doc)}\n\nPlease find attached your quote from ${business}. To view and accept or decline this quote, tap the link below:\n\n${link}\n\nThank you!`,
  };
}

/** The invoice email: PDF attached (with the bank details), no link. */
export function invoiceEmailText(doc: SalesDoc) {
  const business = businessName();
  return {
    subject: `Invoice ${docNumberLabel(doc)} from ${business}`,
    body: `${greeting(doc)}\n\nPlease find attached your invoice from ${business}. Payment details are included on the invoice.\n\nThank you!`,
  };
}

/** Creates the quote's link and PDF, then opens the owner's email app ready to send. */
export async function emailQuote(doc: SalesDoc, payment: BusinessPayment): Promise<EmailResult> {
  const link = quotePageLink(await quoteLinkToken(doc.id));
  const attachmentUri = Platform.OS === 'web' ? undefined : await makePdf(doc, payment);
  return openEmailDraft({ to: doc.client.email.trim(), ...quoteEmailText(doc, link), attachmentUri }, emailApp());
}

/** Creates the invoice PDF, then opens the owner's email app ready to send. */
export async function emailInvoice(doc: SalesDoc, payment: BusinessPayment): Promise<EmailResult> {
  const attachmentUri = Platform.OS === 'web' ? undefined : await makePdf(doc, payment);
  return openEmailDraft({ to: doc.client.email.trim(), ...invoiceEmailText(doc), attachmentUri }, emailApp());
}


/** Emails the client a receipt PDF for a paid invoice, from the owner's email app. */
export async function sendReceipt(doc: SalesDoc, payment: BusinessPayment): Promise<EmailResult> {
  const business = businessStore.get()?.businessName.trim() ?? '';
  const { total } = docTotals(doc.items, doc.gstRate);
  const firstName = doc.client.name.trim().split(/\s+/)[0] ?? '';
  const subject = `Receipt for Invoice ${doc.number}${business ? ` - ${business}` : ''}`;
  const body = `Hi${firstName ? ` ${firstName}` : ''}, thanks for your payment of ${formatMoney(total)}. Your receipt is attached.\n\nKind regards,\n${business}`;
  const attachmentUri = Platform.OS === 'web' ? undefined : await makePdf(doc, payment, { receipt: true });
  return openEmailDraft({ to: doc.client.email.trim(), subject, body, attachmentUri }, emailApp());
}
