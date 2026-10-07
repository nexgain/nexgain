// Notifications for the owner and for individual employees, addressed to one
// person. Loaded from the online database and delivered live between phones.
import type { SymbolViewProps } from 'expo-symbols';

import { createStore } from '@/data/store';
import { supabase } from '@/lib/supabase';

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
  contractor_invoice: { category: 'Finance', icon: ICONS.document, tone: 'blue', actions: ['Review contractor invoice'] },
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
  invoice_status: { category: 'Pay', icon: ICONS.document, tone: 'blue', actions: ['Open invoice'] },
  team_meeting: { category: 'Team', icon: ICONS.team, tone: 'purple', actions: ['Open Roster'] },
  announcement: { category: 'Team', icon: ICONS.megaphone, tone: 'blue', actions: [] },
  document_added: { category: 'Team', icon: ICONS.document, tone: 'purple', actions: ['Open Qualifications'] },
  vehicle_reminder: { category: 'Team', icon: ICONS.car, tone: 'amber', actions: [] },
} satisfies Record<string, TypeInfo>;

export type OwnerNotificationType = keyof typeof OWNER_TYPES;
export type EmployeeNotificationType = keyof typeof EMPLOYEE_TYPES;

export const OWNER_FILTERS = ['All', 'To Do', 'Jobs', 'Employees', 'Incidents', 'Finance', 'System'] as const;

/**
 * Owner to-do statuses: things waiting on the owner. Contractor invoices are
 * "To review" when sent and "To pay" once approved; the database moves them
 * on to "Paid" / "Declined", which takes them off the to-do list.
 */
export const TO_DO_STATUSES = ['To review', 'To pay'];
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
  /** The record it's about, e.g. a contractor invoice id. */
  relatedId?: string;
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
  const target = notificationsStore.get().find((n) => n.id === id);
  if (!target || target.read) return;
  notificationsStore.set((all) => all.map((n) => (n.id === id ? { ...n, read: true } : n)));
  // Records that came from the database (ids are UUIDs) are marked read there too.
  if (/^[0-9a-f]{8}-/.test(id)) {
    supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.warn('Could not mark notification read:', error.message);
      });
  }
}

const FALLBACK_TYPE: TypeInfo = { category: 'System', icon: ICONS.document, tone: 'grey', actions: [] };

export function typeInfo(n: AppNotification): TypeInfo {
  const info = n.audience === 'owner' ? OWNER_TYPES[n.type] : EMPLOYEE_TYPES[n.type];
  return info ?? FALLBACK_TYPE;
}

// ---------------------------------------------------------------------------
// Database: notifications are created by the database itself (e.g. when an
// employee joins, a shift is assigned or a payslip is paid) and delivered live.

type NotificationRow = {
  id: string;
  audience: 'owner' | 'employee';
  type: string;
  title: string;
  summary: string;
  body: string;
  status: string | null;
  details: { label: string; value: string }[] | null;
  photos: string[] | null;
  attachments: Attachment[] | null;
  related_shift: { date: string; title: string; subtitle?: string } | null;
  related_id?: string | null;
  read: boolean;
  created_at: string;
};

function fromRow(row: NotificationRow, employeeId: string | null): AppNotification {
  const base = {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    createdAt: row.created_at,
    read: row.read,
    status: row.status ?? undefined,
    details: row.details ?? undefined,
    photos: row.photos ?? undefined,
    attachments: row.attachments ?? undefined,
    relatedShift: row.related_shift
      ? { date: row.related_shift.date, title: row.related_shift.title, subtitle: row.related_shift.subtitle ?? undefined }
      : undefined,
    relatedId: row.related_id ?? undefined,
  };
  return row.audience === 'owner'
    ? { ...base, audience: 'owner', type: row.type as OwnerNotificationType }
    : { ...base, audience: 'employee', employeeId, type: row.type as EmployeeNotificationType };
}

const isStoragePath = (photo: string) => !/^(https?|data|file|blob|content):/.test(photo);

/**
 * Job report photos are saved privately; swap their storage paths for
 * temporary links (valid for a week) so they can be shown.
 */
async function withPhotoLinks(items: AppNotification[]) {
  const paths = [...new Set(items.flatMap((n) => n.photos ?? []).filter(isStoragePath))];
  if (paths.length === 0) return items;
  const { data } = await supabase.storage.from('employee-documents').createSignedUrls(paths, 7 * 24 * 60 * 60);
  const links = new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  return items.map((n) =>
    n.photos?.some(isStoragePath) ? { ...n, photos: n.photos.map((p) => links.get(p) ?? p).filter((p) => !isStoragePath(p)) } : n,
  );
}

/** Loads the signed-in person's notifications (newest first). */
export async function loadNotifications(employeeId: string | null) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  notificationsStore.set(await withPhotoLinks((data as NotificationRow[]).map((row) => fromRow(row, employeeId))));
}

/**
 * Delivers new and updated notifications live. `onNew` runs for each new one
 * (e.g. to refresh the roster). Returns a function that stops listening.
 */
export function subscribeToNotifications(userId: string, employeeId: string | null, onNew?: (n: AppNotification) => void) {
  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
      async (payload) => {
        if (payload.eventType === 'DELETE') return;
        const [n] = await withPhotoLinks([fromRow(payload.new as NotificationRow, employeeId)]);
        notificationsStore.set((all) => [n, ...all.filter((x) => x.id !== n.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        if (payload.eventType === 'INSERT') onNew?.(n);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export function clearNotifications() {
  notificationsStore.set([]);
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
  if (filter === 'To Do') return !!n.status && TO_DO_STATUSES.includes(n.status);
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
