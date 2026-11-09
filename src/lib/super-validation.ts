// Checks for super and tax numbers, with friendly messages. Each returns an
// error message, or null when the number is fine. The database checks TFNs,
// ABNs and BSBs again when they're saved.

const digitsOf = (text: string) => text.replace(/\D/g, '');

/**
 * Tax file number: 9 digits with the ATO's check (each digit times
 * 1, 4, 3, 7, 5, 8, 6, 9, 10; the total must divide by 11).
 */
export function isValidTfn(text: string) {
  const d = digitsOf(text);
  if (d.length !== 9) return false;
  const weights = [1, 4, 3, 7, 5, 8, 6, 9, 10];
  const sum = weights.reduce((total, w, i) => total + w * Number(d[i]), 0);
  return sum % 11 === 0;
}

/**
 * ABN: 11 digits with the ATO's check (take 1 from the first digit, multiply
 * by 10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19; the total must divide by 89).
 */
export function isValidAbn(text: string) {
  const d = digitsOf(text);
  if (d.length !== 11) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = weights.reduce((total, w, i) => total + w * (Number(d[i]) - (i === 0 ? 1 : 0)), 0);
  return sum % 89 === 0;
}

export function tfnError(text: string) {
  const d = digitsOf(text);
  if (!d) return null; // optional
  if (d.length !== 9) return 'A tax file number has 9 digits.';
  if (!isValidTfn(d)) return 'That tax file number doesn’t look right. Check it against your myGov account or a payslip.';
  return null;
}

export function abnError(text: string, what = 'The fund’s ABN') {
  const d = digitsOf(text);
  if (!d) return `Enter ${what.charAt(0).toLowerCase() + what.slice(1)}.`;
  if (d.length !== 11) return `${what} has 11 digits.`;
  if (!isValidAbn(d)) return `${what} doesn’t look right. Check it on the fund’s website or abr.business.gov.au.`;
  return null;
}

export function bsbError(text: string) {
  const d = digitsOf(text);
  if (!d) return 'Enter the BSB.';
  if (d.length !== 6) return 'A BSB has 6 digits.';
  return null;
}

/** USI: the fund's Unique Superannuation Identifier, e.g. "STA0100AU" (letters and numbers, 9 to 20 characters). */
export function usiError(text: string) {
  const t = text.trim().replace(/\s/g, '');
  if (!t) return 'Enter the fund’s USI.';
  if (!/^[A-Za-z0-9]{9,20}$/.test(t)) return 'A USI is 9 to 20 letters and numbers, e.g. STA0100AU. It’s on your fund’s website.';
  return null;
}

/** Electronic Service Address: the SMSF's messaging alias, e.g. "esuper" or "SMSFdataflow". */
export function esaError(text: string) {
  const t = text.trim();
  if (!t) return 'Enter the fund’s electronic service address (ESA).';
  if (!/^[A-Za-z0-9._-]{2,40}$/.test(t)) return 'An ESA is a short name like "esuper" or "smsfdataflow". Your SMSF’s administrator can tell you.';
  return null;
}

export function accountNumberError(text: string) {
  const d = digitsOf(text);
  if (!d) return 'Enter the account number.';
  if (d.length < 5 || d.length > 10) return 'An account number has 5 to 10 digits.';
  return null;
}

export function requiredError(text: string, label: string) {
  return text.trim() ? null : `Enter ${label}.`;
}

/** "•••••123": only the last 3 digits. */
export function maskNumber(text: string | null | undefined, show = 3) {
  const d = digitsOf(text ?? '');
  if (!d) return '';
  return `${'•'.repeat(Math.max(3, d.length - show))}${d.slice(-show)}`;
}

/** "51824753556" -> "51 824 753 556" while typing. */
export const formatAbn = (text: string) => {
  const d = digitsOf(text).slice(0, 11);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 11)].filter(Boolean).join(' ');
};

/** "123456" -> "123-456" while typing. */
export const formatBsb = (text: string) => {
  const d = digitsOf(text).slice(0, 6);
  return d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
};
