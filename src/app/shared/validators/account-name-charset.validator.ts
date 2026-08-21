import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * OBRS-1464 (AC-3): rejects an account-NAME that contains a character which
 * cannot occur in a real person's or company's name.
 *
 * <p><b>This is deliberately a DENYlist, and a narrow one.</b> The obvious rule
 * — "letters only" — blocks customers who typed correctly, and a customer who
 * cannot enter a valid destination cannot cancel their ticket at all, which is
 * worse than letting a bad value through to a human who will read it. Real Thai
 * account names carry spaces, a title with dots (`น.ส.` `ด.ช.`), a legal form in
 * parentheses (`บริษัท ... จำกัด (มหาชน)`), hyphens in some surnames, and the
 * same account often carries a Latin-script name. All of those stay allowed
 * here by construction: anything NOT in {@link DENIED} passes.
 *
 * <p>What is denied is the set that signals the field was filled with the wrong
 * thing — digits (Arabic and Thai), and the symbol block that appears in an
 * account NUMBER, a note to oneself, or pasted junk but never in a name.
 */
const DENIED = /[0-9๐-๙@#$%^&*_=+<>{}[\]\\|~`"!?;:/]/;

export function accountNameCharsetValidator(
  control: AbstractControl
): ValidationErrors | null {
  const value = control.value;
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  return DENIED.test(value) ? { accountNameCharset: true } : null;
}
