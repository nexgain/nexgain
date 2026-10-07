// A contractor invoice as a single A4 PDF. Used by the contractor (download /
// share) and the owner. Uses the details saved on the invoice when it was sent.
import type { ContractorInvoice } from '@/data/contractor-invoices';
import { formatShortDate } from '@/data/employee-roster';
import { formatAbn } from '@/data/employees';
import { formatMoney } from '@/data/payroll';
import { fromDateKey } from '@/data/shifts';
import { escapeHtml as esc, sharePdf } from '@/lib/share-pdf';

export type InvoiceBank = { accountName: string; bsb: string; accountNumber: string } | null;

const date = (key: string | null) => (key ? formatShortDate(fromDateKey(key)) : '—');

export function buildContractorInvoiceHtml(inv: ContractorInvoice, bank: InvoiceBank) {
  const from = inv.sentDetails;
  const title = inv.gstRegistered ? 'Tax Invoice' : 'Invoice';
  const rows = inv.items
    .map(
      (i) => `<tr><td>${esc(i.description)}</td><td class="num">${i.quantity}</td><td class="num">${formatMoney(i.rate)}</td><td class="num">${formatMoney(i.amount)}</td></tr>`,
    )
    .join('');
  const paid = inv.status === 'paid' && inv.paidAt;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4 portrait; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0F172A; font-size: 12px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 22px; }
    h1 { margin: 0; font-size: 26px; color: #2563EB; }
    .muted { color: #64748B; }
    .num { text-align: right; white-space: nowrap; }
    .paid { display: inline-block; margin-top: 6px; background: #16A34A; color: #fff; font-weight: 700; padding: 4px 12px; border-radius: 999px; letter-spacing: 1px; }
    .parties { display: flex; gap: 24px; margin-bottom: 20px; }
    .parties > div { flex: 1; }
    .label { font-size: 10px; text-transform: uppercase; color: #64748B; font-weight: 700; margin-bottom: 4px; }
    .name { font-size: 15px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; color: #64748B; padding: 8px 4px; border-bottom: 2px solid #E6E9EF; }
    th.num { text-align: right; }
    td { padding: 8px 4px; border-bottom: 1px solid #F1F5F9; vertical-align: top; }
    .totals { margin-left: auto; width: 260px; margin-top: 14px; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .grand { font-size: 16px; font-weight: 800; border-top: 2px solid #0F172A; margin-top: 4px; padding-top: 8px !important; }
    .pay { margin-top: 24px; padding: 14px 16px; border-radius: 10px; background: #F4F6FA; }
    .notes { margin-top: 16px; }
  </style></head><body>
    <div class="top">
      <div>
        <h1>${title}</h1>
        <div class="muted">${esc(inv.number)}</div>
        ${paid ? `<div class="paid">PAID ${esc(formatShortDate(new Date(inv.paidAt!)))}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div><span class="muted">Invoice date:</span> ${esc(date(inv.invoiceDate))}</div>
        <div><span class="muted">Due date:</span> ${esc(date(inv.dueDate))}</div>
      </div>
    </div>
    <div class="parties">
      <div>
        <div class="label">From</div>
        <div class="name">${esc(from?.name ?? '')}</div>
        ${from?.abn ? `<div>ABN ${esc(formatAbn(from.abn))}</div>` : ''}
        ${from?.phone ? `<div>${esc(from.phone)}</div>` : ''}
        ${from?.email ? `<div>${esc(from.email)}</div>` : ''}
      </div>
      <div>
        <div class="label">Bill to</div>
        <div class="name">${esc(from?.billTo ?? '')}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Description</th><th class="num">Qty / Hours</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted">No items</td></tr>'}</tbody>
    </table>
    <div class="totals">
      <div><span>Subtotal</span><span>${formatMoney(inv.subtotal)}</span></div>
      <div><span>${inv.gstRegistered ? 'GST (10%)' : 'GST (not registered)'}</span><span>${formatMoney(inv.gst)}</span></div>
      <div class="grand"><span>Total${inv.gstRegistered ? ' (inc. GST)' : ''}</span><span>${formatMoney(inv.total)}</span></div>
    </div>
    <div class="pay">
      <div class="label">Payment details</div>
      ${
        bank
          ? `<div>Account name: ${esc(bank.accountName)}</div><div>BSB: ${esc(bank.bsb)}</div><div>Account number: ${esc(bank.accountNumber)}</div>`
          : `<div class="muted">Account ending ${esc(inv.bankLast4 ?? '—')}</div>`
      }
      <div class="muted" style="margin-top:4px">Reference: ${esc(inv.number)}</div>
    </div>
    ${inv.notes ? `<div class="notes"><div class="label">Notes</div>${esc(inv.notes).replace(/\n/g, '<br>')}</div>` : ''}
  </body></html>`;
}

export function downloadContractorInvoice(inv: ContractorInvoice, bank: InvoiceBank) {
  const safeName = (inv.sentDetails?.name ?? 'Contractor').replace(/\s+/g, '_');
  return sharePdf(buildContractorInvoiceHtml(inv, bank), `Invoice_${inv.number}_${safeName}.pdf`);
}
