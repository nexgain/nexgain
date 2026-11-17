// NexGain Bookings: the owner's (and staff's) view of booking settings,
// services, bookable staff, time off and the bookings themselves. Stored in
// Supabase (see supabase/migrations/20261117000000_bookings.sql) and loaded by
// useBookingsSync() in the NexGain Bookings layouts. Updates live when a
// customer books, moves or cancels online.
import { useEffect } from 'react';

import { businessStore, useBusiness } from '@/data/business';
import { createStore } from '@/data/store';
import { systemOf } from '@/data/systems';
import { supabase } from '@/lib/supabase';
import { bookingWords } from '@/systems/bookings/constants/booking-business-types';
import { DEFAULT_TIME_ZONE, zonedParts } from '@/systems/bookings/data/booking-time';

/** The public booking page. Change here if NexGain moves to its own domain. */
export const BOOKING_PAGE_URL = 'https://nexgain.github.io/nexgain/book/';
/** The business's one booking page (customers pick who they'd like there). */
export const bookingLink = (slug: string) => `${BOOKING_PAGE_URL}?b=${encodeURIComponent(slug)}`;

export type OpeningDay = { open: boolean; start: string; end: string };
export type StaffDay = { working: boolean; start: string; end: string };

export type BookingSettings = {
  slug: string;
  accepting: boolean;
  /** 7 days, Monday first. */
  openingHours: OpeningDay[];
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
  cancelNoticeHours: number;
  cancellationPolicy: string;
  reminderHours: number;
  /** Automatic reminder emails to customers (see 20261120000000_booking_reminders.sql). */
  remindersEnabled: boolean;
  /** Deposit when booking (see 20261123000000_booking_payments.sql): none, a fixed amount or a % of the price. */
  depositType: 'none' | 'fixed' | 'percent' | 'full';
  depositValue: number;
  /** Fee for cancelling late: on/off, fixed or %, and how many hours before counts as late. */
  cancellationFeeEnabled: boolean;
  cancellationFeeType: 'fixed' | 'percent';
  cancellationFeeValue: number;
  cancellationFeeHours: number;
  /** "Do you do the work yourself?" Yes = the owner can be booked and has a schedule. */
  ownerWorks: boolean;
  /** Booking business types chosen at sign-up (ids from constants/booking-business-types.ts). */
  businessTypes: string[];
};

export type BookingStaff = {
  id: string;
  employeeId: string | null;
  isOwner: boolean;
  name: string;
  active: boolean;
  /** Their own week (Monday first), or null = the business's opening hours. */
  hours: StaffDay[] | null;
  sort: number;
  /** Set while they've asked for new hours (waiting for the owner). */
  hoursRequestedAt: string | null;
  /** The hours they asked for (null with a request = "the opening hours"). */
  requestedHours: StaffDay[] | null;
};

export type BookingService = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number | null;
  /** The group customers see it under, e.g. "Barber". */
  category: string;
  active: boolean;
  sort: number;
};

export type TimeOff = {
  id: string;
  /** null = the whole business is closed. */
  staffId: string | null;
  startsAt: string;
  endsAt: string;
  status: 'pending' | 'approved' | 'declined';
  note: string;
};

export type BookingStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show';

export type Booking = {
  id: string;
  serviceId: string | null;
  staffId: string;
  staffChosen: boolean;
  serviceName: string;
  durationMinutes: number;
  price: number | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  notes: string;
  startsAt: string;
  endsAt: string;
  blockedUntil: string;
  status: BookingStatus;
  source: 'online' | 'owner';
  cancelledBy: 'customer' | 'business' | null;
  createdAt: string;
  /** The reminder email: null (not yet), sending, sent, failed or skipped, and why. */
  reminderStatus: 'sending' | 'sent' | 'failed' | 'skipped' | null;
  reminderReason: string;
  reminderSentAt: string | null;
  /** The deposit and where it's up to (none, pending, paid, refunded, failed). */
  depositAmount: number;
  paymentStatus: 'none' | 'pending' | 'paid' | 'refunded' | 'failed';
  /** A late-cancellation fee, and whether it was collected. */
  cancellationFee: number;
  feeStatus: 'none' | 'pending' | 'charged' | 'failed' | 'waived';
};

export const DEFAULT_OPENING_HOURS: OpeningDay[] = [
  ...Array.from({ length: 5 }, () => ({ open: true, start: '09:00', end: '17:00' })),
  { open: true, start: '09:00', end: '14:00' },
  { open: false, start: '09:00', end: '17:00' },
];

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export const bookingSettingsStore = createStore<BookingSettings | null>(null);
export const bookingStaffStore = createStore<BookingStaff[]>([]);
export const bookingServicesStore = createStore<BookingService[]>([]);
export const timeOffStore = createStore<TimeOff[]>([]);
export const bookingsStore = createStore<Booking[]>([]);
/** Staff's own prices: "<staff id>:<service id>" -> price (see 20261122000000_booking_staff_prices.sql). */
export const staffPricesStore = createStore<Map<string, number | null>>(new Map());
export const bookingsLoadStore = createStore<'idle' | 'loading' | 'ready' | 'error'>('idle');

export const useBookingSettings = () => bookingSettingsStore.use();
export const useBookingStaff = () => bookingStaffStore.use();
export const useBookingServices = () => bookingServicesStore.use();
export const useTimeOff = () => timeOffStore.use();
export const useBookings = () => bookingsStore.use();
export const useBookingsLoad = () => bookingsLoadStore.use();
export const useStaffPrices = () => staffPricesStore.use();
/** What this business calls its people, bookings and customers, from the business type picked at sign-up. */
export const useBookingWords = () => bookingWords(bookingSettingsStore.use()?.businessTypes);

/** The business's time zone (where its bookings happen). */
export const businessTimeZone = () => businessStore.get()?.timezone || DEFAULT_TIME_ZONE;
export function useBusinessTimeZone() {
  return useBusiness()?.timezone || DEFAULT_TIME_ZONE;
}

// ---------------------------------------------------------------------------
// Reading rows
// ---------------------------------------------------------------------------

type SettingsRow = {
  slug: string;
  accepting: boolean;
  opening_hours: OpeningDay[] | null;
  slot_minutes: number;
  buffer_minutes: number;
  min_notice_minutes: number;
  max_days_ahead: number;
  cancel_notice_hours: number;
  cancellation_policy: string;
  reminder_hours: number;
  reminders_enabled?: boolean;
  deposit_type?: BookingSettings['depositType'];
  deposit_value?: number | string;
  cancellation_fee_enabled?: boolean;
  cancellation_fee_type?: BookingSettings['cancellationFeeType'];
  cancellation_fee_value?: number | string;
  cancellation_fee_hours?: number;
  owner_works?: boolean;
  business_types?: string[] | null;
};
type StaffRow = {
  id: string;
  employee_id: string | null;
  is_owner: boolean;
  name: string;
  active: boolean;
  hours: StaffDay[] | null;
  sort: number;
  requested_hours?: StaffDay[] | null;
  hours_requested_at?: string | null;
};

const daysOf = (v: unknown): StaffDay[] | null =>
  Array.isArray(v) && v.length === 7 ? v.map((d) => ({ working: !!d?.working, start: d?.start ?? '09:00', end: d?.end ?? '17:00' })) : null;
type ServiceRow = {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price: number | string | null;
  category?: string | null;
  active: boolean;
  sort: number;
};
type TimeOffRow = { id: string; staff_id: string | null; starts_at: string; ends_at: string; status: TimeOff['status']; note: string };
type BookingRow = {
  id: string;
  service_id: string | null;
  staff_id: string;
  staff_chosen: boolean;
  service_name: string;
  duration_minutes: number;
  price: number | string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  notes: string;
  starts_at: string;
  ends_at: string;
  blocked_until: string;
  status: BookingStatus;
  source: 'online' | 'owner';
  cancelled_by: 'customer' | 'business' | null;
  created_at: string;
  reminder_status?: Booking['reminderStatus'];
  reminder_reason?: string;
  reminder_sent_at?: string | null;
  deposit_amount?: number | string;
  payment_status?: Booking['paymentStatus'];
  cancellation_fee?: number | string;
  fee_status?: Booking['feeStatus'];
};

const validDays = <T,>(v: unknown): v is T[] => Array.isArray(v) && v.length === 7;

export const settingsFromRow = (r: SettingsRow): BookingSettings => ({
  slug: r.slug,
  accepting: r.accepting,
  openingHours: validDays<OpeningDay>(r.opening_hours)
    ? r.opening_hours.map((d, i) => ({
        open: !!d?.open,
        start: d?.start ?? DEFAULT_OPENING_HOURS[i].start,
        end: d?.end ?? DEFAULT_OPENING_HOURS[i].end,
      }))
    : DEFAULT_OPENING_HOURS,
  slotMinutes: r.slot_minutes,
  bufferMinutes: r.buffer_minutes,
  minNoticeMinutes: r.min_notice_minutes,
  maxDaysAhead: r.max_days_ahead,
  cancelNoticeHours: r.cancel_notice_hours,
  cancellationPolicy: r.cancellation_policy ?? '',
  reminderHours: r.reminder_hours,
  remindersEnabled: r.reminders_enabled ?? true,
  depositType: r.deposit_type ?? 'none',
  depositValue: Number(r.deposit_value ?? 0),
  cancellationFeeEnabled: r.cancellation_fee_enabled ?? false,
  cancellationFeeType: r.cancellation_fee_type ?? 'fixed',
  cancellationFeeValue: Number(r.cancellation_fee_value ?? 0),
  cancellationFeeHours: r.cancellation_fee_hours ?? 24,
  ownerWorks: r.owner_works ?? true,
  businessTypes: r.business_types ?? [],
});

const staffFromRow = (r: StaffRow): BookingStaff => ({
  id: r.id,
  employeeId: r.employee_id,
  isOwner: r.is_owner,
  name: r.name,
  active: r.active,
  hours: daysOf(r.hours),
  sort: r.sort,
  hoursRequestedAt: r.hours_requested_at ?? null,
  requestedHours: daysOf(r.requested_hours),
});

const serviceFromRow = (r: ServiceRow): BookingService => ({
  id: r.id,
  name: r.name,
  description: r.description ?? '',
  durationMinutes: r.duration_minutes,
  price: r.price === null ? null : Number(r.price),
  category: r.category ?? '',
  active: r.active,
  sort: r.sort,
});

const timeOffFromRow = (r: TimeOffRow): TimeOff => ({
  id: r.id,
  staffId: r.staff_id,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  status: r.status,
  note: r.note ?? '',
});

export const bookingFromRow = (r: BookingRow): Booking => ({
  id: r.id,
  serviceId: r.service_id,
  staffId: r.staff_id,
  staffChosen: r.staff_chosen,
  serviceName: r.service_name,
  durationMinutes: r.duration_minutes,
  price: r.price === null ? null : Number(r.price),
  customerName: r.customer_name,
  customerPhone: r.customer_phone ?? '',
  customerEmail: r.customer_email ?? '',
  notes: r.notes ?? '',
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  blockedUntil: r.blocked_until,
  status: r.status,
  source: r.source,
  cancelledBy: r.cancelled_by,
  createdAt: r.created_at,
  reminderStatus: r.reminder_status ?? null,
  reminderReason: r.reminder_reason ?? '',
  reminderSentAt: r.reminder_sent_at ?? null,
  depositAmount: Number(r.deposit_amount ?? 0),
  paymentStatus: r.payment_status ?? 'none',
  cancellationFee: Number(r.cancellation_fee ?? 0),
  feeStatus: r.fee_status ?? 'none',
});

const BOOKING_COLUMNS =
  'id, service_id, staff_id, staff_chosen, service_name, duration_minutes, price, customer_name, customer_phone, customer_email, notes, starts_at, ends_at, blocked_until, status, source, cancelled_by, created_at, deposit_amount, payment_status';

// ---------------------------------------------------------------------------
// Loading (and live updates)
// ---------------------------------------------------------------------------

/** Added by later database files (reminders, cancellation fees): left out until those have been run. */
const REMINDER_COLUMNS = 'reminder_status, reminder_reason, reminder_sent_at, cancellation_fee, fee_status';

/** Bookings from about 13 months ago onwards (enough for a year of analytics). */
async function fetchBookings() {
  const since = new Date(Date.now() - 400 * 86_400_000).toISOString();
  const all: Booking[] = [];
  let columns = `${BOOKING_COLUMNS}, ${REMINDER_COLUMNS}`;
  for (let from = 0; from < 50_000; from += 1000) {
    const page = () =>
      supabase
        .from('bookings')
        .select(columns)
        .gte('starts_at', since)
        .order('starts_at')
        .order('id')
        .range(from, from + 999);
    let { data, error } = await page();
    if (error?.code === '42703' && columns !== BOOKING_COLUMNS) {
      columns = BOOKING_COLUMNS;
      ({ data, error } = await page());
    }
    if (error) throw error;
    const rows = (data ?? []) as unknown as BookingRow[];
    all.push(...rows.map(bookingFromRow));
    if (rows.length < 1000) break;
  }
  return all;
}

export async function loadBookingsData() {
  bookingsLoadStore.set('loading');
  try {
    const [settings, staff, services, timeOff, bookings, prices] = await Promise.all([
      supabase.from('booking_settings').select('*').maybeSingle<SettingsRow>(),
      supabase.from('booking_staff').select('*').order('sort').order('name'),
      supabase.from('booking_services').select('*').order('sort').order('name'),
      supabase
        .from('booking_time_off')
        .select('id, staff_id, starts_at, ends_at, status, note')
        .gte('ends_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
        .order('starts_at'),
      fetchBookings(),
      supabase.from('booking_staff_prices').select('staff_id, service_id, price'),
    ]);
    for (const r of [settings, staff, services, timeOff]) if (r.error) throw r.error;
    bookingSettingsStore.set(settings.data ? settingsFromRow(settings.data) : null);
    bookingStaffStore.set(((staff.data ?? []) as StaffRow[]).map(staffFromRow));
    bookingServicesStore.set(((services.data ?? []) as ServiceRow[]).map(serviceFromRow));
    timeOffStore.set(((timeOff.data ?? []) as TimeOffRow[]).map(timeOffFromRow));
    bookingsStore.set(bookings);
    // Not there until the staff prices file has been run: everyone pays the usual price.
    staffPricesStore.set(
      new Map(((prices.data ?? []) as { staff_id: string; service_id: string; price: number | string | null }[]).map((r) => [
          priceKey(r.staff_id, r.service_id),
          r.price === null ? null : Number(r.price),
        ])),
    );
    bookingsLoadStore.set('ready');
  } catch (e) {
    console.warn('Could not load bookings:', e instanceof Error ? e.message : e);
    bookingsLoadStore.set('error');
  }
}

export function clearBookingsData() {
  bookingSettingsStore.set(null);
  bookingStaffStore.set([]);
  bookingServicesStore.set([]);
  timeOffStore.set([]);
  bookingsStore.set([]);
  staffPricesStore.set(new Map());
  bookingsLoadStore.set('idle');
}

/**
 * Loads the bookings data for a NexGain Bookings business and keeps it up to
 * date: a booking made, moved or cancelled online shows straight away. Used by
 * the NexGain Bookings owner and employee layouts.
 */
export function useBookingsSync() {
  const business = useBusiness();
  const businessId = business?.id ?? null;
  const bookingsSystem = systemOf(business) === 'bookings';
  useEffect(() => {
    if (!businessId || !bookingsSystem) return;
    loadBookingsData();
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Several changes together (e.g. a reschedule) reload once.
    const reload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fetchBookings()
          .then((list) => bookingsStore.set(list))
          .catch(() => {});
      }, 300);
    };
    const channel = supabase
      .channel(`bookings-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `business_id=eq.${businessId}` }, reload)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
      clearBookingsData();
    };
  }, [businessId, bookingsSystem]);
}

// ---------------------------------------------------------------------------
// Owner: settings, services, staff and time off
// ---------------------------------------------------------------------------

const businessId = () => businessStore.get()?.id ?? null;
const friendly = (message: string) =>
  /network|fetch/i.test(message) ? 'Couldn’t save. Check your internet connection and try again.' : 'Couldn’t save that. Please try again.';

function settingsColumns(p: Partial<BookingSettings>) {
  const c: Record<string, unknown> = {};
  if (p.slug !== undefined) c.slug = p.slug;
  if (p.accepting !== undefined) c.accepting = p.accepting;
  if (p.openingHours !== undefined) c.opening_hours = p.openingHours;
  if (p.slotMinutes !== undefined) c.slot_minutes = p.slotMinutes;
  if (p.bufferMinutes !== undefined) c.buffer_minutes = p.bufferMinutes;
  if (p.minNoticeMinutes !== undefined) c.min_notice_minutes = p.minNoticeMinutes;
  if (p.maxDaysAhead !== undefined) c.max_days_ahead = p.maxDaysAhead;
  if (p.cancelNoticeHours !== undefined) c.cancel_notice_hours = p.cancelNoticeHours;
  if (p.cancellationPolicy !== undefined) c.cancellation_policy = p.cancellationPolicy;
  if (p.reminderHours !== undefined) c.reminder_hours = p.reminderHours;
  if (p.remindersEnabled !== undefined) c.reminders_enabled = p.remindersEnabled;
  if (p.depositType !== undefined) c.deposit_type = p.depositType;
  if (p.depositValue !== undefined) c.deposit_value = p.depositValue;
  if (p.cancellationFeeEnabled !== undefined) c.cancellation_fee_enabled = p.cancellationFeeEnabled;
  if (p.cancellationFeeType !== undefined) c.cancellation_fee_type = p.cancellationFeeType;
  if (p.cancellationFeeValue !== undefined) c.cancellation_fee_value = p.cancellationFeeValue;
  if (p.cancellationFeeHours !== undefined) c.cancellation_fee_hours = p.cancellationFeeHours;
  if (p.ownerWorks !== undefined) c.owner_works = p.ownerWorks;
  return c;
}

/** Saves booking settings. Returns an error message, or null. */
export async function updateBookingSettings(changes: Partial<BookingSettings>): Promise<string | null> {
  const id = businessId();
  const before = bookingSettingsStore.get();
  if (!id || !before) return 'Bookings aren’t set up yet.';
  bookingSettingsStore.set({ ...before, ...changes });
  const { error } = await supabase
    .from('booking_settings')
    .update({ ...settingsColumns(changes), updated_at: new Date().toISOString() })
    .eq('business_id', id);
  if (!error) return null;
  bookingSettingsStore.set(before);
  if (error.code === '23505') return 'That link name is already taken. Please try another.';
  return friendly(error.message);
}

/**
 * "Do you do the work yourself?" Yes = the owner is on the booking page and has
 * a schedule; No = they aren't and don't (the database turns their staff row on/off).
 */
export async function setOwnerWorks(works: boolean): Promise<string | null> {
  const error = await updateBookingSettings({ ownerWorks: works });
  if (!error) bookingStaffStore.set((list) => list.map((s) => (s.isOwner ? { ...s, active: works } : s)));
  return error;
}

/** Whether the owner shows on the calendar and booking page (they do the work themselves). */
export const ownerWorks = (settings: BookingSettings | null) => settings?.ownerWorks ?? true;

/** A link name from what the owner typed: "Jo's Cuts!" -> "jos-cuts". */
export function cleanSlug(text: string) {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

export type ServiceDraft = Omit<BookingService, 'id' | 'sort'> & { id: string | null };

/** Adds or updates a service. Returns an error message, or null. */
export async function saveService(draft: ServiceDraft): Promise<string | null> {
  const id = businessId();
  if (!id) return 'Bookings aren’t set up yet.';
  const cols = {
    name: draft.name.trim(),
    description: draft.description.trim(),
    duration_minutes: draft.durationMinutes,
    price: draft.price,
    category: draft.category.trim(),
    active: draft.active,
    updated_at: new Date().toISOString(),
  };
  const list = bookingServicesStore.get();
  const { data, error } = draft.id
    ? await supabase.from('booking_services').update(cols).eq('id', draft.id).select().single<ServiceRow>()
    : await supabase
        .from('booking_services')
        .insert({ ...cols, business_id: id, sort: list.length ? Math.max(...list.map((s) => s.sort)) + 1 : 0 })
        .select()
        .single<ServiceRow>();
  if (error) return friendly(error.message);
  const saved = serviceFromRow(data);
  bookingServicesStore.set(draft.id ? list.map((s) => (s.id === saved.id ? saved : s)) : [...list, saved]);
  return null;
}

/** Removes a service. Past bookings keep its name and price. */
export async function deleteService(serviceId: string): Promise<string | null> {
  const { error } = await supabase.from('booking_services').delete().eq('id', serviceId);
  if (error) return friendly(error.message);
  bookingServicesStore.set((list) => list.filter((s) => s.id !== serviceId));
  return null;
}

/** Changes a bookable person's name, hours or whether they can be booked. */
export async function updateStaff(staffId: string, changes: Partial<Pick<BookingStaff, 'name' | 'active' | 'hours'>>): Promise<string | null> {
  const before = bookingStaffStore.get();
  bookingStaffStore.set(before.map((s) => (s.id === staffId ? { ...s, ...changes } : s)));
  const { error } = await supabase.from('booking_staff').update(changes).eq('id', staffId);
  if (!error) return null;
  bookingStaffStore.set(before);
  return friendly(error.message);
}

/** Owner adds time off (approved straight away). staffId null = the whole business is closed. */
export async function addTimeOff(staffId: string | null, startsAt: string, endsAt: string, note: string): Promise<string | null> {
  const id = businessId();
  if (!id) return 'Bookings aren’t set up yet.';
  if (new Date(endsAt) <= new Date(startsAt)) return 'The end must be after the start.';
  const { data, error } = await supabase
    .from('booking_time_off')
    .insert({ business_id: id, staff_id: staffId, starts_at: startsAt, ends_at: endsAt, note: note.trim(), status: 'approved' })
    .select('id, staff_id, starts_at, ends_at, status, note')
    .single<TimeOffRow>();
  if (error) return friendly(error.message);
  timeOffStore.set((list) => [...list, timeOffFromRow(data)].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
  return null;
}

export async function setTimeOffStatus(timeOffId: string, status: TimeOff['status']): Promise<string | null> {
  const { error } = await supabase.from('booking_time_off').update({ status }).eq('id', timeOffId);
  if (error) return friendly(error.message);
  timeOffStore.set((list) => list.map((t) => (t.id === timeOffId ? { ...t, status } : t)));
  return null;
}

export async function removeTimeOff(timeOffId: string): Promise<string | null> {
  const { error } = await supabase.from('booking_time_off').delete().eq('id', timeOffId);
  if (error) return friendly(error.message);
  timeOffStore.set((list) => list.filter((t) => t.id !== timeOffId));
  return null;
}

// ---------------------------------------------------------------------------
// Owner: bookings added, moved or cancelled by hand (walk-ins, phone bookings)
// ---------------------------------------------------------------------------

export type ManualBooking = {
  serviceId: string;
  staffId: string;
  startsAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  notes: string;
};

const OVERLAP = '23P01';
/** Raised by the database (bookings_on_roster) when the time isn't inside the person's rostered times. */
const OFF_ROSTER = 'NXR01';

/** A clear message for a booking the database refused. */
function bookingSaveError(error: { code?: string; message: string }) {
  if (error.code === OVERLAP) return 'That time overlaps another booking for this person. Choose another time.';
  if (error.code === OFF_ROSTER) return 'This person isn’t rostered on for all of that time. Choose a time inside their roster, or roster them on first.';
  return friendly(error.message);
}
const plusMinutes = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60000).toISOString();

/**
 * Adds a booking by hand. The minimum-notice rule doesn't apply, but staff can
 * only be booked inside their rostered times and never over another booking
 * for the same person (the database refuses both). Returns an error message, or null.
 */
export async function addManualBooking(b: ManualBooking): Promise<string | null> {
  const id = businessId();
  const service = bookingServicesStore.get().find((s) => s.id === b.serviceId);
  const settings = bookingSettingsStore.get();
  if (!id || !service || !settings) return 'Choose a service.';
  if (!b.customerName.trim()) return 'Enter the customer’s name.';
  const endsAt = plusMinutes(b.startsAt, service.durationMinutes);
  const price = priceFor(service, b.staffId, staffPricesStore.get());
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      business_id: id,
      service_id: service.id,
      staff_id: b.staffId,
      staff_chosen: true,
      service_name: service.name,
      duration_minutes: service.durationMinutes,
      price,
      customer_name: b.customerName.trim(),
      customer_phone: b.customerPhone.trim(),
      customer_email: b.customerEmail.trim().toLowerCase(),
      notes: b.notes.trim(),
      starts_at: b.startsAt,
      ends_at: endsAt,
      blocked_until: plusMinutes(endsAt, settings.bufferMinutes),
      source: 'owner',
    })
    .select(BOOKING_COLUMNS)
    .single<BookingRow>();
  if (error) return bookingSaveError(error);
  bookingsStore.set((list) => [...list.filter((x) => x.id !== data.id), bookingFromRow(data)].sort((a, c) => a.startsAt.localeCompare(c.startsAt)));
  return null;
}

/** Moves a booking to another time and/or person (keeps its length and buffer). */
export async function moveBooking(bookingId: string, startsAt: string, staffId: string): Promise<string | null> {
  const b = bookingsStore.get().find((x) => x.id === bookingId);
  if (!b) return 'Booking not found.';
  const buffer = new Date(b.blockedUntil).getTime() - new Date(b.endsAt).getTime();
  const endsAt = plusMinutes(startsAt, b.durationMinutes);
  const changes = {
    starts_at: startsAt,
    ends_at: endsAt,
    blocked_until: new Date(new Date(endsAt).getTime() + buffer).toISOString(),
    staff_id: staffId,
    reminder_sent_at: null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('bookings').update(changes).eq('id', bookingId);
  if (error) return bookingSaveError(error);
  bookingsStore.set((list) =>
    list
      .map((x) => (x.id === bookingId ? { ...x, startsAt, endsAt, blockedUntil: changes.blocked_until, staffId } : x))
      .sort((a, c) => a.startsAt.localeCompare(c.startsAt)),
  );
  return null;
}

/** Cancelled (by the business), Completed or No-show. Back to Confirmed undoes it. */
export async function setBookingStatus(bookingId: string, status: BookingStatus): Promise<string | null> {
  const changes =
    status === 'cancelled'
      ? { status, cancelled_at: new Date().toISOString(), cancelled_by: 'business' as const }
      : { status, cancelled_at: null, cancelled_by: null };
  const { error } = await supabase.from('bookings').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', bookingId);
  if (error) return error.code === OVERLAP ? 'That time has been booked since. Move it to another time instead.' : friendly(error.message);
  bookingsStore.set((list) =>
    list.map((x) => (x.id === bookingId ? { ...x, status, cancelledBy: status === 'cancelled' ? 'business' : null } : x)),
  );
  return null;
}

// ---------------------------------------------------------------------------
// Handy lookups
// ---------------------------------------------------------------------------

/** Bookings on one local day (business time), not cancelled, earliest first. */
export function bookingsOnDay(bookings: Booking[], dateKey: string, timeZone: string, includeCancelled = false) {
  return bookings.filter(
    (b) => (includeCancelled || b.status !== 'cancelled') && zonedParts(b.startsAt, timeZone).date === dateKey,
  );
}


// ---------------------------------------------------------------------------
// Money in the business's own currency (AUD, GBP, USD...)
// ---------------------------------------------------------------------------

const CURRENCY_LOCALE: Record<string, string> = { AUD: 'en-AU', GBP: 'en-GB', USD: 'en-US', NZD: 'en-NZ', EUR: 'en-IE', CAD: 'en-CA' };

/** The business's currency code, e.g. "AUD" (from "AUD – Australian Dollar"). */
export function currencyCode(currency = businessStore.get()?.currency) {
  const code = (currency ?? 'AUD').trim().slice(0, 3).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : 'AUD';
}

/** "$40.00", "£40.00" or "$40" (whole: no cents), in the business's currency. */
export function formatPrice(amount: number, { whole = false, currency }: { whole?: boolean; currency?: string } = {}) {
  const code = currencyCode(currency);
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALE[code] ?? 'en-AU', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  } catch {
    return amount.toFixed(whole ? 0 : 2);
  }
}

// ---------------------------------------------------------------------------
// Staff: their own appointments, days off and hours (see 20261119000000_bookings_staff.sql)
// ---------------------------------------------------------------------------

/** The bookable person who is this employee (null for the owner, or before loading). */
export function myStaff(staff: BookingStaff[], employeeId: string | null | undefined) {
  return employeeId ? (staff.find((s) => s.employeeId === employeeId) ?? null) : null;
}

/** The database's own message (e.g. "This booking was cancelled."), or a general one. */
const rpcError = (message: string) => (/network|fetch/i.test(message) ? friendly(message) : message);

/** Staff: Completed, No-show, or back to booked (their own appointments, once started). */
export async function markMyBooking(bookingId: string, status: 'completed' | 'no_show' | 'confirmed'): Promise<string | null> {
  const { error } = await supabase.rpc('booking_staff_set_status', { p_booking: bookingId, p_status: status });
  if (error) return rpcError(error.message);
  bookingsStore.set((list) => list.map((b) => (b.id === bookingId ? { ...b, status } : b)));
  return null;
}

/** Staff: ask for time off. The owner approves it before customers stop seeing those times. */
export async function requestTimeOff(staffId: string, startsAt: string, endsAt: string, note: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('booking_request_time_off', { p_starts: startsAt, p_ends: endsAt, p_note: note });
  if (error) return rpcError(error.message);
  timeOffStore.set((list) =>
    [...list, { id: data as string, staffId, startsAt, endsAt, status: 'pending' as const, note: note.trim() }].sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    ),
  );
  return null;
}

/** Staff: take back a request the owner hasn't answered. */
export async function withdrawTimeOff(timeOffId: string): Promise<string | null> {
  const { error } = await supabase.rpc('booking_withdraw_time_off', { p_id: timeOffId });
  if (error) return rpcError(error.message);
  timeOffStore.set((list) => list.filter((t) => t.id !== timeOffId));
  return null;
}

// ---------------------------------------------------------------------------
// Appointment reminders (sent by the booking-reminders Edge Function)
// ---------------------------------------------------------------------------

/** Upcoming appointments whose reminder couldn't be sent (with the reason), soonest first. */
export function reminderProblems(bookings: Booking[], now = new Date()) {
  return bookings.filter((b) => b.status === 'confirmed' && b.reminderStatus === 'failed' && new Date(b.startsAt) > now);
}

/** "Sent", "Couldn't send: ...", "Not sent: ..." or null when it isn't due yet. */
export function reminderText(b: Booking) {
  if (b.reminderStatus === 'sent') return 'Reminder sent';
  if (b.reminderStatus === 'sending') return 'Reminder sending…';
  if (b.reminderStatus === 'failed') return `Reminder couldn’t be sent: ${b.reminderReason}`;
  if (b.reminderStatus === 'skipped') return `No reminder: ${b.reminderReason}`;
  return null;
}

// ---------------------------------------------------------------------------
// Who does which service, at what price (see 20261125000000_bookings_staff_services.sql)
// A row = this person does it; its price is theirs (blank = the usual price).
// ---------------------------------------------------------------------------

export const priceKey = (staffId: string, serviceId: string) => `${staffId}:${serviceId}`;

/** Whether this person does the service (ticked in My Services & Prices). */
export const doesService = (staffId: string, serviceId: string, prices: Map<string, number | null>) => prices.has(priceKey(staffId, serviceId));

/** What this person charges for the service: their own price, or the service's usual price. */
export function priceFor(service: Pick<BookingService, 'id' | 'price'>, staffId: string | null, prices: Map<string, number | null>) {
  if (!staffId) return service.price;
  const own = prices.get(priceKey(staffId, service.id));
  return own === undefined || own === null ? service.price : own;
}

/** Bookable people who do the service. */
export function staffForService(service: BookingService | null | undefined, staff: BookingStaff[], prices = staffPricesStore.get()) {
  if (!service) return staff.filter((s) => s.active);
  return staff.filter((s) => s.active && doesService(s.id, service.id, prices));
}

/**
 * A person does (or stops doing) a service, at their own price (null = the usual
 * price). Staff change their own; the owner can change anyone's.
 */
export async function setStaffService(staffId: string, serviceId: string, does: boolean, price: number | null): Promise<string | null> {
  const id = businessId();
  if (!id) return 'Bookings aren’t set up yet.';
  const { error } = !does
    ? await supabase.from('booking_staff_prices').delete().eq('staff_id', staffId).eq('service_id', serviceId)
    : await supabase
        .from('booking_staff_prices')
        .upsert({ staff_id: staffId, service_id: serviceId, business_id: id, price, updated_at: new Date().toISOString() });
  if (error) return error.code === '42P01' ? 'Staff services aren’t set up yet. Run the database file first.' : friendly(error.message);
  staffPricesStore.set((map) => {
    const next = new Map(map);
    if (!does) next.delete(priceKey(staffId, serviceId));
    else next.set(priceKey(staffId, serviceId), price);
    return next;
  });
  return null;
}

/** The services in the order customers see them. */
export const sortedServices = (list: BookingService[]) => [...list].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

/** Moves a service up or down past the next one in its category (the order customers see). */
export async function moveService(serviceId: string, direction: -1 | 1): Promise<string | null> {
  const before = sortedServices(bookingServicesStore.get());
  const i = before.findIndex((x) => x.id === serviceId);
  if (i < 0) return null;
  const same = (x: BookingService) => x.category.trim() === before[i].category.trim() && x.active === before[i].active;
  let j = i + direction;
  while (j >= 0 && j < before.length && !same(before[j])) j += direction;
  if (j < 0 || j >= before.length) return null;
  const list = [...before];
  [list[i], list[j]] = [list[j], list[i]];
  const renumbered = list.map((x, n) => ({ ...x, sort: n }));
  const changed = renumbered.filter((x) => before.find((y) => y.id === x.id)?.sort !== x.sort);
  bookingServicesStore.set(renumbered);
  const results = await Promise.all(changed.map((x) => supabase.from('booking_services').update({ sort: x.sort }).eq('id', x.id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    bookingServicesStore.set(before);
    return friendly(failed.error.message);
  }
  return null;
}

/**
 * Saves the booking choices from owner sign-up, once the business exists: the
 * business types, "do you do the work yourself?", and the services (each
 * staff member, including the owner, gets them at the usual price).
 */
export async function saveBookingSignup(
  forBusinessId: string,
  choices: { typeIds: string[]; ownerWorks: boolean; services: { name: string; minutes: number; price: number | null; category: string }[] },
): Promise<string | null> {
  const { error: settingsError } = await supabase
    .from('booking_settings')
    .update({ owner_works: choices.ownerWorks, business_types: choices.typeIds, updated_at: new Date().toISOString() })
    .eq('business_id', forBusinessId);
  if (settingsError) return friendly(settingsError.message);
  if (choices.services.length === 0) return null;
  const { error } = await supabase.from('booking_services').insert(
    choices.services.map((x, n) => ({
      business_id: forBusinessId,
      name: x.name.trim().slice(0, 100),
      duration_minutes: x.minutes,
      price: x.price,
      category: x.category.slice(0, 100),
      sort: n,
    })),
  );
  return error ? friendly(error.message) : null;
}

// ---------------------------------------------------------------------------
// Deposits and cancellation fees (same rules as the database)
// ---------------------------------------------------------------------------

/** The deposit for a price: none, a fixed amount (never more than the price) or a percentage. */
export function depositFor(price: number | null, settings: Pick<BookingSettings, 'depositType' | 'depositValue'>) {
  const v = settings.depositValue;
  if (settings.depositType === 'fixed') return Math.round((price === null ? v : Math.min(v, price)) * 100) / 100;
  if (settings.depositType === 'percent') return Math.round((price ?? 0) * v) / 100;
  if (settings.depositType === 'full') return price ?? 0;
  return 0;
}

/** The cancellation fee for a price, if cancelled inside the window. */
export function cancellationFeeFor(price: number | null, settings: Pick<BookingSettings, 'cancellationFeeEnabled' | 'cancellationFeeType' | 'cancellationFeeValue'>) {
  if (!settings.cancellationFeeEnabled) return 0;
  const v = settings.cancellationFeeValue;
  if (settings.cancellationFeeType === 'percent') return Math.round((price ?? 0) * v) / 100;
  return Math.round((price === null ? v : Math.min(v, price)) * 100) / 100;
}

/** e.g. "$15 deposit paid", "$15 deposit refunded", or null with no deposit. */
export function depositText(b: Pick<Booking, 'depositAmount' | 'paymentStatus' | 'cancellationFee' | 'feeStatus'>) {
  if (!b.depositAmount) return null;
  const amount = formatPrice(b.depositAmount);
  switch (b.paymentStatus) {
    case 'paid':
      return `${amount} deposit paid`;
    case 'refunded':
      return b.cancellationFee > 0 ? `${amount} deposit paid; ${formatPrice(b.depositAmount - Math.min(b.cancellationFee, b.depositAmount))} refunded` : `${amount} deposit refunded`;
    case 'failed':
      return `${amount} deposit didn’t go through`;
    case 'pending':
      return `${amount} deposit waiting for payment`;
    default:
      return null;
  }
}
