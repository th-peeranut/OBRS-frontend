/**
 * The customer-shell pages the OBRS-584 contrast gate sweeps, and everything
 * needed to reach them with no backend.
 *
 * Lifted from `e2e/scripts/capture-obrs752.js`, which is where these fixtures
 * were derived and proven -- that script measured all eight pages in both themes
 * against a server with nothing listening on :8080. Promoting them from a
 * one-off capture script into the GATE lane is the point of this card: the
 * measurement existed, it just ran once, by hand, and told nobody afterwards.
 *
 * WHY THE STORE IS SEEDED RATHER THAN THE FUNNEL DRIVEN
 *
 * `/schedule-booking` .. `/e-ticket` read their trip from NgRx, not from the
 * URL, so a bare `goto` lands on a real page with an empty store: the shell
 * renders and every element worth measuring (`.select-btn`, `.btn-confirm`,
 * `.btn-next`, `.payment-btn`) is simply absent. Driving the whole funnel by
 * hand is a lot of selector surface, and each step is a chance to measure the
 * wrong state without noticing. Seeding uses the app's OWN action types through
 * the real reducer and the real selectors -- only the input is injected.
 *
 * THE POPULATION IS DECLARED HERE, IN FULL (OBRS-970)
 *
 * This file used to name only the pages it swept, which made the pages it did
 * NOT sweep invisible: the gate reported "8 pages swept" and nothing anywhere
 * said 8 out of how many. `CUSTOMER_PAGES` below is the swept half and
 * `EXCLUDED_CUSTOMER_ROUTES` is the other half, each excluded route carrying the
 * reason it is not here. Between them they must account for EVERY customer-side
 * route in `src/app/app-routing.module.ts` -- `obrs-970-route-population.spec.ts`
 * fails by name when one is in neither list, which is the check that stops this
 * gap from reopening the next time somebody ships a page.
 *
 * HOW TO MEASURE THE TWO SIDES (do not trust a number written in prose)
 *
 * Every count this card was argued with had rotted by the time it was worked,
 * so the commands live here instead of their answers:
 *
 * Each command drops COMMENT LINES first. Both files argue with themselves in prose
 * that quotes the very keys being counted, and the sweep count would otherwise count
 * the line that documents it -- which is how a header ends up reporting its own size.
 *
 *   # customer-side routes: every route key minus the two shells and the wildcard
 *   grep -v "^ *[/*]" src/app/app-routing.module.ts | grep "path: '" | grep -vE "'(admin|staff|\*\*)'" | wc -l
 *
 *   # the same population asked the other way: routes that DECLARE they are
 *   # customer area. Smaller, because /login, /register, /otp/... and the two
 *   # email-confirmation routes carry no `data` block at all. Both are correct;
 *   # they answer different questions, so neither alone is "the" number.
 *   grep -v "^ *[/*]" src/app/app-routing.module.ts | grep -c 'customerArea: true'
 *   grep -v "^ *[/*]" src/app/app-routing.module.ts | grep -c 'requireAuth: true'
 *
 *   # what this file sweeps -- ENTRIES, which is more than URLs: /schedule-booking
 *   # is three entries (seeded, empty, no-results) because they are three screens.
 *   grep -v "^ *[/*]" e2e/support/customer-pages.ts | grep -c "url: '"
 *
 *   # and the half that is deliberately NOT swept
 *   grep -c "    path: '" e2e/support/customer-pages.ts
 *
 * WHO ELSE READS `CUSTOMER_PAGES` (measured 2026-08-18 -- an entry added here is
 * paid for five times over in the GATE lane, not once)
 *
 *   customer-contrast-gate.spec.ts        both themes, so 2 page loads per entry
 *   obrs-1372-consent-banner-reachability.spec.ts
 *   obrs-1370-lane-offline.spec.ts
 *   dark-override-effective.spec.ts       via TARGETS
 *   host-box-sweep.spec.ts                via CUSTOMER_SWEEP in host-boxes.ts,
 *                                         which also REQUIRES a CUSTOMER_HOST row
 *                                         per key or its own check fails by name
 *
 * ASCII-only source.
 */

import { Page } from '@playwright/test';

const ok = <T>(data: T) => ({ code: 200, message: 'OK', data });

// --- fixtures ---------------------------------------------------------------
// Matched against the request PATHNAME, first match wins, and only ever for
// requests already under `/api/`. Keying these on Playwright URL globs lets a
// fixture swallow the page's own document request (OBRS-747, four blank pages).

/**
 * One object serving both readers of `/api/stops`, deliberately a superset.
 *
 * The route map wants a `RouteStop` (order / slug / name / coordinates); the
 * recent-route quick pick resolves its saved pairs against the same response as
 * a `StationApi` -- it matches on `id` and labels from `display`. An earlier
 * draft of this file kept those as two separate fixtures and served the
 * RouteStop one, which has no `id` at all: `deriveRecentRouteCandidates()` then
 * matched nothing, the strip rendered nothing, and `.recent-route-btn` -- the
 * element this entire card exists for -- was silently absent from every sweep
 * while the page still cleared its population floor by 40 text runs.
 *
 * That is exactly the failure `mustRender` was added to catch, and it caught it.
 * Keep the two shapes merged.
 */
const stop = (order: number, slug: string, name: string, lat: number, lng: number) => ({
  // StationApi half
  id: order,
  status: { code: 'active', display: { en: { label: 'Active' } } },
  stopType: { code: 'station', display: { en: { label: 'Station' } } },
  display: { en: { label: name }, th: { label: name } },
  createdAt: '2026-01-01T00:00:00+07:00',
  updatedAt: '2026-01-01T00:00:00+07:00',
  // RouteStop half
  order,
  slug,
  name,
  address: 'Nong Chak, Ban Bueng, Chonburi',
  approxTime: `${String(7 + order).padStart(2, '0')}:00`,
  distanceKmFromOrigin: order * 30,
  offsetMinutesFromOrigin: order * 40,
  latitude: lat,
  longitude: lng,
  primaryPhotoUrl: null,
  googleMapsUrl: null,
});

const PICKUP_STOPS = [
  stop(1, 'nong_chak', 'Nong Chak', 13.2836, 101.0654),
  stop(2, 'ban_bueng', 'Ban Bueng', 13.3121, 101.1149),
];
const DROPOFF_STOPS = [
  stop(3, 'bts_mochit', 'BTS Mo Chit', 13.8025, 100.5537),
  stop(4, 'bkr_mochit2', 'Mo Chit 2 Terminal', 13.8117, 100.5487),
];

// The station roster the recent-route quick pick resolves its saved pairs
// against (`deriveRecentRouteCandidates` drops a pair whose stations are not in
// the CURRENT active roster). Ids must match RECENT_ROUTES_SEED below or the
// strip renders nothing and the element this whole card exists for is absent --
// which the per-page floor in the gate spec turns into a failure rather than a
// quiet pass.
// The active station roster the quick pick resolves against. Same objects the
// route map reads -- see `stop()` above for why they are one shape.
//
// `display` matters and is not decoration: `getStationFallbackLabel()` falls
// back to the raw SLUG when it is missing, so a lazier fixture renders
// "nong_chak -> bkr_mochit2" in a pill where production renders a station name.
// Same element, different glyph width, different font-size bucket.
const STATIONS = [...PICKUP_STOPS, ...DROPOFF_STOPS];

const ROUTE_META = {
  slug: 'chonburi_bangkok',
  titleLocalized: { en: 'Chonburi - Bangkok', th: 'Chonburi - Bangkok', zh: 'Chonburi - Bangkok' },
  totalDistanceKm: 120,
  durationMinMinutes: 120,
  durationMaxMinutes: 150,
  originProvinceLabel: 'Chonburi',
  destinationProvinceLabel: 'Bangkok',
};

const ROUTES = ok([
  {
    id: 1,
    slug: 'chonburi_bangkok',
    status: 'active',
    translations: { th: { label: 'Chonburi - Bangkok' }, en: { label: 'Chonburi - Bangkok' } },
  },
]);

const schedule = (id: number, time: string, seats: number) => ({
  id,
  vehicleType: 'minibus',
  departureDateTime: `2030-06-17T${time}:00+07:00`,
  arrivalDateTime: `2030-06-17T${String(Number(time.slice(0, 2)) + 2).padStart(2, '0')}:30:00+07:00`,
  pricePerSeat: 180,
  availableSeats: seats,
  availableSeatNumbers: Array.from({ length: seats }, (_, i) => `A${i + 1}`),
  routeSlug: 'chonburi_bangkok',
  seatingMode: 'ASSIGNED',
});

// Two rows on purpose: one comfortable, one at 3 seats left, which is under
// LOW_SEAT_THRESHOLD and renders the scarcity styling -- a colour combination
// that exists on no other row.
const SCHEDULES = [schedule(101, '08:00', 12), schedule(102, '13:00', 3)];

const lookup = (id: number, code: string, label: string) => ({
  id,
  code,
  display: { th: { label }, en: { label: code } },
});

// OBRS-938. `to` is a parameter rather than a constant because the home page's
// recent-route strip derives its whole population from THIS list for a logged-in
// session (`HomeBookingComponent.loadRecentRoutesFromApi()` -- the localStorage
// source below is never read when `auth_token` is seeded). Three bookings on one
// route tally to ONE distinct pair, so the strip rendered a single pill; OBRS-928
// then prefills the top-ranked route, so that single pill was always `.is-active`
// and `body.is-dark .booking-section .recent-route-btn { color }` had no element
// at rest anywhere in the sweep to control. It read as a dead declaration for a
// week while the rule is in fact correct -- see the header of MY_BOOKINGS.
const myBooking = (
  id: number,
  number: string,
  status: string,
  amount: number,
  to: { id: number; slug: string; label: string } = { id: 4, slug: 'bkr_mochit2', label: 'Mo Chit 2 Terminal' }
) => ({
  id,
  bookingNumber: number,
  totalAmount: amount,
  status,
  bookingType: 'one_way',
  bookingChannel: 'online',
  createdAt: '2026-07-20T10:00:00+07:00',
  rescheduleCount: 0,
  seatChangeCount: 0,
  stopChangeCount: 0,
  // OBRS-699: reschedule/change-seat/change-stop eligibility reads the
  // operator's window off the ROW. Absent means "no governing operator" and the
  // action is withheld, so the `my-bookings-reschedule` host box (which clicks
  // Reschedule in the overflow menu) cannot open its dialog without these.
  rescheduleWindowHours: 2,
  rescheduleMaxDaysAhead: 60,
  contact: { fullName: 'Somchai Jaidee', phoneNumber: '0812345678' },
  bookingSchedules: [
    {
      id: 100 + id,
      departureDateTime: '2030-06-17T08:00:00+07:00',
      arrivalDateTime: '2030-06-17T10:30:00+07:00',
      legType: 'outbound',
      fromStop: lookup(1, 'nong_chak', 'Nong Chak'),
      toStop: lookup(to.id, to.slug, to.label),
      routeSlug: 'chonburi_bangkok',
      seatingMode: 'ASSIGNED',
      tickets: [
        {
          id: 700 + id,
          ticketNumber: `T-${String(700 + id).padStart(6, '0')}`,
          seatNumber: 'A1',
          status,
        },
      ],
    },
  ],
});

const pageOf = <T>(content: T[]) => ({
  content,
  totalElements: content.length,
  totalPages: 1,
  size: 100,
  number: 0,
  numberOfElements: content.length,
});

// THREE statuses on purpose: `statusClass()` maps them to three different badge
// colours, and one booking would have measured one badge while claiming to have
// covered the screen.
//
// TWO DESTINATIONS on purpose (OBRS-938), and it is a claim about the HOME page,
// not this one. `/bookings/me` is also the recent-route strip's source for a
// logged-in session: `extractRecentRoutePairsFromBookings` keeps duplicates
// because the duplicates ARE the frequency signal, then `tallyRecentRoutePairs`
// collapses them to one entry per DISTINCT pair. Three bookings on 1->4 are one
// distinct pair, so the strip rendered exactly one pill -- and since OBRS-928
// prefills the top-ranked route into the search form on load, that one pill
// carried `.is-active` on every load. Every rule keyed on a plain
// `.recent-route-btn` was then measuring nothing: the dark-override gate went red
// on `color` (the `&.is-active` variant paints $dk-bg over it and the base
// declaration had no other element to control), and the contrast gate had
// silently stopped scoring the un-filled pill -- which is the exact 2.79:1 site
// OBRS-575 opened for. 503 books 1->3 so the strip renders an active pill AND an
// inactive one, which is what a customer with more than one habit sees.
//
// The pinning is `mustRender: '.recent-route-btn:not(.is-active)'` on the home
// target below. Change these ids back to one pair and that fires by name rather
// than surfacing a week later as a CSS rule that looks broken and is not.
const MY_BOOKINGS = ok(
  pageOf([
    myBooking(501, 'B-000501', 'confirmed', 360),
    myBooking(502, 'B-000502', 'refunded', 180),
    myBooking(503, 'B-000503', 'cancelled', 180, { id: 3, slug: 'bts_mochit', label: 'BTS Mo Chit' }),
  ])
);

const TICKETS = ok([
  {
    ticketId: 777,
    ticketNumber: 'T-000777',
    seatNumber: 'A1',
    passengerName: 'Somchai Jaidee',
    fromStop: 'Nong Chak',
    toStop: 'Mo Chit 2 Terminal',
    departureDateTime: '2030-06-17T08:00:00+07:00',
    routeName: 'Chonburi - Bangkok',
    price: 180,
    status: 'confirmed',
    bookingNumber: 'B-000501',
  },
]);

// Without this every ticket renders the red OBRS-96 'qrUnavailable' placeholder
// and the e-ticket measurement is of an error state, not a ticket.
const boardingToken = (id: string) =>
  ok({
    ticketId: Number(id),
    ticketNumber: `T-${String(id).padStart(6, '0')}`,
    boardingToken: `valid-token-${id}`,
    expiresAt: '2030-06-17T09:00:00+07:00',
  });

/**
 * OBRS-970. The three published-policy pages read their numbers from a PUBLIC
 * endpoint rather than from a translation file -- that is OBRS-564's rule, and
 * the reason those pages are not static.
 *
 * They matter to the fixture list because the fallback at the bottom of
 * `seedCustomerSession` answers `data: null`, and each of these components turns
 * a null payload into its inline-error branch: a retry link where the published
 * terms should be. The page still renders, still clears any plausible text floor,
 * and would be swept as "the refund policy" while showing an error. Same class of
 * silent substitution `mustRender` was added for, one layer earlier.
 *
 * Values are shaped after the DTOs (`CancellationPolicyDto`, `BookingPolicyDto`,
 * `ParcelPolicyDto`) and are deliberately ordinary: nothing here is a boundary,
 * because these pages are swept for COLOUR, not for arithmetic. The arithmetic is
 * pinned by obrs-627-refund-policy.spec.ts against the real th.json.
 */
const CANCELLATION_POLICY = {
  cancelWindowHours: 24,
  earlyWindowHours: 72,
  refundRateEarly: 0.9,
  refundRateLate: 0.5,
  manualRefundDueDays: 14,
};
const BOOKING_POLICY = { maxAdvanceDays: 30, cutoffMinutes: 60 };
const PARCEL_POLICY = {
  maxWeightKg: 20,
  carryOnFreeSizeMaxInch: 24,
  carryOnFreeAisleMaxPerTrip: 2,
  // NOT empty: an empty array renders the "nothing is prohibited" branch, which
  // is a different screen with different elements. The list a customer actually
  // reads is the one with rows in it.
  prohibitedCategories: ['flammable', 'explosive', 'perishable'],
};

const FIXTURES: [RegExp, (m: RegExpExecArray) => unknown][] = [
  [/\/tickets\/(\d+)\/boarding-token$/, (m) => boardingToken(m[1])],
  // OBRS-970. Anchored, and above the looser patterns below, so `/routes` cannot
  // swallow them the day one of these paths grows a segment.
  [/\/cancellation-policy$/, () => ok(CANCELLATION_POLICY)],
  [/\/booking-policy$/, () => ok(BOOKING_POLICY)],
  [/\/parcel-policy$/, () => ok(PARCEL_POLICY)],
  [/\/schedules\/search/, () => ok({ departureSchedules: SCHEDULES, arrivalSchedules: null })],
  [/\/routes\/[^/]+\/pickup-dropoff$/, () => ok({ route: ROUTE_META, pickup: PICKUP_STOPS, dropoff: DROPOFF_STOPS })],
  [/\/routes/, () => ROUTES],
  [/\/stations/, () => ok(STATIONS)],
  [/\/stops/, () => ok(STATIONS)],
  [/\/bookings\/me/, () => MY_BOOKINGS],
  [/\/bookings\/\d+\/tickets/, () => TICKETS],
  [/\/tickets/, () => TICKETS],
];

/**
 * `saveRecentRoute()`'s on-disk shape -- see src/app/shared/lib/recent-routes.ts.
 *
 * OBRS-938: this is the ANONYMOUS source and it is not what the sweep measures.
 * `AuthService.authStatusSubject` is a `BehaviorSubject(this.isAuthenticated())`,
 * so with `auth_token` seeded below it emits `true` once, synchronously, and
 * `HomeBookingComponent` takes the `/bookings/me` branch and never reads this key
 * at all. Kept, and kept CORRECT, because a fixture that looks like the source of
 * a population and is not is worse than no fixture: it invites the next reader to
 * edit this and wonder why the page did not move.
 *
 * It was NOT correct until now. OBRS-923 bumped the cache key v1 -> v2 (entries
 * gained `count`) and nothing updated this seed, so it wrote `obrs.recentRoutes.v1`
 * -- a key the app has not read since. Nothing caught it, and nothing could: for
 * the authenticated sweep the key is dead either way.
 *
 * A version lives in TWO places here and only one of them decides whether the app
 * reads the seed at all. The first pass at this fixed the payload -- `version` and
 * the `count` fields, right here -- and left the KEY the write site passes to
 * `localStorage.setItem` still saying v1, then said in the commit message that the
 * two were matched. They were not. The payload is what `readRecentRoutePairs()`
 * validates AFTER it finds something; the key is what decides whether it finds
 * anything. Both now say v2 -- see the write site in `seedCustomerSession` below,
 * which has to repeat the literal because nothing under e2e/ imports from src/
 * (and `RECENT_ROUTES_CACHE_VERSION` is not exported at all). That repetition is
 * how the drift happened once already, so the next key bump has to come here too.
 */
const RECENT_ROUTES_SEED = JSON.stringify({
  version: 'v2',
  routes: [
    { originId: 1, destinationId: 4, savedAt: '2026-07-20T10:00:00.000Z', count: 3 },
    { originId: 2, destinationId: 3, savedAt: '2026-07-19T10:00:00.000Z', count: 1 },
  ],
});

const STORE_SEED = {
  filter: {
    roundTrip: { id: 'one_way', name: 'One way' },
    passengerInfo: [{ type: 'adult', count: 1 }],
    startStationId: 'nong_chak',
    stopStationId: 'bkr_mochit2',
    departureDate: '2030-06-17',
    returnDate: null,
    adultCount: 1,
    kidsCount: 0,
  },
  list: { departureSchedules: SCHEDULES, arrivalSchedules: null },
  booking: { schedule: [SCHEDULES[0]] },
  passengers: [
    {
      isAdult: true,
      title: 1,
      firstName: 'Somchai',
      middleName: '',
      lastName: 'Jaidee',
      phoneNumber: '0812345678',
      gender: 'male',
      isSelectSeat: true,
      passengerSeat: 'A1',
      useBookerInfo: true,
      email: 'customer@system.local',
      seatPreference: null,
      seatRequirement: null,
    },
  ],
  bookingResult: { id: 501, bookingNumber: 'B-000501', totalAmount: 180, status: 'pending' },
};

export interface CustomerPage {
  key: string;
  url: string;
  /** The pathname the app must actually land on -- a redirect is a failed sweep. */
  landsOn: string;
  seed?: boolean;
  /**
   * Minimum number of scoreable text runs. A page that renders its shell but
   * none of its content still measures ~20 runs and would otherwise report a
   * clean pass over nothing -- the OBRS-734 false green, restated. Set from a
   * real run and left well under it, so ordinary copy edits do not trip it.
   */
  minText: number;
  /** Same guard for invariant B. 0 where the page genuinely has no surfaced control. */
  minControls: number;
  /**
   * Same guard for invariant C (OBRS-797). Optional and omitted rather than 0 on
   * the pages that render no placeholder at all: a declared 0 reads as "checked,
   * none expected", and here that would be indistinguishable from a page whose
   * fields stopped rendering. Only set it where a placeholder is part of what
   * the page IS -- /login and /passenger-info -- so the number is a claim
   * somebody made rather than a default nobody chose.
   */
  minPlaceholders?: number;
  /**
   * Elements this page MUST render for the sweep to mean what it claims.
   *
   * A population floor catches a page that failed to render. It does not catch
   * the narrower and likelier failure: the page renders, the count clears the
   * floor, and the one element the gate was built for is absent because a
   * fixture drifted. `.recent-route-btn` needs a recent-route history AND a
   * station roster that resolves it -- two things that can rot independently,
   * and the whole of AC1 rests on that element being measured.
   *
   * OBRS-938: PRESENT is not the same as MEASURABLE, and this list has to say
   * which one it means. `.recent-route-btn` kept rendering after OBRS-928; what
   * stopped was any pill in the un-filled state, because the strip was down to
   * one pill and the prefill made it `.is-active`. Every rule written for the
   * base state then had nothing to control, which is a silent hole in two gates
   * at once. A selector here may therefore carry state -- what the sweep needs is
   * an element in the state under test, not a tag name.
   */
  mustRender: string[];
  /**
   * Controls whose `:hover` and `:focus-visible` states are measured too.
   *
   * OBRS-575 failed in both states and by different amounts -- rest was
   * $brand-customer-strong on the dark card (2.79:1 when the card was filed),
   * hover was $text-white on the accent fill (2.03:1). A rest-only gate reports
   * one of those and calls the button covered.
   *
   * Deliberately a short list rather than every control: each entry costs four
   * pointer/focus round trips per page per theme, and a gate whose wall clock
   * scales with the size of the DOM is a gate people stop running.
   */
  hoverTargets: string[];
  /**
   * Shallow patch applied over STORE_SEED before it is dispatched (OBRS-1228).
   *
   * A function rather than a literal because the only override so far has to be
   * computed at run time: "the customer searched TODAY and nothing came back"
   * is a claim about the clock, and a hard-coded date turns into "searched some
   * day in the past" the morning after it is written -- which renders the
   * generic `.no-results` copy and quietly measures a different screen than the
   * entry's name promises. `mustRender` is what turns that into a failure.
   */
  storeOverride?: () => Record<string, unknown>;
}

/** Local YYYY-MM-DD. `toISOString()` is UTC and is the wrong day here for 7 hours a night. */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const CUSTOMER_PAGES: CustomerPage[] = [
  {
    key: 'home',
    url: '/',
    landsOn: '/',
    minText: 40,
    minControls: 5,
    // .recent-route-btn is the OBRS-575 defect this card exists for; .btn-search
    // is the OBRS-746 boundary finding. Both must be in the population.
    //
    // OBRS-938 adds the `:not(.is-active)` row. The bare selector above stayed
    // satisfied by the single prefilled pill while the un-filled state -- the
    // 2.79:1 site OBRS-575 was opened for -- disappeared from both sweeps for a
    // week. This row is the one that goes red if MY_BOOKINGS ever collapses back
    // to a single distinct route pair.
    mustRender: ['.recent-route-btn', '.recent-route-btn:not(.is-active)', '.btn-search'],
    hoverTargets: ['.recent-route-btn', '.btn-search'],
  },
  {
    key: 'login',
    url: '/login',
    landsOn: '/login',
    minText: 15,
    minControls: 2,
    // Email + password. Both measured 1.10:1 in dark before OBRS-797.
    minPlaceholders: 2,
    mustRender: ['.login-btn'],
    hoverTargets: ['.login-btn', '.login-by-phone-no-btn'],
  },
  {
    key: 'my-bookings',
    url: '/my-bookings',
    landsOn: '/my-bookings',
    minText: 30,
    minControls: 3,
    mustRender: ['.booking-card', '.status-badge'],
    hoverTargets: ['.filter-pill', '.actions-menu-btn'],
  },
  {
    key: 'schedule-booking',
    url: '/schedule-booking',
    landsOn: '/schedule-booking',
    seed: true,
    minText: 30,
    minControls: 2,
    mustRender: ['.select-btn'],
    hoverTargets: ['.select-btn'],
  },
  {
    // OBRS-1228. The entry above seeds two trips, so /schedule-booking has been
    // swept for eleven months in exactly ONE of its two states -- and the state
    // it never entered is the one that was broken. The results panel is themed
    // by `.booking-container:has(.schedule-item)`; with no trip row that
    // selector does not match, the panel stayed light #f6fcff on the dark page,
    // and `.title` (already $dk-text) read 1.05:1. Nine pages swept, "0 below
    // AA", and a heading nobody could read -- because the population was
    // complete and the STATES were not.
    //
    // Same URL, opposite store. Two entries rather than a flag on one: every
    // floor and every mustRender below describes the empty screen, and folding
    // them into the populated entry would mean neither set could be asserted.
    key: 'schedule-booking-empty',
    url: '/schedule-booking',
    landsOn: '/schedule-booking',
    seed: true,
    storeOverride: () => ({
      filter: { ...STORE_SEED.filter, departureDate: todayLocal() },
      list: { departureSchedules: [], arrivalSchedules: null },
    }),
    minText: 25,
    minControls: 2,
    // `.sold-out-today__title` is the 1.05:1 site itself. `__action` is the
    // filled pill, which is the only control the panel contributes and the one
    // whose boundary against the newly-dark surface has to be scored.
    //
    // The pair also pins the STATE, not just the page: if `todayLocal()` ever
    // drifts off the component's own idea of today, the branch falls through to
    // `.no-results` and both of these render zero times -- a red run naming the
    // reason, rather than a green sweep over the wrong empty state.
    mustRender: ['.sold-out-today__title', '.sold-out-today__action'],
    hoverTargets: ['.sold-out-today__action'],
  },
  {
    // The OTHER empty state, and the older one: search a day that is not today,
    // get nothing, and the panel renders `.no-results` instead of the OBRS-1217
    // copy. Same blind spot, longer-standing -- `.no-results` predates both
    // cards and had never once been measured, which is how it shipped at 4.45:1
    // on the #f6fcff tint in LIGHT mode. Not a dark-mode bug and not new; just
    // never rendered under a gate.
    //
    // The date is STORE_SEED's own 2030-06-17 rather than an override, and that
    // is what puts this entry on the other side of the branch from the one
    // above: `soldOutToday$` emits null for any day that is not today.
    key: 'schedule-booking-no-results',
    url: '/schedule-booking',
    landsOn: '/schedule-booking',
    seed: true,
    storeOverride: () => ({ list: { departureSchedules: [], arrivalSchedules: null } }),
    minText: 25,
    minControls: 2,
    mustRender: ['.no-results'],
    // The panel contributes no control in this state -- the filter form's are
    // covered by the two entries above.
    hoverTargets: [],
  },
  {
    key: 'review-schedule-booking',
    url: '/review-schedule-booking',
    landsOn: '/review-schedule-booking',
    seed: true,
    minText: 25,
    minControls: 1,
    mustRender: [],
    hoverTargets: ['.btn-change-info'],
  },
  {
    key: 'passenger-info',
    url: '/passenger-info',
    landsOn: '/passenger-info',
    seed: true,
    minText: 25,
    minControls: 3,
    // booker-info-form's Phone + Email, which is where the user reported it.
    // Two, not three: this fixture seeds `useBookerInfo: true`, so the
    // passenger-info-form's own phone field is not rendered -- the same
    // one-passenger fixture narrowness OBRS-795 tracks, restated for invariant C.
    minPlaceholders: 2,
    mustRender: ['.btn-next'],
    hoverTargets: ['.btn-next', '.btn-back'],
  },
  {
    key: 'payment',
    url: '/payment',
    landsOn: '/payment',
    seed: true,
    minText: 20,
    minControls: 1,
    mustRender: [],
    hoverTargets: ['.payment-btn', '.back-btn'],
  },
  {
    key: 'e-ticket',
    url: '/e-ticket',
    landsOn: '/e-ticket',
    seed: true,
    minText: 15,
    minControls: 1,
    mustRender: [],
    hoverTargets: ['.ticket-nav-btn', '.download-btn'],
  },
  {
    // OBRS-857 added a customer-facing page and did NOT add it here, so the gate went on
    // reporting "8 pages swept" while a ninth shipped unmeasured. A page list that only grows
    // when someone remembers is a gate that quietly narrows.
    //
    // What this entry measures is the page AT REST: the lead, the form and its submit button.
    // Everything downstream of a lookup response -- .find-booking-result, .find-booking-ticket,
    // the .admin-status chip re-scoped onto :host, and both .find-booking-empty states -- needs
    // a response the sweep cannot drive, so it is NOT covered here. Said out loud rather than
    // implied by a green run. (mustRender first claimed .find-booking-empty; it renders only in
    // the not-found/throttled states and the gate's own zero-times check caught the lie.)
    key: 'find-booking',
    url: '/find-booking',
    landsOn: '/find-booking',
    minText: 8,
    minControls: 1,
    // Both fields carry one. Placeholders are the OBRS-797 defect class (1.10:1 in dark), and
    // this page is public, so its two are the first a signed-out visitor ever sees.
    minPlaceholders: 2,
    mustRender: ['.find-booking-form', '.find-booking-lead', '.btn-primary'],
    hoverTargets: ['.btn-primary'],
  },

  // --- OBRS-970 group 1: the pages that open with a bare `goto` -------------
  //
  // Everything below needs no store seed and no session beyond the one
  // `seedCustomerSession` already writes. Eight of the nine were ALREADY visited
  // by this lane -- `route-smoke` proves they render and `PUBLIC_SWEEP` in
  // host-boxes.ts measures their host boxes -- so "nothing was watching them" was
  // never quite true. What none of those asked is the only question this list is
  // for: what COLOUR are they, in the theme a customer might be reading them in.
  //
  // The four policy pages are the reason the card was filed: they are the footer's
  // "information and services" column, they are reachable signed-out, and they are
  // the closest thing this product has to a legal surface.
  //
  // EVERY FLOOR BELOW WAS READ OFF A REAL RUN (2026-08-18, this lane) and then cut
  // to roughly two thirds of it, which is the same rule the eleven entries above
  // follow: high enough to catch a page that stopped rendering, low enough that an
  // ordinary copy edit does not redden the gate. The card predicted the three policy
  // pages would go red on contrast because `.policy-container` is unthemed
  // (OBRS-969). MEASURED: they do not -- their body text is `$text-black`, declared
  // in their own stylesheets, so an unthemed white surface keeps a legible pair in
  // both themes. 969 is a theme-consistency defect, not a contrast one. What DID go
  // red on the first sweep was /track-parcel's h1 (1.20:1, OBRS-1424) and the 1.4.11
  // control boundaries on the three auth pages (OBRS-772); both are in
  // CONTRAST_ALLOW naming the card that owns the fix.
  {
    key: 'refund-policy',
    url: '/refund-policy',
    landsOn: '/refund-policy',
    minText: 40,
    minControls: 3,
    mustRender: ['.policy-card', '.policy-body'],
    // The cross-link to the sibling policy is the only control the page owns; the
    // rest of what a sweep finds here belongs to the navbar and the footer, which
    // are measured on every other page too.
    hoverTargets: ['.policy-cross-link'],
  },
  {
    key: 'business-policy',
    url: '/business-policy',
    landsOn: '/business-policy',
    minText: 25,
    minControls: 3,
    // `.policy-version` is the OBRS-628 line that must never be re-typed into
    // i18n. It is also the tell that the page rendered its CONTENT rather than
    // its skeleton: the skeleton has no version stamp.
    mustRender: ['.policy-card', '.policy-version'],
    hoverTargets: ['.policy-cross-link'],
  },
  {
    key: 'privacy-policy',
    url: '/privacy-policy',
    landsOn: '/privacy-policy',
    minText: 90,
    // The only page in this group that owns no control and fetches nothing -- it is
    // static by construction (PrivacyPolicyComponent has no service at all). The
    // three this floor guards are the shell's: navbar, footer, consent control. A
    // floor is still worth having on them, because a shell that stopped rendering
    // is exactly the failure a full-page sweep must not report as a clean pass.
    minControls: 3,
    mustRender: ['.policy-card', '.policy-body'],
    hoverTargets: [],
  },
  {
    key: 'parcel-policy',
    url: '/parcel-policy',
    landsOn: '/parcel-policy',
    minText: 80,
    minControls: 3,
    // OBRS-629 shipped this page AFTER this card was written, which is the card's
    // own AC-5 happening in front of us: the "three policy pages" in the card body
    // are four today. The prohibited-item list is fixture-fed, so pinning it here
    // is what separates "the terms rendered" from "the error branch rendered".
    mustRender: ['.policy-card', '.policy-prohibited-list'],
    hoverTargets: ['.policy-cross-link'],
  },
  {
    key: 'how-to-book',
    url: '/how-to-book',
    landsOn: '/how-to-book',
    minText: 35,
    minControls: 3,
    mustRender: ['.how-to-book-card', '.steps'],
    hoverTargets: [],
  },
  {
    // The three auth-entry pages below render their OWN layout -- `.bg-img`,
    // `.left-section`, a language switch -- and not the customer navbar/footer, so
    // almost nothing measured on them is measured anywhere else in this sweep.
    key: 'register',
    url: '/register',
    landsOn: '/register',
    minText: 20,
    minControls: 9,
    // The longest form a customer meets. Placeholders are the OBRS-797 defect
    // class and this page carries more of them than any other.
    minPlaceholders: 5,
    mustRender: ['#firstName', '.login-btn'],
    hoverTargets: ['.login-btn'],
  },
  {
    key: 'login-mobile',
    url: '/login-mobile',
    landsOn: '/login-mobile',
    minText: 11,
    minControls: 5,
    mustRender: ['#phoneNo', '.login-btn', '.login-by-phone-no-btn'],
    // Two buttons with two different fills, which is two colour pairs -- the
    // OBRS-575 shape exactly.
    hoverTargets: ['.login-btn', '.login-by-phone-no-btn'],
  },
  {
    key: 'forget-password',
    url: '/forget-password',
    landsOn: '/forget-password',
    minText: 11,
    minControls: 4,
    minPlaceholders: 1,
    mustRender: ['#email', '.login-btn'],
    hoverTargets: ['.login-btn'],
  },
  {
    // Public parcel tracking (OBRS-305), swept AT REST like /find-booking above
    // and for the same reason: everything past a lookup response --
    // `.parcel-tracking-result`, `.parcel-tracking-timeline`, both not-found
    // states -- needs an answer this entry does not drive. Said out loud rather
    // than implied by a green run.
    key: 'track-parcel',
    url: '/track-parcel',
    landsOn: '/track-parcel',
    minText: 24,
    minControls: 4,
    minPlaceholders: 1,
    mustRender: ['.parcel-tracking-form', '.btn-primary'],
    hoverTargets: ['.btn-primary'],
  },
];

/**
 * OBRS-970 AC-6. What one entry costs a sweep, and the budget derived from it.
 *
 * Every spec that loops `CUSTOMER_PAGES` used to hard-code its own ceiling --
 * 300_000 in three of them, 240_000 in the fourth -- under a list whose whole
 * purpose is to grow. That is the shape OBRS-798 already fixed once for the host
 * -box sweeps (`sweepBudgetMs` in host-boxes.ts): a gate that reddens on the size
 * of its own coverage teaches people to re-run CI until it passes.
 *
 * MEASURED 2026-08-18 on this lane, before this card added anything: the
 * reachability sweep took 1.4 min over 11 entries = 7.6 s per entry, one pass
 * each, fresh browser context per page.
 *
 * The nine pages this card added are CHEAPER than the eleven that were here:
 * measured per entry on a quiet lane, 4.9-5.4 s for the policy pages against
 * 6.1-8.4 s for the seeded funnel screens.
 *
 * ONE CORRECTION WORTH KEEPING, because it nearly went into this file as fact.
 * The reachability sweep blew this budget twice while the value was being chosen,
 * and the first diagnosis was contention -- the contrast gate loading 40 pages on
 * the other worker. That was WRONG. Instrumenting the sweep per page showed it
 * completing 13 entries in 87 s and then losing its browser context on
 * /privacy-policy, where the consent banner stands down by design (OBRS-874); it
 * then sat until whatever ceiling it had been given. The budget was never the
 * problem, and raising it would have bought a slower red. See
 * NO_BANNER_BY_DESIGN in obrs-1372-consent-banner-reachability.spec.ts.
 *
 * Re-measure with the wall clock the sweeps print, not with a number from here:
 *   npx playwright test --config=playwright.gate.config.ts obrs-1372-consent-banner-reachability
 */
export const CUSTOMER_SWEEP_SETUP_MS = 30_000;
export const CUSTOMER_SWEEP_PAGE_MS = 20_000;

/**
 * @param passesPerEntry how many times the sweep loads each entry -- the contrast
 * gate visits every page once per THEME, so it passes 2; every other reader
 * passes 1 and may leave it out.
 */
export function customerSweepBudgetMs(passesPerEntry = 1): number {
  return CUSTOMER_SWEEP_SETUP_MS + CUSTOMER_PAGES.length * passesPerEntry * CUSTOMER_SWEEP_PAGE_MS;
}

/** A customer-side route this sweep does NOT visit, and why not. */
export interface ExcludedCustomerRoute {
  /** Exactly as written in `src/app/app-routing.module.ts`, leading slash added. */
  path: string;
  why: string;
}

/**
 * The other half of the population (OBRS-970 AC-1).
 *
 * The gap this card was opened for did not survive because anyone decided these
 * pages were not worth measuring -- it survived because nothing anywhere said
 * they existed. A list that only names what it covers reports "8 pages swept" and
 * cannot be read as "8 out of 24" by anybody who is not already counting routes
 * by hand.
 *
 * So: every route that is not in `CUSTOMER_PAGES` is here, with the reason. The
 * reason is the point. "Not yet" is a legitimate entry; an empty line is not.
 *
 * `obrs-970-route-population.spec.ts` fails when a route is in neither list, when
 * it is in both, and when an entry here names a route that no longer exists.
 */
export const EXCLUDED_CUSTOMER_ROUTES: ExcludedCustomerRoute[] = [
  {
    path: '/otp/:option/:phoneno',
    why:
      'Reached only by submitting /login-mobile, and the OTP it renders against is minted by ' +
      'a POST this lane does not answer. Visiting the URL directly renders the countdown ' +
      'screen for a code nobody sent -- a real page, but not the one a customer sees. ' +
      'host-box-sweep.ts reaches it under PUBLIC_SWEEP for the narrower host-box question, ' +
      'which does not care which state the page is in.',
  },
  {
    path: '/reset-password',
    why:
      'Needs a live, unexpired token in the query string (`#newPassword` only mounts for one). ' +
      'A fixture token would pin this sweep to whatever the backend calls valid THIS month, ' +
      'which is a coupling the GATE lane exists to not have.',
  },
  {
    path: '/verify-email',
    why: 'Same as /reset-password: a one-shot emailed token, and no screen at all without one.',
  },
  {
    path: '/change-email/confirm',
    why: 'Same as /verify-email -- opened from a confirmation mail, meaningless without its token.',
  },
  {
    path: '/account',
    why:
      'NOT YET, and cheaper than this card first estimated: seedCustomerSession already writes ' +
      'auth_token and auth_roles, which is why /my-bookings (requireAuth: true) is swept today, ' +
      'so what is missing is an API fixture and not a login flow. Its consent-overlap seam is ' +
      'covered meanwhile by obrs-854-account-deeplink.spec.ts; what is missing is the ' +
      'systematic colour sweep.',
  },
  {
    path: '/my-reports',
    why: 'NOT YET. Same shape as /account -- a signed-in list page needing one API fixture.',
  },
  {
    path: '/parcel-booking',
    why:
      'NOT YET. A multi-step form behind featureEnabledGuard(onlineParcelBooking); the flag is ' +
      'true in the environment this lane builds, so it is reachable -- what it needs is the ' +
      'fixtures for the step it should be measured at, which is a choice nobody has made yet.',
  },
  {
    path: '/my-parcels',
    why: 'NOT YET. Same shape as /my-reports, behind the same parcel flag as /parcel-booking.',
  },
];

/**
 * A customer session, a theme, and a recent-route history -- all before the app
 * boots, so nothing has to be clicked.
 *
 * The theme is set through `app_admin_theme`, the key ThemeService itself reads
 * (src/app/shared/services/theme.service.ts). That is a claim about a coupling,
 * so the caller asserts `body.is-dark` afterwards rather than trusting it: a
 * renamed key would otherwise measure the LIGHT theme twice and report both as
 * green, which is how a theme test passes on the wrong background.
 */
export async function seedCustomerSession(page: Page, dark: boolean): Promise<void> {
  await page.addInitScript(
    ([isDark, recent]) => {
      localStorage.setItem('app_language', 'en');
      localStorage.setItem('auth_token', 'obrs-584-contrast-gate-token');
      localStorage.setItem('auth_username', 'customer@system.local');
      localStorage.setItem('auth_roles', JSON.stringify(['user']));
      // Must equal RECENT_ROUTES_CACHE_KEY (src/app/shared/lib/recent-routes.ts).
      // Hand-copied -- see RECENT_ROUTES_SEED's note on why, and on the v1 that
      // sat here unread from OBRS-923 until OBRS-938.
      localStorage.setItem('obrs.recentRoutes.v2', recent as string);
      if (isDark) localStorage.setItem('app_admin_theme', 'dark');
      else localStorage.removeItem('app_admin_theme');
    },
    [dark, RECENT_ROUTES_SEED] as [boolean, string]
  );

  await page.route('**/api/**', async (route) => {
    const pathname = route.request().url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    for (const [re, make] of FIXTURES) {
      const m = re.exec(pathname);
      if (m) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(make(m)),
        });
        return;
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) });
  });

  // No key and no network in this lane; without the abort the Home page waits on
  // the Maps bootstrap before it finishes rendering.
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());

  // OBRS-1370. /login pulls the Google Identity Services client, which pulls a second file
  // from ssl.gstatic.com. Nothing in this lane signs in with Google, and these were two of
  // the five external hosts this lane was measured reaching. `obrs-854-account-deeplink`
  // aborts the same script for the same reason; this is the shared-harness half.
  await page.route('**/accounts.google.com/**', (route) => route.abort());
  await page.route('**/ssl.gstatic.com/**', (route) => route.abort());
}

/**
 * Dispatch the real action types into the real root Store. `store` is `private`
 * on the component, which is a compile-time idea -- the field is there at
 * runtime, and `window.ng` exists because this lane serves a development build.
 */
export async function seedStore(page: Page, overrides: Record<string, unknown> = {}): Promise<void> {
  // OBRS-767: this used to be the `page.evaluate` below and nothing else, so it
  // threw the instant no component exposed a Store. That is a RACE, not a check --
  // `review-total-host-box.spec.ts` calls it on the line after `page.goto()`, with
  // no wait of any kind, and passed only because the lane was light enough that
  // Angular had always rendered first. Adding a second CPU-heavy spec to the same
  // 2-worker lane was enough to lose that race on the CI runner, and the lane went
  // red in a spec that had not changed. Wait for the precondition, then assert it:
  // a page that genuinely has no Store still fails, just 20s later and saying so.
  try {
    await page.waitForFunction(
      () => {
        const ng = (window as unknown as { ng?: { getComponent(el: Element): unknown } }).ng;
        if (!ng || !ng.getComponent) return false;
        for (const el of Array.from(document.querySelectorAll('*'))) {
          const cmp = ng.getComponent(el) as { store?: { dispatch?: unknown } } | null;
          if (cmp && cmp.store && typeof cmp.store.dispatch === 'function') return true;
        }
        return false;
      },
      undefined,
      { timeout: 20_000 },
    );
  } catch {
    throw new Error(
      'seedStore: no component exposed an NgRx Store within 20s. Either the page never ' +
        'bootstrapped (check for an unmocked /api call raising the global error modal), ' +
        'or this is not a development build so `window.ng` is absent.',
    );
  }

  await page.evaluate((seed) => {
    const ng = (window as unknown as { ng?: { getComponent(el: Element): unknown } }).ng;
    if (!ng || !ng.getComponent) throw new Error('window.ng is absent -- not a development build?');
    let store: { dispatch(a: unknown): void } | null = null;
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cmp = ng.getComponent(el) as { store?: { dispatch?: unknown } } | null;
      if (cmp && cmp.store && typeof cmp.store.dispatch === 'function') {
        store = cmp.store as { dispatch(a: unknown): void };
        break;
      }
    }
    if (!store) throw new Error('no component on the page exposes an NgRx Store');
    store.dispatch({ type: '[ScheduleFilter API] Set Schedule Filter Success', schedule_filter: seed.filter });
    store.dispatch({ type: '[ScheduleList API] Set Schedule List Success', schedule_list: seed.list });
    store.dispatch({ type: '[ScheduleBooking API] Set Schedule Booking Success', schedule_booking: seed.booking });
    store.dispatch({ type: '[PassengerInfo API] Set Passenger Info Success', passengerInfo: seed.passengers });
    store.dispatch({ type: '[Booking API] Set Booking Success', booking: seed.bookingResult });
  }, { ...STORE_SEED, ...overrides } as typeof STORE_SEED);
}
