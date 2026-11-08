// Income tax brackets for each country, used by payroll to estimate the tax
// taken out of each pay. Update the rates here each year, or add a country
// (keyed by the country code chosen at sign-up, e.g. "AU"). Payroll code
// doesn't need to change.
//
// How a country's rules are used (see data/tax.ts):
//   1. A pay is turned into a yearly figure (e.g. a week's pay x 52).
//   2. Each bracket taxes only the part of that yearly income inside it.
//   3. Levies (e.g. Medicare) are added on the whole yearly income.
//   4. The yearly tax is divided back down to one pay (e.g. / 52).

export type TaxBracket = {
  /** Income above this amount (per year) is taxed at `rate`, up to the next bracket's `from`. */
  from: number;
  rate: number;
};

export type CountryTaxRules = {
  /** Shown to the owner, e.g. "Australia 2026–27 resident rates". */
  label: string;
  /** Lowest first; the first one starts at 0. */
  brackets: TaxBracket[];
  /** Added on the whole yearly income, e.g. the 2% Medicare levy. */
  levies: { name: string; rate: number }[];
  /**
   * The rate used for the first bracket when an employee hasn't claimed the
   * tax-free threshold (instead of 0%). Leave out if the country has no such rule.
   */
  noTaxFreeThresholdRate?: number;
};

export const TAX_BRACKETS: Record<string, CountryTaxRules> = {
  // Australian resident rates from 1 July 2026.
  AU: {
    label: 'Australia 2026–27 resident rates',
    brackets: [
      { from: 0, rate: 0 }, //             $0 – $18,200
      { from: 18_200, rate: 0.15 }, //     $18,201 – $45,000
      { from: 45_000, rate: 0.3 }, //      $45,001 – $135,000
      { from: 135_000, rate: 0.37 }, //    $135,001 – $190,000
      { from: 190_000, rate: 0.45 }, //    $190,001 and over
    ],
    levies: [{ name: 'Medicare levy', rate: 0.02 }],
    noTaxFreeThresholdRate: 0.15,
  },
};
