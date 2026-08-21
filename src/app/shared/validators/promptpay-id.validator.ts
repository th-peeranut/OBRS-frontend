import { AbstractControl, ValidationErrors } from '@angular/forms';
import { THAI_LOCAL_PHONE_PATTERN } from '../constants/thai-msisdn';

const NATIONAL_ID_PATTERN = /^\d{13}$/;

/**
 * PromptPay proxy-id validator (OBRS-286, UI spec "Forms" table; rule revised by OBRS-1462).
 * Judges shape only — a blank value is left to `trimmedRequiredValidator` /
 * `Validators.required`, applied separately by the caller only while the PromptPay mode is
 * selected.
 *
 * PromptPay registers either a 10-digit mobile number or a 13-digit national/tax ID as the proxy
 * that receives the money, so both are accepted. OBRS-286's K8.2 rejected the 13-digit shape with
 * a message of its own; no reason for that rule was ever recorded — not on the card, not in the
 * session log, not in the comment that cited it — and the owner reversed it on 2026-08-21.
 *
 * The field's `maxlength=13` is older than this card: it was there so a national ID would reach
 * this validator INTACT and be refused with its own message instead of being silently truncated
 * into something that might coincidentally pass the 10-digit pattern. It still belongs there, now
 * as the length of the longest value that is VALID.
 *
 * A 13-digit value is judged on its mod-11 check digit, never on its length alone. A person reads
 * this number off the refund worklist and transfers real money to it, so a single mistyped digit
 * that still counts to 13 is money sent to a stranger.
 * `CancellationService#hasValidThaiIdCheckDigit` runs the identical rule server-side; if the two
 * drift apart, the form accepts what the API then refuses.
 *
 * OBRS-455: the 10-digit rule is `THAI_LOCAL_PHONE_PATTERN`, unchanged in value — this file used to declare
 * a private const *named* `THAI_MOBILE_PATTERN` holding `/^0\d{9}$/`, i.e. the shared name for a
 * different rule, which is worse than a duplicate: an import added later would have silently
 * changed which numbers this accepts. Deliberately NOT narrowed to the mobile-prefix rule — a
 * PromptPay ID is a payment identifier, not an SMS destination, and tightening it is a payments
 * decision this card did not make.
 */
export function promptPayIdValidator(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (!raw) {
    return null;
  }
  if (THAI_LOCAL_PHONE_PATTERN.test(raw)) {
    return null;
  }
  if (!NATIONAL_ID_PATTERN.test(raw)) {
    return { pattern: true };
  }
  return hasValidThaiIdCheckDigit(raw) ? null : { checkDigit: true };
}

function hasValidThaiIdCheckDigit(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(digits[i]) * (13 - i);
  }
  return (11 - (sum % 11)) % 10 === Number(digits[12]);
}
