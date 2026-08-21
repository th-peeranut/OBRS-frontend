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
 *
 * <p><b>OBRS-1486 settled this on 2026-08-21 — do not re-open it without a real
 * customer who hit it.</b> The owner was shown both options and kept this one:
 * every digit stays denied, at the KNOWN cost that a company whose legal name
 * carries a numeral (`บริษัท 3 พี่น้อง จำกัด`, `บริษัท 108 ช็อป จำกัด`) cannot enter
 * its own account name, and so cannot cancel its ticket at all. The rejected
 * alternative was "deny only a run of 5+ digits", which would have let
 * `สมชาย 12` reach the person making the transfer. How often a corporate refund
 * actually happens has never been measured — the prod `refund_destination`
 * table is behind OBRS-421 — so a real customer hitting this IS the evidence
 * that would justify revisiting it, and nothing else is.
 *
 * <p>The server half was ruled out in the same decision:
 * `CancellationService.resolveRefundDestination` keeps `StringUtils.hasText`
 * for accountName on purpose and does NOT mirror this regex. The asymmetry with
 * accountNumber (enforced on both sides) is intended: a name is read by the
 * human making the transfer, who stops when it looks wrong, while one wrong
 * digit in the number sends the money to the wrong account silently.
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
