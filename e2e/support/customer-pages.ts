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

const FIXTURES: [RegExp, (m: RegExpExecArray) => unknown][] = [
  [/\/tickets\/(\d+)\/boarding-token$/, (m) => boardingToken(m[1])],
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
