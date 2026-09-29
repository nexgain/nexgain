import * as MailComposer from 'expo-mail-composer';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';

import { formatShortDate } from '@/data/employee-roster';
import { businessStore, type BusinessProfile } from '@/data/business';
import { docTotals, gstLabel, lineAmount, type BusinessPayment, type SalesDoc } from '@/data/invoices';
import { formatMoney } from '@/data/payroll';
import { fromDateKey } from '@/data/shifts';

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
      ? `<h3>Payment information</h3>
      <div>Bank: ${escape(payment.bank || '—')}<br>BSB: ${escape(payment.bsb || '—')}<br>
      Account: ${escape(payment.account || '—')}<br>Reference: ${escape(doc.paymentReference || doc.number)}</div>`
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

/**
 * Phone: creates a PDF and opens the share sheet (Save to Files, AirDrop, email...).
 * Web: opens the browser print dialog, where it can be saved as a PDF.
 */
export async function downloadPdf(doc: SalesDoc, payment: BusinessPayment) {
  const html = buildDocHtml(doc, payment);
  if (Platform.OS === 'web') {
    await Print.printToFileAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `${doc.number}.pdf`,
  });
}

/**
 * Hands the document to the phone's share sheet (email, SMS...) as a PDF. On web,
 * opens an email draft to the client instead, since browsers can't attach files.
 * Nothing is sent from a server until an email service is connected.
 */
export async function sendDoc(doc: SalesDoc, payment: BusinessPayment) {
  if (Platform.OS === 'web') {
    const { total } = docTotals(doc.items, doc.gstRate);
    const kind = doc.kind === 'invoice' ? 'Invoice' : 'Quote';
    const subject = encodeURIComponent(`${kind} ${doc.number}`);
    const body = encodeURIComponent(`Hi${doc.client.name ? ` ${doc.client.name}` : ''},\n\nPlease find ${kind.toLowerCase()} ${doc.number} for ${formatMoney(total)} (inc. GST).\n`);
    await Linking.openURL(`mailto:${encodeURIComponent(doc.client.email)}?subject=${subject}&body=${body}`);
    return;
  }
  await downloadPdf(doc, payment);
}

/**
 * What happened when sending a receipt:
 * - "sent": the mail app confirmed it was sent (iPhone only)
 * - "not_sent": the email was cancelled or saved as a draft
 * - "ask": we can't tell (Android mail, share sheet, web), so ask the user
 */
export type ReceiptSendResult = 'sent' | 'not_sent' | 'ask';

/**
 * Emails the client a receipt PDF for a paid invoice. Uses the phone's mail app when
 * available, otherwise the share sheet (Gmail, Outlook...). On web, opens an email
 * draft, since browsers can't attach files.
 */
export async function sendReceipt(doc: SalesDoc, payment: BusinessPayment): Promise<ReceiptSendResult> {
  const businessName = businessStore.get()?.businessName.trim() ?? '';
  const { total } = docTotals(doc.items, doc.gstRate);
  const firstName = doc.client.name.trim().split(/\s+/)[0] ?? '';
  const subject = `Receipt for Invoice ${doc.number}${businessName ? ` - ${businessName}` : ''}`;
  const body = `Hi${firstName ? ` ${firstName}` : ''}, thanks for your payment of ${formatMoney(total)}. Your receipt is attached.\n\nKind regards,\n${businessName}`;

  if (Platform.OS === 'web') {
    await Linking.openURL(
      `mailto:${encodeURIComponent(doc.client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    );
    return 'ask';
  }

  const { uri } = await Print.printToFileAsync({ html: buildDocHtml(doc, payment, { receipt: true }) });

  if (await MailComposer.isAvailableAsync()) {
    const result = await MailComposer.composeAsync({
      recipients: doc.client.email ? [doc.client.email] : [],
      subject,
      body,
      attachments: [uri],
    });
    // Android always reports "sent", even when cancelled, so only trust it on iPhone.
    if (Platform.OS !== 'ios') return 'ask';
    return result.status === MailComposer.MailComposerStatus.SENT ? 'sent' : 'not_sent';
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: subject,
  });
  return 'ask';
}
