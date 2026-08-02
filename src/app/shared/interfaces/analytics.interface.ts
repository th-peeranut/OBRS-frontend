/**
 * OBRS-867 — the analytics contract.
 *
 * Every event this app is allowed to send is named here, and every parameter it
 * may carry is typed here. That is deliberate: an open `track(name, anything)`
 * API is how a phone number ends up in a third-party dashboard six months from
 * now. A closed union means adding a new event is a code review, not an
 * accident — and `analytics-pii-guard.ts` still re-checks the payload at
 * runtime, because a type only constrains the code we wrote on purpose.
 *
 * Naming follows GA4's `snake_case` convention so the events are usable in a
 * GA4 funnel exploration without renaming.
 */

/** The closed set of events this app may send. */
export type AnalyticsEventName =
  /** A route change inside the SPA. Path only — never the query string. */
  | 'page_view'
  /** The customer pressed Search (or a saved filter auto-searched). */
  | 'search_submitted'
  /** The search came back. Always fired, with `has_results` either way. */
  | 'search_results_shown'
  /**
   * The search came back EMPTY. Redundant with `search_results_shown`
   * (`has_results: false`) on purpose — a dedicated event is one click to chart
   * in GA4, and OBRS-862's priority is decided by exactly this number.
   */
  | 'search_no_results'
  /** The customer picked a departure (or return) trip off the results list. */
  | 'schedule_selected'
  /** The customer reached the passenger-details step. */
  | 'passenger_info_reached'
  /** The customer reached the payment step. */
  | 'payment_started'
  /** The customer switched payment tab (card <-> PromptPay QR). */
  | 'payment_method_selected'
  /** Payment settled and the ticket was issued. The bottom of the funnel. */
  | 'booking_completed';

/**
 * Value types a provider can carry. GA4 accepts string / number / boolean;
 * anything else (objects, arrays, Date) would be stringified unpredictably by
 * the tag, so the type refuses it here instead.
 */
export type AnalyticsParamValue = string | number | boolean;

/**
 * A parameter bag. `undefined` is allowed as a *value* so call sites can pass an
 * optional field without a conditional-spread dance; `sanitizeAnalyticsParams`
 * drops those keys before anything is sent.
 */
export type AnalyticsParams = Readonly<
  Record<string, AnalyticsParamValue | null | undefined>
>;

/** One event, ready to hand to a provider. */
export interface AnalyticsEvent {
  readonly name: AnalyticsEventName;
  readonly params: AnalyticsParams;
}

/**
 * The customer's PDPA answer about analytics.
 *
 * `unset` is a real, distinct third state — not a synonym for `denied`. Nothing
 * may be sent while it is `unset`, but the banner must keep asking; treating it
 * as `denied` would silently stop asking and lock the site into never
 * measuring anything.
 */
export type AnalyticsConsentDecision = 'granted' | 'denied' | 'unset';

/** Which leg of a round trip an event refers to. */
export type AnalyticsTripLeg = 'departure' | 'return';
