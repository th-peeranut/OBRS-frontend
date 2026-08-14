import { extractApiErrorCode } from './api-error-code';

/**
 * OBRS-736. The backend refuses a charge above the per-transaction ceiling Omise
 * imposes on the merchant account, with this code and a message that says so —
 * naming the limit and offering the two things that actually work (book in
 * smaller groups, or pay cash at the counter).
 *
 * The message is already on screen by the time a component's catch block runs:
 * `errorInterceptor` shows the backend's own `message` for any status it does not
 * map to a transport string, and the payment POST does not opt out of it. So this
 * exists for the SECOND toast — the components' generic `PAYMENT.ALERT.FAILED`
 * ("check your card details or balance"), which would contradict the truthful
 * message with a false cause and a suggestion that cannot help.
 */
export const PAYMENT_AMOUNT_EXCEEDS_GATEWAY_LIMIT =
  'PAYMENT_AMOUNT_EXCEEDS_GATEWAY_LIMIT';

/**
 * OBRS-1352. The backend refuses a second charge while the first one is still
 * `pending` (`PaymentService.validateBookingForPayment`), and says so in all
 * three locales — "a payment is already in progress for this booking".
 *
 * Measured on prod, booking 3 of 13 Aug 2026: the charge Omise accepted at
 * 11:43:12 sat `pending` with no `failure_code` and no `failure_message` until
 * the 15-minute hold expired at 11:57:34, and the passenger filed two usability
 * reports in between. What they quoted back was the generic toast below —
 * "ชำระเงินไม่สำเร็จ กรุณาตรวจสอบข้อมูลบัตรหรือยอดเงินคงเหลือ" — which names a
 * cause the gateway never gave, and prescribes a retry that this guard refuses
 * every time for as long as the hold lasts. Checking a card balance cannot
 * clear it; only waiting out the booking can.
 */
export const PAYMENT_IN_PROGRESS = 'PAYMENT_IN_PROGRESS';

/**
 * True when the backend already told the passenger something truer and more
 * actionable than the generic payment-failed toast, so the caller should stay
 * quiet rather than talk over it.
 */
export function isHandledByBackendMessage(error: unknown): boolean {
  const code = extractApiErrorCode(error, null);
  return (
    code === PAYMENT_AMOUNT_EXCEEDS_GATEWAY_LIMIT ||
    code === PAYMENT_IN_PROGRESS
  );
}
