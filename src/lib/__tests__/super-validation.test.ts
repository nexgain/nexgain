// TFN, ABN, BSB, USI and ESA checks for super details.
import { describe, expect, it } from '@jest/globals';

import { abnError, bsbError, esaError, isValidAbn, isValidTfn, maskNumber, tfnError, usiError } from '@/lib/super-validation';

describe('TFN', () => {
  it('passes the ATO check for real-format numbers', () => {
    // Publicly documented test TFNs.
    expect(isValidTfn('123 456 782')).toBe(true);
    expect(isValidTfn('876543210')).toBe(true);
  });
  it('catches typos', () => {
    expect(isValidTfn('123456789')).toBe(false);
    expect(tfnError('12345678')).toMatch(/9 digits/);
    expect(tfnError('123456789')).toMatch(/doesn’t look right/);
  });
  it('is optional', () => {
    expect(tfnError('')).toBeNull();
  });
});

describe('ABN', () => {
  it('passes the ATO check', () => {
    // The ATO's own example ABN, and AustralianSuper's.
    expect(isValidAbn('51 824 753 556')).toBe(true);
    expect(isValidAbn('65714394898')).toBe(true);
  });
  it('catches typos and wrong lengths', () => {
    expect(isValidAbn('51824753557')).toBe(false);
    expect(abnError('5182475355')).toMatch(/11 digits/);
    expect(abnError('51824753557')).toMatch(/doesn’t look right/);
  });
});

describe('BSB, USI and ESA', () => {
  it('checks them', () => {
    expect(bsbError('062-000')).toBeNull();
    expect(bsbError('06200')).toMatch(/6 digits/);
    expect(usiError('STA0100AU')).toBeNull();
    expect(usiError('AB')).toMatch(/9 to 20/);
    expect(esaError('esuper')).toBeNull();
    expect(esaError('')).toMatch(/Enter/);
  });
});

describe('masking', () => {
  it('shows only the last 3 digits', () => {
    expect(maskNumber('12345678')).toBe('•••••678');
    expect(maskNumber('')).toBe('');
  });
});
