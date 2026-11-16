// =============================================================================
//  PAYMENT SERVICE — every payment NexGain Bookings makes goes through this file.
// =============================================================================
//
//  TEST MODE: Stripe is NOT connected yet. Every function below pretends the
//  payment worked and returns a fake reference starting "test_", so the whole
//  booking flow (deposit, refunds, cancellation fees) can be tested for free.
//  No card is charged and no money moves.
//
//  The only other payment code is on the booking page: docs/book/payment.js
//  (where the card form goes). Nothing else needs to change to go live.
//
//  ---------------------------------------------------------------------------
//  TO CONNECT STRIPE (when you're ready):
//   1. Make a Stripe account (https://dashboard.stripe.com) and, for each
//      business to be paid directly, set up Stripe Connect (so money goes to
//      the business, not to NexGain).
//   2. Keep the SECRET key on the server only, never in the app or a web page:
//        npx supabase secrets set STRIPE_SECRET_KEY=sk_live_... --project-ref <your ref>
//      (use sk_test_... first to test with Stripe's test cards).
//   3. Put the PUBLISHABLE key (pk_...) in docs/book/payment.js (it's safe to show).
//   4. Fill in each TODO below, set PAYMENTS_LIVE = true, and redeploy the
//      booking-page function.
//   5. Add a Stripe webhook (TODO in takeDeposit) so payments that finish after
//      the page is closed are still recorded.
//  ---------------------------------------------------------------------------

/** false = test mode (pretend payments). Set to true once Stripe is connected below. */
export const PAYMENTS_LIVE = false;

export type PaymentResult =
  | { ok: true; reference: string }
  | { ok: false; reason: string };

/** A fake reference for test mode, e.g. "test_dep_k3j2h1". */
const testReference = (kind: string) => `test_${kind}_${crypto.randomUUID().slice(0, 8)}`;

/**
 * Take the deposit when a customer books.
 * Called by the booking-page function straight after the booking is saved.
 * A failed payment cancels the booking so the time is free again.
 */
export async function takeDeposit(input: {
  /** The amount, e.g. 15.5 (dollars, not cents). */
  amount: number;
  /** e.g. "AUD", "GBP", "USD". */
  currency: string;
  /** e.g. "Deposit: Haircut with Alex, Fade Lab". */
  description: string;
  customerEmail: string;
  /** NexGain's booking id, saved on the payment so they can be matched up. */
  bookingId: string;
  /** From the booking page (docs/book/payment.js): the card payment it confirmed. */
  pagePaymentToken?: string | null;
}): Promise<PaymentResult> {
  if (!PAYMENTS_LIVE) return { ok: true, reference: testReference('dep') };

  // TODO (Stripe): the usual flow is
  //   a) On the booking page (payment.js), Stripe.js collects the card and
  //      confirms a PaymentIntent created for this booking, then sends its id
  //      here as input.pagePaymentToken.
  //   b) Here, check that PaymentIntent really succeeded for the right amount:
  //        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');            // <- the secret key
  //        const res = await fetch(`https://api.stripe.com/v1/payment_intents/${input.pagePaymentToken}`, {
  //          headers: { Authorization: `Bearer ${stripeKey}` },
  //        });
  //        const intent = await res.json();
  //        if (intent.status !== 'succeeded' || intent.amount !== Math.round(input.amount * 100)) {
  //          return { ok: false, reason: 'The payment didn’t go through.' };
  //        }
  //        return { ok: true, reference: intent.id };
  //   c) Also add a webhook (payment_intent.succeeded / payment_failed) that
  //      calls the booking_record_payment database function, in case the
  //      customer closes the page before this runs.
  return { ok: false, reason: 'Payments aren’t connected yet.' };
}

/** Refund some or all of a deposit (customer cancelled in time, or the fee was less than the deposit). */
export async function refundDeposit(input: {
  /** The reference takeDeposit returned (a Stripe PaymentIntent id once live). */
  reference: string;
  amount: number;
  currency: string;
  bookingId: string;
}): Promise<PaymentResult> {
  if (!PAYMENTS_LIVE || input.reference.startsWith('test_')) return { ok: true, reference: testReference('ref') };

  // TODO (Stripe): refund part of the payment.
  //   const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');               // <- the secret key
  //   const res = await fetch('https://api.stripe.com/v1/refunds', {
  //     method: 'POST',
  //     headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  //     body: new URLSearchParams({ payment_intent: input.reference, amount: String(Math.round(input.amount * 100)) }),
  //   });
  //   const refund = await res.json();
  //   return refund.id ? { ok: true, reference: refund.id } : { ok: false, reason: refund.error?.message ?? 'Refund failed.' };
  return { ok: false, reason: 'Payments aren’t connected yet.' };
}

/**
 * Charge the part of a late-cancellation fee that the deposit doesn't cover
 * (or the whole fee when there was no deposit).
 */
export async function chargeCancellationFee(input: {
  amount: number;
  currency: string;
  customerEmail: string;
  bookingId: string;
  /** The deposit's reference, if there was one (its card can be charged again). */
  depositReference: string | null;
}): Promise<PaymentResult> {
  if (!PAYMENTS_LIVE) return { ok: true, reference: testReference('fee') };

  // TODO (Stripe): charging a card later needs the customer's permission and a
  // saved card. When taking the deposit, create the PaymentIntent with
  // setup_future_usage: 'off_session' (and a Stripe Customer), then here:
  //   const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');               // <- the secret key
  //   POST https://api.stripe.com/v1/payment_intents with
  //     amount, currency, customer, payment_method, off_session: true, confirm: true
  //   and return { ok: true, reference: intent.id } when it succeeds.
  // Without a saved card, record the fee as owed and ask the customer to pay it.
  return { ok: false, reason: 'Payments aren’t connected yet.' };
}
