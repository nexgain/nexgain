// Super status for the owner's Employees list, and the super form's checks.
import { describe, expect, it, jest } from '@jest/globals';

import { superFormErrors } from '@/components/super-fields';
import { EMPTY_SUPER_FORM, superStatusOf, type EmployeeSuper } from '@/data/employee-super';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const employee = { employmentType: 'Full-time' };
const record = (changes: Partial<EmployeeSuper>): EmployeeSuper => ({
  employeeId: 'e1',
  choice: 'default',
  fundName: null,
  fundAbn: null,
  usi: null,
  memberNumber: null,
  accountName: null,
  esa: null,
  smsfAccountName: null,
  smsfBsbLast3: null,
  smsfAccountLast3: null,
  declaredAt: '2026-11-10T00:00:00Z',
  choiceReceivedAt: '2026-11-10T00:00:00Z',
  choiceActionedAt: null,
  updatedAt: '2026-11-10T00:00:00Z',
  ...changes,
});

describe('super status', () => {
  it('is Missing details until the employee chooses', () => {
    expect(superStatusOf(employee, undefined)).toBe('Missing details');
  });
  it('is Complete for the employer’s default fund', () => {
    expect(superStatusOf(employee, record({ choice: 'default' }))).toBe('Complete');
  });
  it('needs a stapled fund request for "I’m not sure"', () => {
    expect(superStatusOf(employee, record({ choice: 'unsure' }))).toBe('Needs stapled fund request');
  });
  it('checks an own fund has every detail', () => {
    expect(superStatusOf(employee, record({ choice: 'own', fundName: 'AustralianSuper', fundAbn: '65714394898', usi: 'STA0100AU', memberNumber: '123' }))).toBe('Complete');
    expect(superStatusOf(employee, record({ choice: 'own', fundName: 'AustralianSuper' }))).toBe('Missing details');
  });
  it('isn’t needed for contractors', () => {
    expect(superStatusOf({ employmentType: 'Contractor' }, undefined)).toBe('Not needed');
  });
});

describe('the super form', () => {
  it('needs a choice and the declaration', () => {
    const e = superFormErrors(EMPTY_SUPER_FORM, '');
    expect(e.choice).toBeTruthy();
    expect(e.declared).toBeTruthy();
  });
  it('asks nothing more for the default fund', () => {
    expect(superFormErrors({ ...EMPTY_SUPER_FORM, choice: 'default', declared: true }, '')).toEqual({});
  });
  it('checks an own fund’s ABN, USI and member number', () => {
    const e = superFormErrors({ ...EMPTY_SUPER_FORM, choice: 'own', fundName: 'X', fundAbn: '12345678901', usi: '', declared: true }, '');
    expect(Object.keys(e).sort()).toEqual(['fundAbn', 'memberNumber', 'usi']);
  });
  it('checks an SMSF’s ESA and bank details', () => {
    const ok = superFormErrors(
      { ...EMPTY_SUPER_FORM, choice: 'smsf', fundName: 'Smith SMSF', fundAbn: '51824753556', esa: 'esuper', smsfAccountName: 'Smith SMSF', smsfBsb: '062-000', smsfAccountNumber: '12345678', declared: true },
      '',
    );
    expect(ok).toEqual({});
  });
  it('checks the TFN with the ATO rule (optional)', () => {
    const base = { ...EMPTY_SUPER_FORM, choice: 'default' as const, declared: true };
    expect(superFormErrors(base, '123456789').tfn).toBeTruthy();
    expect(superFormErrors(base, '123456782').tfn).toBeUndefined();
  });
});
