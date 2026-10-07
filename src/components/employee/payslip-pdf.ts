// One payslip as a single portrait A4 PDF, laid out like the on-screen payslip.
import type { BusinessProfile } from '@/data/business';
import { formatShortDate } from '@/data/employee-roster';
import { formatCurrency as money, formatHrs, type PayslipView } from '@/data/employee-payslips';
import { SUPER_GUARANTEE_RATE } from '@/data/payroll';
import { escapeHtml as esc, sharePdf } from '@/lib/share-pdf';

export type PayslipPerson = { name: string; position: string; employeeId: string };

const rateText = (v: PayslipView, rate: number) => (v.salaried ? `${money(rate)}/yr` : `${money(rate)}/hr`);

export function buildPayslipHtml(v: PayslipView, business: BusinessProfile | null, person: PayslipPerson) {
  const earnings = [
    ['Ordinary Hours', formatHrs(v.ordinaryHours), rateText(v, v.ordinaryRate), money(v.ordinaryPay)],
    ['Overtime', formatHrs(v.overtimeHours), v.salaried ? '—' : rateText(v, v.overtimeRate), money(v.overtimePay)],
    ['Allowances', '—', '—', money(v.allowances)],
  ];
  const deductions = [
    ['PAYG Tax', money(v.tax)],
    ['Other Deductions', money(v.otherDeductions)],
  ];
  const logo = business?.logo
    ? `<img class="logo" src="${esc(business.logo)}" alt="">`
    : `<div class="logo logo-blank">${esc((business?.businessName ?? 'N').trim().charAt(0).toUpperCase())}</div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0F172A; font-size: 12px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
    h1 { font-size: 24px; margin: 0; }
    .muted { color: #64748B; }
    .card { border: 1px solid #E6E9EF; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; }
    .period { display: flex; justify-content: space-between; align-items: center; }
    .period-range { font-size: 15px; font-weight: 700; }
    .badge { background: #E8F7EE; color: #16A34A; font-weight: 700; font-size: 11px; padding: 3px 10px; border-radius: 999px; }
    .parties { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .biz { display: flex; align-items: center; gap: 10px; }
    .logo { width: 48px; height: 48px; border-radius: 10px; object-fit: contain; }
    .logo-blank { background: #EAF1FF; color: #2563EB; font-size: 22px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
    .biz-name { font-size: 15px; font-weight: 700; }
    .person { text-align: right; }
    .person-name { font-size: 15px; font-weight: 700; }
    .summary { display: flex; background: #E8F7EE; border-radius: 12px; padding: 14px 8px; margin-bottom: 12px; }
    .summary div { flex: 1; text-align: center; }
    .summary .label { color: #166534; font-size: 11px; }
    .summary .value { color: #16A34A; font-size: 18px; font-weight: 800; margin-top: 2px; }
    .summary .sub { color: #166534; font-size: 10px; margin-top: 2px; }
    h2 { font-size: 13px; margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; color: #64748B; padding: 6px 4px; border-bottom: 1px solid #E6E9EF; }
    td { padding: 7px 4px; border-bottom: 1px solid #F1F5F9; }
    .num { text-align: right; white-space: nowrap; }
    .total td { font-weight: 700; border-bottom: none; border-top: 1px solid #E6E9EF; }
    .note { font-size: 10px; color: #64748B; margin-top: 6px; }
    .net { display: flex; justify-content: space-between; align-items: center; background: #16A34A; color: #fff; border-radius: 12px; padding: 16px 18px; }
    .net .label { font-size: 14px; font-weight: 600; }
    .net .value { font-size: 26px; font-weight: 800; }
  </style></head><body>
    <div class="top"><h1>Payslip</h1><div class="muted">Paid ${esc(formatShortDate(v.paidAt))}</div></div>

    <div class="card period">
      <div><div class="period-range">${esc(v.rangeLabel)}</div><div class="muted">${esc(v.frequency)} pay period</div></div>
      <div style="text-align:right"><span class="badge">Paid</span><div class="muted" style="margin-top:4px">Paid on ${esc(formatShortDate(v.paidAt))}</div></div>
    </div>

    <div class="card parties">
      <div class="biz">${logo}<div class="biz-name">${esc(business?.businessName ?? '')}</div></div>
      <div class="person">
        <div class="person-name">${esc(person.name)}</div>
        <div class="muted">${esc(person.position || '—')}</div>
        <div class="muted">Employee ID: ${esc(person.employeeId)}</div>
      </div>
    </div>

    <div class="summary">
      <div><div class="label">Total Pay</div><div class="value">${money(v.totalEarnings)}</div></div>
      <div><div class="label">Total Hours</div><div class="value">${formatHrs(v.totalHours)}</div><div class="sub">incl. ${formatHrs(v.overtimeHours)} hrs overtime</div></div>
      <div><div class="label">Avg. Hourly Rate</div><div class="value">${v.avgHourlyRate === null ? '—' : money(v.avgHourlyRate)}</div></div>
    </div>

    <div class="card">
      <h2>Earnings</h2>
      <table>
        <thead><tr><th>Description</th><th class="num">Hours</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${earnings.map((r) => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td><td class="num">${r[2]}</td><td class="num">${r[3]}</td></tr>`).join('')}
          <tr class="total"><td>Total Earnings</td><td class="num">${formatHrs(v.totalHours)}</td><td></td><td class="num">${money(v.totalEarnings)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>Deductions</h2>
      <table>
        <thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${deductions.map((r) => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td></tr>`).join('')}
          <tr class="total"><td>Total Deductions</td><td class="num">${money(v.totalDeductions)}</td></tr>
        </tbody>
      </table>
      <table style="margin-top:8px"><tbody>
        <tr><td>Superannuation (${SUPER_GUARANTEE_RATE * 100}%)</td><td class="num">${money(v.super)}</td></tr>
      </tbody></table>
      <div class="note">Superannuation is paid by your employer on top of your pay. It is not taken out of your net pay.</div>
    </div>

    <div class="net"><div class="label">Net Pay</div><div class="value">${money(v.net)}</div></div>
  </body></html>`;
}

export function downloadPayslip(v: PayslipView, business: BusinessProfile | null, person: PayslipPerson) {
  return sharePdf(buildPayslipHtml(v, business, person), v.fileName);
}
