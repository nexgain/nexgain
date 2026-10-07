// The owner's payroll report: one landscape A4 table (running onto more pages
// if needed, with the column headings repeated), plus a totals bar.
import type { BusinessProfile } from '@/data/business';
import { formatShortDate } from '@/data/employee-roster';
import { employeeFullName, employeeInitialsOf } from '@/data/employees';
import { formatHours, formatMoney, payTotals, type PayLine, type Period } from '@/data/payroll';
import { escapeHtml as esc, sharePdf } from '@/lib/share-pdf';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fileDate = (d: Date) => `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;

function lastDay(period: Period) {
  const d = new Date(period.end);
  d.setDate(d.getDate() - 1);
  return d;
}

const rateText = (l: PayLine, rate: number | null) =>
  rate === null ? '—' : l.employee.payType === 'salary' ? `${formatMoney(rate)}/yr` : `${formatMoney(rate)}/hr`;

export function buildPayrollReportHtml(period: Period, frequency: string, business: BusinessProfile | null, lines: PayLine[]) {
  const totals = payTotals(lines);
  const span = `${formatShortDate(period.start)} – ${formatShortDate(lastDay(period))}`;
  const rows = lines
    .map((l, i) => {
      const name = employeeFullName(l.employee);
      const salaried = l.employee.payType === 'salary';
      const pending = l.status !== 'Paid';
      return `<tr>
        <td class="idx">${i + 1}</td>
        <td><div class="emp"><span class="initials">${esc(employeeInitialsOf(name))}</span><span>${esc(name)}${
          pending ? '<br><span class="tag">Not yet approved</span>' : ''
        }</span></div></td>
        <td>${esc(l.employee.role || '—')}</td>
        <td class="num">${formatHours(l.ordinaryHours)} hrs<br><span class="sub">@ ${rateText(l, l.rate)}</span></td>
        <td class="num">${formatHours(l.overtimeHours)} hrs<br><span class="sub">@ ${salaried ? 'n/a (salary)' : rateText(l, l.overtimeRate)}</span></td>
        <td class="num">${formatMoney(0)}</td>
        <td class="num">${l.gross === null ? 'Rate not set' : formatMoney(l.gross)}</td>
        <td class="num">${l.tax === null ? '—' : `Tax ${formatMoney(l.tax)}`}<br><span class="sub">${
          l.super === null ? '' : `Super ${formatMoney(l.super)} (employer)`
        }</span></td>
        <td class="num net">${l.net === null ? '—' : formatMoney(l.net)}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0F172A; font-size: 11px; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid #2563EB; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .muted { color: #64748B; }
    .biz { font-size: 15px; font-weight: 700; text-align: right; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th { background: #F1F5F9; text-align: left; font-size: 9px; text-transform: uppercase; color: #475569; padding: 7px 6px; }
    td { padding: 7px 6px; border-bottom: 1px solid #E6E9EF; vertical-align: middle; }
    .num { text-align: right; white-space: nowrap; }
    th.num { text-align: right; }
    .idx { color: #64748B; width: 22px; }
    .emp { display: flex; align-items: center; gap: 8px; }
    .initials { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 13px; background: #EAF1FF; color: #2563EB; font-weight: 700; font-size: 10px; flex-shrink: 0; }
    .sub { color: #64748B; font-size: 9px; }
    .tag { color: #B45309; font-size: 9px; }
    th.net, td.net { background: #E8F7EE; }
    td.net { color: #15803D; font-weight: 700; font-size: 12px; }
    .totals { display: flex; margin-top: 14px; border-radius: 10px; overflow: hidden; border: 1px solid #E6E9EF; page-break-inside: avoid; break-inside: avoid; }
    .totals > div { flex: 1; padding: 10px 12px; border-right: 1px solid #E6E9EF; }
    .totals > div:last-child { border-right: none; background: #16A34A; color: #fff; }
    .totals .label { font-size: 9px; text-transform: uppercase; color: #64748B; }
    .totals > div:last-child .label { color: #DCFCE7; }
    .totals .value { font-size: 16px; font-weight: 800; margin-top: 2px; }
    .totals .sub2 { font-size: 9px; color: #64748B; }
    .foot { margin-top: 10px; font-size: 9px; color: #64748B; }
  </style></head><body>
    <div class="head">
      <div><h1>Payroll Report</h1><div class="muted">${esc(span)} · ${esc(frequency)}</div></div>
      <div class="biz">${esc(business?.businessName ?? '')}<div class="muted" style="font-weight:400;font-size:10px">Generated ${esc(formatShortDate(new Date()))}</div></div>
    </div>
    <table>
      <thead><tr>
        <th>#</th><th>Employee</th><th>Position</th><th class="num">Ord. Hours @ Rate</th><th class="num">OT Hours @ Rate</th>
        <th class="num">Allowances</th><th class="num">Gross Pay</th><th class="num">Deductions</th><th class="num net">Net Pay</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="9" class="muted">No employees in this pay period.</td></tr>'}</tbody>
    </table>
    <div class="totals">
      <div><div class="label">Total Employees</div><div class="value">${lines.length}</div></div>
      <div><div class="label">Total Hours</div><div class="value">${formatHours(totals.hours)}</div><div class="sub2">incl. ${formatHours(totals.overtimeHours)} OT hrs</div></div>
      <div><div class="label">Total Gross Pay</div><div class="value">${formatMoney(totals.gross)}</div></div>
      <div><div class="label">Total Deductions</div><div class="value">${formatMoney(totals.tax)}</div><div class="sub2">+ ${formatMoney(totals.super)} super paid by employer</div></div>
      <div><div class="label">Total Net Pay</div><div class="value">${formatMoney(totals.net)}</div></div>
    </div>
    <div class="foot">Deductions are PAYG tax taken out of pay. Super is paid by the employer on top of gross pay and isn't deducted.</div>
  </body></html>`;
}

export function downloadPayrollReport(period: Period, frequency: string, business: BusinessProfile | null, lines: PayLine[]) {
  const fileName = `Payroll_Report_${fileDate(period.start)}_to_${fileDate(lastDay(period))}.pdf`;
  return sharePdf(buildPayrollReportHtml(period, frequency, business, lines), fileName, { landscape: true });
}
