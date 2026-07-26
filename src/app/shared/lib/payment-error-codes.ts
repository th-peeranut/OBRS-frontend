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
 * True when the backend already told the passenger something truer and more
 * actionable than the generic payment-failed toast, so the caller should stay
 * quiet rather than talk over it.
 */
export function isHandledByBackendMessage(error: unknown): boolean {
  return (
    extractApiErrorCode(error, null) === PAYMENT_AMOUNT_EXCEEDS_GATEWAY_LIMIT
  );
}
