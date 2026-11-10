// Super only for Australian businesses, and which fund each employee is paid into.
import { describe, expect, it, jest } from '@jest/globals';

import { employeeSteps } from '@/components/employee-signup/types';
import { financialErrors } from '@/components/signup/step-financial';
import { EMPTY_SIGNUP } from '@/components/signup/types';
import { EMPTY_SUPER_SETTINGS, getEmployeeSuperFund, type EmployeeSuper } from '@/data/employee-super';
import { getsSuper } from '@/data/employees';
import { businessUsesSuper } from '@/data/super-rules';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

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
const settings = { ...EMPTY_SUPER_SETTINGS, defaultFundName: 'AustralianSuper', defaultFundUsi: 'STA0100AU', defaultFundAbn: '65714394898' };

describe('businessUsesSuper', () => {
  it('is only for Australia', () => {
    expect(businessUsesSuper({ country: 'AU' })).toBe(true);
    expect(businessUsesSuper({ country: 'NZ' })).toBe(false);
    expect(businessUsesSuper({ country: 'GB' })).toBe(false);
  });
  it('treats older businesses with no country as Australian', () => {
    expect(businessUsesSuper({ country: null })).toBe(true);
  });
  it('turns super off in payroll for other countries', () => {
    expect(getsSuper({ employmentType: 'Full-time' }, { country: 'AU' } as never)).toBe(true);
    expect(getsSuper({ employmentType: 'Full-time' }, { country: 'NZ' } as never)).toBe(false);
    expect(getsSuper({ employmentType: 'Contractor' }, { country: 'AU' } as never)).toBe(false);
  });
});

describe('getEmployeeSuperFund', () => {
  const who = { id: 'e1' };
  it('option a: the employer’s fund', () => {
    expect(getEmployeeSuperFund(who, [record({ choice: 'default' })], settings)).toMatchObject({ kind: 'employer', fundName: 'AustralianSuper', usi: 'STA0100AU' });
  });
  it('option b: their own fund', () => {
    const own = record({ choice: 'own', fundName: 'Hostplus', usi: 'HOS0100AU', fundAbn: '68657495890', memberNumber: '998877' });
    expect(getEmployeeSuperFund(who, [own], settings)).toMatchObject({ kind: 'own', fundName: 'Hostplus', memberNumber: '998877' });
  });
  it('option c: none yet, never the employer’s fund', () => {
    expect(getEmployeeSuperFund(who, [record({ choice: 'unsure' })], settings)).toEqual({ kind: 'none', reason: 'stapled_check_needed' });
  });
  it('no choice yet', () => {
    expect(getEmployeeSuperFund(who, [], settings)).toEqual({ kind: 'none', reason: 'not_chosen' });
  });
});

describe('employee sign-up steps', () => {
  const ids = (country: string | null, employmentType: 'Full-time' | 'Contractor' = 'Full-time') =>
    employeeSteps({ business: { id: 'b', name: 'B', logo: null, industry: null, industryCategory: null, country }, employmentType }).map((s) => s.id);
  it('asks "Your super fund" for Australian businesses', () => {
    expect(ids('AU')).toContain('super');
  });
  it('skips it everywhere else, and for contractors', () => {
    expect(ids('NZ')).not.toContain('super');
    expect(ids('AU', 'Contractor')).not.toContain('super');
  });
});

describe('owner sign-up', () => {
  it('needs a country', () => {
    expect(financialErrors(EMPTY_SIGNUP).country).toBeTruthy();
  });
  it('needs the default fund in Australia', () => {
    const e = financialErrors({ ...EMPTY_SIGNUP, country: 'AU' });
    expect(Object.keys(e).sort()).toEqual(['superFundAbn', 'superFundName', 'superFundUsi']);
    expect(financialErrors({ ...EMPTY_SIGNUP, country: 'AU', superFundName: 'AustralianSuper', superFundUsi: 'STA0100AU', superFundAbn: '65714394898' })).toEqual({});
  });
  it('doesn’t ask for a fund anywhere else (New Zealand asks for the bank instead)', () => {
    expect(Object.keys(financialErrors({ ...EMPTY_SIGNUP, country: 'NZ' }))).toEqual(['bank']);
    expect(financialErrors({ ...EMPTY_SIGNUP, country: 'NZ', bank: 'BNZ' })).toEqual({});
    expect(financialErrors({ ...EMPTY_SIGNUP, country: 'GB' })).toEqual({});
  });
});
