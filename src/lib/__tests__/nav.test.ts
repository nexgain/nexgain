// Links in the shared screens: unchanged for service and booking businesses,
// kept under /hospitality/ for hospitality businesses. Uses FAKE businesses only.
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: {} }));

// eslint-disable-next-line import/first
import { homeFor } from '@/data/systems';
// eslint-disable-next-line import/first
import { isEmployeePath, systemHref, systemPath, withoutSystemPrefix } from '@/lib/nav';

describe('service and booking businesses: links never change', () => {
  it.each(['service', 'bookings'] as const)('%s', (system) => {
    for (const path of ['/transactions', '/payroll', '/jobs', '/invoices/new', '/home', '/', '/owner-login', '/transaction/[id]?id=1']) {
      expect(systemPath(path, system)).toBe(path);
    }
  });
});

describe('hospitality businesses', () => {
  const h = (path: string) => systemPath(path, 'hospitality');

  it('keeps shared pages inside /hospitality', () => {
    expect(h('/transactions')).toBe('/hospitality/transactions');
    expect(h('/employee/[id]')).toBe('/hospitality/employee/[id]');
    expect(h('/home')).toBe('/hospitality/home');
    expect(h('/expenses/edit?id=5')).toBe('/hospitality/expenses/edit?id=5');
  });

  it('leaves login pages, the start page and prefixed links alone', () => {
    expect(h('/')).toBe('/');
    expect(h('/owner-login')).toBe('/owner-login');
    expect(h('/join/ABC123')).toBe('/join/ABC123');
    expect(h('/hospitality/sales')).toBe('/hospitality/sales');
    expect(h('../back')).toBe('../back');
  });

  it('never opens a System 1-only page (jobs, quotes, invoices)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(h('/jobs')).toBe('/hospitality/dashboard');
    expect(h('/invoices/new')).toBe('/hospitality/dashboard');
    expect(h('/job/[id]')).toBe('/hospitality/dashboard');
    expect(h('/job-report')).toBe('/hospitality/home');
    // "/menu" (More) is shared; "/menu-items" isn't "/menu".
    expect(h('/menu')).toBe('/hospitality/menu');
    warn.mockRestore();
  });

  it('works for { pathname, params } links too', () => {
    // No business loaded in this test, so it behaves like System 1.
    expect(systemHref({ pathname: '/transaction/[id]', params: { id: '1' } })).toEqual({ pathname: '/transaction/[id]', params: { id: '1' } });
  });

  it('knows employee pages and the side menu paths', () => {
    expect(isEmployeePath('/hospitality/payslip/1')).toBe(true);
    expect(isEmployeePath('/hospitality/sales')).toBe(false);
    expect(withoutSystemPrefix('/hospitality/transactions')).toBe('/transactions');
    expect(withoutSystemPrefix('/hospitality')).toBe('/');
    expect(withoutSystemPrefix('/transactions')).toBe('/transactions');
  });

  it('opens the hospitality home pages after login', () => {
    expect(homeFor('owner', { systemType: 'hospitality' })).toBe('/hospitality/dashboard');
    expect(homeFor('employee', { systemType: 'hospitality' })).toBe('/hospitality/home');
  });
});
