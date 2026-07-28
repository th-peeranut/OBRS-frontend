import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

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
 * Narrower than `THAI_LOCAL_PHONE_PATTERN` below: `0[689]` are the real Thai mobile prefixes, so
 * `02...` (a Bangkok landline) is correctly rejected for a phone we will send an OTP to.
 *
 * OBRS-455 made this the rule for **every field that is an SMS destination**, not just the auth
 * ones: the booking contact phone (six senders read `contact_phone_snapshot` — boarding and
 * pre-departure reminders, payment-confirmed, cancellation, reschedule, schedule-change), the
 * parcel recipient (the arrival notice), and the admin user form (same `users.phone_number` column
 * signup writes).
 */
export const THAI_MOBILE_PATTERN = /^0[689]\d{8}$/;

/**
 * A Thai number in local form: 10 digits starting `0`. Admits landlines (`02...`) as well as
 * mobiles.
 *
 * For a phone **nothing texts** — a passenger's own number, a walk-in parcel sender's contact —
 * where rejecting a business landline would be wrong (ADR-0082, Accepted). It is deliberately NOT
 * the same rule as `THAI_MOBILE_PATTERN`: OBRS-455 classified every phone field by what the number
 * is *used for*, and only the SMS destinations were narrowed. Same rule these forms already
 * enforced — this constant is where the copies went, not a change to any of them.
 */
export const THAI_LOCAL_PHONE_PATTERN = /^0\d{9}$/;

/**
 * Any 10–15 digits — the browser-side mirror of the backend's `ContactPhone.ANY_DIGITS_PATTERN`.
 *
 * Used only where the wire contract is deliberately that wide: the online parcel `senderPhone`,
 * whose sender may be reachable on a number that is not a Thai local one at all. Prefer
 * `THAI_LOCAL_PHONE_PATTERN` for a field a Thai customer types about themselves; this one exists so
 * a form does not silently promise the API something narrower than the API accepts.
 */
export const ANY_DIGITS_PHONE_PATTERN = /^\d{10,15}$/;

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
  if (THAI_LOCAL_PHONE_PATTERN.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

/**
 * OBRS-691 — drop-in replacement for `Validators.pattern(<regex>)` on any phone control that
 * now carries display dashes at rest (`080-000-0000`): strips separators BEFORE testing, so a
 * grouped value validates exactly like its bare-digit equivalent (same rule as
 * `account-page.component.ts`'s `thaiMobileValidator`, generalized to an arbitrary pattern
 * instead of being hardcoded to `THAI_MOBILE_PATTERN`). Returns the SAME `{ pattern: true }`
 * error shape `Validators.pattern` produces, so every existing `hasError('pattern')` /
 * `errors?.['pattern']` template binding keeps working unchanged. `required` still owns the
 * empty case — a blank value returns null here so the two errors don't stack.
 */
export function separatorTolerantPattern(pattern: RegExp): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = control.value;
    if (raw === null || raw === undefined || raw === '') {
      return null;
    }
    return pattern.test(stripPhoneSeparators(raw)) ? null : { pattern: true };
  };
}
