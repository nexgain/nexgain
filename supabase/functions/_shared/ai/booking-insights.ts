// NexGain Bookings: the booking checks in the daily business health check.
// Only booking businesses have bookings, so these find nothing for anyone else.
// Pure functions only (tested with sample data); ai-insights/index.ts loads the
// bookings and saves what's found alongside the other insights.
import type { Insight } from './types.ts';

export type BookingRow = {
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  price: number | string | null;
  starts_at: string;
  ends_at: string;
  cancelled_by: 'customer' | 'business' | null;
  service_name: string;
};

const DAY = 86_400_000;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const round = (n: number) => Math.round(n * 100) / 100;
const price = (b: BookingRow) => Number(b.price ?? 0) || 0;
const earned = (b: BookingRow, now: number) => b.status === 'completed' || (b.status === 'confirmed' && Date.parse(b.ends_at) <= now);
const pct = (rate: number) => `${Math.round(rate * 100)}%`;

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `$${Math.round(amount)}`;
  }
}

/** Monday = 0 ... Sunday = 6, in the business's time zone. */
function weekdayIn(iso: string, timeZone: string) {
  const name = new Date(iso).toLocaleDateString('en-GB', { timeZone, weekday: 'long' });
  return Math.max(0, DAYS.indexOf(name));
}

function insight(i: Omit<Insight, 'related'>): Insight {
  return { ...i, related: [] };
}

/** What the booking checks found, for one business. */
export function bookingInsights(bookings: BookingRow[], opts: { timeZone: string; currency: string; now?: Date }): Insight[] {
  const now = (opts.now ?? new Date()).getTime();
  const between = (from: number, to: number) => bookings.filter((b) => Date.parse(b.starts_at) >= from && Date.parse(b.starts_at) < to);
  const last30 = between(now - 30 * DAY, now);
  const prev30 = between(now - 60 * DAY, now - 30 * DAY);
  const out: Insight[] = [];
  const $ = (n: number) => money(n, opts.currency);

  // 1. No-shows: appointments missed in the last 30 days.
  const noShows = last30.filter((b) => b.status === 'no_show');
  const happened = last30.filter((b) => earned(b, now)).length + noShows.length;
  const noShowRate = happened ? noShows.length / happened : 0;
  if (noShows.length >= 3 && noShowRate >= 0.1) {
    const lost = round(noShows.reduce((s, b) => s + price(b), 0));
    const high = noShowRate >= 0.2;
    out.push(
      insight({
        key: 'booking_no_shows',
        check: 'booking_no_shows',
        area: 'jobs',
        severity: high ? 'high' : 'medium',
        placements: high ? ['attention', 'analytics', 'notification'] : ['attention', 'analytics'],
        title: `${noShows.length} no-shows in the last 30 days`,
        summary: `${pct(noShowRate)} of appointments were missed in the last 30 days${lost > 0 ? `, about ${$(lost)} in lost bookings` : ''}.`,
        suggestion:
          'Make sure appointment reminders are on, add a no-show rule to your cancellation policy in Bookings Settings, and mark No-show on missed appointments so you can spot repeat customers.',
        estimatedSaving: lost > 0 ? lost : null,
        metrics: { noShows: noShows.length, noShowRate: round(noShowRate), lostValue: lost },
      }),
    );
  }

  // 2. Cancellations: bookings for the last 30 days that were cancelled.
  const cancelled = last30.filter((b) => b.status === 'cancelled');
  const cancelRate = last30.length ? cancelled.length / last30.length : 0;
  if (cancelled.length >= 5 && cancelRate >= 0.2) {
    const byCustomer = cancelled.filter((b) => b.cancelled_by === 'customer').length;
    out.push(
      insight({
        key: 'booking_cancellations',
        check: 'booking_cancellations',
        area: 'jobs',
        severity: 'medium',
        placements: ['attention', 'analytics'],
        title: `${pct(cancelRate)} of bookings were cancelled`,
        summary: `${cancelled.length} of ${last30.length} bookings in the last 30 days were cancelled (${byCustomer} by customers online).`,
        suggestion:
          'Ask for more notice before customers can cancel online (Bookings Settings › Customers can change or cancel online), and keep reminders on so customers move rather than cancel.',
        estimatedSaving: null,
        metrics: { cancelled: cancelled.length, bookings: last30.length, cancellationRate: round(cancelRate), byCustomer },
      }),
    );
  }

  // 3. Booking revenue down on the 30 days before.
  const revenueNow = round(last30.filter((b) => earned(b, now)).reduce((s, b) => s + price(b), 0));
  const revenueBefore = round(prev30.filter((b) => earned(b, now)).reduce((s, b) => s + price(b), 0));
  if (revenueBefore >= 200 && revenueNow <= revenueBefore * 0.8) {
    const drop = (revenueBefore - revenueNow) / revenueBefore;
    out.push(
      insight({
        key: 'booking_revenue_drop',
        check: 'booking_revenue_drop',
        area: 'finance',
        severity: drop >= 0.4 ? 'high' : 'medium',
        placements: ['attention', 'analytics'],
        title: `Booking revenue down ${pct(drop)}`,
        summary: `Bookings brought in ${$(revenueNow)} in the last 30 days, down from ${$(revenueBefore)} the 30 days before.`,
        suggestion:
          'Share your booking link again (Instagram, Facebook, Google), message past customers who haven’t been back, and check your opening hours give enough times to book.',
        estimatedSaving: round(revenueBefore - revenueNow),
        metrics: { revenueNow, revenueBefore, drop: round(drop) },
      }),
    );
  }

  // 4. A quiet day: over the last 8 weeks, a working day well below the others.
  const recent = between(now - 56 * DAY, now).filter((b) => b.status !== 'cancelled');
  if (recent.length >= 20) {
    const counts = Array(7).fill(0) as number[];
    for (const b of recent) counts[weekdayIn(b.starts_at, opts.timeZone)]++;
    const workingDays = counts.map((c, d) => ({ c, d })).filter((x) => x.c > 0);
    if (workingDays.length >= 3) {
      const average = recent.length / workingDays.length;
      const quietest = workingDays.reduce((a, b) => (b.c < a.c ? b : a));
      if (quietest.c < average * 0.4) {
        out.push(
          insight({
            key: `booking_quiet_day:${quietest.d}`,
            check: 'booking_quiet_day',
            area: 'jobs',
            severity: 'low',
            placements: ['other', 'analytics'],
            title: `${DAYS[quietest.d]}s are quiet`,
            summary: `${DAYS[quietest.d]}s had ${quietest.c} bookings in the last 8 weeks, against about ${Math.round(average)} on your other working days.`,
            suggestion: `Try a ${DAYS[quietest.d]} special or a quieter-day price, or use ${DAYS[quietest.d]}s for admin and shorter opening hours.`,
            estimatedSaving: null,
            metrics: { day: DAYS[quietest.d], bookings: quietest.c, average: round(average) },
          }),
        );
      }
    }
  }

  // 5. The most popular service (for the Analytics page).
  const live30 = last30.filter((b) => b.status !== 'cancelled');
  if (live30.length >= 10) {
    const counts = new Map<string, number>();
    for (const b of live30) counts.set(b.service_name, (counts.get(b.service_name) ?? 0) + 1);
    const [name, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = count / live30.length;
    if (share >= 0.3) {
      out.push(
        insight({
          key: 'booking_top_service',
          check: 'booking_top_service',
          area: 'jobs',
          severity: 'low',
          placements: ['analytics'],
          title: `${name} is your most booked service`,
          summary: `${pct(share)} of bookings in the last 30 days were for ${name} (${count} bookings).`,
          suggestion: `Keep plenty of times free for ${name}, and check its price still covers your time and products.`,
          estimatedSaving: null,
          metrics: { service: name, bookings: count, share: round(share) },
        }),
      );
    }
  }

  return out;
}
