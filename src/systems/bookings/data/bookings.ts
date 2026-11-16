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
import { DEFAULT_TIME_ZONE, zonedParts } from '@/systems/bookings/data/booking-time';

/** The public booking page. Change here if NexGain moves to its own domain. */
export const BOOKING_PAGE_URL = 'https://nexgain.github.io/nexgain/book/';
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
};

export type BookingService = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number | null;
  /** Staff who do it; empty = everyone. */
  staffIds: string[];
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
export const bookingsLoadStore = createStore<'idle' | 'loading' | 'ready' | 'error'>('idle');

export const useBookingSettings = () => bookingSettingsStore.use();
export const useBookingStaff = () => bookingStaffStore.use();
export const useBookingServices = () => bookingServicesStore.use();
export const useTimeOff = () => timeOffStore.use();
export const useBookings = () => bookingsStore.use();
export const useBookingsLoad = () => bookingsLoadStore.use();

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
};
type StaffRow = { id: string; employee_id: string | null; is_owner: boolean; name: string; active: boolean; hours: StaffDay[] | null; sort: number };
type ServiceRow = {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price: number | string | null;
  staff_ids: string[] | null;
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
});

const staffFromRow = (r: StaffRow): BookingStaff => ({
  id: r.id,
  employeeId: r.employee_id,
  isOwner: r.is_owner,
  name: r.name,
  active: r.active,
  hours: validDays<StaffDay>(r.hours)
    ? r.hours.map((d) => ({ working: !!d?.working, start: d?.start ?? '09:00', end: d?.end ?? '17:00' }))
    : null,
  sort: r.sort,
});

const serviceFromRow = (r: ServiceRow): BookingService => ({
  id: r.id,
  name: r.name,
  description: r.description ?? '',
  durationMinutes: r.duration_minutes,
  price: r.price === null ? null : Number(r.price),
  staffIds: r.staff_ids ?? [],
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
});

const BOOKING_COLUMNS =
  'id, service_id, staff_id, staff_chosen, service_name, duration_minutes, price, customer_name, customer_phone, customer_email, notes, starts_at, ends_at, blocked_until, status, source, cancelled_by, created_at';

// ---------------------------------------------------------------------------
// Loading (and live updates)
// ---------------------------------------------------------------------------

/** Bookings from about 13 months ago onwards (enough for a year of analytics). */
async function fetchBookings() {
  const since = new Date(Date.now() - 400 * 86_400_000).toISOString();
  const all: Booking[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await supabase
      .from('bookings')
      .select(BOOKING_COLUMNS)
      .gte('starts_at', since)
      .order('starts_at')
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as BookingRow[];
    all.push(...rows.map(bookingFromRow));
    if (rows.length < 1000) break;
  }
  return all;
}

export async function loadBookingsData() {
  bookingsLoadStore.set('loading');
  try {
    const [settings, staff, services, timeOff, bookings] = await Promise.all([
      supabase.from('booking_settings').select('*').maybeSingle<SettingsRow>(),
      supabase.from('booking_staff').select('id, employee_id, is_owner, name, active, hours, sort').order('sort').order('name'),
      supabase.from('booking_services').select('id, name, description, duration_minutes, price, staff_ids, active, sort').order('sort').order('name'),
      supabase
        .from('booking_time_off')
        .select('id, staff_id, starts_at, ends_at, status, note')
        .gte('ends_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
        .order('starts_at'),
      fetchBookings(),
    ]);
    for (const r of [settings, staff, services, timeOff]) if (r.error) throw r.error;
    bookingSettingsStore.set(settings.data ? settingsFromRow(settings.data) : null);
    bookingStaffStore.set(((staff.data ?? []) as StaffRow[]).map(staffFromRow));
    bookingServicesStore.set(((services.data ?? []) as ServiceRow[]).map(serviceFromRow));
    timeOffStore.set(((timeOff.data ?? []) as TimeOffRow[]).map(timeOffFromRow));
    bookingsStore.set(bookings);
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
    staff_ids: draft.staffIds,
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
const plusMinutes = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60000).toISOString();

/**
 * Adds a booking by hand. The owner can book outside opening hours or the
 * notice rules, but never over another booking for the same person (the
 * database refuses overlaps). Returns an error message, or null.
 */
export async function addManualBooking(b: ManualBooking): Promise<string | null> {
  const id = businessId();
  const service = bookingServicesStore.get().find((s) => s.id === b.serviceId);
  const settings = bookingSettingsStore.get();
  if (!id || !service || !settings) return 'Choose a service.';
  if (!b.customerName.trim()) return 'Enter the customer’s name.';
  const endsAt = plusMinutes(b.startsAt, service.durationMinutes);
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      business_id: id,
      service_id: service.id,
      staff_id: b.staffId,
      staff_chosen: true,
      service_name: service.name,
      duration_minutes: service.durationMinutes,
      price: service.price,
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
  if (error) return error.code === OVERLAP ? 'That time overlaps another booking for this person. Choose another time.' : friendly(error.message);
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
  if (error) return error.code === OVERLAP ? 'That time overlaps another booking for this person. Choose another time.' : friendly(error.message);
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

/** Who can do a service (everyone when it has no staff list), only those who can be booked. */
export function staffForService(service: BookingService | null | undefined, staff: BookingStaff[]) {
  const active = staff.filter((s) => s.active);
  if (!service || service.staffIds.length === 0) return active;
  return active.filter((s) => service.staffIds.includes(s.id));
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
