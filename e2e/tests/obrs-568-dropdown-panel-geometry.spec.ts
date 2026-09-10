import { expect, Locator, Page, test } from '@playwright/test';
import { mockPublicPageApis } from '../fixtures/public-page-mocks';
import { seedAnalyticsConsent } from '../support/analytics-consent';
import { seedCustomerSession } from '../support/customer-pages';
import {
  expectNoEscapedGateCalls,
  seedGateAdminSession,
  stubWalkInSellShell,
} from '../support/gate-admin-session';

/**
 * OBRS-568 -- one geometry contract, asserted on EVERY dropdown family.
 *
 * WHY THIS SPEC EXISTS. OBRS-561 fixed a panel that painted its option text
 * outside its own box on a phone, and OBRS-1224 fixed where the typing happened
 * inside it. Both are single-family specs: they measure `app-dropdown-group-obrs`
 * and nothing else. The owner's ask behind OBRS-568 is the one thing neither of
 * them can answer -- "are they all the same" -- so this spec asks the same
 * questions of all four families and fails naming the family that answers
 * differently.
 *
 * THE CONTRACT (docs/design-system.md 3.2, written by this card):
 *   1. open downward by default
 *   2. flip up only when below does not fit and above does
 *   3. always `max-height` + `overflow-y: auto`, so the panel never exceeds the viewport
 *   4. width comes from the panel's own content, has a floor, and stays on screen
 *
 * Rules 3 and 4 are asserted for all four families here. Rules 1-2 are asserted
 * for the Bootstrap/Popper families only, because `app-admin-dropdown` is not a
 * Popper dropdown at all -- it positions its own panel with
 * `position: absolute; top: calc(100% + 8px)` and therefore cannot flip. That is
 * a MEASURED deviation, recorded in 3.2 rather than silently fixed here: making
 * the admin panel flip is a behaviour change across 39 call sites that this card
 * did not ask for.
 *
 * WHY THE ASSERTIONS ARE COMPUTED STYLE AND RECTANGLES, NOT SOURCE TEXT. Every
 * declaration under test sits in a component stylesheet that Karma's 800px window
 * either never applies (the <=576px media block) or applies against a viewport
 * that cannot show the defect. `max-height: 60vh` is only a number once there is
 * a real viewport height, and "the option text stays inside the box" is only
 * decidable once there is a real cascade. That is the whole reason OBRS-561
 * shipped past a green unit suite.
 *
 * REFUSING A FALSE PASS. A panel with zero rows satisfies every "nothing is too
 * big" assertion trivially, so each arm asserts its own row count first. The
 * station and driver arms deliberately stub LONG lists (24 stops, 30 drivers) --
 * a short list never reaches `max-height`, so a spec built on the shipped
 * two-stop fixture would pass on a build with no bound at all.
 *
 * HERMETIC on this lane's terms (playwright.gate.config.ts): every /api/ call is
 * answered here or by a shared helper. No backend, no seeded data.
 *
 * ASCII-only source.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 720 };

const ok = (data: unknown) => ({ code: 200, message: 'OK', data });

// ---------------------------------------------------------------------------
// The measurement
// ---------------------------------------------------------------------------

type PanelGeometry = {
  /** Computed `overflow-y` of the panel. Rule 3 wants auto or scroll. */
  overflowY: string;
  /** Computed `max-height` in px, or -1 when the computed value is `none`. */
  maxHeightPx: number;
  height: number;
  left: number;
  right: number;
  width: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Popper's own account of which way it opened; '' when not a Popper panel. */
  placement: string;
  /** Rows in the panel. 0 means this measurement proves nothing. */
  rowCount: number;
  /** Worst `scrollWidth - clientWidth` over the rows: the OBRS-561 defect, in px. */
  worstRowOverflow: number;
  worstRowText: string;
};

async function measurePanel(
  page: Page,
  panelSelector: string,
  rowSelector: string
): Promise<PanelGeometry> {
  return page.evaluate(
    ({ panelSelector, rowSelector }) => {
      const panel = document.querySelector(panelSelector) as HTMLElement | null;
      if (!panel) {
        throw new Error('open panel not found: ' + panelSelector);
      }

      const style = getComputedStyle(panel);
      const rect = panel.getBoundingClientRect();
      const rows = Array.from(panel.querySelectorAll(rowSelector)) as HTMLElement[];

      let worstRowOverflow = 0;
      let worstRowText = '';
      for (const row of rows) {
        const overflow = row.scrollWidth - row.clientWidth;
        if (overflow > worstRowOverflow) {
          worstRowOverflow = overflow;
          worstRowText = (row.textContent ?? '').trim().slice(0, 60);
        }
      }

      return {
        overflowY: style.overflowY,
        maxHeightPx: style.maxHeight === 'none' ? -1 : Math.round(parseFloat(style.maxHeight)),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        placement: panel.getAttribute('data-popper-placement') ?? '',
        rowCount: rows.length,
        worstRowOverflow,
        worstRowText,
      };
    },
    { panelSelector, rowSelector }
  );
}

/** Rules 3 and 4, in one place, so every family is judged by the same words. */
function expectPanelObeysGeometryRules(family: string, g: PanelGeometry): void {
  // A panel with no rows satisfies every bound below without proving anything.
  expect(g.rowCount, family + ': panel rendered no rows, so nothing was measured').toBeGreaterThan(
    0
  );

  // Rule 3 -- the declaration reached the element...
  expect(g.maxHeightPx, family + ": computed max-height is 'none' (rule 3)").toBeGreaterThan(0);
  expect(
    ['auto', 'scroll'],
    family + ": computed overflow-y is '" + g.overflowY + "' (rule 3)"
  ).toContain(g.overflowY);
  // ...and the panel it produced fits the screen it is on.
  expect(
    g.height,
    family + ': panel ' + g.height + 'px exceeds the ' + g.viewportHeight + 'px viewport (rule 3)'
  ).toBeLessThanOrEqual(g.viewportHeight);

  // Rule 4 -- the panel stays on screen...
  expect(
    g.left,
    family + ': panel starts off the left edge at ' + g.left + 'px (rule 4)'
  ).toBeGreaterThanOrEqual(-1);
  expect(
    g.right,
    family + ': panel ends at ' + g.right + 'px past the ' + g.viewportWidth + 'px viewport (rule 4)'
  ).toBeLessThanOrEqual(g.viewportWidth + 1);
  // ...and the box is wide enough for what it is painting. This is the OBRS-561
  // defect exactly: the panel was 60px wide and ~229px of option text was drawn
  // outside it, over whatever the page had behind.
  expect(
    g.worstRowOverflow,
    family +
      ': a row overflows the panel by ' +
      g.worstRowOverflow +
      'px ("' +
      g.worstRowText +
      '") (rule 4)'
  ).toBeLessThanOrEqual(0);
}

// ---------------------------------------------------------------------------
// Families 1 and 2: the two customer-shell families on the home page
// ---------------------------------------------------------------------------

/** 24 stops -- enough to overflow 60vh at both viewports here, per OBRS-1224. */
const STOPS = Array.from({ length: 24 }, (_, i) => ({
  id: i + 1,
  slug: 'stop-' + (i + 1),
  status: 'active',
  stopType: 'station',
  createdBy: 'system',
  createdDate: '2024-01-01',
  lastUpdatedBy: 'system',
  lastUpdatedDate: '2024-01-01',
  display: [
    // Deliberately long: rule 4 is about text that does not fit, so a fixture of
    // short labels would measure a panel that was never asked the question.
    { locale: 'en', label: 'Stop ' + (i + 1) + ' Riverside Interchange Terminal' },
    { locale: 'th', label: 'Stop ' + (i + 1) },
  ],
}));

const PROVINCES = [
  {
    id: 1,
    slug: 'riverside',
    translations: { en: { label: 'Riverside', description: null } },
    stops: STOPS.map((s) => ({ id: s.id, code: s.slug })),
  },
];

async function bootHome(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await seedAnalyticsConsent(page);
  await mockPublicPageApis(page);
  await page.route('**/api/stops', (route) => route.fulfill({ json: ok(STOPS) }));
  await page.route('**/api/provinces/stops', (route) => route.fulfill({ json: ok(PROVINCES) }));
  await page.goto('/');
}

function stationTrigger(page: Page): Locator {
  return page.locator('app-dropdown-group-obrs .dropdown-btn').first();
}

function passengerTrigger(page: Page): Locator {
  return page.locator('app-dropdown-obrs-passenger .dropdown-btn').first();
}

test.describe('OBRS-568 -- dropdown-group-obrs (station picker)', () => {
  for (const viewport of [PHONE, DESKTOP]) {
    const label = viewport.width + 'x' + viewport.height;
    test(label + ': panel obeys rules 3 and 4', async ({ page }) => {
      await bootHome(page, viewport);
      await stationTrigger(page).click();
      await expect(page.locator('app-dropdown-group-obrs .dropdown-menu.show').first()).toBeVisible();

      const geometry = await measurePanel(
        page,
        'app-dropdown-group-obrs .dropdown-menu.show',
        '.dropdown-option'
      );
      expectPanelObeysGeometryRules('dropdown-group-obrs @ ' + label, geometry);
    });
  }

  for (const viewport of [PHONE, DESKTOP]) {
    const label = viewport.width + 'x' + viewport.height;
    test('rules 1-2 @ ' + label + ': downward unless below does not fit and above does', async ({
      page,
    }) => {
      // Rules 1 and 2 are ONE rule -- "prefer below, flip only when you must" --
      // and a spec that pins a direction states neither. Measured on this branch:
      // the station bar flips UP at 1280x720 (below leaves 260px for a 432px
      // panel) and DOWN at 390x844, so a fixed expectation is wrong at one of
      // those viewports whatever it says. This asks instead whether the direction
      // Popper chose is the one the rule permits, from the space actually there.
      await bootHome(page, viewport);
      await stationTrigger(page).click();
      await expect(
        page.locator('app-dropdown-group-obrs .dropdown-menu.show').first()
      ).toBeVisible();

      const space = await page.evaluate(() => {
        const trigger = document.querySelector(
          'app-dropdown-group-obrs .dropdown-btn'
        ) as HTMLElement;
        const panel = document.querySelector(
          'app-dropdown-group-obrs .dropdown-menu.show'
        ) as HTMLElement;
        const t = trigger.getBoundingClientRect();
        const p = panel.getBoundingClientRect();
        return {
          placement: panel.getAttribute('data-popper-placement') ?? '',
          panelHeight: Math.round(p.height),
          spaceBelow: Math.round(window.innerHeight - t.bottom),
          spaceAbove: Math.round(t.top),
        };
      });

      expect(space.placement, 'a Popper panel must report its placement').not.toBe('');

      if (space.placement.startsWith('bottom')) {
        // Rule 1 taken. Legitimate when it fits below -- and ALSO when neither
        // side fits, because rule 2 only permits a flip that improves things and
        // `bottom-start` is the stated default. That second case is not a loophole
        // invented here: it is the state the OBRS-568 card itself measured before
        // OBRS-561 ("1138px ใส่ไม่ได้ทั้งบนและล่าง Popper จึงคาที่ default"), and it
        // is what this page still does at 390x844 -- 401px below, 506px panel,
        // less than that above. Rule 3 is what keeps that case survivable, and
        // rule 3 is asserted separately for every family above.
        const fitsBelow = space.spaceBelow >= space.panelHeight - 1;
        const abovePointless = space.spaceAbove < space.panelHeight;
        expect(
          fitsBelow || abovePointless,
          'opened downward into ' +
            space.spaceBelow +
            'px for a ' +
            space.panelHeight +
            'px panel while ' +
            space.spaceAbove +
            'px above would have fitted it (rule 1/2)'
        ).toBe(true);
      } else {
        // Rule 2 taken: legitimate only when below does NOT fit and above does.
        // Both halves matter -- a panel that flips when below was fine has just
        // become "always up", which is the fixed direction the card refused.
        expect(
          space.spaceBelow,
          'flipped up although ' +
            space.spaceBelow +
            'px was available below for a ' +
            space.panelHeight +
            'px panel (rule 2)'
        ).toBeLessThan(space.panelHeight);
        expect(
          space.spaceAbove,
          'flipped up into ' +
            space.spaceAbove +
            'px, which does not fit the ' +
            space.panelHeight +
            'px panel either (rule 2)'
        ).toBeGreaterThanOrEqual(space.panelHeight - 1);
      }
    });
  }
});

test.describe('OBRS-568 -- dropdown-obrs-passenger (passenger count)', () => {
  for (const viewport of [PHONE, DESKTOP]) {
    const label = viewport.width + 'x' + viewport.height;
    test(label + ': panel obeys rules 3 and 4', async ({ page }) => {
      await bootHome(page, viewport);
      await passengerTrigger(page).click();
      await expect(
        page.locator('app-dropdown-obrs-passenger .dropdown-menu.show').first()
      ).toBeVisible();

      const geometry = await measurePanel(
        page,
        'app-dropdown-obrs-passenger .dropdown-menu.show',
        '.dropdown-option'
      );
      expectPanelObeysGeometryRules('dropdown-obrs-passenger @ ' + label, geometry);
    });
  }
});

// ---------------------------------------------------------------------------
// Family 3: dropdown-obrs, on the longest public form that uses it
// ---------------------------------------------------------------------------

test.describe('OBRS-568 -- dropdown-obrs (title picker on /register)', () => {
  for (const viewport of [PHONE, DESKTOP]) {
    const label = viewport.width + 'x' + viewport.height;
    test(label + ': panel obeys rules 3 and 4', async ({ page }) => {
      await page.setViewportSize(viewport);
      await seedCustomerSession(page, false);
      await page.goto('/register');

      const trigger = page.locator('app-dropdown-obrs .dropdown-btn').first();
      await expect(trigger).toBeVisible();
      await trigger.click();
      await expect(page.locator('app-dropdown-obrs .dropdown-menu.show').first()).toBeVisible();

      const geometry = await measurePanel(
        page,
        'app-dropdown-obrs .dropdown-menu.show',
        '.dropdown-option'
      );
      expectPanelObeysGeometryRules('dropdown-obrs @ ' + label, geometry);
    });
  }
});

// ---------------------------------------------------------------------------
// Family 4: admin-dropdown, reached the way trip-details-edit.spec.ts reaches it
// ---------------------------------------------------------------------------

const BUS_TRIP = {
  scheduleId: 201,
  vehicleType: 'bus',
  licensePlate: 'TH-8888',
  driverName: 'Somchai Driver',
  departureDateTime: '2026-09-01T08:00:00Z',
  arrivalDateTime: '2026-09-01T13:00:00Z',
  pricePerSeat: '350.00',
  capacity: 21,
  availableCount: 18,
  reservedUnpaidCount: 1,
  soldPaidCount: 2,
  availableSeatNumbers: ['1', '2', '4', '6', '7', '8'],
};

const SCHEDULE_DETAIL_RESP = ok({
  id: 201,
  departureDateTime: '2026-09-01T08:00:00+07:00',
  status: 'active',
  scheduleSetId: null,
  seatingCapacity: null,
  route: { id: 1, slug: 'bkk-cnx', name: 'Bangkok - Chiang Mai' },
  vehicle: { id: 5, numberPlate: 'TH-8888', vehicleNumber: 'V5' },
  vehicleType: { id: 2, slug: 'bus', name: 'Bus', totalSeats: 21 },
  driver: { id: 7, fullName: 'Somchai Driver' },
});

/** 30 drivers with long names: the admin panel's own bound and its width floor
 *  are both only reachable with a list the shipped 2-row fixture never produces. */
const DRIVERS_RESP = ok(
  Array.from({ length: 30 }, (_, i) => ({
    id: 7 + i,
    name: 'Somchai Wongsawat Driver Number ' + (i + 1),
  }))
);

async function openTripDetailsForm(page: Page): Promise<void> {
  await page.route('**/api/private/schedules/walk-in**', (route) =>
    route.fulfill({
      json: ok([{ routeSlug: 'bkk-cnx', routeLabel: 'Bangkok - Chiang Mai', trips: [BUS_TRIP] }]),
    })
  );
  await page.route('**/api/private/segments/**', (route) =>
    route.fulfill({
      json: ok({
        route: { slug: 'bkk-cnx', name: 'Bangkok - Chiang Mai' },
        stopPairs: [
          {
            segmentId: 1,
            fromStop: { slug: 'bkk', name: 'Bangkok' },
            toStop: { slug: 'cnx', name: 'Chiang Mai' },
            vehicleType: { slug: 'bus', name: 'Bus' },
            fare: '350.00',
            estimatedDurationMinutes: 300,
          },
        ],
      }),
    })
  );
  await page.route('**/api/private/vehicle-types/**', (route) =>
    route.fulfill({ json: ok({ id: 2, slug: 'bus', name: 'Bus', totalSeats: 21, seatMaps: [] }) })
  );

  await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
  await page.locator('app-walk-in-trip-browser').waitFor({ state: 'visible', timeout: 20_000 });

  const tripRow = page.locator('.trip-row').first();
  await tripRow.waitFor({ timeout: 10_000 });
  await tripRow.click();

  // Registered after the row click and before the tab click, exactly as
  // trip-details-edit.spec.ts does: the form's forkJoin fires on tab activation.
  await page.route('**/api/private/schedules/201', (route) =>
    route.fulfill({ json: SCHEDULE_DETAIL_RESP })
  );
  await page.route('**/api/private/vehicle-types', (route) =>
    route.fulfill({
      json: ok([
        { id: 1, slug: 'van', name: 'Van', totalSeats: 10 },
        { id: 2, slug: 'bus', name: 'Bus', totalSeats: 21 },
      ]),
    })
  );
  await page.route('**/api/private/vehicles', (route) =>
    route.fulfill({
      json: ok([{ id: 5, numberPlate: 'TH-8888', vehicleType: { id: 2, slug: 'bus' } }]),
    })
  );
  await page.route('**/api/private/users/drivers', (route) => route.fulfill({ json: DRIVERS_RESP }));

  await page.locator('.p-tablist-tab-list').getByText('Trip Details').click();
  await page.locator('app-trip-details-edit-form').waitFor({ state: 'visible', timeout: 15_000 });
}

test.describe('OBRS-568 -- admin-dropdown (driver picker in the trip-details form)', () => {
  test.beforeEach(async ({ page }) => {
    await seedGateAdminSession(page);
    await stubWalkInSellShell(page);
  });
  test.afterEach(async ({ page }) => {
    expectNoEscapedGateCalls(page);
  });

  for (const viewport of [PHONE, DESKTOP]) {
    const label = viewport.width + 'x' + viewport.height;
    test(label + ': panel obeys rules 3 and 4', async ({ page }) => {
      await page.setViewportSize(viewport);
      await openTripDetailsForm(page);

      // The driver picker is the last of the form's four selects.
      const driverDropdown = page.locator('app-trip-details-edit-form app-admin-dropdown').last();
      await driverDropdown.locator('button.admin-dropdown-trigger').click();
      const panel = driverDropdown.locator('div.admin-dropdown-menu');
      await expect(panel).toBeVisible();

      const geometry = await panel.evaluate((el: HTMLElement) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const rows = Array.from(
          el.querySelectorAll('button.admin-dropdown-option')
        ) as HTMLElement[];

        let worstRowOverflow = 0;
        let worstRowText = '';
        for (const row of rows) {
          const overflow = row.scrollWidth - row.clientWidth;
          if (overflow > worstRowOverflow) {
            worstRowOverflow = overflow;
            worstRowText = (row.textContent ?? '').trim().slice(0, 60);
          }
        }

        return {
          overflowY: style.overflowY,
          maxHeightPx: style.maxHeight === 'none' ? -1 : Math.round(parseFloat(style.maxHeight)),
          height: Math.round(rect.height),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          placement: el.getAttribute('data-popper-placement') ?? '',
          rowCount: rows.length,
          worstRowOverflow,
          worstRowText,
        };
      });

      expectPanelObeysGeometryRules('admin-dropdown @ ' + label, geometry);
    });
  }
});
