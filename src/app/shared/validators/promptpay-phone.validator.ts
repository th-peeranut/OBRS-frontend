import { AbstractControl, ValidationErrors } from '@angular/forms';
import { THAI_LOCAL_PHONE_PATTERN } from '../constants/thai-msisdn';

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
 *
 * OBRS-455: the rule is `THAI_LOCAL_PHONE_PATTERN`, unchanged in value — this file used to declare
 * a private const *named* `THAI_MOBILE_PATTERN` holding `/^0\d{9}$/`, i.e. the shared name for a
 * different rule, which is worse than a duplicate: an import added later would have silently
 * changed which numbers this accepts. Deliberately NOT narrowed to the mobile-prefix rule — a
 * PromptPay ID is a payment identifier, not an SMS destination, and tightening it is a payments
 * decision this card did not make.
 */
export function promptPayPhoneValidator(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (!raw) {
    return null;
  }
  if (raw.length === NATIONAL_ID_LENGTH) {
    return { nationalId: true };
  }
  if (!THAI_LOCAL_PHONE_PATTERN.test(raw)) {
    return { pattern: true };
  }
  return null;
}
