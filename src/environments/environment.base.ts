// Common defaults shared by every environment.*.ts file. Angular's build
// `fileReplacements` swaps out `environment.ts` per configuration, so the
// shared base must live under a different filename or those files would
// end up importing themselves.
export const environmentBase = {
  production: false,
  // Local backend default (OBRS-367): the un-overridden base URL is only ever
  // used by `environment.ts` (the `npm run start:local` / `ng test` config);
  // `environment.sit.ts` overrides it. The local Spring Boot backend serves on
  // :8080 (`./mvnw spring-boot:run -Dspring-boot.run.profiles=dev,local`), so
  // this must match it — a stale :8000 here made `npm run start:local` 500 on
  // login until every dev hand-patched it.
  apiUrl: 'http://localhost:8080',
  promptpay: {
    baseUrl: '',
    id: '0123456789',
  },
  jira: {
    browseBaseUrl: 'https://nj-phuyaipu.atlassian.net/browse/',
  },
  omisePublicKey: 'pkey_test_5rd059u8cgynfe12lds',
  useMockPayments: false,
  useDevApiEndpoints: true,
  homeRouteSlug: 'chonburi_bangkok',
  mapsApiKey: '',
  googleClientId: '',
  // OBRS-424: MapTiler tile key for the internal fleet live map (layer 1).
  // Empty by default — no key has been provisioned yet (owner has been
  // asked). The empty-key path is what CI and every fresh clone always take
  // (FleetMapPanelComponent.canShowMap degrades to the MAP_UNAVAILABLE
  // placeholder; the side list keeps working fully), same shape as mapsApiKey.
  maptilerKey: '',
  // OBRS-867: measurement tag IDs. Same shape and same reasoning as
  // `maptilerKey` above — blank is the committed default, and blank means the
  // tag is never injected at all (`AnalyticsTagsService.load()` returns without
  // touching the DOM). That is what keeps CI, every fresh clone and every local
  // `npm start` out of the production property, with no flag for anyone to
  // remember to switch off.
  //
  // An ID being present is necessary but never sufficient: loading is
  // additionally gated on the visitor's PDPA answer (AnalyticsConsentService).
  // See docs/adr/0034-analytics-provider-and-pdpa-consent-gate.md.
  analytics: {
    ga4MeasurementId: '',
    clarityProjectId: '',
  },
  // OBRS-622 go-live scope cut — reversible per-feature entry gates.
  // Flip a value to `true` to re-enable the feature everywhere post-go-live
  // (single-point-per-feature; no code revert needed).
  features: {
    onlineParcelBooking: false, // gates /parcel-booking + /my-parcels routes + navbar My Parcels link
    // OBRS-933: flipped back on post-go-live, which is the one-liner OBRS-622
    // AC6 always described. The SIT-only override this replaces (OBRS-831) is
    // removed in the same commit — it existed only because this value read
    // false. `PROD_MAPTILER_API_KEY` must be exported at `npm run build:prod`
    // or the prod bundle inherits `maptilerKey: ''` and degrades to the
    // MAP_UNAVAILABLE placeholder without erroring at build or boot time.
    fleetMap: true,             // gates the staff fleet-map route + its nav link
    // OBRS-1302: the customer-side ONLINE SEAT BOOKING path — /review-schedule-booking,
    // /passenger-info, /payment, and the "choose this trip" button that leads into them.
    //
    // Off is not a scope cut like the two above; it is a deliberate close of a path
    // that already works. On 2026-08-13 prod was measured selling for real (6 trips /
    // 20 free seats tomorrow, a LIVE Omise key in the shipped bundle) while ranking
    // #4 on Google — and there is nobody at the other end: prod has no SALESPERSON
    // account at all (OBRS-1218) and neither counter nor driver staff have been
    // trained. A customer who paid would reach a bus where no one can check them in.
    //
    // Deliberately does NOT gate /schedule-booking, /find-booking, /e-ticket or
    // /my-bookings: the timetable+fare list IS the shop window that earns the Google
    // position (and is why a customer would message the page at all), and the other
    // two are how an already-issued ticket is retrieved.
    //
    // Flip to `true` to reopen everywhere. Two conditions, neither dated yet:
    // (a) a SALESPERSON account exists and staff are trained (OBRS-850 AC-2 /
    // OBRS-1218), (b) OBRS-832 closes so booking SMS stops failing silently.
    //
    // ONE config overrides this back to `true`: `environment.ts`, which is what
    // `ng test`, `npm run build` and the e2e gate lane build against. The reason
    // is written there and it is not a loophole — prod and SIT both inherit the
    // `false` below. Unlike the two flags above, this one is a fact about the
    // business, so a test lane has no business inheriting it.
    onlineTicketBooking: false,
  },
};
