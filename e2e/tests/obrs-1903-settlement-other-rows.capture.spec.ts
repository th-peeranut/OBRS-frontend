import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { seedGateAdminSession } from '../support/gate-admin-session';

/**
 * OBRS-1903 BEFORE/AFTER evidence for `/staff/settlement`: the free-text "อื่น ๆ" cost becomes
 * REPEATABLE and moves out of the fixed table onto a button, so a day that paid for the car wash
 * AND the parcel run can name both instead of lumping them into one figure.
 *
 * Replaces the OBRS-1896 capture lane, whose frames photographed a permanent 6th row that the
 * owner's ruling (1) took back off the screen.
 *
 * Hermetic on the gate lane's terms (see playwright.gate.config.ts rule 1): a synthetic
 * salesperson session in localStorage and every `/api/**` call answered here, so the run needs no
 * backend and no seeded database.
 *
 * Every number printed is READ BACK from the rendered DOM. The expected-0s are paired with
 * expected-1 controls on sibling selectors, so a typo'd selector fails loudly instead of reading
 * as "correctly absent".
 *
 *   npx playwright test --config=playwright.obrs1903capture.config.ts
 */

const ASSETS = 'e2e-evidence/obrs-1903';

/** The cap the screen enforces: `DriverCashDaySettleReqDto.expenses` is @Size(max = 20) over the
 * whole list, and DRIVER_WAGE plus the four fixed amount rows already spend five of those slots. */
const MAX_OTHER_ROWS = 15;

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

test.describe('OBRS-1903 capture', () => {
  test.beforeAll(() => {
    mkdirSync(ASSETS, { recursive: true });
  });

  test('many อื่น ๆ rows on one day, before and after', async ({ page }) => {
    await seedGateAdminSession(page, {
      roles: ['salesperson'],
      username: 'salesperson@system.local',
      // The counter reads this screen in Thai; an English frame would be evidence of a
      // screen nobody uses.
      language: 'th',
    });

    // One handler for every authenticated call: the three this screen actually reads from, and an
    // empty list for the shell's own traffic. `apiUrl` points at a port where nothing listens, so
    // anything missed here fails loudly rather than reaching a server.
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

    const vehicle = page.locator('[data-testid="settlement-vehicle"] app-admin-dropdown');
    await vehicle.locator('.admin-dropdown-trigger').click();
    await vehicle.locator('.admin-dropdown-option', { hasText: '16-8747' }).first().click();

    const table = page.locator('[data-testid="settlement-expenses"]');
    await table.locator('[data-testid="settlement-expense-row-FUEL"]').waitFor({ timeout: 60_000 });

    // The day CONTEXT must actually have landed: without it the wage row shows the
    // not-configured state, the ค่าจอดรถ row is filtered out, and the frame would be five rows
    // for a reason that has nothing to do with this card. The first run of the OBRS-1896 lane
    // stubbed the wrong path and photographed exactly that.
    await expect(page.locator('[data-testid="settlement-wage-total"]')).toBeVisible();
    await expect(table.locator('[data-testid="settlement-expense-row-PARKING_FEE"]')).toHaveCount(1);

    const otherRows = table.locator('[data-testid^="settlement-other-row-"]');
    const addOther = page.locator('[data-testid="settlement-add-other"]');
    const submit = page.locator('[data-testid="settlement-submit"]');
    const total = page.locator('[data-testid="settlement-total"]').first();

    // ── BEFORE: the screen as the counter opens it — five rows, the button unpressed ──
    expect(await table.locator('tbody tr').count()).toBe(5);
    expect(await otherRows.count()).toBe(0);
    await expect(addOther).toBeEnabled(); // positive control for the count above
    await table.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${ASSETS}/OBRS-1903-BEFORE-five-rows-button-unpressed.png` });

    // ── AFTER 1: three presses, three empty rows, caret waiting in the last one ──────
    await addOther.click();
    await addOther.click();
    await addOther.click();
    expect(await otherRows.count()).toBe(3);
    const focused = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') ?? null,
    );
    console.log(`    caret after the third press: ${focused}`);
    expect(focused).toBe('settlement-other-label-2');
    await table.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${ASSETS}/OBRS-1903-AFTER-1-three-empty-rows.png` });

    // ── AFTER 2: two named costs, and the THIRD row half-filled is refused on screen ──
    const totalBefore = (await total.innerText()).trim();
    await page.locator('[data-testid="settlement-other-label-0"]').fill('ค่าล้างรถ');
    await page.locator('[data-testid="settlement-other-amount-0"]').fill('300');
    await page.locator('[data-testid="settlement-other-label-1"]').fill('ค่าส่งของ');
    await page.locator('[data-testid="settlement-other-amount-1"]').fill('120.50');
    await page.locator('[data-testid="settlement-other-amount-2"]').fill('80');

    // Named on the row that is wrong, and on no other: a gate that only asked the first row
    // would let this day reach the server, which refuses the WHOLE submit rather than the row.
    await expect(page.locator('[data-testid="settlement-other-incomplete-2"]')).toBeVisible();
    await expect(page.locator('[data-testid="settlement-other-incomplete-0"]')).toHaveCount(0);
    await expect(submit).toBeDisabled();
    await page.screenshot({
      path: `${ASSETS}/OBRS-1903-AFTER-2-third-row-half-filled-is-refused.png`,
    });

    // ── AFTER 3: the third row taken back out by its own ✕, and the money lands ───────
    await page.locator('[data-testid="settlement-other-remove-2"]').click();
    expect(await otherRows.count()).toBe(2);
    await expect(page.locator('[data-testid="settlement-other-label-0"]')).toHaveValue('ค่าล้างรถ');
    await expect(page.locator('[data-testid="settlement-other-label-1"]')).toHaveValue('ค่าส่งของ');
    await expect(submit).toBeEnabled();
    const totalAfter = (await total.innerText()).trim();
    console.log(
      `    total charged to the box: ${totalBefore} -> ${totalAfter} (wage 600 + 300 + 120.50)`,
    );
    expect(totalBefore).not.toBe(totalAfter);
    // Full page: the two named rows and the total they moved have to be in ONE frame, or the
    // picture proves the rows exist and nothing about the money.
    await page.screenshot({
      path: `${ASSETS}/OBRS-1903-AFTER-3-two-named-rows-and-the-total.png`,
      fullPage: true,
    });

    // ── AFTER 4: the quota. 15 rows and the button says so rather than failing later ──
    for (let i = 2; i < MAX_OTHER_ROWS; i += 1) {
      await addOther.click();
    }
    expect(await otherRows.count()).toBe(MAX_OTHER_ROWS);
    await expect(addOther).toBeDisabled();
    const fullMessage = (
      await page.locator('[data-testid="settlement-other-full"]').innerText()
    ).trim();
    console.log(`    at the cap: "${fullMessage}"`);
    await page.locator('[data-testid="settlement-other-full"]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${ASSETS}/OBRS-1903-AFTER-4-fifteen-rows-and-the-button-is-spent.png`,
      fullPage: true,
    });
  });
});
