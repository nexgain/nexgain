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
