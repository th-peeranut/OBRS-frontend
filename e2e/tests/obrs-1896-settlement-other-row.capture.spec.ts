import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { seedGateAdminSession } from '../support/gate-admin-session';

/**
 * OBRS-1896 BEFORE/AFTER evidence for `/staff/settlement`: the day-settlement table
 * gains a 6th row whose ITEM cell is typed, so cash that fits none of the five fixed
 * categories can finally leave the box on this screen.
 *
 * Hermetic on the gate lane's terms (see playwright.gate.config.ts rule 1): a synthetic
 * salesperson session in localStorage and every `/api/**` call answered here, so the run
 * needs no backend and no seeded database. The BEFORE frame is produced by hiding the new
 * row in the page's own DOM rather than by checking out the old tree - the claim it
 * carries is "these five rows are what the screen used to offer", and nothing else in the
 * frame differs.
 *
 * Every number printed is READ BACK from the rendered DOM. The expected-0s are paired
 * with expected-1 controls on sibling selectors, so a typo'd selector fails loudly
 * instead of reading as "correctly absent".
 *
 *   npx playwright test --config=playwright.obrs1896capture.config.ts
 */

const ASSETS = 'e2e-evidence/obrs-1896';

const CONTEXT = {
  businessDate: '2026-09-13',
  vehicleId: 3,
  vehiclePlate: '16-8747',
  assignedDriverId: 44,
  assignedDriverName: 'สมชาย',
  driverId: 44,
  driverName: 'สมชาย',
  schedules: [
    {
      scheduleId: 101,
      departureDateTime: '2026-09-13T06:00:00',
      routeId: 1,
      routeName: 'บ้านบึง - เอกมัย',
      firstRoundOfRoute: true,
    },
    {
      scheduleId: 102,
      departureDateTime: '2026-09-13T13:00:00',
      routeId: 1,
      routeName: 'บ้านบึง - เอกมัย',
      firstRoundOfRoute: false,
    },
  ],
  legCount: 2,
  driverWageRateConfigured: true,
  driverWageRatePerLeg: '300.00',
  driverWageTotal: '600.00',
  parkingFeeEligible: true,
  day: {
    dayId: 7,
    driverId: 44,
    driverName: 'สมชาย',
    holderRole: 'DRIVER',
    businessDate: '2026-09-13',
    vehicleId: 3,
    status: 'OPEN',
    entries: [],
    advanceTotal: '1000.00',
    perHeadTotal: '0.00',
    expensePaidTotal: '0.00',
    parcelRemitTotal: '0.00',
    parcelClawbackTotal: '0.00',
    expectedReturnAmount: '1000.00',
    returnedAmount: null,
    returnedAt: null,
    returnedByUserId: null,
    returnedByName: null,
    discrepancy: null,
    discrepancyReason: null,
    perHeadRates: [],
    hasUnmappedSalesPointRemit: false,
    reopenCount: 0,
    reopens: [],
  },
  alreadySettled: false,
  lastSubmission: null,
};

const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'OK', data }),
});

test.describe('OBRS-1896 capture', () => {
  test.beforeAll(() => {
    mkdirSync(ASSETS, { recursive: true });
  });

  test('the 6th อื่น ๆ row, before and after', async ({ page }) => {
    await seedGateAdminSession(page, {
      roles: ['salesperson'],
      username: 'salesperson@system.local',
      // The counter reads this screen in Thai; an English frame would be evidence of a
      // screen nobody uses.
      language: 'th',
    });

    // One handler for every authenticated call: the three this screen actually reads from,
    // and an empty list for the shell's own traffic. `apiUrl` points at a port where
    // nothing listens, so anything missed here fails loudly rather than reaching a server.
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/private/vehicles')) {
        return route.fulfill(ok([{ id: 3, numberPlate: '16-8747' }]));
      }
      if (path.endsWith('/private/users/drivers')) {
        return route.fulfill(ok([{ id: 44, name: 'สมชาย' }]));
      }
      if (path.includes('/driver-cash/day-context')) {
        return route.fulfill(ok(CONTEXT));
      }
      return route.fulfill(ok([]));
    });

    await page.goto('/staff/settlement', { waitUntil: 'domcontentloaded' });

    const vehicle = page.locator(
      '[data-testid="settlement-vehicle"] app-admin-dropdown',
    );
    await vehicle.locator('.admin-dropdown-trigger').click();
    await vehicle
      .locator('.admin-dropdown-option', { hasText: '16-8747' })
      .first()
      .click();

    const table = page.locator('[data-testid="settlement-expenses"]');
    await table
      .locator('[data-testid="settlement-expense-row-FUEL"]')
      .waitFor({ timeout: 60_000 });

    // The day CONTEXT must actually have landed: without it the wage row shows the
    // not-configured state, the ค่าจอดรถ row is filtered out, and the frame would be five
    // rows for a reason that has nothing to do with this card. The first run of this spec
    // stubbed the wrong path and photographed exactly that.
    await expect(
      page.locator('[data-testid="settlement-wage-total"]'),
    ).toBeVisible();
    await expect(
      table.locator('[data-testid="settlement-expense-row-PARKING_FEE"]'),
    ).toHaveCount(1);

    const rows = table.locator('tbody tr');
    const otherRow = table.locator(
      '[data-testid="settlement-expense-row-OTHER"]',
    );
    const otherLabel = page.locator('[data-testid="settlement-other-label"]');

    // ── BEFORE: the same screen with the new row taken back out ──────────────
    await otherRow.evaluate((el: HTMLElement) => (el.style.display = 'none'));
    expect(await rows.filter({ visible: true }).count()).toBe(5);
    expect(await otherLabel.count()).toBe(1); // present in the DOM - only this frame hides it
    await table.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${ASSETS}/OBRS-1896-BEFORE-five-fixed-rows.png`,
    });

    await otherRow.evaluate((el: HTMLElement) => (el.style.display = ''));

    // ── AFTER 1: the row exists and its ITEM cell is an input ────────────────
    expect(await rows.count()).toBe(6);
    await expect(otherLabel).toBeVisible();
    expect(await otherLabel.getAttribute('maxlength')).toBe('100');
    await table.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${ASSETS}/OBRS-1896-AFTER-1-six-rows.png` });

    // ── AFTER 2: half-filled is refused on the screen, not by a 400 ──────────
    const total = page.locator('[data-testid="settlement-total"]');
    const totalBefore = (await total.first().innerText()).trim();
    await page.locator('[data-testid="settlement-amount-OTHER"]').fill('300');
    await expect(
      page.locator('[data-testid="settlement-other-incomplete"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="settlement-submit"]'),
    ).toBeDisabled();
    await page.screenshot({
      path: `${ASSETS}/OBRS-1896-AFTER-2-amount-without-a-name-is-refused.png`,
    });

    // ── AFTER 3: named, and the money the counter owes back drops by it ──────
    await otherLabel.fill('ค่าล้างรถ');
    await expect(
      page.locator('[data-testid="settlement-other-incomplete"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid="settlement-submit"]'),
    ).toBeEnabled();
    const totalAfter = (await total.first().innerText()).trim();
    console.log(
      `    total charged to the box: ${totalBefore} -> ${totalAfter} (wage 600 + 300)`,
    );
    expect(totalBefore).not.toBe(totalAfter);
    // Full page: the named row and the total it moved have to be in ONE frame, or the
    // picture proves the row exists and nothing about the money.
    await page.screenshot({
      path: `${ASSETS}/OBRS-1896-AFTER-3-named-and-charged.png`,
      fullPage: true,
    });
  });
});
