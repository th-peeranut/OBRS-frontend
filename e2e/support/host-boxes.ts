/**
 * OBRS-775 -- finding component hosts that are `display: inline` while holding
 * block-level children, in the only place the answer exists: a running browser.
 *
 * THE DEFECT, RESTATED FROM OBRS-753. An Angular component whose SCSS never
 * writes `:host { display: ... }` renders as `display: inline`, because that is
 * the initial value and Angular adds nothing. If its template's root children
 * are block-level, CSS requires the browser to split the inline box and wrap
 * those children in ANONYMOUS block boxes. The host's own border box then stops
 * describing anything you can reason about -- on OBRS-753 it spanned the height
 * of BOTH children, so Playwright's hit test at a button inside it resolved to
 * the host and called it an interceptor.
 *
 * WHY NOT A STYLESHEET LINT. The defect is a MISSING declaration, so there is no
 * token in any diff for a reviewer or a parser to catch, and no parser can tell
 * an inline host that is FINE (all children inline; or the host is a flex/grid
 * item and its parent blockifies it) from one that is malformed. Only the
 * cascade knows, and the cascade only exists in a browser. Same argument as
 * OBRS-584's contrast gate.
 *
 * OUT-OF-FLOW CHILDREN ARE NOT A DEFECT, and this module says so in code.
 * Absolutely positioned, fixed and floated boxes are taken out of the normal
 * flow before the inline box is ever split, so an inline host whose only
 * block-level child is `position: absolute` is well-formed. That is not a
 * technicality: `app-report-usability-fab` is on the card's list of 25 and its
 * only child is `.report-fab { position: fixed }`, so it never needed fixing.
 * Counting it would have put a fictional entry on the allow-list, and an
 * allow-list with fictional entries on it is how a gate stops being believed.
 *
 * The page lists live here too, so the GATE spec and the before/after geometry
 * CAPTURE measure exactly the same screens. Two copies of "which pages does this
 * card cover" is how the evidence ends up describing a different sweep from the
 * one that is enforced.
 *
 * ASCII-only source.
 */

import { expect, Browser, Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CUSTOMER_PAGES } from './customer-pages';

/** Displays that make a box BLOCK-LEVEL, i.e. illegal inside an inline box. */
export const BLOCK_LEVEL = /^(block|flex|grid|table|list-item|flow-root)$/;

export interface MalformedHost {
  /** Which page it was seen on -- the first one, since hosts repeat across the shell. */
  page: string;
  /** The custom-element tag, e.g. `app-navbar` or `p-card`. */
  tag: string;
  /** The in-flow block-level children that make the box malformed. */
  blockChildren: string[];
}

/**
 * Every custom-element host on the current page that is `display: inline` and
 * holds at least one IN-FLOW block-level child.
 *
 * Scoped to tags containing a hyphen, which is exactly the set of custom
 * elements: our own `app-*` plus PrimeNG's `p-*`. A plain `<span>` wrapping a
 * `<div>` is the same CSS mistake, but it is written down in a template where a
 * reviewer can see it; the host case is the one that is invisible by
 * construction, and it is the one this card is about.
 */
export async function scanMalformedHosts(page: Page, pageKey: string): Promise<MalformedHost[]> {
  const found = await page.evaluate(() => {
    const blockLevel = /^(block|flex|grid|table|list-item|flow-root)$/;
    const label = (el: Element) => {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
      return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
    };

    const out: { tag: string; blockChildren: string[] }[] = [];
    const seen = new Set<string>();

    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (!el.tagName.includes('-')) continue;
      const cs = getComputedStyle(el);
      if (cs.display !== 'inline') continue;

      const kids: string[] = [];
      for (const child of Array.from(el.children)) {
        const ccs = getComputedStyle(child);
        if (!blockLevel.test(ccs.display)) continue;
        // Out of flow before the inline box is ever split -- see the header.
        if (ccs.position === 'absolute' || ccs.position === 'fixed') continue;
        if (ccs.float !== 'none') continue;
        kids.push(label(child));
      }
      if (!kids.length) continue;

      // One entry per component, not per instance: `app-passenger-info-form`
      // renders once per passenger and would otherwise report N identical rows.
      const tag = el.tagName.toLowerCase();
      if (seen.has(tag)) continue;
      seen.add(tag);
      out.push({ tag, blockChildren: kids });
    }
    return out;
  });

  return found.map((f) => ({ page: pageKey, ...f }));
}

/**
 * Waits until the page is quiescent enough to measure.
 *
 * The app's HTTP interceptor opens a SweetAlert "Loading..." for EVERY `/api/`
 * call and closes it in `finalize`. Its container is `position: fixed` and keeps
 * `pointer-events: auto` right through the closing transition, so a scan taken a
 * few frames early measures a page that still has a modal on it. OBRS-753 lost a
 * run to exactly that, and its own header records the fix; this is the same wait,
 * hoisted so every page in the sweep gets it.
 */
export async function settle(page: Page): Promise<void> {
  await expect(page.locator('.swal2-container')).toHaveCount(0, { timeout: 15_000 });
  // OBRS-776: and the WEBFONT has to have finished arriving, or the run measures
  // a page mid-swap. `styles.scss` pulls Sarabun from fonts.googleapis.com and
  // every text box is a different width in the fallback face -- one AFTER run
  // reported 48 moves, all of them `width` on the collapsed admin sidebar's nav
  // labels on a single screen, heights identical to the pixel. That is the
  // signature of a font swap, not of layout, and it is a RACE rather than a
  // failure: the same tree measured twice disagreed with itself. `fonts.ready`
  // resolves once loading has settled either way, which is what removes the race.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Two frames: the swal container is removed on transitionend, and the layout
  // that follows its removal is what we are about to measure.
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  );
  // OBRS-782 deliberately does NOT reset the scroll here. A screen reached by
  // clicking ends up wherever the scrolling left it, and that offset is not
  // layout -- but resetting it from this side loses a race against the page
  // (`p-menu` restores focus to its trigger on hide, and focusing scrolls).
  // The reset belongs in the same browser task as the measurement, so it lives
  // in `measureAll` in `obrs-775-geometry.spec.ts`. The gate spec does not
  // care: `scanMalformedHosts` reads `display`, not coordinates.
}

// --- the pages under sweep ---------------------------------------------------

/**
 * OBRS-782. One canned answer for the pages that need real rows, matched on the
 * request PATHNAME (query already stripped, so `/schedules/walk-in?date=` is
 * `/schedules/walk-in`). Consulted by `mockEmptyBackend` BEFORE its generic
 * answers, and only for the page currently under `visit`.
 *
 * Never give `match` the `g` flag: `RegExp.test` is stateful with it, so the
 * second request for the same path would silently miss.
 */
export interface FixtureRule {
  match: RegExp;
  body: unknown;
}

/**
 * The rules in force right now. Module-level rather than a per-page
 * `page.route`, deliberately: routes stack, and a handler registered for one
 * screen would still be answering three screens later -- the sweep visits every
 * page through one `Page`, so a leaked fixture would put rows on a screen whose
 * whole point is that it has none. `visit` overwrites this on every navigation,
 * so what is in force is always exactly what the current entry declares.
 */
let activeFixture: FixtureRule[] = [];

export interface SweepPage {
  key: string;
  url: string;
  /** The pathname the app must land on. A redirect to /login is a failed sweep. */
  landsOn: RegExp;
  /** Proof the page rendered ITSELF and not just the shell. */
  requires: string;
  /** Needs the NgRx booking store seeded before it renders anything measurable. */
  seed?: boolean;
  /**
   * OBRS-782. Rows this screen cannot render without, answered ahead of
   * `mockEmptyBackend`'s nulls.
   *
   * The empty backend is not laziness and this is not a climbdown from it: an
   * empty table has the same host tree as a full one, which is true of every
   * page the sweep reached before this card and false for exactly the seven it
   * could not. A `p-tabView` behind `*ngIf="selectedTrip"` does not render a
   * different box when the list is empty -- it renders no box at all, and a
   * census that never saw it cannot say a global rule left it alone.
   *
   * So the bar for a fixture here is the same as the bar for an `act`: the
   * SMALLEST thing that makes the PrimeNG host exist. Not a working sales flow;
   * one row, one status, one selectable trip.
   */
  fixture?: FixtureRule[];
  /**
   * OBRS-776. One interaction to perform after the page has rendered and before
   * anything is measured, for the screens whose content only exists behind a
   * click. Kept to a single deterministic action with a `requires`-style
   * assertion of its own inside: a sweep entry that quietly failed to open its
   * modal would measure the page underneath and file it under the modal's key.
   */
  act?: (page: Page) => Promise<void>;
}

/**
 * The routed component each customer page must actually mount, keyed by
 * `CUSTOMER_PAGES[].key`.
 *
 * Not derived from `CustomerPage.mustRender`: three of the eight declare none
 * (they exist for the contrast gate, which needs a CONTROL to measure, and those
 * pages have none worth naming), and the generic fallback this replaced --
 * `app-root > *` -- resolved to the `<router-outlet>` element itself, which
 * Angular leaves in the DOM and renders `display: none`. It timed out on
 * `/review-schedule-booking` on the first run. Naming the routed component is
 * both honest and stricter: a page that redirected renders a different host and
 * fails here rather than being swept under someone else's key.
 *
 * A key added to `CUSTOMER_PAGES` and not here fails loudly in the gate spec,
 * which is the point -- the sweep should grow when that list grows.
 */
export const CUSTOMER_HOST: Record<string, string> = {
  home: 'app-home',
  login: 'app-login',
  'my-bookings': 'app-my-bookings',
  'schedule-booking': 'app-schedule-booking',
  'review-schedule-booking': 'app-review-schedule-booking',
  'passenger-info': 'app-passenger-info',
  payment: 'app-payment',
  'e-ticket': 'app-e-ticket',
};

/** `CUSTOMER_PAGES` restated in this module's shape. */
export const CUSTOMER_SWEEP: SweepPage[] = CUSTOMER_PAGES.map((c) => ({
  key: c.key,
  url: c.url,
  landsOn: new RegExp(c.landsOn.replace(/\//g, '\\/') + '$'),
  requires: CUSTOMER_HOST[c.key],
  seed: c.seed,
}));

/**
 * Public and auth-entry routes. Taken from `route-smoke.spec.ts`, which already
 * proves each one renders under an empty mocked backend -- the sentinel selectors
 * below are its assertions, reused so the two specs cannot drift into disagreeing
 * about what "this page rendered" means.
 */
export const PUBLIC_SWEEP: SweepPage[] = [
  { key: 'business-policy', url: '/business-policy', landsOn: /\/business-policy$/, requires: '.policy-card h1' },
  { key: 'how-to-book', url: '/how-to-book', landsOn: /\/how-to-book$/, requires: '.how-to-book-card h1' },
  { key: 'privacy-policy', url: '/privacy-policy', landsOn: /\/privacy-policy$/, requires: '.policy-card h1' },
  { key: 'refund-policy', url: '/refund-policy', landsOn: /\/refund-policy$/, requires: '.policy-card h1' },
  { key: 'forget-password', url: '/forget-password', landsOn: /\/forget-password$/, requires: '#email' },
  {
    key: 'reset-password',
    url: '/reset-password?token=host-box-sweep-token',
    landsOn: /\/reset-password/,
    requires: '#newPassword',
  },
  { key: 'login-mobile', url: '/login-mobile', landsOn: /\/login-mobile$/, requires: '#phoneNo' },
  { key: 'register', url: '/register', landsOn: /\/register$/, requires: '#firstName' },
  { key: 'otp', url: '/otp/login/0812345678', landsOn: /\/otp\//, requires: 'app-otp' },
];

/**
 * The staff and admin shells, plus the one customer page that needs a session
 * AND a booking id. The card called this group unsurveyed and said so in as many
 * words -- the static census pointed at it as the thickest one, and the 25 hosts
 * it quoted were customer pages only. Everything here is reachable with no
 * backend, which is why these particular routes and not the whole admin menu: a
 * page that needs data this lane cannot fake would measure its own error state
 * and report the hosts of a screen no user sees.
 *
 * `/payment/result` sits here rather than with the public pages because
 * `PaymentResultComponent.ngOnInit` bounces to `/payment` when
 * `getActiveBookingId()` is empty, and this is the group that seeds one. On the
 * first run it was in PUBLIC_SWEEP and the landing assertion caught the redirect
 * -- which is the assertion doing its job: without it the sweep would have
 * measured `/payment` twice and filed the second one under `payment-result`.
 */
// --- OBRS-782 fixtures: the smallest rows that make a host exist -------------

/** The envelope every endpoint in this app answers in. Declared here rather
 * than beside `mockEmptyBackend` because the fixtures below are evaluated at
 * module load, which is before that section runs -- a `const` used above its
 * declaration is a TDZ ReferenceError, not a hoist. */
const ok = <T>(data: T) => ({ code: 200, message: 'OK', data });

/**
 * Far enough out that no policy window closes on it. `/staff/sell` groups trips
 * by date and `my-bookings` refuses to reschedule inside four hours, so a date
 * near today would make these screens depend on the day the suite runs.
 */
const FIXTURE_DEPARTURE = '2030-06-17T08:00:00+07:00';
const FIXTURE_ARRIVAL = '2030-06-17T13:00:00+07:00';

/**
 * One selectable walk-in trip. Mirrors `staff-sell-walkin.spec.ts`'s
 * `BUS_TRIP_FIXTURE` in shape but not in ambition: that spec sells a ticket and
 * needs seat numbers, prices and counts that add up, while this one needs a
 * `.trip-row` to exist so `selectedTrip` can become non-null. Kept separate
 * rather than imported because a spec is not a fixture module, and because the
 * day the sales flow needs a richer trip this one should NOT follow it.
 */
const WALK_IN_TRIPS = ok([
  {
    routeSlug: 'chonburi_bangkok',
    routeLabel: 'Chonburi - Bangkok',
    trips: [
      {
        scheduleId: 42,
        vehicleType: 'bus',
        licensePlate: 'TH-8888',
        driverName: 'Somchai Jaidee',
        departureDateTime: FIXTURE_DEPARTURE,
        arrivalDateTime: FIXTURE_ARRIVAL,
        pricePerSeat: '350.00',
        capacity: 21,
        availableCount: 21,
        reservedUnpaidCount: 0,
        soldPaidCount: 0,
        availableSeatNumbers: Array.from({ length: 21 }, (_, i) => String(i + 1)),
      },
    ],
  },
]);

/** Selecting a trip fetches the route's stop pairs for pickup/drop-off. */
const WALK_IN_SEGMENTS = ok({
  route: { slug: 'chonburi_bangkok', name: 'Chonburi - Bangkok' },
  stopPairs: [
    {
      segmentId: 1,
      fromStop: { slug: 'nong_chak', name: 'Nong Chak' },
      toStop: { slug: 'bkr_mochit2', name: 'Mo Chit 2 Terminal' },
      vehicleType: { slug: 'bus', name: 'Bus' },
      fare: '350.00',
      estimatedDurationMinutes: 300,
    },
  ],
});

/**
 * The boarding manifest's supplementary header. `status: 'scheduled'` is the
 * whole point -- `parseAdminStatus` takes a plain string verbatim, and the
 * "Mark delayed" pill (and therefore the delay dialog's two calendars) is
 * `*ngIf="canDelaySchedule && tripHeader.statusCode === 'scheduled'"`.
 */
const BOARDING_SCHEDULE = ok({
  id: 42,
  status: 'scheduled',
  departureDateTime: FIXTURE_DEPARTURE,
  route: { code: 'CBR-BKK', slug: 'chonburi_bangkok' },
  vehicle: { numberPlate: 'TH-8888', vehicleNumber: 'BUS-01' },
  driver: { fullName: 'Somchai Jaidee' },
  assignedToMe: true,
  delayedDepartureDateTime: null,
  delayReason: null,
});

/** One vehicle row, so a "Manage maintenance" button exists to focus it. */
const ONE_VEHICLE = ok([
  {
    id: 1,
    vehicleNumber: 'BUS-01',
    numberPlate: 'TH-8888',
    vehicleType: { id: 1, slug: 'bus', name: 'Bus' },
    status: 'active',
  },
]);

/**
 * The round-trip promotion singleton. Its whole form -- both calendars included
 * -- is `*ngIf="!isLoading && promotion"`, and the endpoint is one the generic
 * mock answers with `null`, which renders the "no promotion configured" line
 * instead. This is the one of the seven that needs no click at all.
 */
const ROUND_TRIP_PROMOTION = ok({
  id: 1,
  slug: 'round_trip',
  code: 'ROUNDTRIP',
  discountType: { code: 'percentage', name: 'Percentage' },
  status: { code: 'active', name: 'Active' },
  discountValue: 10,
  maxDiscountAmount: 200,
  minBookingAmount: 500,
  startDateTime: '2026-01-01T00:00:00+07:00',
  endDateTime: '2030-12-31T23:59:59+07:00',
  usageLimit: null,
  currentUsage: 0,
  autoApply: true,
});

/** /admin/promotions, with the singleton row its card needs. */
const PROMOTIONS_FIXTURE: FixtureRule[] = [
  { match: /\/admin\/promotions\/round-trip$/, body: ROUND_TRIP_PROMOTION },
];

export const ADMIN_SWEEP: SweepPage[] = [
  { key: 'admin-lookups', url: '/admin/lookups', landsOn: /\/admin\/lookups$/, requires: '.admin-table' },
  { key: 'admin-roles', url: '/admin/roles', landsOn: /\/admin\/roles$/, requires: '.admin-table' },
  { key: 'admin-routes', url: '/admin/routes', landsOn: /\/admin\/routes$/, requires: '.admin-table' },
  { key: 'admin-users', url: '/admin/users', landsOn: /\/admin\/users$/, requires: '.admin-table' },
  {
    key: 'admin-usability-reports',
    url: '/admin/usability-reports',
    landsOn: /\/admin\/usability-reports$/,
    requires: 'app-usability-reports-page',
  },
  { key: 'staff-sell', url: '/staff/sell', landsOn: /\/staff\/sell$/, requires: 'app-sell-page' },
  { key: 'staff-driver', url: '/staff/driver', landsOn: /\/staff\/driver$/, requires: '.admin-title-block h2' },
  { key: 'staff-boarding', url: '/staff/boarding', landsOn: /\/staff\/boarding$/, requires: 'app-boarding-entry-page' },
  {
    key: 'staff-boarding-list',
    url: '/staff/boarding/42',
    landsOn: /\/staff\/boarding\/42$/,
    requires: 'app-boarding-list-page table',
  },
  { key: 'payment-result', url: '/payment/result', landsOn: /\/payment\/result$/, requires: '.payment-result h1' },

  // --- OBRS-776 -------------------------------------------------------------
  // Added so the sweep sees every page that renders one of the four PrimeNG
  // hosts OBRS-775 left on its allow-list. Not a judgement call about which
  // pages "probably matter": `primengHostUsers()` below reads the source tree
  // for every component that renders one, and the gate spec fails on any of
  // them no page here mounts. Each `requires` is the routed component's own
  // selector, which is what makes a redirect visible instead of quietly
  // sweeping whichever page it redirected to.
  { key: 'admin-schedules', url: '/admin/schedules', landsOn: /\/admin\/schedules$/, requires: 'app-schedules-page' },
  { key: 'admin-reports', url: '/admin/reports', landsOn: /\/admin\/reports$/, requires: 'app-reports-page' },
  {
    key: 'admin-settlements',
    url: '/admin/settlements',
    landsOn: /\/admin\/settlements$/,
    requires: 'app-settlements-page',
  },
  {
    key: 'admin-eod-sales-report',
    url: '/admin/eod-sales-report',
    landsOn: /\/admin\/eod-sales-report$/,
    requires: 'app-eod-sales-report-page',
  },
  {
    key: 'admin-refund-void-report',
    url: '/admin/refund-void-report',
    landsOn: /\/admin\/refund-void-report$/,
    requires: 'app-refund-void-report-page',
  },
  {
    key: 'admin-cash-online-reconciliation',
    url: '/admin/cash-online-reconciliation-report',
    landsOn: /\/admin\/cash-online-reconciliation-report$/,
    requires: 'app-cash-online-reconciliation-report-page',
  },
  { key: 'admin-expenses', url: '/admin/expenses', landsOn: /\/admin\/expenses$/, requires: 'app-expenses-page' },
  {
    key: 'admin-promotions',
    url: '/admin/promotions',
    landsOn: /\/admin\/promotions$/,
    requires: 'app-promotions-page',
    // OBRS-782: the round-trip singleton, so `app-round-trip-promotion-card`
    // renders its form instead of the "nothing configured" line. Folded into
    // the existing entry rather than given a page of its own -- it needs no
    // click, so a second visit to the same URL would buy one more component and
    // pay a full navigation for it.
    fixture: PROMOTIONS_FIXTURE,
  },
  { key: 'admin-vehicles', url: '/admin/vehicles', landsOn: /\/admin\/vehicles$/, requires: 'app-vehicles-page' },
  {
    // A TAB of /admin/settings since OBRS-576, not a route of its own;
    // `SYSTEM_SETTINGS_TABS` is where the `history` segment comes from.
    key: 'admin-settings-history',
    url: '/admin/settings/history',
    landsOn: /\/admin\/settings\/history$/,
    requires: 'app-config-change-history-page',
  },
  {
    key: 'staff-schedules',
    url: '/staff/schedules',
    landsOn: /\/staff\/schedules$/,
    requires: 'app-staff-schedules-page',
  },
  {
    key: 'staff-parcel-consign',
    url: '/staff/parcels/consign',
    landsOn: /\/staff\/parcels\/consign$/,
    requires: 'app-parcel-consign-page',
  },

  // The two admin form modals. Their host elements are written unconditionally
  // into their pages, so they are in the DOM from the first paint -- but the
  // template root of each is `<div *ngIf="isOpen">`, so the `p-calendar` inside
  // renders only once the modal opens. Both open from the page's own Add button
  // with no seeded data at all, which is what makes them worth one click each:
  // `expense-form-modal` is the ONLY place in the app that renders a
  // `p-calendar` with `styleClass="schedule-calendar-filter"` on a page this
  // lane can reach, and that is a materially different box from the
  // `app-date-field` one -- `.p-calendar.app-date-field` is `display: flex` in
  // styles.scss and blockifies PrimeNG's inner span, while
  // `schedule-calendar-filter` matches no rule anywhere and leaves it
  // `inline-flex`. Without these two entries the global rule would be shipped
  // over a variant nothing had measured.
  {
    key: 'admin-expenses-modal',
    url: '/admin/expenses',
    landsOn: /\/admin\/expenses$/,
    requires: 'app-expenses-page',
    act: async (page) => {
      await page.locator('app-expenses-page button.admin-btn-primary').first().click();
      await expect(page.locator('app-expense-form-modal .admin-modal')).toBeVisible({ timeout: 10_000 });
    },
  },
  {
    key: 'admin-promotions-modal',
    url: '/admin/promotions',
    landsOn: /\/admin\/promotions$/,
    requires: 'app-promotions-page',
    fixture: PROMOTIONS_FIXTURE,
    // OBRS-782 narrowed this selector from `app-promotions-page
    // button.admin-btn-primary` -- `.first()` was safe only while the
    // round-trip card above rendered nothing. With its form populated, the
    // card's own Save button is the first `admin-btn-primary` on the page, and
    // the click would have submitted a promotion instead of opening the modal.
    // The page's Add button lives in `.admin-page-intro`, which the card does
    // not use.
    act: async (page) => {
      await page.locator('app-promotions-page .admin-page-intro button.admin-btn-primary').first().click();
      await expect(page.locator('app-promotion-form-modal .admin-modal')).toBeVisible({ timeout: 10_000 });
    },
  },
  {
    // The bare `<p-calendar>` -- no styleClass at all, so none of the
    // `.p-calendar.app-date-field` rules in styles.scss apply and PrimeNG's own
    // `inline-flex` container survives. Four components write one and this is
    // the only one of the four that opens on a click with no seeded data, which
    // is what makes it the screen that measures the shape for all of them.
    key: 'staff-schedules-modal',
    url: '/staff/schedules',
    landsOn: /\/staff\/schedules$/,
    requires: 'app-staff-schedules-page',
    act: async (page) => {
      await page.locator('app-staff-schedules-page button.btn-primary').first().click();
      await expect(page.locator('app-staff-schedules-page .modal.d-block')).toBeVisible({ timeout: 10_000 });
    },
  },

  // --- OBRS-782 -------------------------------------------------------------
  // The screens OBRS-776 could not open. Each one is a page already in this
  // list, revisited with the smallest fixture that makes its PrimeNG host
  // exist plus the clicks a staff member would make. They are separate entries
  // rather than extra clicks on the existing ones because an `act` that fails
  // has to name one screen: chaining "select a trip, then open the Trip Details
  // tab, then open the schedule modal on top of it" into one entry would put
  // three components behind one assertion and one error message.
  {
    // `app-walk-in-center-panel`'s p-tabView is `*ngIf="selectedTrip"`, and
    // `app-trip-details-edit-form` lives in its second tab. One trip row and
    // two clicks reach both, which is why they share an entry.
    key: 'staff-sell-trip-details',
    url: '/staff/sell',
    landsOn: /\/staff\/sell$/,
    requires: 'app-sell-page',
    fixture: [
      { match: /\/schedules\/walk-in$/, body: WALK_IN_TRIPS },
      { match: /\/segments\//, body: WALK_IN_SEGMENTS },
    ],
    act: async (page) => {
      await page.locator('.trip-row').first().click();
      await expect(page.locator('app-walk-in-center-panel p-tabview')).toBeVisible({ timeout: 10_000 });
      await page.locator('.p-tabview-nav').getByText('Trip Details').click();
      await expect(page.locator('app-trip-details-edit-form')).toBeVisible({ timeout: 10_000 });
    },
  },
  {
    // `app-sell-page`'s own two calendars are in the schedule modal, which the
    // trip browser's Add button opens. It needs no fixture at all: the modal
    // body is `*ngIf="scheduleStore.hasValue"`, and that store resolves on six
    // empty lists exactly as it already does on /staff/schedules.
    key: 'staff-sell-schedule-modal',
    url: '/staff/sell',
    landsOn: /\/staff\/sell$/,
    requires: 'app-sell-page',
    act: async (page) => {
      await page.locator('app-walk-in-trip-browser button.btn-outline-primary').first().click();
      await expect(page.locator('app-sell-page .modal.d-block .modal-body form')).toBeVisible({ timeout: 15_000 });
    },
  },
  {
    // `app-boarding-list`'s two calendars are in the delay dialog, and its pill
    // is `*ngIf="canDelaySchedule && tripHeader.statusCode === 'scheduled'"`.
    // The role half already holds -- `admin` grants `salesperson` through
    // AuthService.ROLE_GRANTS -- so the status is the only missing half, and it
    // comes from a supplementary GET the generic mock answers with null.
    key: 'staff-boarding-list-delay',
    url: '/staff/boarding/42',
    landsOn: /\/staff\/boarding\/42$/,
    requires: 'app-boarding-list-page table',
    fixture: [{ match: /\/schedules\/42$/, body: BOARDING_SCHEDULE }],
    act: async (page) => {
      await page
        .locator('app-boarding-list button.admin-btn')
        .filter({ has: page.locator('span.material-symbols-outlined', { hasText: /^update$/ }) })
        .first()
        .click();
      await expect(page.locator('app-boarding-list .schedule-delay-modal')).toBeVisible({ timeout: 10_000 });
    },
  },
  {
    // `app-vehicle-maintenance-panel` renders under `activeTab === maintenance
    // && focusedVehicle`, and its calendars are one further click inside the
    // panel's own Add modal. Three states, so three assertions -- a click that
    // silently did nothing would otherwise be reported as a clean screen.
    key: 'admin-vehicles-maintenance',
    url: '/admin/vehicles',
    landsOn: /\/admin\/vehicles$/,
    requires: 'app-vehicles-page',
    fixture: [
      { match: /\/vehicles$/, body: ONE_VEHICLE },
      { match: /\/vehicles\/\d+\/maintenance$/, body: ok([]) },
    ],
    act: async (page) => {
      await page
        .locator('app-vehicle-list-table button.admin-icon-btn')
        .filter({ has: page.locator('span.material-symbols-outlined', { hasText: /^build$/ }) })
        .first()
        .click();
      await expect(page.locator('app-vehicle-maintenance-panel')).toBeVisible({ timeout: 10_000 });
      await page.locator('app-vehicle-maintenance-panel button.admin-btn-primary').first().click();
      await expect(page.locator('app-vehicle-maintenance-panel .admin-modal')).toBeVisible({ timeout: 10_000 });
    },
  },
];

/**
 * OBRS-782. Customer screens that need a click, swept after `CUSTOMER_SWEEP`
 * with the same session and the same fixtures.
 *
 * Deliberately NOT added to `CUSTOMER_PAGES`: that list is shared with
 * `customer-contrast-gate.spec.ts` and `dark-override-effective.spec.ts`, which
 * sweep it for colour rather than for boxes, and an entry that only exists to
 * open a dialog would cost both of them a page and answer neither's question.
 */
export const CUSTOMER_EXTRA_SWEEP: SweepPage[] = [
  {
    // `app-reschedule-date-picker-step` is step one of the reschedule dialog,
    // which the booking card's overflow menu opens. No fixture: booking 501 in
    // `customer-pages.ts` is already `confirmed`, one-way, never rescheduled
    // and departs in 2030 -- every clause of `computeRescheduleEligibility`.
    key: 'my-bookings-reschedule',
    url: '/my-bookings',
    landsOn: /\/my-bookings$/,
    requires: 'app-my-bookings',
    act: async (page) => {
      await page.locator('button.actions-menu-btn').first().click();
      await page.locator('.my-bookings-action-menu').getByText('Reschedule').click();
      await expect(page.locator('app-reschedule-date-picker-step p-calendar')).toBeVisible({ timeout: 10_000 });
    },
  },
];

/**
 * Feature flags whose OFF state is the reason a component is on the gate spec's
 * `NOT_SWEPT` list, read from `environment.base.ts` at run time.
 *
 * `/parcel-booking` is `canActivate: [AuthGuard, featureEnabledGuard(...)]` and
 * the flag is `false` in the base environment every build inherits, so the page
 * bounces to `/` and `app-parcel-trip-form` mounts nowhere -- the sweep's own
 * landing assertion is what caught it. Excluding it is honest ONLY while the
 * flag stays off, so the gate reads the flag rather than taking the exclusion on
 * trust: turn `onlineParcelBooking` on and the sweep goes red asking to be
 * widened, which is the moment the question actually needs answering.
 */
export function featureFlags(): Record<string, boolean> {
  const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'environments', 'environment.base.ts'), 'utf8');
  const block = /features:\s*\{([^}]*)\}/.exec(src)?.[1];
  if (!block) throw new Error('OBRS-776: no `features` block in environment.base.ts');
  const flags: Record<string, boolean> = {};
  for (const m of block.matchAll(/(\w+)\s*:\s*(true|false)/g)) flags[m[1]] = m[2] === 'true';
  return flags;
}

// --- who renders the PrimeNG hosts (OBRS-776) --------------------------------

/**
 * The four library hosts OBRS-775 measured as `display: inline` around block
 * children and could not fix from a component stylesheet.
 */
export const PRIMENG_TARGETS = ['p-tabview', 'p-tabpanel', 'p-card', 'p-calendar'] as const;

export interface PrimengHostUser {
  /** Our component's selector, e.g. `app-expenses-page`. */
  selector: string;
  /** Repo-relative path of the template that renders it. */
  file: string;
  /** Which of PRIMENG_TARGETS it renders. */
  uses: string[];
  /**
   * One entry per PrimeNG tag written in this template: the tag, plus only the
   * `styleClass` values that some stylesheet uses in a rule that sets `display`.
   *
   * WHY THE FILTER AND NOT THE RAW styleClass. What decides whether one of these
   * hosts is malformed -- and therefore what blockifying it does -- is whether
   * PrimeNG's inner container is block-level. `styleClass` lands on that
   * container, so a class matters here IF AND ONLY IF something sets `display`
   * through it. `.p-calendar.app-date-field` is `display: flex; width: 100%` in
   * styles.scss and is exactly what blockifies the span, so `app-date-field` is
   * a real variant. `schedule-calendar-filter` matches no rule anywhere in the
   * tree, and `center-tabview` is styled through `::ng-deep` for backgrounds,
   * padding and flex-wrap but never `display` -- keeping either in the key would
   * demand a screen for a distinction that does not exist, and a check that
   * fails on a correct tree is a check that gets deleted.
   */
  variants: string[];
}

/**
 * Every component of OURS whose template renders one of `PRIMENG_TARGETS`, read
 * off the source tree at run time.
 *
 * WHY THIS IS NOT A HAND-WRITTEN LIST. The fix for these hosts is a global rule,
 * and a global rule lands on every instance in the app at once -- including the
 * ones on pages nobody swept. OBRS-775 refused to ship it for exactly that
 * reason and carded the widening instead. A widening whose completeness is a
 * sentence in a card is worth nothing a year from now: the twenty-sixth
 * component to render a `p-calendar` will be added by someone who never read it.
 * Deriving the population from the tree means the sweep either covers it or the
 * gate goes red, and the day PrimeNG's own tags change this list empties and
 * `no stale ALLOW entries` says so.
 *
 * Scanning source with a regex is normally the wrong tool for a CSS question --
 * OBRS-775's header argues that at length. It is the right tool for THIS
 * question, which is not "is this host malformed" (only a browser knows) but
 * "which files mention this tag", and a file that mentions it is exactly the
 * population a global rule can reach.
 */
/**
 * Does any stylesheet in the tree set `display` in a rule that mentions `.name`?
 *
 * Deliberately crude, and crude in the safe direction: it takes the text from
 * each mention of the class to the next `}` and asks whether `display` appears
 * in it. Nested SCSS means that can over-report -- a child rule inside the same
 * block counts -- and over-reporting only ever demands an extra screen, while
 * under-reporting would excuse one that mattered.
 */
function setsDisplayThrough(className: string, sheets: string[]): boolean {
  const needle = '.' + className;
  for (const sheet of sheets) {
    let at = sheet.indexOf(needle);
    while (at !== -1) {
      const end = sheet.indexOf('}', at);
      if (/display\s*:/.test(sheet.slice(at, end === -1 ? undefined : end))) return true;
      at = sheet.indexOf(needle, at + needle.length);
    }
  }
  return false;
}

export function primengHostUsers(): PrimengHostUser[] {
  const srcRoot = path.resolve(__dirname, '..', '..', 'src');

  const files: string[] = [];
  const styleSheets: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (p.endsWith('.scss')) styleSheets.push(fs.readFileSync(p, 'utf8'));
      else if (p.endsWith('.html') || (p.endsWith('.ts') && !p.endsWith('.spec.ts'))) files.push(p);
    }
  };
  walk(srcRoot);

  // Which component owns which template. An inline `template:` lives in the .ts
  // itself, so both cases resolve through the same map.
  const selectorOf = new Map<string, string>();
  for (const ts of files.filter((f) => f.endsWith('.ts'))) {
    const src = fs.readFileSync(ts, 'utf8');
    const selector = /selector:\s*['"]([^'"]+)['"]/.exec(src)?.[1];
    if (!selector) continue;
    selectorOf.set(ts, selector);
    const templateUrl = /templateUrl:\s*['"]\.\/([^'"]+)['"]/.exec(src)?.[1];
    if (templateUrl) selectorOf.set(path.join(path.dirname(ts), templateUrl), selector);
  }

  // `\b` rather than a bare `includes`, so a hypothetical `<p-cardboard>` is not
  // counted as a `p-card`. The two passes below must agree about what a tag is,
  // or a file lands in the census with no variant to compare.
  const tagsOf = (src: string, target: string) => src.match(new RegExp('<' + target + '\\b[^>]*>', 'g')) ?? [];

  const users: PrimengHostUser[] = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8').toLowerCase();
    const uses = PRIMENG_TARGETS.filter((t) => tagsOf(src, t).length > 0);
    if (!uses.length) continue;
    const selector = selectorOf.get(file);
    // A template no component claims cannot be reached by any page, and silently
    // dropping it would be the one hole this whole function exists to close.
    if (!selector) throw new Error(`OBRS-776: ${file} renders ${uses.join(',')} but no component claims it`);

    const variants = new Set<string>();
    for (const target of PRIMENG_TARGETS) {
      for (const tag of tagsOf(src, target)) {
        // The leading boundary matters: `inputStyleClass` ends in `styleclass`
        // once the source is lower-cased, and folding it in here would split one
        // variant into several that differ by something on PrimeNG's INPUT
        // rather than on the host box this card is about.
        const styleClass = [...tag.matchAll(/(?:^|\s)styleclass="([^"]*)"/g)]
          .flatMap((m) => m[1].trim().split(/\s+/))
          .filter((c) => c && setsDisplayThrough(c, styleSheets))
          .sort();
        variants.add(`${target} styleClass=[${styleClass.join(' ') || '-'}]`);
      }
    }

    users.push({
      selector,
      file: path.relative(srcRoot, file).replace(/\\/g, '/'),
      uses: [...uses],
      variants: [...variants].sort(),
    });
  }
  return users.sort((a, b) => a.selector.localeCompare(b.selector));
}

/**
 * Which of OUR components were seen actually RENDERING a PrimeNG target, keyed
 * by our component's tag, with the target tags it rendered.
 *
 * WHY NOT "was the component on the page". That was the first version of this
 * and it was wrong in the direction that matters. `app-expense-form-modal` is
 * written unconditionally into `expenses-page.component.html`, so its host
 * element is always in the DOM -- but its template root is
 * `<div *ngIf="isOpen">`, so the `p-calendar` inside it renders only once
 * somebody opens the modal. Counting the component as covered because its host
 * existed would have reported a `p-calendar` variant as measured when no
 * `p-calendar` had rendered at all, which is the precise failure this whole
 * card is about, reproduced inside the check meant to prevent it.
 *
 * Attribution is to the NEAREST `app-*` ancestor, which is the component whose
 * template wrote the tag -- the same thing `primengHostUsers()` reads
 * statically, so the two are comparable. The exception is a PrimeNG element
 * projected through `<ng-content>`, which would be attributed to the component
 * it lands in rather than the one that wrote it; nothing in this tree does that
 * today, and if it starts the coverage check reds rather than passing quietly.
 */
export async function scanPrimengCoverage(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate((targets) => {
    const out: Record<string, string[]> = {};
    for (const el of Array.from(document.querySelectorAll(targets.join(',')))) {
      let owner: Element | null = el.parentElement;
      while (owner && !owner.tagName.toLowerCase().startsWith('app-')) owner = owner.parentElement;
      if (!owner) continue;
      const key = owner.tagName.toLowerCase();
      const tag = el.tagName.toLowerCase();
      (out[key] ??= []).includes(tag) || out[key].push(tag);
    }
    return out;
  }, [...PRIMENG_TARGETS]);
}

// --- reaching them -----------------------------------------------------------

const emptyPage = () => ({ content: [], totalElements: 0, totalPages: 0, size: 100, number: 0 });

/**
 * A deliberately dumb backend for the public and admin groups: arrays where a
 * list is expected, an empty page where a page is expected, `null` otherwise.
 *
 * It does NOT try to be `route-smoke`'s mock plus extras. This card measures
 * BOXES, and an empty table has exactly the same host tree as a full one; richer
 * fixtures would buy nothing and would be a second copy of a shape that has to
 * stay in step with the server. The one thing that does matter -- that the page
 * rendered at all -- is asserted per page by `requires`, not inferred from the
 * fixture.
 */
export async function mockEmptyBackend(page: Page): Promise<void> {
  await page.route('**/api/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    // OBRS-782: the current page's own rows win over the generic answers. First
    // match, so a fixture can narrow one path without restating the rest.
    for (const rule of activeFixture) {
      if (rule.match.test(pathname)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(rule.body),
        });
      }
    }
    let body: unknown = ok(null);
    if (/\/external\/otp\/request/.test(pathname)) body = ok({ token: 'OTP-HOST-BOX-SWEEP' });
    else if (/(bookings|usability-reports|notifications)$/.test(pathname)) body = ok(emptyPage());
    else if (/\/private\/notifications\/unread-count$/.test(pathname)) body = ok({ unreadCount: 0 });
    else if (/\/private\/users\/me$/.test(pathname)) body = ok({ salesPointStop: null });
    else if (/\/payments$/.test(pathname)) body = ok({ paymentSummary: { status: 'pending' }, transactions: [] });
    else if (/(lookups|roles|users|routes|stops|stations|vehicles|vehicle-types|schedule-set|schedules)$/.test(pathname))
      body = ok([]);
    else if (/\/boarding-list$/.test(pathname)) body = ok([]);
    else if (/\/route-stops\//.test(pathname)) body = ok({ stops: [] });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
}

/** No session at all -- the logged-out shell is a different navbar, and worth measuring. */
export async function seedAnonymousSession(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('app_language', 'en'));
  await mockEmptyBackend(page);
}

export async function seedStaffSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
    localStorage.setItem('auth_token', 'obrs-775-host-box-sweep-token');
    localStorage.setItem('auth_username', 'admin@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['admin']));
    localStorage.setItem('active_booking_id', '123');
  });
  await mockEmptyBackend(page);
}

/**
 * Navigates to a page and blocks until it is the page it claims to be and has
 * stopped moving. Shared so the gate and the geometry capture cannot disagree
 * about when a page is ready -- a capture taken one frame earlier than the gate
 * would report differences that are timing, not layout.
 */
export async function visit(page: Page, p: SweepPage, seedFn?: (pg: Page) => Promise<void>): Promise<void> {
  // OBRS-782: set BEFORE the navigation, and unconditionally -- an entry with
  // no fixture has to CLEAR the previous one, or the empty-backend pages after
  // a fixtured one would quietly measure somebody else's rows.
  activeFixture = p.fixture ?? [];
  await page.goto(p.url);
  if (p.seed && seedFn) await seedFn(page);
  // The page must be ITSELF before anything is measured. Without this a redirect
  // to /login measures the login page's boxes, files them under this page's key,
  // and reports a clean result for a screen it never visited.
  await expect(page).toHaveURL(p.landsOn);
  await page.locator(p.requires).first().waitFor({ timeout: 15_000 });
  if (p.act) await p.act(page);
  await settle(page);
}

/**
 * A fresh context per group. `browser.newPage()` would share storage with the
 * others, and the customer group seeds `auth_roles: ['user']` while the admin
 * group seeds `['admin']` -- one leaking into the other is how a sweep measures
 * a screen the role it claims to hold could never open.
 */
export async function newSweepPage(browser: Browser, width = 1280, height = 720): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height } });
  return ctx.newPage();
}
