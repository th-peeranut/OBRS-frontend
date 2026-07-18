/**
 * Session-scoped (same tab, survives refresh, cleared on tab close) stash of
 * "amount paid" keyed by tracking number — see
 * `ParcelBookingSuccessPageComponent`'s doc comment for why this exists (no
 * backend endpoint resolves an amount from a bare tracking number alone).
 * Written by `ParcelBookingPageComponent.onPaymentCompleted()` at the moment
 * payment completes, read by the success page. Best-effort only: wrapped in
 * try/catch so a private-mode storage failure never breaks the flow.
 */
const KEY_PREFIX = 'parcel_booking_amount_';

export function stashParcelBookingAmount(trackingNumber: string, amount: number): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + trackingNumber, String(amount));
  } catch {
    // Private-mode/storage-full — the success page just omits the amount line.
  }
}

export function readParcelBookingAmount(trackingNumber: string): number | null {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + trackingNumber);
    const parsed = raw !== null ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
