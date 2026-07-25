/**
 * A Thai mobile number as the user types it: `0[689]XXXXXXXX`.
 *
 * Mirrors the backend's `ThaiMsisdn.CANONICAL_PATTERN` (OBRS-409). The backend also accepts the
 * `66[689]XXXXXXXX` spelling on the wire, because ThaiBulkSMS takes either (ADR-0079) — this form
 * deliberately does not offer that choice. A Thai user typing their own number types the local
 * form, and the backend now stores only the canonical one anyway, so accepting a second spelling
 * here would buy nothing and hand people a way to type a number that renders back differently
 * from what they entered.
 *
 * Narrower than the `/^0\d{9}$/` used by the booking/passenger forms: `0[689]` are the real Thai
 * mobile prefixes, so `02...` (a Bangkok landline) is correctly rejected for a phone we will send
 * an OTP to. Those other forms still carry their own copy of a looser rule — unifying them is
 * OBRS-455, not this card.
 */
export const THAI_MOBILE_PATTERN = /^0[689]\d{8}$/;

/**
 * Drops every non-digit so a number a user typed or read back with grouping dashes
 * (`080-000-0000`) collapses to the canonical digit string the pattern and the backend want.
 * The stored/validated/submitted value is ALWAYS bare digits — the dashes are a display skin,
 * never part of the model.
 */
export function stripPhoneSeparators(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/**
 * Groups a Thai local mobile number for reading: `0800000000` → `080-000-0000` (the 3-3-4
 * grouping Thai readers expect). Anything that is not a full 10-digit local number is returned
 * as its bare digits rather than mis-grouped — a half-typed number must never gain a dash in a
 * place that shifts as the next keystroke lands.
 */
export function formatThaiMobile(value: string | null | undefined): string {
  const digits = stripPhoneSeparators(value);
  if (/^0\d{9}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}
