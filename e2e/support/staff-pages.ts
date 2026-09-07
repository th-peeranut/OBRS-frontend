/**
 * The staff-shell pages the OBRS-812 contrast gate sweeps, and everything needed
 * to reach them with no backend.
 *
 * WHY THIS FILE EXISTS AT ALL
 *
 * `customer-pages.ts` declares twenty entries and every one of them is a customer
 * route. Nothing under `/staff/*` or `/admin/*` has ever been swept, so every
 * staff-side contrast fix has shipped with nothing watching it. OBRS-797 is the
 * case that named the gap: it moved `.admin-field::placeholder` in dark mode from
 * 3.32:1 to 7.18:1 on the boarding scan box, and the only measurement of either
 * number came from a probe written for that one card, in the office repo, which
 * CI does not run. The customer half of the same card is covered by invariant C
 * on every push; the staff half is covered by nothing.
 *
 * WHY A SEPARATE LIST RATHER THAN MORE `CUSTOMER_PAGES` ENTRIES
 *
 * Three readers would break, and each break is silent in a different way:
 *
 *   1. `obrs-970-route-population.spec.ts` requires every entry in
 *      `CUSTOMER_PAGES` to be a customer-side route in `app-routing.module.ts`
 *      -- the population it checks explicitly EXCLUDES `admin` and `staff`.
 *   2. `host-box-sweep.spec.ts` requires a `CUSTOMER_HOST` row in
 *      `host-boxes.ts` for every `CUSTOMER_PAGES` key, and fails by name without
 *      one. Staff pages are already swept there under `ADMIN_SWEEP`, which is a
 *      different session and a different question.
 *   3. `seedCustomerSession` mints `auth_roles: ['user']`. The `/staff` route is
 *      `requiredRoles: ['driver', 'salesperson']`, so a staff entry in that list
 *      would redirect, and the sweep would score the login page under a staff
 *      key.
 *
 * THE SESSION IS `['admin']`, NOT `['salesperson']`
 *
 * Same choice `host-boxes.ts` made and for the reason written there: admin holds
 * cross-portal access through `AuthService.ROLE_GRANTS` (OBRS-176), so one
 * session reaches every page here, and the pages render the operator's view
 * rather than a role-narrowed subset.
 *
 * WHY THE BACKEND MOCK IS LOCAL AND NOT `mockEmptyBackend`
 *
 * `host-boxes.ts` answers its calls out of a MODULE-LEVEL `activeFixture` that its
 * own sweep runner assigns per page and never clears. That variable is per worker
 * process, not per test file, so importing `mockEmptyBackend` here would leave
 * this sweep's answers depending on which page the host-box sweep happened to
 * stop on in the same worker. The generic answers below are the same shape;
 * binding them per page, at session-seed time, is what makes them ours.
 *
 * ASCII-only source.
 */

import { Page, expect } from '@playwright/test';

const ok = <T>(data: T) => ({ code: 200, message: 'OK', data });
const emptyPage = () => ({ content: [], totalElements: 0 });

/** One canned answer for the page under test: first match wins, before the generic map. */
export interface StaffFixtureRule {
  /** Tested against the request PATHNAME only -- never the query string. */
  match: RegExp;
  body: unknown;
}

/** A staff-shell page this gate sweeps, and the floors that make its sweep evidence. */
export interface StaffPage {
  key: string;
  url: string;
  /** The pathname the sweep must actually land on. A redirect is a failure, not a clean page. */
  landsOn: string;
  /** Answers this page needs on top of the generic empty backend. */
  fixture?: StaffFixtureRule[];
  /**
   * Clicks that reach a control the first paint does not render.
   *
   * Deliberately narrow: an `act` that fails has to name one screen, so nothing
   * here chains two unrelated screens into one entry.
   */
  act?: (page: Page) => Promise<void>;
  minText: number;
  minControls: number;
  minPlaceholders?: number;
  /**
   * Selectors that must exist, checked SEPARATELY from the floors above.
   *
   * A page can clear a text-run floor on its shell alone while the element the
   * gate was built to watch is absent -- which is exactly how the customer gate
   * lost `.recent-route-btn` for a week (OBRS-938). Every entry below names the
   * element that makes its page worth sweeping, not merely one that is present.
   */
  mustRender: string[];
}

/**
 * The generic empty backend, mirroring `mockEmptyBackend`'s answers for the
 * endpoints these four pages call. Registered under the page's own fixture, so a
 * page can narrow one path without restating the rest.
 */
function answerFor(pathname: string): unknown {
  if (/(bookings|usability-reports|notifications)$/.test(pathname)) return ok(emptyPage());
  if (/\/private\/notifications\/unread-count$/.test(pathname)) return ok({ unreadCount: 0 });
  if (/\/private\/users\/me$/.test(pathname)) return ok({ salesPointStop: null });
  if (/(lookups|roles|users|routes|stops|stations|vehicles|vehicle-types|schedule-set|schedules)$/.test(pathname))
    return ok([]);
  if (/\/boarding-list$/.test(pathname)) return ok([]);
  if (/\/route-stops\//.test(pathname)) return ok({ stops: [] });
  return ok(null);
}

/**
 * A staff session, a theme, and this page's canned answers -- all before the app
 * boots, so nothing has to be clicked.
 *
 * The theme goes through `app_admin_theme`, the key `ThemeService` itself reads,
 * which puts `is-dark` on `document.body` for the whole app and on `.admin-shell`
 * through `AdminLayoutComponent`'s own binding. That is a claim about a coupling,
 * so the caller asserts `body.is-dark` afterwards rather than trusting it.
 */
export async function seedStaffSweepSession(
  page: Page,
  dark: boolean,
  fixture: StaffFixtureRule[] = []
): Promise<void> {
  await page.addInitScript(
    ([isDark]) => {
      localStorage.setItem('app_language', 'en');
      localStorage.setItem('auth_token', 'obrs-812-staff-contrast-gate-token');
      localStorage.setItem('auth_username', 'admin@system.local');
      localStorage.setItem('auth_roles', JSON.stringify(['admin']));
      if (isDark) localStorage.setItem('app_admin_theme', 'dark');
      else localStorage.removeItem('app_admin_theme');
    },
    [dark] as [boolean]
  );

  await page.route('**/api/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const rule = fixture.find((r) => r.match.test(pathname));
    const body = rule ? rule.body : answerFor(pathname);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  // No key and no network in this lane; without the abort the fleet map and the
  // sell page's stop pickers wait on the Maps bootstrap before they finish.
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
}

/**
 * Deletes every `.admin-field ... ::placeholder` rule from the live CSSOM,
 * reconstructing the pre-OBRS-797 boarding placeholder. Shared by the gate's
 * mutation test and by the OBRS-812 evidence capture, which reconstruct the
 * same BEFORE state and must agree on how.
 *
 * `owner` is carried down rather than read back off `parentStyleSheet`: an
 * index is only meaningful against the list it came from, and a rule inside
 * `@media` has the SHEET as its parentStyleSheet while its index counts within
 * the media block -- so deleting by that pair removes an unrelated top-level
 * rule and reports success.
 */
export function stripAdminFieldPlaceholderRules(): number {
  let n = 0;
  const strip = (owner: CSSStyleSheet | CSSGroupingRule) => {
    const rules = owner.cssRules;
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i] as CSSRule & { selectorText?: string; cssRules?: CSSRuleList };
      if (rule.selectorText?.includes('.admin-field') && rule.selectorText.includes('::placeholder')) {
        owner.deleteRule(i);
        n++;
        continue;
      }
      if (rule.cssRules) strip(rule as CSSGroupingRule);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      strip(sheet);
    } catch {
      // A cross-origin sheet cannot be read; this lane serves none.
    }
  }
  return n;
}

// --- fixtures ---------------------------------------------------------------

/**
 * The trip whose header `/staff/boarding/42` renders, and the reason the scan box
 * is measurable at all.
 *
 * `status` must NOT be an arrived one: `.admin-field.boarding-scan-input` carries
 * `[disabled]="isScanning || isUpdatingScheduleStatus || isScheduleArrived"`, and
 * `MEASURE` skips every disabled element (WCAG exempts inactive components). An
 * arrived fixture would therefore park the OBRS-797 placeholder in the skip count
 * and let this page report a clean sweep over the one element it exists to watch.
 */
const BOARDING_SCHEDULE = ok({
  id: 42,
  status: 'scheduled',
  departureDateTime: '2030-06-17T08:00:00+07:00',
  route: { code: 'CBR-BKK', slug: 'chonburi_bangkok' },
  vehicle: { numberPlate: 'TH-8888', vehicleNumber: 'BUS-01' },
  driver: { fullName: 'Somchai Jaidee' },
  assignedToMe: true,
  delayedDepartureDateTime: null,
  delayReason: null,
});

/**
 * Two categories, three rows. NOT the real 23-item checklist: the sweep scores
 * colour pairs, and a fourth row of the same shape adds wall clock without adding
 * a pair. Two categories rather than one because the group header is its own
 * surface, and one group would leave it scored exactly once.
 */
const INSPECTION_ITEMS = ok([
  { id: 1, code: 'ENGINE_OIL', label: 'Engine oil level', displayOrder: 1, active: true, category: 'ENGINE_FLUIDS', categoryOrder: 1 },
  { id: 2, code: 'COOLANT', label: 'Coolant level', displayOrder: 2, active: true, category: 'ENGINE_FLUIDS', categoryOrder: 1 },
  { id: 3, code: 'TIRE_TREAD', label: 'Tire tread depth', displayOrder: 1, active: true, category: 'TIRES', categoryOrder: 2 },
]);

/** One van, and it is the driver's own, so the picker defaults to it (OBRS-1332). */
const INSPECTABLE_VEHICLES = ok([{ id: 1, label: 'BUS-01 / TH-8888', assignedToMe: true }]);

export const STAFF_PAGES: StaffPage[] = [
  {
    // The walk-in counter, with the empty backend the rest of this lane uses: the
    // trip browser renders its date/route filters and its empty result panel,
    // which is the operator's first screen every shift and carries the Bootstrap
    // form-control family the staff shell inherits.
    key: 'staff-sell',
    url: '/staff/sell',
    landsOn: '/staff/sell',
    // Measured 2026-09-05 on this fixture: 44 text runs light / 48 dark, 10
    // controls in both. The floors sit below the smaller of each pair, far enough
    // to survive a copy change and not far enough to survive a page that did not
    // render.
    minText: 40,
    minControls: 8,
    mustRender: ['app-sell-page', 'input.form-control.form-control-sm'],
  },
  {
    // The schedule browser, and the only page here that renders
    // `.admin-dropdown-trigger` -- the design-system dropdown whose 1.19:1 light
    // boundary the register below carries.
    key: 'staff-schedules',
    url: '/staff/schedules',
    landsOn: '/staff/schedules',
    // Measured 2026-09-05: 42 text runs light / 43 dark, 5 controls, 2
    // placeholders in both themes.
    minText: 38,
    minControls: 4,
    minPlaceholders: 2,
    mustRender: ['app-staff-schedules-page', 'button.admin-dropdown-trigger'],
  },
  {
    // The OBRS-797 screen. `.admin-field.boarding-scan-input` is the placeholder
    // that card measured at 3.32:1, and the mutation test in the spec removes the
    // rule that fixed it and requires this page to go red.
    key: 'staff-boarding',
    url: '/staff/boarding/42',
    landsOn: '/staff/boarding/42',
    fixture: [{ match: /\/schedules\/42$/, body: BOARDING_SCHEDULE }],
    // Measured 2026-09-05: 69 text runs light / 76 dark, 7 controls, 2
    // placeholders in both themes. The two placeholders are the scan box and the
    // passenger search box, and BOTH are `.admin-field` -- so the floor of 2 is
    // what makes a fixture change that stops rendering either one go red instead
    // of quietly halving invariant C's population on this page.
    minText: 60,
    minControls: 6,
    minPlaceholders: 2,
    mustRender: ['.admin-field.boarding-scan-input', 'button.admin-btn'],
  },
  {
    key: 'staff-inspection',
    url: '/staff/inspection',
    landsOn: '/staff/inspection',
    fixture: [
      { match: /\/private\/vehicle-inspection-items$/, body: INSPECTION_ITEMS },
      { match: /\/private\/vehicles\/inspectable$/, body: INSPECTABLE_VEHICLES },
      { match: /\/private\/inspections\/me$/, body: ok([]) },
    ],
    // The per-row note textarea is `@if (verdictAt(i) === 'needs_repair')`, so the
    // third `.admin-field` on this page exists only after a click. It is the one
    // OBRS-797's comment names alongside the boarding box ("the same gap covers
    // the /staff/inspection note textareas"), so a sweep that never opens it
    // measures two thirds of the element this card is about.
    //
    // Both waits are SHORT on purpose. Playwright's defaults here are 30 s for the
    // click's actionability and 10 s for the assertion, so a page that renders no
    // rows at all burns ~40 s per theme doing nothing -- measured 2026-09-05, that
    // pushed the sweep past its own 190 s budget and the run died as
    // "Test timeout exceeded" with a torn-down browser context. The gate was still
    // RED, but it was red in the one way this file exists to prevent: a message
    // that names the harness instead of the screen. Five seconds is far longer
    // than a rendered control needs and far shorter than the budget.
    act: async (page) => {
      await page.locator('.inspection-verdict-btn.is-needs-repair').first().click({ timeout: 5_000 });
      await expect(page.locator('.inspection-row-note textarea.admin-field')).toBeVisible({ timeout: 5_000 });
    },
    // Measured 2026-09-05: 43 text runs and 10 controls in both themes, and 3
    // `.admin-field` placeholders -- the odometer input, the per-row note the
    // `act` above opens, and the general-notes textarea. Three is the number the
    // card was filed on, so the floor is 3: a page that renders two of them has
    // lost the one that needed a click, which is the one the fixture is for.
    minText: 38,
    minControls: 8,
    minPlaceholders: 3,
    mustRender: ['.inspection-row-note textarea.admin-field', 'input.admin-field.p-inputnumber-input'],
  },
];

/**
 * How long the sweep gets, derived from the population rather than pinned to a
 * constant under a list that only grows.
 *
 * Measured 2026-09-05 on a quiet lane: the eight sweeps (four pages x two themes)
 * took 31.8 s end to end, so ~4 s each -- the 20 s per pass below is the same
 * rate `CUSTOMER_SWEEP_PAGE_MS` uses and is deliberately five times the measured
 * cost, because this budget is a backstop for a hung page and not a target.
 *
 * @param passesPerEntry how many times the sweep loads each entry -- the gate
 * visits every page once per THEME, so it passes 2.
 */
export function staffSweepBudgetMs(passesPerEntry = 1): number {
  return 30_000 + STAFF_PAGES.length * passesPerEntry * 20_000;
}
