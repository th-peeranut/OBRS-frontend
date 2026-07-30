/**
 * OBRS-902 — one vocabulary for `payment_method`, for every event that carries it.
 *
 * OBRS-867 shipped the parameter from three call sites that did not agree on
 * what a payment method is called, so the same card booking arrived at GA4
 * under three different names depending on which step emitted it:
 *
 * | step                             | source of the value        | sent   |
 * | -------------------------------- | -------------------------- | ------ |
 * | `payment_started`                | the UI tab id              | `creditcard`   |
 * | `payment_method_selected`        | the UI tab id              | `creditcard`   |
 * | `booking_completed` (in page)    | the UI tab id              | `creditcard`   |
 * | `booking_completed` (after 3DS)  | a hardcoded constant       | `qr_promptpay` |
 * | what the API was actually told   | `PaymentPayload`           | `card`         |
 *
 * Every one of those is "the payment method", and none of them can be counted
 * against another. `payment_started=creditcard` and `booking_completed=card`
 * do not join, so a funnel split by method leaks 100% of its sessions — and
 * the fourth row is simply false, which is the defect OBRS-902 was filed for.
 *
 * So the fix is not "read the value from a better place"; it is having exactly
 * one place that decides what the value is. Call sites hand over whatever they
 * hold — a tab id, an API field — and get back the canonical name.
 *
 * **The canonical vocabulary is the API's** (`PaymentMethod` in
 * `payment.interface.ts`: `card`, `qr_promptpay`, `cash`, ...), not the UI's.
 * The UI's tab ids exist only inside this app, while the API's names are what
 * `payments.payment_method` stores and therefore what every revenue report
 * already groups by. Choosing the UI vocabulary would have made the analytics
 * dashboard the one place in the system that cannot be reconciled with the
 * money.
 */

import { hasOwnKey } from './own-key';

/**
 * Emitted when the method genuinely is not known — an absent or empty value.
 *
 * A distinct token rather than dropping the parameter or guessing a default:
 * a missing `payment_method` is invisible in a GA4 breakdown (the row just
 * isn't there), and a guessed one is indistinguishable from a measurement.
 * `unknown` shows up as its own bar, so the gap is legible on the chart that
 * someone is about to make a decision from. Guessing is what OBRS-902 *was*.
 */
export const ANALYTICS_PAYMENT_METHOD_UNKNOWN = 'unknown';

/**
 * A value that normalised to something outside GA4-safe shape. Kept separate
 * from `unknown` so "we were told nothing" and "we were told something we
 * cannot use" never collapse into the same bar.
 */
export const ANALYTICS_PAYMENT_METHOD_OTHER = 'other';

/**
 * Names that mean the same method. Keys are already lower-cased and
 * underscore-joined by the time they are looked up.
 *
 * `credit_card` is here because the API's own `PaymentMethod` union carries
 * both it and `card`; the FE only ever sends `card`, but a value read back off
 * a transaction is the server's to choose and both spellings are legal there.
 */
const ALIASES: Readonly<Record<string, string>> = {
  creditcard: 'card',
  credit_card: 'card',
  card: 'card',
  qrcode: 'qr_promptpay',
  qr_code: 'qr_promptpay',
  qr: 'qr_promptpay',
  promptpay: 'qr_promptpay',
  prompt_pay: 'qr_promptpay',
  qr_promptpay: 'qr_promptpay',
};

/**
 * GA4 event parameters become dimension values, and an unbounded server string
 * becomes an unbounded dimension. Anything that is not a short snake_case token
 * is reported as `other` rather than passed through.
 */
const GA4_SAFE = /^[a-z0-9_]{1,40}$/;

/**
 * A method name has a name in it. Requiring one letter is what stops a
 * digits-only value from reaching the wire: no payment method is spelled
 * `0812345678` or `4242424242424242`, but a server field mix-up could put one
 * there. `sanitizeAnalyticsParams`' `LONG_DIGIT_RUN` rule would catch it, but
 * that guard only throws on non-production builds — in production it drops the
 * key and the event goes out incomplete. Refuse the shape here, while the value
 * is still ours to name.
 */
const HAS_A_LETTER = /[a-z]/;

/**
 * Turn whatever a call site holds into the one name for that method.
 *
 * Unrecognised-but-well-formed values pass through deliberately (`truemoney`,
 * `mobile_banking_kbank`, a method the backend adds next quarter): mapping them
 * to `other` would hide a real, correctly-reported method behind a bucket, and
 * the whole point of the parameter is to answer "which methods do customers
 * actually use". Only the shape is enforced, not the membership.
 */
export function normalizeAnalyticsPaymentMethod(
  raw: string | null | undefined
): string {
  const trimmed = String(raw ?? '').trim().toLowerCase();
  if (!trimmed) {
    return ANALYTICS_PAYMENT_METHOD_UNKNOWN;
  }

  const token = trimmed.replace(/[\s-]+/g, '_');
  // `hasOwnKey` and not `ALIASES[token] ?? ...`: an object literal inherits
  // `Object.prototype`, so `ALIASES['constructor']` is the Object *function* —
  // non-nullish and truthy, so a `??`/`||` fallback never fires and the caller
  // would ship a function where GA4 expects a string (ADR-0028, OBRS-427/601).
  if (hasOwnKey(ALIASES, token)) {
    return ALIASES[token];
  }

  return GA4_SAFE.test(token) && HAS_A_LETTER.test(token)
    ? token
    : ANALYTICS_PAYMENT_METHOD_OTHER;
}
