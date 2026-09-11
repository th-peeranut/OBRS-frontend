import { Page, expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  CUSTOMER_PAGES,
  seedCustomerSession,
  seedStore,
} from '../support/customer-pages';
import { seedAnalyticsConsent } from '../support/analytics-consent';

/**
 * OBRS-640 PHASE A -- the mobile tap-target + typography audit, and its baseline run.
 *
 * <p>THE TWO CLAIMS. AC-2: every real interactive element on the six routes below offers
 * a >=44x44 press area, proved by HIT-TESTING a 44x44 box centred on the element (the
 * corners and edge midpoints), not by reading its CSS box -- padding-based invisible
 * expansion is invisible to a stylesheet parser and provable only this way. AC-3: no
 * rendered text node is smaller than 12px (`$font-size-xs`, the same floor
 * obrs-639-stepper-geometry.spec.ts pins).
 *
 * <p>NOT A GATE. This is Phase A: measure, do not fix. It is deliberately absent from
 * `playwright.gate.config.ts`'s `testMatch` (the owner's call, docs/prod/LANE-BRIEFS.md
 * #obrs-640) and runs under its own `playwright.obrs640audit.config.ts`, CAPTURE lane in
 * `e2e/lanes.json`. Run on the unfixed tree it is EXPECTED to report violations -- that is
 * the baseline Phase B fixes against -- so most of these tests fail today, on purpose.
 * Every test still prints the full population/violation detail before asserting, so a red
 * run is exactly as informative as a green one.
 *
 * <p>POPULATION, ALWAYS NEXT TO THE VIOLATION COUNT (office lesson
 * `measure-the-population-before-widening-a-matcher`, OBRS-640's own AC). Every exclusion
 * (display:none, zero box, aria-hidden, disabled, hidden, opacity 0) is counted by reason
 * and printed -- never folded silently into either the numerator or the denominator.
 *
 * <p>SIX ROUTES, EIGHT SURFACES. `/`, `/schedule-booking`, `/passenger-info`, `/payment`,
 * `/account` are measured at rest. `/my-bookings` gets THREE surfaces: the list at rest,
 * the per-card overflow menu opened (`.my-bookings-action-menu`, appendTo="body" so it is
 * invisible on a bare load), and the e-ticket modal opened from that menu
 * (`.ticket-modal`) -- both interaction-gated surfaces the card named explicitly, each
 * scoped to its own overlay root so an element merely COVERED by the overlay (not
 * shrunk, not hidden) is never counted as a false tap-target violation.
 *
 * <p>HERMETIC. Every /api/** call is answered by `seedCustomerSession`'s in-browser
 * fixture map; `/account` and the ticket modal need one endpoint each that map does not
 * carry (`/users/me`, `/bookings/501/tickets`) -- registered here, AFTER
 * seedCustomerSession, so Playwright's last-registered-runs-first rule lets the more
 * specific route win without touching e2e/support/customer-pages.ts.
 *
 * <p>GOTCHAS THIS FILE WORKS AROUND (memory/FRONTEND-GOTCHAS.md):
 *   - the app's own loading swal races a bare `document.elementFromPoint` read straight
 *     after a mocked API answers -- waited out the same way customer-contrast-gate.spec.ts
 *     does (a fixed settle after goto/seed, and any `.swal2-container` still up is reported
 *     rather than measured through).
 *   - `browser.newContext()` drops `playwright.config.ts`'s viewport -- this uses the test's
 *     own `page` fixture and `test.use({ viewport })`, exactly obrs-639's pattern, never a
 *     fresh context.
 *   - viewport heights are REAL phone heights (see the WIDTHS comment below), and every tap
 *     candidate is `scrollIntoViewIfNeeded()`'d before it is hit-tested -- an earlier draft
 *     used one artificially tall viewport instead so nothing needed scrolling, and it
 *     manufactured a false violation on a `position: fixed` FAB. `documentHeight` is still
 *     reported per surface as a plain diagnostic.
 *   - a `border-radius:50%` icon button's hit area is a CIRCLE, and Chromium's own
 *     hit-testing excludes the corners of its bounding SQUARE -- probing those corners
 *     unconditionally manufactures a false violation on any round button under ~61px in
 *     diameter (confirmed live on /account's report-fab, 48x48). Detected via each corner's
 *     own computed radius and probed on a circle instead; see `isRound` in
 *     `probeTaggedTapElement`.
 *   - OBRS-1207's report-usability-fab "yields" (`pointer-events:none`) whenever it sits over
 *     another clickable element, and that state can flip mid-sweep -- scrolling one candidate
 *     into view can trigger the FAB's own scroll listener before this sweep's turn to probe
 *     it. Re-checked immediately before every probe, not trusted from the earlier collection
 *     pass, and excluded (counted, never silent) rather than judged either way.
 *
 * ASCII-only source.
 */

// Real phone heights, not an inflated canvas -- same pair obrs-639-stepper-geometry.spec.ts
// uses. An earlier draft used one artificially tall (4200px) viewport per width so every
// candidate rendered without a scroll, and it manufactured a false violation: a
// `position: fixed` FAB pins to the viewport BOTTOM, so inflating the viewport moved it far
// past where its actual ancestor stack still paints, and `elementFromPoint` hit bare `html`
// a few px away from a perfectly fine button. A real phone scrolls; so does this sweep --
// see `scrollIntoViewIfNeeded` in the tap loop below, which is what makes hit-testing sound
// at a realistic height. Text does not need it: font-size is a layout property, unaffected
// by whether the node is currently scrolled into view.
const WIDTHS = [
  { name: '390', width: 390, height: 664 },
  { name: '360', width: 360, height: 740 },
];

/** AC-2. */
const MIN_TAP_PX = 44;
/** AC-3, AC-4's sibling floor in obrs-639-stepper-geometry.spec.ts: `$font-size-xs`. */
const MIN_FONT_PX = 12;

const ASSETS = 'e2e-evidence/obrs-640';

/**
 * AC-6 self-test only. Shrinks a real element's rendered box (via an injected
 * stylesheet, never a src/ edit) so a run with this set can be diffed against the
 * baseline to prove the audit actually catches a regression and names it. Off by
 * default; never set in a committed run.
 */
const INDUCE = process.env['OBRS_640_INDUCE_REGRESSION'] === '1';

interface Violation {
  selector: string;
  text: string;
  detail: string;
}

interface SweepResult {
  populationTotal: number;
  measuredTotal: number;
  excluded: Record<string, number>;
  violations: Violation[];
}

interface Surface {
  key: string;
  /** One of the card's six routes, for grouping in the report. */
  route: string;
  /** CSS selector the sweep is scoped to. Omitted = the whole `document.body`. */
  scope?: string;
  prepare: (page: Page) => Promise<void>;
}

// --- fixtures the shared customer-pages.ts map does not carry --------------

/** GET /api/private/users/me -- MyAccountProfile (src/app/shared/interfaces/my-account.interface.ts).
 *  `pdpaConsentVersion` deliberately does not match the build's PRIVACY_POLICY_VERSION, so the
 *  re-consent notice (`.account-consent-notice`) also renders -- one more real, populated state
 *  for the same one fixture, rather than a second entry. */
async function seedAccountProfile(page: Page): Promise<void> {
  await page.route('**/api/private/users/me', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'OK',
        data: {
          id: 501,
          title: 'MR',
          firstName: 'Somchai',
          middleName: '',
          lastName: 'Jaidee',
          nickname: '',
          email: 'customer@system.local',
          phoneNumber: '0812345678',
          preferredLocale: 'en',
          pdpaConsentVersion: 'obrs-640-stale-version',
        },
      }),
    });
  });
}

/** GET /api/private/bookings/501/tickets -- BookingTicketsData
 *  (src/app/shared/interfaces/booking-ticket.interface.ts), the shape
 *  `mapBookingTicketsToCard` reads. Booking 501 is MY_BOOKINGS' first (paid) row, so the
 *  "View e-ticket" item is present in its overflow menu. Registered AFTER
 *  seedCustomerSession so this more specific route wins over the generic (and, for this
 *  endpoint, wrongly-shaped) `/\/bookings\/\d+\/tickets/` entry in customer-pages.ts --
 *  worth a note for whoever reads that file next, not a fix this card makes. */
async function seedTicketModalFixture(page: Page): Promise<void> {
  await page.route('**/api/private/bookings/501/tickets', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'OK',
        data: {
          bookingId: 501,
          bookingNumber: 'B-000501',
          bookingStatus: 'confirmed',
          totalTickets: 1,
          contactPhoneNumber: '0812345678',
          totalAmount: 360,
          journeys: [
            {
              legType: { code: 'outbound', label: 'Outbound' },
              routeLabel: 'Chonburi - Bangkok',
              fromStop: { code: 'nong_chak', label: 'Nong Chak' },
              toStop: { code: 'bkr_mochit2', label: 'Mo Chit 2 Terminal' },
              departureDateTime: '2030-06-17T08:00:00+07:00',
              arrivalDateTime: '2030-06-17T10:30:00+07:00',
              vehicle: { vehicleType: { code: 'minibus', label: 'Minibus' }, numberPlate: '1kk-1234' },
              seatingMode: 'ASSIGNED',
              tickets: [
                {
                  id: 1201,
                  ticketNumber: 'T-001201',
                  passengerType: { code: 'adult', label: 'Adult' },
                  passengerTitle: 'MR',
                  passengerName: 'Somchai Jaidee',
                  seatNumber: 'A1',
                  status: { code: 'confirmed', label: 'Confirmed' },
                  fareCategory: 'adult',
                },
              ],
            },
          ],
        },
      }),
    });
  });
}

/** AC-6 self-test only -- see INDUCE above. */
async function maybeInduceRegression(page: Page): Promise<void> {
  if (!INDUCE) return;
  // Targets confirmed PASSING at baseline on the "account" surface (measured
  // 2026-09-11): [data-testid="profile-edit"] is a 171.6x44 button (0 misses -- the
  // 44.0 epsilon fix is what lets it pass) and .account-page__header h1 is well above
  // 12px. Shrinking them here, after navigation (addStyleTag targets the CURRENT
  // document -- called before prepare()'s own goto it would be lost), is what proves
  // AC-6: the same run that reports these two clean at baseline must report them named
  // as violations with this env var set, then clean again with it unset.
  await page.addStyleTag({
    content: `
      [data-testid="profile-edit"] { min-height: 18px !important; height: 18px !important; min-width: 40px !important; padding: 0 6px !important; }
      .account-page__header h1 { font-size: 8px !important; }
    `,
  });
}

const settle = (page: Page) => page.waitForTimeout(2500);

// --- the eight surfaces -----------------------------------------------------

const SURFACES: Surface[] = [
  {
    key: 'home',
    route: '/',
    prepare: async (page) => {
      const entry = CUSTOMER_PAGES.find((p) => p.key === 'home');
      if (!entry) throw new Error('customer-pages.ts: "home" entry not found');
      await page.goto(entry.url, { waitUntil: 'domcontentloaded' });
      await settle(page);
    },
  },
  {
    key: 'schedule-booking',
    route: '/schedule-booking',
    prepare: async (page) => {
      const entry = CUSTOMER_PAGES.find((p) => p.key === 'schedule-booking');
      if (!entry) throw new Error('customer-pages.ts: "schedule-booking" entry not found');
      await page.goto(entry.url, { waitUntil: 'domcontentloaded' });
      await settle(page);
      await seedStore(page, entry.storeOverride?.());
      await page.waitForTimeout(1200);
    },
  },
  {
    key: 'passenger-info',
    route: '/passenger-info',
    prepare: async (page) => {
      const entry = CUSTOMER_PAGES.find((p) => p.key === 'passenger-info');
      if (!entry) throw new Error('customer-pages.ts: "passenger-info" entry not found');
      await page.goto(entry.url, { waitUntil: 'domcontentloaded' });
      await settle(page);
      await seedStore(page, entry.storeOverride?.());
      await page.waitForTimeout(1200);
    },
  },
  {
    key: 'payment',
    route: '/payment',
    prepare: async (page) => {
      const entry = CUSTOMER_PAGES.find((p) => p.key === 'payment');
      if (!entry) throw new Error('customer-pages.ts: "payment" entry not found');
      await page.goto(entry.url, { waitUntil: 'domcontentloaded' });
      await settle(page);
      await seedStore(page, entry.storeOverride?.());
      await page.waitForTimeout(1200);
    },
  },
  {
    key: 'my-bookings',
    route: '/my-bookings',
    prepare: async (page) => {
      const entry = CUSTOMER_PAGES.find((p) => p.key === 'my-bookings');
      if (!entry) throw new Error('customer-pages.ts: "my-bookings" entry not found');
      await page.goto(entry.url, { waitUntil: 'domcontentloaded' });
      await settle(page);
    },
  },
  {
    // Invisible on a bare load -- the card measured its rows at 29px. appendTo="body",
    // so it is scoped rather than swept with the whole page (the page behind it is
    // merely COVERED, not shrunk or hidden, and covering is not this card's claim).
    key: 'my-bookings-action-menu',
    route: '/my-bookings',
    scope: '.my-bookings-action-menu',
    prepare: async (page) => {
      const entry = CUSTOMER_PAGES.find((p) => p.key === 'my-bookings');
      if (!entry) throw new Error('customer-pages.ts: "my-bookings" entry not found');
      await page.goto(entry.url, { waitUntil: 'domcontentloaded' });
      await settle(page);
      await page.locator('.actions-menu-btn').first().click();
      await page.locator('.my-bookings-action-menu').first().waitFor({ state: 'visible' });
    },
  },
  {
    // Invisible on a bare load -- the card measured 18 text nodes at 11px. Reached via
    // the same overflow menu's "View e-ticket" row (booking 501 is paid, per
    // my-bookings.component.ts#L245); scoped to `.ticket-modal` so the page behind the
    // backdrop is not counted.
    key: 'my-bookings-ticket-modal',
    route: '/my-bookings',
    scope: '.ticket-modal',
    prepare: async (page) => {
      const entry = CUSTOMER_PAGES.find((p) => p.key === 'my-bookings');
      if (!entry) throw new Error('customer-pages.ts: "my-bookings" entry not found');
      await seedTicketModalFixture(page);
      await page.goto(entry.url, { waitUntil: 'domcontentloaded' });
      await settle(page);
      await page.locator('.actions-menu-btn').first().click();
      await page.locator('.my-bookings-action-menu').first().waitFor({ state: 'visible' });
      await page.locator('.my-bookings-action-menu .bi-ticket-perforated').first().click();
      await page.locator('app-e-ticket-card').first().waitFor({ state: 'visible' });
    },
  },
  {
    key: 'account',
    route: '/account',
    prepare: async (page) => {
      await seedAccountProfile(page);
      await page.goto('/account', { waitUntil: 'domcontentloaded' });
      await settle(page);
    },
  },
];

// Every function below is serialized by `page.evaluate` and runs inside the browser, so
// nothing outside its own body (no outer closure, no shared module-level helper) is
// reachable there -- `pathOf` is therefore restated inline in each one rather than
// imported or hoisted, matching e2e/support/customer-contrast.ts's own convention for
// the same constraint.
const TAP_SELECTOR = [
  'a[href]',
  'button',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Phase 1 of the tap sweep (AC-2). Finds every candidate under `scope`, excludes the
 * not-really-there ones (counted, never silent), and TAGS each measured survivor with
 * `data-obrs640-tap="<idx>"` so `probeTaggedTapElement` below can re-find it after this
 * function returns and the caller has scrolled it into view. Hit-testing happens in a
 * SEPARATE pass, not here, because `elementFromPoint` only ever sees the current
 * viewport -- doing it in this same pass over the whole page would demand either an
 * unrealistically tall viewport (tried, and it broke a `position: fixed` FAB -- see the
 * WIDTHS comment above) or measuring elements the phone has not scrolled to yet.
 */
function collectTapCandidates(args: { scope: string | null; selector: string }): {
  populationTotal: number;
  excluded: Record<string, number>;
  measuredCount: number;
} | null {
  const root: Element | null = args.scope ? document.querySelector(args.scope) : document.body;
  if (!root) return null;

  document.querySelectorAll('[data-obrs640-tap]').forEach((el) => el.removeAttribute('data-obrs640-tap'));

  const isDisabled = (el: Element): boolean =>
    !!el.closest('[disabled], [aria-disabled="true"], .is-disabled, .disabled, fieldset:disabled');
  const isAriaHidden = (el: Element): boolean => !!el.closest('[aria-hidden="true"]');

  const candidates = Array.from(root.querySelectorAll(args.selector));
  if (root.matches(args.selector)) candidates.unshift(root);

  const excluded: Record<string, number> = {
    displayNone: 0,
    visibilityHidden: 0,
    opacityZero: 0,
    zeroBox: 0,
    ariaHidden: 0,
    disabled: 0,
    pointerEventsNone: 0,
  };
  let measuredCount = 0;
  for (const el of candidates) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') {
      excluded['displayNone']++;
      continue;
    }
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse') {
      excluded['visibilityHidden']++;
      continue;
    }
    if (Number(cs.opacity) === 0) {
      excluded['opacityZero']++;
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      excluded['zeroBox']++;
      continue;
    }
    if (isAriaHidden(el)) {
      excluded['ariaHidden']++;
      continue;
    }
    if (isDisabled(el)) {
      excluded['disabled']++;
      continue;
    }
    // OBRS-1207's report-usability-fab "yields" (pointer-events:none) whenever it sits
    // over another clickable element -- by design, a real tap there is meant to fall
    // through to what is underneath, so it is not this element's tap target to fail.
    // Without this a hit-test finds exactly the pass-through the component intends and
    // reports it as if the FAB itself were unreachable.
    if (cs.pointerEvents === 'none') {
      excluded['pointerEventsNone']++;
      continue;
    }
    el.setAttribute('data-obrs640-tap', String(measuredCount));
    measuredCount++;
  }

  return { populationTotal: candidates.length, excluded, measuredCount };
}

interface ProbeOutcome {
  violation: Violation | null;
  /** Set when the element's OWN state changed between phase 1 and this probe -- e.g.
   *  OBRS-1207's report-fab, whose `pointer-events:none` "yield" is toggled by a scroll
   *  listener, so scrolling a LATER candidate into view can flip an EARLIER one's state
   *  before it is this function's turn. Re-checked here rather than trusted from phase 1
   *  so the sweep never judges an element against a state it was not actually in when
   *  probed. Counted under the same exclusion reasons as phase 1, never silently. */
  excludedReason: string | null;
  /** OBRS-640 round 2 (AC-2 label credit). True only when `el` missed its OWN hit-test
   *  but an associated `<label for="...">` -- the association read from the DOM, never
   *  assumed from proximity -- was ITSELF hit-tested to >=minTapPx square and credited
   *  instead. Always false on a `violation: null` outcome that passed on its own box.
   *  The caller counts and prints this separately (`satisfiedViaLabel=N`) so it can
   *  never become a silent blanket exemption. */
  satisfiedViaLabel: boolean;
  /** Count of probe corners `hitTestBox` skipped as off-screen at the viewport's own
   *  edge (`VIEWPORT_EDGE_EPS`). Reporting-only (AC-5): does not change which elements
   *  are skipped, just makes a previously-silent skip counted and printed like every
   *  other exclusion reason, so an element that drifts onto this edge later shows up
   *  in the count instead of vanishing from it. */
  viewportEdgeSkips: number;
}

/**
 * Phase 2 of the tap sweep. Called once per tagged element, AFTER the caller has
 * `scrollIntoViewIfNeeded()`'d it, so `getBoundingClientRect` and `elementFromPoint` agree
 * about where it actually is on the CURRENT screen -- the real thing a finger meets.
 */
function probeTaggedTapElement(args: { idx: number; minTapPx: number }): ProbeOutcome | null {
  const el = document.querySelector(`[data-obrs640-tap="${args.idx}"]`);
  if (!el) return null;

  const cs0 = getComputedStyle(el);
  if (cs0.display === 'none') {
    return { violation: null, excludedReason: 'displayNone', satisfiedViaLabel: false, viewportEdgeSkips: 0 };
  }
  if (cs0.visibility === 'hidden' || cs0.visibility === 'collapse') {
    return { violation: null, excludedReason: 'visibilityHidden', satisfiedViaLabel: false, viewportEdgeSkips: 0 };
  }
  if (Number(cs0.opacity) === 0) {
    return { violation: null, excludedReason: 'opacityZero', satisfiedViaLabel: false, viewportEdgeSkips: 0 };
  }
  if (cs0.pointerEvents === 'none') {
    return { violation: null, excludedReason: 'pointerEventsNone', satisfiedViaLabel: false, viewportEdgeSkips: 0 };
  }

  const pathOf = (n0: Element): string => {
    const parts: string[] = [];
    let n: Element | null = n0;
    for (let i = 0; n && n !== document.body && i < 5; n = n.parentElement, i++) {
      let s = n.tagName.toLowerCase();
      const cls = (n.getAttribute('class') || '')
        .split(/\s+/)
        .filter((c) => c && !/^ng-|^_ng|^cdk-|^p-element$/.test(c))
        .slice(0, 3);
      if (cls.length) s += '.' + cls.join('.');
      parts.push(s);
    }
    return parts.join(' > ');
  };
  const snippet = (n: Element): string =>
    (n.textContent || n.getAttribute('aria-label') || n.getAttribute('placeholder') || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40);

  // OBRS-640 round 2, confirmed live: a box whose true (sub-pixel) edge lands within
  // ~1px of the viewport's far boundary -- observed as low as 0.1875px past
  // `window.innerHeight` on the footer's "Refund Policy" link once the sweep's own
  // scrollIntoViewIfNeeded chain happened to rest it flush against the bottom edge --
  // makes `elementFromPoint` return null there even though a REAL click at that exact
  // pixel does activate the element (dispatched via page.mouse and verified to
  // navigate). `elementFromPoint` is stricter at its own boundary than the browser's
  // real input hit-test; probing right up against it manufactures a violation a finger
  // would never hit. A 1px margin (5x the largest overflow measured) folds this into
  // the SAME "off the physical screen" case inside `hitTestBox` below, rather than a
  // second rule.
  const VIEWPORT_EDGE_EPS = 1;

  /**
   * Hit-tests ONE box -- the tap candidate's own, or (OBRS-640 round 2, AC-2 label
   * credit) an associated `<label>`'s -- against `args.minTapPx`. Extracted so a label
   * is held to the exact same probe geometry and roundness handling a plain tap target
   * answers to, never a softer one.
   */
  const hitTestBox = (
    target: Element
  ): { probed: number; misses: string[]; rect: DOMRect; edgeSkips: number } => {
    // 0.5px inset from the theoretical box edge: `getBoundingClientRect`'s bottom/right
    // are EXCLUSIVE at the sub-pixel level, so probing an element sized exactly
    // minTapPx (44.0, measured live on /account's "Edit personal details" et al.) at
    // the literal edge missed 3/8 corners on a button that already meets the floor -- a
    // false violation manufactured by the probe, not a real one. Anything genuinely
    // smaller still misses: a 40px button's edge is 2px inboard of a 21.5px-inset
    // probe, well past this margin.
    const half = args.minTapPx / 2 - 0.5;
    const rect = target.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    // A `border-radius:50%` icon button (the report-usability-fab on mobile, 48x48)
    // does not just LOOK round -- Chromium's own hit-testing excludes the corners a
    // bounding-box probe would still ask about, which is correct engine behaviour, not
    // a defect: a 48px circle already clears the 44px floor and a real finger meets it
    // exactly where the probe below checks. Squaring the corners on a shape whose
    // actual reachable area is a circle inscribed in that square is a guaranteed false
    // miss for anything under ~61px in diameter (corner distance (half)*sqrt(2) > a
    // radius below that) -- confirmed live on /account's FAB via `elementsFromPoint`,
    // which returned the button dead-center and at every edge midpoint, but the plain
    // div behind it at all four corners. Detected by reading the box's own corner radii
    // rather than assuming from a class name: "round" only when EVERY corner covers at
    // least half the box's shorter side, so a merely pill-shaped wide button (rounded
    // ends, flat middle) is unaffected -- its own centre sits on the flat part either
    // way.
    const minDim = Math.min(rect.width, rect.height);
    // `getComputedStyle` does NOT resolve a percentage border-radius to px (percentages
    // stay percentages in the computed value, since the used value depends on which
    // axis of the box is asked) -- confirmed live: `border-radius: 50%` on the FAB's
    // 48x48 box reads back as "50%", not "24px", so a px-only regex silently measured
    // every round corner as 0 and never once triggered this branch. Resolved against
    // `minDim` here, which is exact for a circle (width===height) and merely
    // approximate for a rounded ellipse -- fine for a heuristic that only decides which
    // of two already-correct probe shapes to use.
    const cornerRadiusPx = (v: string): number => {
      const m = /^([\d.]+)(px|%)/.exec(v);
      if (!m) return 0;
      const n = parseFloat(m[1]);
      return m[2] === '%' ? (n / 100) * minDim : n;
    };
    const csT = getComputedStyle(target);
    const isRound =
      minDim > 0 &&
      Math.min(
        cornerRadiusPx(csT.borderTopLeftRadius),
        cornerRadiusPx(csT.borderTopRightRadius),
        cornerRadiusPx(csT.borderBottomRightRadius),
        cornerRadiusPx(csT.borderBottomLeftRadius)
      ) >=
        minDim / 2 - 1;

    const probes: [number, number][] = isRound
      ? [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return [cx + half * Math.cos(rad), cy + half * Math.sin(rad)] as [number, number];
        })
      : [
          [cx - half, cy - half],
          [cx + half, cy - half],
          [cx - half, cy + half],
          [cx + half, cy + half],
          [cx, cy - half],
          [cx, cy + half],
          [cx - half, cy],
          [cx + half, cy],
        ];

    const misses: string[] = [];
    let probed = 0;
    let edgeSkips = 0;
    for (const [x, y] of probes) {
      // Off the CURRENT viewport is off the physical screen, not a defect the box owns
      // -- elementFromPoint answers null there regardless of the element's own size.
      if (
        x < 0 ||
        y < 0 ||
        x >= window.innerWidth - VIEWPORT_EDGE_EPS ||
        y >= window.innerHeight - VIEWPORT_EDGE_EPS
      ) {
        edgeSkips++;
        continue;
      }
      probed++;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(hit === target || target.contains(hit))) {
        misses.push(`(${Math.round(x)},${Math.round(y)})->${hit ? pathOf(hit) : 'nothing'}`);
      }
    }
    return { probed, misses, rect, edgeSkips };
  };

  const primary = hitTestBox(el);
  if (primary.probed > 0 && primary.misses.length === 0) {
    return {
      violation: null,
      excludedReason: null,
      satisfiedViaLabel: false,
      viewportEdgeSkips: primary.edgeSkips,
    };
  }

  // OBRS-640 round 2 (AC-2: "a real radio's tap area is the input plus its associated
  // label -- tapping the label actuates the control"). Restricted to <input>, the one
  // HTML relationship where clicking a DIFFERENT element is guaranteed to activate this
  // one. The association is read from the DOM (`for`/`id`, the markup this card
  // requires at every site it touches), never assumed from proximity or class name, and
  // the label is hit-tested by the exact same `hitTestBox` any other tap candidate
  // answers to -- a label under 44x44 still fails, same as any other candidate; nothing
  // here is inferred from CSS.
  let label: Element | null = null;
  if (el.tagName === 'INPUT') {
    const id = el.getAttribute('id');
    if (id) {
      label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    }
  }
  let labelEdgeSkips = 0;
  if (label) {
    const viaLabel = hitTestBox(label);
    labelEdgeSkips = viaLabel.edgeSkips;
    if (viaLabel.probed > 0 && viaLabel.misses.length === 0) {
      return {
        violation: null,
        excludedReason: null,
        satisfiedViaLabel: true,
        viewportEdgeSkips: primary.edgeSkips + labelEdgeSkips,
      };
    }
  }

  if (primary.probed === 0) {
    return {
      violation: {
        selector: pathOf(el),
        text: snippet(el),
        detail: `unprobeable: entire ${args.minTapPx}x${args.minTapPx} box fell outside the viewport even after scrollIntoViewIfNeeded`,
      },
      excludedReason: null,
      satisfiedViaLabel: false,
      viewportEdgeSkips: primary.edgeSkips + labelEdgeSkips,
    };
  }
  return {
    violation: {
      selector: pathOf(el),
      text: snippet(el),
      detail:
        `box ${primary.rect.width.toFixed(1)}x${primary.rect.height.toFixed(1)} at ` +
        `(${primary.rect.left.toFixed(0)},${primary.rect.top.toFixed(0)}); ${primary.misses.length}/${primary.probed} probes missed: ` +
        primary.misses.join(', '),
    },
    excludedReason: null,
    satisfiedViaLabel: false,
    viewportEdgeSkips: primary.edgeSkips + labelEdgeSkips,
  };
}

/** The text-size sweep (AC-3), one full pass over `scope`. No scrolling needed: font-size
 *  is a layout property, unaffected by whether the node happens to be currently visible
 *  through the viewport's scroll offset. */
function auditText(args: { scope: string | null; minFontPx: number }): SweepResult | null {
  const root: Element | null = args.scope ? document.querySelector(args.scope) : document.body;
  if (!root) return null;

  const pathOf = (n0: Element): string => {
    const parts: string[] = [];
    let n: Element | null = n0;
    for (let i = 0; n && n !== document.body && i < 5; n = n.parentElement, i++) {
      let s = n.tagName.toLowerCase();
      const cls = (n.getAttribute('class') || '')
        .split(/\s+/)
        .filter((c) => c && !/^ng-|^_ng|^cdk-|^p-element$/.test(c))
        .slice(0, 3);
      if (cls.length) s += '.' + cls.join('.');
      parts.push(s);
    }
    return parts.join(' > ');
  };
  const isAriaHidden = (el: Element): boolean => !!el.closest('[aria-hidden="true"]');

  const excluded: Record<string, number> = {
    displayNone: 0,
    visibilityHidden: 0,
    opacityZero: 0,
    zeroBox: 0,
    ariaHidden: 0,
  };
  const violations: Violation[] = [];
  let populationTotal = 0;
  let measuredTotal = 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const raw = node.textContent || '';
    if (raw.trim().length === 0) {
      node = walker.nextNode();
      continue;
    }
    populationTotal++;
    const el = node.parentElement;
    if (!el) {
      node = walker.nextNode();
      continue;
    }
    const cs = getComputedStyle(el);
    if (cs.display === 'none') {
      excluded['displayNone']++;
      node = walker.nextNode();
      continue;
    }
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse') {
      excluded['visibilityHidden']++;
      node = walker.nextNode();
      continue;
    }
    if (Number(cs.opacity) === 0) {
      excluded['opacityZero']++;
      node = walker.nextNode();
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      excluded['zeroBox']++;
      node = walker.nextNode();
      continue;
    }
    if (isAriaHidden(el)) {
      excluded['ariaHidden']++;
      node = walker.nextNode();
      continue;
    }

    measuredTotal++;
    const size = parseFloat(cs.fontSize);
    if (size < args.minFontPx) {
      violations.push({
        selector: pathOf(el),
        text: raw.trim().replace(/\s+/g, ' ').slice(0, 40),
        detail: `${size.toFixed(2)}px`,
      });
    }
    node = walker.nextNode();
  }

  return { populationTotal, measuredTotal, excluded, violations };
}

/** Reported alongside every surface for the same reason `documentHeight` mattered in the
 *  earlier, since-abandoned tall-viewport draft: a page taller than the viewport is normal
 *  now (the sweep scrolls), but it is still worth seeing in the log, not inferring. */
function readDims(): { documentHeight: number; viewportHeight: number } {
  return { documentHeight: document.documentElement.scrollHeight, viewportHeight: window.innerHeight };
}

const fmtExcluded = (e: Record<string, number>): string =>
  Object.entries(e)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');

test.describe('OBRS-640 mobile tap-target + typography audit (Phase A baseline)', () => {
  test.beforeAll(() => {
    mkdirSync(ASSETS, { recursive: true });
  });

  for (const vp of WIDTHS) {
    test.describe(`@ ${vp.name}px`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      for (const surface of SURFACES) {
        test(`${surface.key} (${vp.name}px)`, async ({ page }) => {
          await seedAnalyticsConsent(page);
          await seedCustomerSession(page, false);
          await surface.prepare(page);
          // AFTER prepare/navigation: addStyleTag injects into the CURRENT document, so
          // called any earlier it would be wiped out by prepare()'s own page.goto().
          await maybeInduceRegression(page);

          const swal = await page.locator('.swal2-container').count();
          const scope = surface.scope ?? null;

          const dims = await page.evaluate(readDims);

          const text = await page.evaluate(auditText, { scope, minFontPx: MIN_FONT_PX });
          expect(
            text,
            `${surface.key}@${vp.name}px: scope "${scope ?? 'body'}" was not in the DOM (text sweep)`
          ).not.toBeNull();

          const collected = await page.evaluate(collectTapCandidates, { scope, selector: TAP_SELECTOR });
          expect(
            collected,
            `${surface.key}@${vp.name}px: scope "${scope ?? 'body'}" was not in the DOM (tap sweep)`
          ).not.toBeNull();
          const c = collected as {
            populationTotal: number;
            excluded: Record<string, number>;
            measuredCount: number;
          };

          // One scroll + probe per SURVIVING candidate -- a real finger meets the element
          // where the phone has scrolled it to, not where it would sit on an infinite canvas.
          const tapViolations: Violation[] = [];
          const tapExcluded = { ...c.excluded };
          let tapMeasuredTotal = c.measuredCount;
          // AC-6: counted and printed separately from `violations`/`measuredTotal` so a
          // credited input can never disappear into either silently.
          let tapSatisfiedViaLabel = 0;
          // AC-5: the viewport-edge probe skip (`VIEWPORT_EDGE_EPS`) counted and printed
          // like every other exclusion reason, not silent -- reporting-only, so it is
          // tracked apart from `tapExcluded`/`tapMeasuredTotal` and never subtracts from
          // either (the element itself is still measured; only some of its probe corners
          // were skipped as off-screen).
          let tapViewportEdgeSkips = 0;
          for (let i = 0; i < c.measuredCount; i++) {
            await page.locator(`[data-obrs640-tap="${i}"]`).scrollIntoViewIfNeeded();
            const outcome = await page.evaluate(probeTaggedTapElement, { idx: i, minTapPx: MIN_TAP_PX });
            if (!outcome) continue;
            tapViewportEdgeSkips += outcome.viewportEdgeSkips;
            if (outcome.excludedReason) {
              tapExcluded[outcome.excludedReason] = (tapExcluded[outcome.excludedReason] ?? 0) + 1;
              tapMeasuredTotal--;
              continue;
            }
            if (outcome.satisfiedViaLabel) tapSatisfiedViaLabel++;
            if (outcome.violation) tapViolations.push(outcome.violation);
          }
          const tap: SweepResult & { satisfiedViaLabel: number; viewportEdgeSkips: number } = {
            populationTotal: c.populationTotal,
            measuredTotal: tapMeasuredTotal,
            excluded: tapExcluded,
            violations: tapViolations,
            satisfiedViaLabel: tapSatisfiedViaLabel,
            viewportEdgeSkips: tapViewportEdgeSkips,
          };
          const t = text as SweepResult;

          const tag = `${surface.key}-${vp.name}`;
          writeFileSync(
            `${ASSETS}/${tag}.json`,
            JSON.stringify({ route: surface.route, ...dims, tap, text: t }, null, 2)
          );

          console.log(
            `[OBRS-640] ${surface.route} > ${surface.key} @ ${vp.name}px ` +
              `(swal=${swal}, doc=${dims.documentHeight}px, viewport=${dims.viewportHeight}px)\n` +
              `  TAP  population=${tap.populationTotal} measured=${tap.measuredTotal} ` +
              `violations=${tap.violations.length} satisfiedViaLabel=${tap.satisfiedViaLabel} ` +
              `viewportEdge=${tap.viewportEdgeSkips} ` +
              `excluded{${fmtExcluded(tap.excluded)}}\n` +
              tap.violations.map((v) => `    TAP  ${v.selector} "${v.text}" -- ${v.detail}`).join('\n') +
              (tap.violations.length ? '\n' : '') +
              `  TEXT population=${t.populationTotal} measured=${t.measuredTotal} ` +
              `violations=${t.violations.length} excluded{${fmtExcluded(t.excluded)}}\n` +
              t.violations.map((v) => `    TEXT ${v.selector} "${v.text}" -- ${v.detail}`).join('\n')
          );

          expect(swal, `${surface.key}@${vp.name}px: a stray swal popup was still up`).toBe(0);

          expect(
            tap.violations.length,
            `${surface.key}@${vp.name}px: ${tap.violations.length}/${tap.measuredTotal} tap-target violations ` +
              `(AC-2, >=${MIN_TAP_PX}x${MIN_TAP_PX}) -- see the log above`
          ).toBe(0);
          expect(
            t.violations.length,
            `${surface.key}@${vp.name}px: ${t.violations.length}/${t.measuredTotal} text nodes ` +
              `below ${MIN_FONT_PX}px (AC-3) -- see the log above`
          ).toBe(0);
        });
      }
    });
  }
});
