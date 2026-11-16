// =============================================================================
//  PAYMENT (booking page) — the card form for deposits. The server side is
//  supabase/functions/_shared/paymentService.ts; between them they hold ALL of
//  NexGain Bookings' payment code.
// =============================================================================
//
//  TEST MODE: Stripe isn't connected. The "card form" is a note saying no card
//  is needed, and confirm() pretends the payment worked.
//
//  TO CONNECT STRIPE:
//   1. Add Stripe.js to index.html, above this file:
//        <script src="https://js.stripe.com/v3/"></script>
//   2. Put your PUBLISHABLE key below (pk_test_... first, then pk_live_...).
//      Never put the secret key (sk_...) here: this page is public.
//   3. Fill in the TODOs: mount the card form, and confirm the payment with the
//      client secret the server sends for the booking.
//   4. Set LIVE = true.
(function () {
  'use strict';
  var LIVE = false;
  var PUBLISHABLE_KEY = 'pk_test_REPLACE_ME'; // <- TODO: your Stripe publishable key

  window.NexGainPayment = {
    live: LIVE,

    /** Shows where the customer enters their card, inside `container`. */
    renderCardForm: function (container, amountText) {
      container.replaceChildren();
      var box = document.createElement('div');
      box.className = 'pay-box';
      if (!LIVE) {
        box.textContent = 'Test mode: no card needed and nothing is charged. In the live app, the ' + amountText + ' deposit is paid by card here.';
        container.appendChild(box);
        return;
      }
      // TODO (Stripe): mount Stripe's card form here, e.g.
      //   var stripe = Stripe(PUBLISHABLE_KEY);
      //   var elements = stripe.elements({ clientSecret: <from the server> });
      //   elements.create('payment').mount(box);
      //   window.NexGainPayment._stripe = stripe; window.NexGainPayment._elements = elements;
      void PUBLISHABLE_KEY;
      container.appendChild(box);
    },

    /**
     * Takes the payment. Resolves { ok: true, token } (token goes to the server,
     * which checks it), or { ok: false, message } to show the customer.
     */
    confirm: function () {
      if (!LIVE) return Promise.resolve({ ok: true, token: null });
      // TODO (Stripe):
      //   return window.NexGainPayment._stripe
      //     .confirmPayment({ elements: window.NexGainPayment._elements, redirect: 'if_required' })
      //     .then(function (r) { return r.error ? { ok: false, message: r.error.message } : { ok: true, token: r.paymentIntent.id }; });
      return Promise.resolve({ ok: false, message: 'Payments aren’t connected yet.' });
    },
  };
})();
