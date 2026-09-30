// The owner's calendar: jobs (kept in step with the Jobs page by the database),
// material deliveries and other reminders. Stored online ("calendar_events",
// owner only). Job events are changed through their job, never directly.
import type { SymbolViewProps } from 'expo-symbols';

import { localParts, toTimestamp } from '@/data/business-time';
import { createStore } from '@/data/store';
import { newId, warnSaveFailed } from '@/lib/ids';
import { supabase } from '@/lib/supabase';

export const EVENT_TYPES = ['job', 'delivery', 'other'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type CalendarEvent = {
  id: string;
  type: EventType;
  title: string;
  /** Brisbane date "YYYY-MM-DD" and times "HH:MM". */
  date: string;
  start: string;
  end: string;
  startsAt: string;
  endsAt: string;
  jobId: string | null;
  clientId: string | null;
  address: string;
  notes: string;
  status: string;
  supplier: string;
  deliveryItems: string;
};

type EventRow = {
  id: string;
  type: EventType;
  title: string;
  starts_at: string;
  ends_at: string;
  job_id: string | null;
  client_id: string | null;
  address: string;
  notes: string;
  status: string;
  supplier: string;
  delivery_items: string;
};

function fromRow(row: EventRow): CalendarEvent {
  const start = localParts(row.starts_at);
  const end = localParts(row.ends_at);
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    date: start.date,
    start: start.time,
    end: end.time,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    jobId: row.job_id,
    clientId: row.client_id,
    address: row.address,
    notes: row.notes,
    status: row.status,
    supplier: row.supplier,
    deliveryItems: row.delivery_items,
  };
}

export const eventsStore = createStore<CalendarEvent[]>([]);

export function useCalendarEvents() {
  return eventsStore.use();
}

const byStart = (a: CalendarEvent, b: CalendarEvent) => a.startsAt.localeCompare(b.startsAt);

export async function loadEvents() {
  const { data, error } = await supabase.from('calendar_events').select('*').order('starts_at');
  if (error) throw error;
  eventsStore.set((data as EventRow[]).map(fromRow));
}

export type EventDraft = {
  id?: string;
  type: Exclude<EventType, 'job'>;
  title: string;
  date: string;
  start: string;
  end: string;
  jobId: string | null;
  address: string;
  notes: string;
  supplier: string;
  deliveryItems: string;
};

/** Adds or edits a delivery / other event. */
export function saveEvent(draft: EventDraft, businessId: string) {
  const startsAt = toTimestamp(draft.date, draft.start);
  const endsAt = toTimestamp(draft.date, draft.end);
  const saved: CalendarEvent = {
    ...draft,
    id: draft.id ?? newId(),
    startsAt,
    endsAt,
    clientId: null,
    status: 'scheduled',
  };
  eventsStore.set((all) => [...all.filter((e) => e.id !== saved.id), saved].sort(byStart));
  supabase
    .from('calendar_events')
    .upsert({
      id: saved.id,
      business_id: businessId,
      type: saved.type,
      title: saved.title,
      starts_at: startsAt,
      ends_at: endsAt,
      job_id: saved.jobId,
      address: saved.address,
      notes: saved.notes,
      supplier: saved.supplier,
      delivery_items: saved.deliveryItems,
    })
    .then(({ error }) => warnSaveFailed('calendar event', error));
}

export function deleteEvent(id: string) {
  eventsStore.set((all) => all.filter((e) => e.id !== id));
  supabase
    .from('calendar_events')
    .delete()
    .eq('id', id)
    .then(({ error }) => warnSaveFailed('calendar event', error));
}

const icon = (ios: string, android: string) => ({ ios, android, web: android }) as SymbolViewProps['name'];

/** Each type's colour (fixed, readable on the dark owner theme) and icon. */
export const EVENT_TYPE_INFO: Record<EventType, { label: string; color: string; icon: SymbolViewProps['name'] }> = {
  job: { label: 'Job', color: '#3987e5', icon: icon('briefcase.fill', 'work') },
  delivery: { label: 'Delivery', color: '#c98500', icon: icon('shippingbox.fill', 'local_shipping') },
  other: { label: 'Other', color: '#9085e9', icon: icon('note.text', 'sticky_note_2') },
};
