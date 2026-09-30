// Upcoming jobs, deliveries and reminders for the owner's Dashboard, taken from
// the Calendar (one source of truth: change it there and it changes here).
import { useCalendarEvents, type CalendarEvent } from '@/data/calendar';
import { useClients } from '@/data/clients';
import { format12h } from '@/data/employee-roster';
import { fromDateKey } from '@/data/shifts';

export type UpcomingItemType = 'delivery' | 'materials' | 'job' | 'inspection' | 'other';

export type UpcomingItem = {
  id: string;
  type: UpcomingItemType;
  title: string;
  /** Who it's for or from, e.g. the client or supplier. */
  source: string;
  location: string;
  date: Date;
  /** 24h "HH:MM". */
  time: string;
  /** The calendar event it came from. */
  event: CalendarEvent;
};

/** The next few calendar items that haven't finished, soonest first. */
export function useUpcomingItems(limit = 5): UpcomingItem[] {
  const events = useCalendarEvents();
  const clients = useClients();
  const now = new Date().toISOString();
  return events
    .filter((e) => e.endsAt >= now && e.status !== 'completed' && e.status !== 'cancelled')
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      source:
        e.type === 'job'
          ? (clients.find((c) => c.id === e.clientId)?.name ?? '')
          : e.type === 'delivery'
            ? e.supplier
            : 'Reminder',
      location: e.address,
      date: fromDateKey(e.date),
      time: e.start,
      event: e,
    }));
}

export type UpcomingTone = 'today' | 'tomorrow' | 'soon' | 'later';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** e.g. "Today · 7:00 AM", "Tomorrow · 9:00 AM", "In 3 days · 6:30 AM", "Wed 30 Sep · 10:00 AM". */
export function upcomingTiming(item: Pick<UpcomingItem, 'date' | 'time'>, now = new Date()) {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(item.date) - start(now)) / DAY_MS);
  const time = format12h(item.time);

  if (days === 0) return { tone: 'today' as const, label: `Today · ${time}` };
  if (days === 1) return { tone: 'tomorrow' as const, label: `Tomorrow · ${time}` };
  if (days > 1 && days < 7) return { tone: 'soon' as const, label: `In ${days} days · ${time}` };
  const d = item.date;
  return {
    tone: 'later' as const,
    label: `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${time}`,
  };
}
