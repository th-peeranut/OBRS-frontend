import { AbstractControl, ValidationErrors } from '@angular/forms';

const THAI_MOBILE_PATTERN = /^0\d{9}$/;
const NATIONAL_ID_LENGTH = 13;

/**
 * PromptPay mobile-number validator (OBRS-286, UI spec "Forms" table, SA K8.2).
 * Judges shape only — a blank value is left to `trimmedRequiredValidator` /
 * `Validators.required`, applied separately by the caller only while the
 * PromptPay mode is selected.
 *
 * The field's `maxlength=13` is deliberate (not this validator's concern, but
 * why 13 matters here): it lets a 13-digit Thai national ID reach this
 * validator intact so it can be DETECTED and rejected with its own message,
 * rather than being silently truncated to something that might coincidentally
 * pass the 10-digit pattern.
 */
export function promptPayPhoneValidator(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (!raw) {
    return null;
  }
  if (raw.length === NATIONAL_ID_LENGTH) {
    return { nationalId: true };
  }
  if (!THAI_MOBILE_PATTERN.test(raw)) {
    return { pattern: true };
  }
  return null;
}
