// Notifications for the owner and for individual employees. Records are
// addressed to an audience (the owner, or one employee) so the same store can
// move to a database table unchanged. In memory only until one is connected.
import type { SymbolViewProps } from 'expo-symbols';

import { createStore } from '@/data/store';

type IconName = SymbolViewProps['name'];

export type Tone = 'red' | 'amber' | 'green' | 'blue' | 'purple' | 'grey';

type TypeInfo = {
  /** Filter group this type belongs to. */
  category: string;
  icon: IconName;
  tone: Tone;
  /** Suggested quick actions shown on the detail screen. */
  actions: string[];
};

const icon = (ios: string, android: string): IconName =>
  ({ ios, android, web: android }) as IconName;

const ICONS = {
  warning: icon('exclamationmark.triangle.fill', 'warning'),
  person: icon('person.fill', 'person'),
  personAdd: icon('person.badge.plus', 'person_add'),
  check: icon('checkmark.circle.fill', 'check_circle'),
  dollar: icon('dollarsign.circle.fill', 'attach_money'),
  calendar: icon('calendar', 'calendar_month'),
  document: icon('doc.text.fill', 'description'),
  box: icon('shippingbox.fill', 'inventory_2'),
  wrench: icon('wrench.and.screwdriver.fill', 'build'),
  flag: icon('flag.fill', 'flag'),
  clock: icon('clock.fill', 'schedule'),
  chat: icon('bubble.left.fill', 'chat'),
  quote: icon('doc.badge.plus', 'request_quote'),
  car: icon('car.fill', 'directions_car'),
  megaphone: icon('megaphone.fill', 'campaign'),
  team: icon('person.3.fill', 'groups'),
};

/** Owner notification types. Categories match the owner's filter pills. */
export const OWNER_TYPES = {
  incident_report: { category: 'Incidents', icon: ICONS.warning, tone: 'red', actions: ['View full job details', 'Message employee', 'Create maintenance task', 'Add note'] },
  report_flagged: { category: 'Incidents', icon: ICONS.flag, tone: 'amber', actions: ['View full job details', 'Message employee', 'Add note'] },
  equipment_issue: { category: 'Incidents', icon: ICONS.wrench, tone: 'red', actions: ['Create maintenance task', 'Message employee', 'Add note'] },
  job_completed: { category: 'Jobs', icon: ICONS.check, tone: 'green', actions: ['View full job details', 'Add note'] },
  quote_request: { category: 'Jobs', icon: ICONS.quote, tone: 'blue', actions: ['Create quote', 'Message customer'] },
  customer_message: { category: 'Jobs', icon: ICONS.chat, tone: 'blue', actions: ['Reply to customer'] },
  employee_late: { category: 'Employees', icon: ICONS.clock, tone: 'amber', actions: ['Message employee', 'Open roster'] },
  employee_added: { category: 'Employees', icon: ICONS.personAdd, tone: 'blue', actions: ['View employee'] },
  document_uploaded: { category: 'Employees', icon: ICONS.document, tone: 'purple', actions: ['View document'] },
  invoice_paid: { category: 'Finance', icon: ICONS.dollar, tone: 'green', actions: ['View invoice'] },
  payment_overdue: { category: 'Finance', icon: ICONS.dollar, tone: 'red', actions: ['View invoice', 'Send reminder'] },
  roster_published: { category: 'System', icon: ICONS.calendar, tone: 'blue', actions: ['Open roster'] },
  stock_low: { category: 'System', icon: ICONS.box, tone: 'amber', actions: ['Reorder stock'] },
} satisfies Record<string, TypeInfo>;

/** Employee notification types. */
export const EMPLOYEE_TYPES = {
  roster_published: { category: 'Roster', icon: ICONS.calendar, tone: 'blue', actions: ['Open Roster', 'View Upcoming Jobs'] },
  shift_changed: { category: 'Roster', icon: ICONS.warning, tone: 'amber', actions: ['Open Roster', 'View Upcoming Jobs'] },
  job_completed: { category: 'Roster', icon: ICONS.check, tone: 'green', actions: ['View Upcoming Jobs'] },
  payslip_available: { category: 'Pay', icon: ICONS.dollar, tone: 'green', actions: ['Open Payslips'] },
  team_meeting: { category: 'Team', icon: ICONS.team, tone: 'purple', actions: ['Open Roster'] },
  announcement: { category: 'Team', icon: ICONS.megaphone, tone: 'blue', actions: [] },
  document_added: { category: 'Team', icon: ICONS.document, tone: 'purple', actions: ['Open Qualifications'] },
  vehicle_reminder: { category: 'Team', icon: ICONS.car, tone: 'amber', actions: [] },
} satisfies Record<string, TypeInfo>;

export type OwnerNotificationType = keyof typeof OWNER_TYPES;
export type EmployeeNotificationType = keyof typeof EMPLOYEE_TYPES;

export const OWNER_FILTERS = ['All', 'Jobs', 'Employees', 'Incidents', 'Finance', 'System'] as const;
export const EMPLOYEE_FILTERS = ['All', 'Unread', 'Roster', 'Pay', 'Team'] as const;

export type Attachment = { name: string; sizeBytes: number; uri?: string };

type Base = {
  id: string;
  title: string;
  /** One-line summary shown in the list. */
  summary: string;
  /** Full description on the detail screen. */
  body: string;
  createdAt: string; // ISO
  read: boolean;
  /** e.g. "Needs attention". */
  status?: string;
  details?: { label: string; value: string }[];
  photos?: string[];
  attachments?: Attachment[];
  /** Shift this notification is about. */
  relatedShift?: { date: string; title: string; subtitle?: string };
};

export type OwnerNotification = Base & { audience: 'owner'; type: OwnerNotificationType };
export type EmployeeNotification = Base & {
  audience: 'employee';
  /** null while nobody is signed in. */
  employeeId: string | null;
  type: EmployeeNotificationType;
};
export type AppNotification = OwnerNotification | EmployeeNotification;

export const notificationsStore = createStore<AppNotification[]>([]);

export function useNotifications() {
  return notificationsStore.use();
}

type NewNotification =
  | Omit<OwnerNotification, 'id' | 'createdAt' | 'read'> & { read?: boolean }
  | Omit<EmployeeNotification, 'id' | 'createdAt' | 'read'> & { read?: boolean };

export function addNotification(n: NewNotification) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  notificationsStore.set((all) => [
    { ...n, id, createdAt: new Date().toISOString(), read: n.read ?? false } as AppNotification,
    ...all,
  ]);
  return id;
}

export function markRead(id: string) {
  notificationsStore.set((all) => all.map((n) => (n.id === id && !n.read ? { ...n, read: true } : n)));
}

export function typeInfo(n: AppNotification): TypeInfo {
  return n.audience === 'owner' ? OWNER_TYPES[n.type] : EMPLOYEE_TYPES[n.type];
}

export function ownerNotifications(all: AppNotification[]) {
  return all.filter((n): n is OwnerNotification => n.audience === 'owner');
}

export function employeeNotifications(all: AppNotification[], employeeId: string | null) {
  return all.filter((n): n is EmployeeNotification => n.audience === 'employee' && n.employeeId === employeeId);
}

export function matchesFilter(n: AppNotification, filter: string) {
  if (filter === 'All') return true;
  if (filter === 'Unread') return !n.read;
  return typeInfo(n).category === filter;
}

export function matchesSearch(n: AppNotification, query: string) {
  const q = query.trim().toLowerCase();
  return !q || `${n.title} ${n.summary} ${n.body}`.toLowerCase().includes(q);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export type DateGroup = 'Today' | 'Yesterday' | 'This week' | 'Earlier';

export function dateGroup(iso: string, now = new Date()): DateGroup {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  return 'Earlier';
}

/** Newest first, grouped under date headers; empty groups are dropped. */
export function groupByDate<T extends AppNotification>(items: T[], now = new Date()) {
  const order: DateGroup[] = ['Today', 'Yesterday', 'This week', 'Earlier'];
  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return order
    .map((group) => ({ group, items: sorted.filter((n) => dateGroup(n.createdAt, now) === group) }))
    .filter((g) => g.items.length > 0);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function clock(d: Date) {
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Short list timestamp: "9:41 AM", "Yesterday", "Mon", "12 Sep". */
export function listTime(iso: string, now = new Date()) {
  const d = new Date(iso);
  const group = dateGroup(iso, now);
  if (group === 'Today') return clock(d);
  if (group === 'Yesterday') return 'Yesterday';
  if (group === 'This week') return WEEKDAYS[d.getDay()];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Full timestamp for detail screens: "Mon 12 Oct 2026 · 9:41 AM". */
export function fullTime(iso: string) {
  const d = new Date(iso);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${clock(d)}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
