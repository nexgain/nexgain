// Upcoming deliveries, orders and important dates for the owner. These will be
// found by AI scanning the owner's connected email and integrations; nothing is
// connected yet, so the list is empty.
import { format12h } from '@/data/employee-roster';

export type UpcomingItemType = 'delivery' | 'materials' | 'job' | 'inspection';

export type UpcomingItem = {
  id: string;
  type: UpcomingItemType;
  title: string;
  /** Who it's from, e.g. a supplier name. */
  source: string;
  location: string;
  date: Date;
  /** 24h "HH:MM". */
  time: string;
};

export function getUpcomingItems(): UpcomingItem[] {
  return [];
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
