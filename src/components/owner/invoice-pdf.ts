import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';

import { formatShortDate } from '@/data/employee-roster';
import { docTotals, lineAmount, type BusinessPayment, type SalesDoc } from '@/data/invoices';
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

export function buildDocHtml(doc: SalesDoc, payment: BusinessPayment) {
  const { subtotal, gst, total } = docTotals(doc.items);
  const title = doc.kind === 'invoice' ? 'Invoice' : 'Quote';
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
  </style></head><body>
    <h1>${title} ${escape(doc.number)}</h1>
    <div class="muted">${doc.kind === 'invoice' ? 'Due' : 'Valid until'}: ${dateText(doc.dueDate)}</div>
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
      <div><span>GST (10%)</span><span>${formatMoney(gst)}</span></div>
      <div class="grand"><span>Total</span><span>${formatMoney(total)}</span></div>
    </div>
    ${
      doc.kind === 'invoice'
        ? `<h3>Payment information</h3>
      <div>Bank: ${escape(payment.bank || '—')}<br>BSB: ${escape(payment.bsb || '—')}<br>
      Account: ${escape(payment.account || '—')}<br>Reference: ${escape(doc.paymentReference || doc.number)}</div>`
        : ''
    }
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
    const { total } = docTotals(doc.items);
    const kind = doc.kind === 'invoice' ? 'Invoice' : 'Quote';
    const subject = encodeURIComponent(`${kind} ${doc.number}`);
    const body = encodeURIComponent(`Hi${doc.client.name ? ` ${doc.client.name}` : ''},\n\nPlease find ${kind.toLowerCase()} ${doc.number} for ${formatMoney(total)} (inc. GST).\n`);
    await Linking.openURL(`mailto:${encodeURIComponent(doc.client.email)}?subject=${subject}&body=${body}`);
    return;
  }
  await downloadPdf(doc, payment);
}
