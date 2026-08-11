/**
 * OBRS-1223 — turns a request URL into something safe to name in a metric.
 *
 * WHY AN ALLOWLIST AND NOT A DENYLIST OF ID SHAPES
 * The obvious implementation replaces numeric and uuid segments with `:id` and
 * keeps the rest. That is a denylist, and it keeps whatever the next endpoint
 * puts in a path segment: `/api/bookings/lookup/B-P4HPH6` (a booking reference —
 * `bookingref` is an exact entry on `analytics-pii-guard.ts`'s deny list),
 * `/api/otp/sms/0812345678` (a phone number, which that same file has a shape
 * rule for). Both are paths this app already builds.
 *
 * So the rule is inverted: a segment SURVIVES only if it looks like a hand-typed
 * route word — ASCII letters and dashes, nothing else. Everything else becomes
 * `:id`. A false positive costs one over-merged row in a chart. A false negative
 * hands a customer's phone number to Google, and no commit of ours takes it
 * back. That is the same trade `analytics-pii-guard.ts` documents, made in the
 * one place that file cannot see: the URL is not a parameter, so nothing
 * downstream screens it.
 *
 * The query string is dropped WHOLE and unconditionally, for the same reason
 * `AnalyticsService.trackPageView` reports a route pattern and never a resolved
 * URL: `?token=…` is a credential, and there is no version of "keep the useful
 * query params" that stays safe as endpoints are added.
 *
 * Pure, no Angular, no I/O — so the policy is assertable directly by a spec
 * rather than inferred from an interceptor's behaviour.
 */

/** What replaces any segment that is not a plain route word. */
export const OPAQUE_SEGMENT = ':id';

/** A segment we are willing to print: ASCII letters and dashes only. */
const ROUTE_WORD = /^[A-Za-z][A-Za-z-]*$/;

/**
 * `/api/bookings/42?x=1` -> `/api/bookings/:id`
 *
 * Returns `/unknown` for anything unparseable rather than throwing: this runs on
 * the response path of every idempotent `/api/` request, and a measurement
 * concern may never be the reason a customer's request fails (AC5).
 */
export function toApiEndpointPattern(url: string | null | undefined): string {
  if (!url) return '/unknown';

  let pathname: string;
  try {
    // The base only matters for a relative URL; `req.url` is absolute in this
    // app (it is built from `environment.apiUrl`) but the specs use both.
    pathname = new URL(url, 'http://localhost').pathname;
  } catch {
    return '/unknown';
  }

  const segments = pathname
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => (ROUTE_WORD.test(segment) ? segment : OPAQUE_SEGMENT));

  return `/${segments.join('/')}`;
}
