/**
 * OBRS-1465 — how a Thai bank account number is grouped for DISPLAY while the
 * user types it. The owner ruled on 2026-08-21 for option 1, "group per bank",
 * over a bank-agnostic every-N-digits rule.
 *
 * The dashes are display only. The form control, the wire and
 * `manual_refund_requests.destination_account_number` all hold bare digits —
 * the backend still validates `^\d+$` (`CancellationService`, OBRS-1464) and
 * deliberately puts NO bound on the length, because Thai account numbers are
 * not one fixed width and rejecting a valid destination is the more expensive
 * failure. Every rule below therefore has to survive any length.
 *
 * WHAT IS SOURCED AND WHAT IS NOT — this matters, because a per-bank table is
 * only worth its rows if the rows are true:
 *   - 10 digits written `012-3-45678-9` (3-1-5-1) is the general Thai
 *     convention, not one bank's house style (e.g. Krungthai `301-1-52815-2`).
 *     That is why it is DEFAULT_GROUPS and not eighteen copies of itself.
 *   - Government Savings Bank (030) and BAAC (034) are the two banks that are
 *     NOT 10 digits — both are 12 (GSB also has legacy 15-digit numbers).
 *     A sourced GSB example is `0-5459005667-4`, hence 1-10-1.
 *   - For BAAC no grouping could be sourced, so no row is invented for it: it
 *     falls through to the default, which yields a readable counting aid
 *     without claiming to be that bank's printed format. Same for the other
 *     fifteen banks, which no source distinguishes from the convention.
 * A row here must come from evidence. Adding one by guessing puts a wrong
 * grouping in front of a human who is about to transfer real money by hand.
 */

import { hasOwnKey } from './own-key';

/** Group sizes for a 10-digit account number: `012-3-45678-9`. */
const DEFAULT_GROUPS = [3, 1, 5, 1];

/** Bank of Thailand 3-digit code (what `refundDestination.bank` holds since
 * OBRS-1463) -> group sizes, for the banks a source actually distinguishes. */
const GROUPS_BY_BANK_CODE: Readonly<Record<string, number[]>> = {
  '030': [1, 10, 1], // GSB — 12 digits, e.g. 0-5459005667-4
};

/** Everything that is not a digit is dropped — this is what makes AC-3 work:
 * a number pasted as `148-0-62262-1`, or with spaces, is accepted, not bounced. */
export function stripAccountNumber(text: string): string {
  return text.replace(/\D/g, '');
}

/**
 * `digits` must already be bare digits (see `stripAccountNumber`). `bankCode`
 * is the BOT code, or null when no bank is chosen yet — in which case the
 * convention applies, so the field still helps the user count from keystroke
 * one instead of only after they pick a bank.
 *
 * Digits beyond what the template describes are emitted as one trailing group
 * rather than dropped or refused: the template says how a number of the
 * EXPECTED length is written, and the backend accepts other lengths on purpose.
 */
export function formatAccountNumber(digits: string, bankCode: string | null): string {
  // hasOwnKey, not `MAP[key] || FALLBACK` (ADR-0028): `bankCode` is a runtime
  // string, and for 'constructor' an object literal answers with a FUNCTION,
  // which is truthy -- the `||` would pass it straight to the for..of below.
  const groups =
    bankCode && hasOwnKey(GROUPS_BY_BANK_CODE, bankCode)
      ? GROUPS_BY_BANK_CODE[bankCode]
      : DEFAULT_GROUPS;
  const parts: string[] = [];
  let taken = 0;

  for (const size of groups) {
    if (taken >= digits.length) {
      break;
    }
    parts.push(digits.slice(taken, taken + size));
    taken += size;
  }
  if (taken < digits.length) {
    parts.push(digits.slice(taken));
  }

  return parts.join('-');
}

/**
 * Where the caret belongs in `formatted` so that it still sits after the same
 * DIGIT it sat after before reformatting — AC-4. Counting digits rather than
 * characters is the whole point: inserting a dash to the left of the caret
 * must not drag the caret along with it, and editing mid-string must not throw
 * the caret to the end.
 */
export function caretAfterDigits(formatted: string, digitCount: number): number {
  if (digitCount <= 0) {
    return 0;
  }
  let seen = 0;
  for (let index = 0; index < formatted.length; index++) {
    if (formatted[index] >= '0' && formatted[index] <= '9') {
      seen++;
      if (seen === digitCount) {
        return index + 1;
      }
    }
  }
  return formatted.length;
}
