// Words that differ for United Kingdom businesses ONLY. Everyone else gets
// exactly the words they had before (e.g. "Super" stays "Super").
import { TAPER_NOTE } from './payroll';

export const isUkBusiness = (business: { country?: string | null } | null | undefined) => business?.country === 'GB';

/** "Pension" for UK businesses, "Super" for everyone else. */
export const superWord = (business: { country?: string | null } | null | undefined) => (isUkBusiness(business) ? 'Pension' : 'Super');

/** The Employee Status link's subtitle. */
export const employeeStatusSubtitle = (business: { country?: string | null } | null | undefined) =>
  isUkBusiness(business) ? 'Hours, pay, tax, NI and pension by employee' : 'Hours, pay, tax and super by employee';

/** The note next to tax amounts for UK businesses. */
export const UK_TAX_NOTE = `Tax is UK PAYE income tax (England, Wales & Northern Ireland, 2026/27) from each employee’s tax code, worked out across the tax year from 6 April, plus Class 1 National Insurance. Contractors have no tax or NI taken out. ${TAPER_NOTE}`;
