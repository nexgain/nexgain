// Estimated income tax for each pay, from the brackets in config/tax-brackets.ts
// for the business's country (chosen at sign-up). Contractors have no tax
// taken out: they invoice the business and handle their own tax.
import { TAX_BRACKETS, type CountryTaxRules } from '@/config/tax-brackets';

/** How many pays there are in a year for each pay frequency. NexGain pays weekly for now. */
export const PAYS_PER_YEAR = { Weekly: 52, Fortnightly: 26, Monthly: 12 } as const;
export type PayFrequency = keyof typeof PAYS_PER_YEAR;

export const TAX_ESTIMATE_NOTE = 'Tax is an estimate based on current tax brackets.';

const roundCents = (n: number) => Math.round(n * 100) / 100;

/** Yearly tax on a yearly income: each bracket taxes only the part inside it, then levies on the whole amount. */
export function yearlyTax(income: number, rules: CountryTaxRules, claimsTaxFreeThreshold = true) {
  if (income <= 0) return 0;
  let tax = 0;
  rules.brackets.forEach((bracket, i) => {
    const top = rules.brackets[i + 1]?.from ?? Infinity;
    const portion = Math.min(income, top) - bracket.from;
    if (portion <= 0) return;
    const rate = i === 0 && !claimsTaxFreeThreshold ? (rules.noTaxFreeThresholdRate ?? bracket.rate) : bracket.rate;
    tax += portion * rate;
  });
  for (const levy of rules.levies) tax += income * levy.rate;
  return tax;
}

/**
 * Tax on one pay: the pay x pays per year, taxed as a yearly income, then
 * divided back down. A bigger pay one week means more tax that week.
 */
export function taxForPay(gross: number, rules: CountryTaxRules, claimsTaxFreeThreshold = true, frequency: PayFrequency = 'Weekly') {
  const perYear = PAYS_PER_YEAR[frequency];
  return roundCents(yearlyTax(gross * perYear, rules, claimsTaxFreeThreshold) / perYear);
}

/**
 * How tax is worked out for a business:
 * - brackets: we have the country's brackets
 * - manual: we don't, so the owner entered a flat rate in Payroll Settings
 * - missing: we don't, and no rate has been entered yet (tax can't be worked out)
 */
export type TaxSetup =
  | { kind: 'brackets'; rules: CountryTaxRules }
  | { kind: 'manual'; rate: number }
  | { kind: 'missing'; country: string | null };

export function taxSetupFor(business: { country: string | null; manualTaxRate?: number | null } | null): TaxSetup {
  const country = business?.country ?? null;
  const rules = country ? TAX_BRACKETS[country] : undefined;
  if (rules) return { kind: 'brackets', rules };
  const rate = business?.manualTaxRate;
  if (rate !== null && rate !== undefined) return { kind: 'manual', rate };
  return { kind: 'missing', country };
}

/**
 * Tax on a pay covering `weeks` weeks (usually 1). null when it can't be
 * worked out yet (no brackets and no manual rate). Contractors pay none.
 */
export function taxOnPay(
  gross: number,
  setup: TaxSetup,
  worker: { contractor: boolean; claimsTaxFreeThreshold: boolean },
  weeks = 1,
): number | null {
  if (worker.contractor) return 0;
  if (setup.kind === 'missing') return null;
  if (setup.kind === 'manual') return roundCents(gross * setup.rate);
  // Each week is taxed on that week's pay.
  if (weeks <= 0) return 0;
  return roundCents(taxForPay(gross / weeks, setup.rules, worker.claimsTaxFreeThreshold, 'Weekly') * weeks);
}
