import { environmentBase } from './environment.base';

// OBRS-1179 — the hermetic E2E gate lane's build (`ng serve --configuration gate`,
// playwright.gate.config.ts). It exists for exactly one field.
//
// WHY THE LANE NEEDED ITS OWN FILE
// The gate lane used to build against environment.ts, whose analytics IDs are
// blank like every committed environment's. That was harmless while the consent
// bar rendered regardless of them. OBRS-1179 tied the ask to the IDs, so on that
// build the bar can no longer appear at all — and two GATE specs exist to assert
// the banner-up state (analytics-consent-banner.spec.ts and
// obrs-1372-consent-banner-reachability.spec.ts). Without an ID here they would
// have gone green by asserting nothing, or red for a defect that is not one.
//
// The IDs are the deliberately invalid pair from environment.analytics-e2e.ts,
// for the reason that file gives at length: invalid means the request is still
// ATTEMPTED, but no data can land on a property that does not exist. That lane's
// whole file could not be reused here — it points apiUrl at SIT and inherits the
// closed feature flags, either of which would take most of the gate lane down.
//
// THE LANE IS STILL HERMETIC, AND NOT BECAUSE OF THIS FILE
// `e2e/support/analytics-consent.ts` seeds `denied` lane-wide, so
// `AnalyticsTagsService.load()` never runs for any other spec and no vendor host
// is ever reached. The one spec that presses accept blocks the tag hosts itself.
// That was always the belt; this file removes the braces, which is why both of
// those now say so in their own headers.
//
// It is NOT a deploy target. Selected only by angular.json's `gate` build.
export const environment = {
  ...environmentBase,
  features: {
    ...environmentBase.features,
    // Duplicated from environment.ts, which is what this replaces and which
    // documents both at length. The gate lane walks the booking flow
    // (b2c-critical-path, obrs-639-stepper-geometry, route-smoke and the
    // contrast sweeps), and inheriting the closed base flags redirected 19 of
    // its specs to the homepage the last time it happened (OBRS-1302).
    onlineTicketBooking: true,
    onlineParcelBooking: true,
  },
  analytics: {
    ga4MeasurementId: 'G-OBRS867FAKE',
    clarityProjectId: 'obrs867fake',
  },
};
