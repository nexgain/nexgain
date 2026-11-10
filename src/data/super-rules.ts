// THE rule for whether a business has superannuation: only Australian
// businesses do. Every screen, column and calculation that shows or hides
// super uses this, so the rule lives in one place.

/**
 * True for Australian businesses. Businesses created before NexGain asked for
 * a country (country not set) were all Australian, so they count as Australian.
 */
export function businessUsesSuper(business: { country?: string | null } | null | undefined) {
  const country = business?.country ?? null;
  return country === null || country.toUpperCase() === 'AU';
}

/**
 * THE rule for whether GST features show (the GST page, dashboard tile, GST on
 * new quotes and invoices): Australian businesses registered for GST. Older
 * businesses with no country set count as Australian.
 */
export function businessUsesGst(business: { country?: string | null; gstRegistered?: boolean } | null | undefined) {
  return !!business && businessUsesSuper(business) && business.gstRegistered !== false;
}
