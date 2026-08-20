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
  | 'booking_completed'
  /**
   * OBRS-1223 — one idempotent `/api/` request that took longer than
   * `SLOW_REQUEST_THRESHOLD_MS`. NOT one event per request: that floor exists so
   * this stays a tail measurement rather than an APM bill.
   *
   * The only member of this union that is not about the customer's journey. It
   * is here because `IDEMPOTENT_REQUEST_TIMEOUT_MS` (30s, OBRS-642) CANCELS a
   * real request, and it was set from one measured endpoint plus judgement —
   * defensible as "unlikely to kill anything", not as "why 30 and not 15".
   */
  | 'slow_api_request'
  /**
   * OBRS-1223 — the denominator, emitted once per `CENSUS_WINDOW_SIZE`
   * completed idempotent `/api/` requests.
   *
   * Without it `slow_api_request` is a count with nothing to divide by, and a
   * bare count cannot answer "is 30s too tight" — 200 slow requests is
   * reassuring against 2,000,000 and alarming against 2,000. Emitting the
   * window's total and its slow count TOGETHER is also what keeps the ratio
   * unbiased when a session ends mid-window: the unflushed partial window loses
   * both halves, not one.
   */
  | 'api_request_census'
  /**
   * OBRS-380 Phase 0 — the visitor asked to see the charter ("เหมาคัน") phone
   * number on the home page. The number is behind a click, so this fires on the
   * reveal, not on the `tel:` link.
   *
   * It is the ONLY record a charter lead leaves. Phase 0 has no form, no
   * booking row and no enquiry table on purpose (the contract forbids
   * confirming a charter without บขส.'s written permission, so the quote
   * happens on the phone) — which means without this event the answer to "did
   * anyone want this?" is unknowable rather than zero.
   *
   * Counts intent, and deliberately the WIDER intent: a desktop visitor reads
   * the revealed number and dials a desk phone, so a `tel:`-tap event would
   * have counted only the phone-shaped half of the demand.
   */
  | 'charter_phone_revealed';

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
