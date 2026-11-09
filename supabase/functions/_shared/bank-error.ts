/**
 * A bank-data company (Basiq...) turned a request down. `reason` is their own
 * short explanation (never contains a secret), safe to show the owner.
 */
export class BankError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    detail: string,
  ) {
    super(detail);
  }
}

/** The bank-data company's reason from an error reply like { data: [{ title, detail }] }. */
export function reasonFrom(body: unknown): string {
  const b = body as { data?: { title?: string; detail?: string }[]; message?: string; error?: string } | null;
  const first = Array.isArray(b?.data) ? b.data[0] : undefined;
  return (first?.detail || first?.title || b?.message || b?.error || '').toString().slice(0, 200);
}
