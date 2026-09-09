/**
 * OBRS-1754: the one owner of "is this date range acceptable?".
 *
 * <p>Before this file the rule lived in ELEVEN near-identical copies — ten report pages plus the
 * settlements sub-filter — and that is not an aesthetic complaint. During OBRS-1735 a bug was
 * found that sat in every copy at once (each cleared its error before the null guard, so emitting
 * half a range wiped the message on screen). It happened to be fixable in the picker, one file;
 * the next bug in this family would have meant eleven edits and eleven chances to miss one.
 *
 * <p>Deliberately returns the i18n KEY rather than a translated string: each page names its error
 * under its own prefix (`ADMIN.REPORTS.ERROR`, `ADMIN.SETTLEMENTS.ERROR`,
 * `ADMIN.REFUND_VOID_REPORT.ERROR`, …), and a helper that reached for `TranslateService` would be
 * an Angular dependency in `shared/lib`, which is plain functions by convention.
 *
 * <p>⛔ Behaviour-preserving, byte for byte. It takes BOTH forms of the range — the two `Date`s and
 * the two `YYYY-MM-DD` strings the caller already derived — because the copies compared them that
 * way and the card forbids changing what they decide: ordering is compared on the CALENDAR DAY
 * strings (so a time component cannot flip it), while the span is measured on the `Date`s. Deriving
 * one from the other here would be a different calculation, however close the answers.
 */

/** One year plus a leap day: a range of exactly 366 days is allowed, 367 is not. */
export const MAX_RANGE_SPAN_DAYS = 366;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @param from          the range's first day, as the picker holds it
 * @param to            the range's last day, as the picker holds it
 * @param fromValue     `from` as `YYYY-MM-DD` — what the caller sends to its store
 * @param toValue       `to` as `YYYY-MM-DD`
 * @param errorKeyPrefix e.g. `ADMIN.REPORTS.ERROR`; `.RANGE_INVALID` / `.RANGE_TOO_LARGE` are
 *                       appended to it
 * @returns the i18n key of the reason to refuse, or `''` when the range may be dispatched
 */
export function dateRangeErrorKey(
  from: Date,
  to: Date,
  fromValue: string,
  toValue: string,
  errorKeyPrefix: string
): string {
  if (fromValue > toValue) {
    return `${errorKeyPrefix}.RANGE_INVALID`;
  }

  const spanDays = Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
  if (spanDays > MAX_RANGE_SPAN_DAYS) {
    return `${errorKeyPrefix}.RANGE_TOO_LARGE`;
  }

  return '';
}
