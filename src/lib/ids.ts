// Random ids in the database's format (UUID v4), made on the phone so new
// records can show straight away while they're saved in the background.
export function newId() {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/** Logs a failed background save without any of the saved values. */
export function warnSaveFailed(what: string, error: { message: string } | null) {
  if (error) console.warn(`Could not save ${what}:`, error.message);
}
