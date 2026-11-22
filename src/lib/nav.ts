// Links that work in every system.
//
// The System 1 screens (Payroll, Transactions, GST, Super, the employee side...)
// are shared with NexGain Hospitality. Their links are written for System 1,
// e.g. router.push('/transactions'). For a hospitality business the same
// screen lives at /hospitality/transactions, so these helpers add
// "/hospitality" in front. For service and booking businesses nothing changes:
// every link goes exactly where it always did.
//
// Use `router` from here (not from expo-router) in shared screens, and
// `systemHref()` for <Link>/<Redirect> hrefs.
import { router as expoRouter, type Href } from 'expo-router';

import { businessStore, useBusiness } from '@/data/business';
import { systemOf } from '@/data/systems';

/** Pages outside any system (login, sign-up...): never changed. */
const GLOBAL = ['/owner-login', '/owner-access', '/owner-signup', '/employee-access', '/employee-login', '/employee-signup', '/forgot-password', '/reset-password', '/oauth-return', '/join'];

/**
 * System 1 pages that NexGain Hospitality doesn't have (jobs, quotes,
 * invoices...). A shared screen linking to one of these opens the
 * hospitality home page instead of a "page not found".
 */
const NOT_IN_HOSPITALITY = ['/invoices', '/job', '/jobs', '/job-report', '/reminders', '/services', '/revenue', '/analytics', '/calendar', '/roster', '/ai-assistant'];

const EMPLOYEE_PAGES = ['/home', '/more', '/my-roster', '/my-invoices', '/paid', '/payslips', '/notifications', '/notification', '/payslip', '/profile', '/account', '/availability', '/qualifications', '/add-qualification', '/super-details', '/contractor-invoice'];

const under = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(`${p}/`));

/** The path in the business's own system, e.g. "/transactions" -> "/hospitality/transactions". */
export function systemPath(path: string, system = systemOf(businessStore.get())): string {
  if (system !== 'hospitality') return path;
  // Relative links, the start page, login pages and already-prefixed links stay as they are.
  if (!path.startsWith('/') || path === '/' || under(path, GLOBAL) || under(path, ['/hospitality', '/bookings', '/retail'])) return path;
  const [pathname, query = ''] = path.split('?');
  // A shared screen opening one invoice (e.g. from GST): hospitality's own invoice page.
  if (pathname === '/invoices/[id]') return `/hospitality/invoice/[id]${query ? `?${query}` : ''}`;
  if (under(pathname, NOT_IN_HOSPITALITY)) {
    console.warn(`"${pathname}" isn't part of NexGain Hospitality; opening the home page instead.`);
    return under(pathname, ['/job-report']) ? '/hospitality/home' : '/hospitality/dashboard';
  }
  return `/hospitality${pathname}${query ? `?${query}` : ''}`;
}

/** The same as systemPath, for any expo-router href (a string or { pathname, params }). */
export function systemHref<T extends Href>(href: T): T {
  if (typeof href === 'string') return systemPath(href) as T;
  if (href && typeof href === 'object' && 'pathname' in href && typeof href.pathname === 'string') {
    return { ...href, pathname: systemPath(href.pathname) } as T;
  }
  return href;
}

/** True when the path is an employee page (used by the hospitality employee layout). */
export function isEmployeePath(path: string) {
  return under(path.replace(/^\/hospitality/, ''), EMPLOYEE_PAGES);
}

/** The path without "/hospitality" in front, e.g. for matching the side menu. */
export function withoutSystemPrefix(path: string) {
  return path.replace(/^\/hospitality(?=\/|$)/, '') || '/';
}

/** expo-router's router, with links kept inside the business's own system. */
// Every call is passed on when it happens (never copied early), so this always
// uses expo-router's current router.
export const router: typeof expoRouter = {
  push: (href, options) => expoRouter.push(systemHref(href), options),
  replace: (href, options) => expoRouter.replace(systemHref(href), options),
  navigate: (href, options) => expoRouter.navigate(systemHref(href), options),
  dismissTo: (href, options) => expoRouter.dismissTo(systemHref(href), options),
  prefetch: (href, options) => expoRouter.prefetch(systemHref(href), options),
  back: (options) => expoRouter.back(options),
  canGoBack: () => expoRouter.canGoBack(),
  dismiss: (count, options) => expoRouter.dismiss(count, options),
  dismissAll: (options) => expoRouter.dismissAll(options),
  canDismiss: () => expoRouter.canDismiss(),
  setParams: (params) => expoRouter.setParams(params),
  reload: () => expoRouter.reload(),
  setTransitionMode: (mode) => expoRouter.setTransitionMode(mode),
};

/** True for NexGain Hospitality businesses (shared screens hide jobs, quotes and invoices for them). */
export function useIsHospitality() {
  return systemOf(useBusiness()) === 'hospitality';
}
