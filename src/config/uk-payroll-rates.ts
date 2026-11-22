// UK (England, Wales & Northern Ireland) PAYE income tax and Class 1
// National Insurance rates, by tax year. ONLY used for businesses whose
// country is the United Kingdom (GB). See src/data/uk/payroll.ts for the maths.
//
// Each year: copy the latest entry, give it the new key (e.g. "uk-2027-28"),
// change its dates and figures from HMRC's "Rates and thresholds for
// employers" page, and add it to UK_TAX_YEARS. The maths doesn't change.
//
// Source for 2026/27: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
// (6 April 2026 to 5 April 2027).

export type UkTaxYearRates = {
  /** e.g. "uk-2026-27" */
  id: string;
  /** e.g. "2026/27" */
  label: string;
  /** First day, "YYYY-MM-DD" (always 6 April). */
  start: string;
  /** Last day, "YYYY-MM-DD" (always 5 April the next year). */
  end: string;
  /** The usual tax code, e.g. "1257L" (new UK employees start on this). */
  defaultTaxCode: string;
  /**
   * Income tax bands, on TAXABLE pay (pay after the tax-free allowance from the
   * tax code), yearly. Each rate applies up to `upTo` (null = no limit).
   * The Personal Allowance taper over £100,000 is NOT applied here: HMRC gives
   * those employees a lower tax code (e.g. 757L), as real UK payroll does.
   */
  incomeTaxBands: { rate: number; upTo: number | null }[];
  /** D0 and D1 codes: everything taxed at one rate. */
  higherRate: number;
  additionalRate: number;
  basicRate: number;
  /** PAYE can't take more than this share of a period's pay (the "regulatory limit"). */
  overridingLimit: number;
  /** Class 1 National Insurance, category A. Thresholds per week / per month. */
  ni: {
    /** Lower Earnings Limit. */
    lel: { week: number; month: number };
    /** Primary Threshold: employee NI starts above this. */
    pt: { week: number; month: number };
    /** Secondary Threshold: employer NI starts above this. */
    st: { week: number; month: number };
    /** Upper Earnings Limit: the employee's main rate stops here. */
    uel: { week: number; month: number };
    /** Employee rate between PT and UEL. */
    employeeMainRate: number;
    /** Employee rate above UEL. */
    employeeUpperRate: number;
    /** Employer rate above ST. */
    employerRate: number;
  };
};

export const UK_2026_27: UkTaxYearRates = {
  id: 'uk-2026-27',
  label: '2026/27',
  start: '2026-04-06',
  end: '2027-04-05',
  defaultTaxCode: '1257L',
  incomeTaxBands: [
    { rate: 0.2, upTo: 37_700 }, //    Basic rate: first £37,700 of taxable pay (£12,571–£50,270 of income on 1257L)
    { rate: 0.4, upTo: 125_140 }, //   Higher rate: up to £125,140
    { rate: 0.45, upTo: null }, //     Additional rate: above £125,140
  ],
  basicRate: 0.2,
  higherRate: 0.4,
  additionalRate: 0.45,
  overridingLimit: 0.5,
  ni: {
    lel: { week: 129, month: 559 },
    pt: { week: 242, month: 1_048 },
    st: { week: 96, month: 417 },
    uel: { week: 967, month: 4_189 },
    employeeMainRate: 0.08,
    employeeUpperRate: 0.02,
    employerRate: 0.15,
  },
};

/** Every UK tax year NexGain knows, newest first. */
export const UK_TAX_YEARS: UkTaxYearRates[] = [UK_2026_27];
