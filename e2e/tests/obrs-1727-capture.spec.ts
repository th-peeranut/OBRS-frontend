/**
 * OBRS-1727 AC-7 evidence - the three AFTER frames the card asks for:
 *
 *   1. /admin/settlements, with the expense approval lane at the TOP (AC-1, owner ruling A)
 *      and the menu reading "Settlements & approvals" (AC-2).
 *   2. /admin/expenses, split: the form + log stay, the approval lane is gone (AC-4),
 *      and the left-hand menu entry it lives under is "Expenses"/"คาใชจาย" (owner ruling B).
 *   3. /staff/boarding/:id, the salesperson cash panel with the whole `.dcp-actions`
 *      button row closed (AC-3, owner ruling D2) - the two totals boxes still there.
 *
 *   npx playwright test --config=playwright.obrs1727capture.config.ts
 *
 * CAPTURE and not GATE: the verdict for this card is the unit suite (`ng test`) and the
 * backend IT suite. What this lane adds is the pictures, and one thing a picture cannot
 * carry on its own - each frame asserts the thing it is evidence OF before shooting, so
 * a frame that shot the wrong state fails here instead of reaching the card.
 *
 * Fully stubbed: every /api/** call is answered in-browser via `seedGateAdminSession`'s
 * catch-all plus this file's own handlers, so nothing reaches SIT.
 *
 * ASCII-only source.
 */

import { expect, Page, test } from '@playwright/test';
import { seedGateAdminSession } from '../support/gate-admin-session';

const ASSETS = 'e2e-evidence/obrs-1727';

const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'OK', data }),
});

const VEHICLES = [
  { id: 3, numberPlate: '1 kx 1234', vehicleNumber: '12' },
  { id: 4, numberPlate: '2 kx 5678', vehicleNumber: '13' },
];

/** Three rows waiting on the owner - enough for the lane to render as a worklist. */
const PENDING_EXPENSES = [
  {
    id: 901, ownerId: 1, vehicleId: 3, category: 'FUEL', amount: 1200,
    expenseDate: '2026-09-13', note: 'Filled at Bangchak', source: 'FIELD',
    approvalStatus: 'PENDING',
  },
  {
    id: 902, ownerId: 1, vehicleId: 4, category: 'REPAIR', amount: 3000,
    expenseDate: '2026-09-13', note: 'Two front tyres', source: 'FIELD',
    approvalStatus: 'PENDING',
  },
  {
    id: 903, ownerId: 1, vehicleId: 3, category: 'DRIVER_WAGE', amount: 500,
    expenseDate: '2026-09-14', note: '', source: 'FIELD', approvalStatus: 'PENDING',
  },
];

/** The expense LOG - one FIELD row (uneditable, with its reason) and one MANUAL row. */
const EXPENSES = [
  {
    id: 801, ownerId: 1, vehicleId: 3, category: 'FUEL', amount: 1150,
    expenseDate: `${new Date().toISOString().slice(0, 8)}05`, source: 'FIELD',
    approvalStatus: 'APPROVED', note: 'Field cost, approved',
  },
  {
    id: 802, ownerId: 1, vehicleId: 4, category: 'STAFF_WAGE', amount: 9000,
    expenseDate: `${new Date().toISOString().slice(0, 8)}03`, source: 'MANUAL',
    approvalStatus: 'APPROVED', note: 'Monthly staff wage',
  },
];

const DRIVER_CASH_DAYS = [
  {
    dayId: 11, driverId: 5, driverName: 'Somchai', holderRole: 'DRIVER',
    businessDate: '2026-09-13', vehicleId: 3, vehiclePlate: '1 kx 1234', status: 'OPEN',
    expectedReturnAmount: '1015.00', returnedAmount: null, discrepancy: null,
    hasUnmappedSalesPointRemit: false,
  },
];

const DRIVER_CASH_DAY = {
  dayId: 11, driverId: 5, driverName: 'Somchai', holderRole: 'DRIVER',
  businessDate: '2026-09-14', vehicleId: 3, status: 'OPEN', entries: [],
  advanceTotal: '1000.00', perHeadTotal: '0.00', expensePaidTotal: '320.00',
  parcelRemitTotal: '0.00', parcelClawbackTotal: '0.00', expectedReturnAmount: '680.00',
  returnedAmount: null, returnedAt: null, returnedByUserId: null, returnedByName: null,
  discrepancy: null, discrepancyReason: null, perHeadRates: [], reopenCount: 0,
  reopens: [], hasUnmappedSalesPointRemit: false,
};

/** The salesperson's OWN box - the second totals row the panel keeps (AC-3). */
const MY_DAY = { ...DRIVER_CASH_DAY, dayId: 12, holderRole: 'SALESPERSON', driverName: 'Nisa', perHeadTotal: '240.00', expectedReturnAmount: '240.00' };

async function stubShared(page: Page): Promise<void> {
  const on = (match: (url: URL) => boolean, data: unknown) =>
    page.route(match, (route) => route.fulfill(ok(data)));

  await on((u) => u.pathname.endsWith('/private/vehicles'), VEHICLES);
  await on((u) => u.pathname.endsWith('/private/vehicle-types'), []);
  await on((u) => u.pathname.endsWith('/private/lookups'), []);
  await on((u) => u.pathname.endsWith('/private/owners'), []);
  await on((u) => u.pathname.endsWith('/private/expense-payees'), []);
  await on((u) => u.pathname.endsWith('/private/maintenance-parts'), []);
  await on((u) => u.pathname.endsWith('/private/expenses/pending'), PENDING_EXPENSES);
  await on((u) => u.pathname.endsWith('/private/expenses'), EXPENSES);
}

test.beforeEach(async ({ page }) => {
  // Thai, not the helper's default 'en': the labels AC-2 and owner ruling B decided are
  // Thai strings, and a frame in English would be evidence of a translation nobody ruled on.
  await seedGateAdminSession(page, {
    roles: ['owner'],
    username: 'owner@system.local',
    language: 'th',
  });
  await stubShared(page);
});

test('AC-1/AC-2 AFTER: the approval lane is the first thing on /admin/settlements', async ({ page }) => {
  await page.route(
    (u) => u.pathname.endsWith('/private/settlements/pending'),
    (route) => route.fulfill(ok({ range: { from: '2026-09-08', to: '2026-09-14', timezone: 'Asia/Bangkok' }, items: [] }))
  );
  await page.route((u) => u.pathname.endsWith('/private/driver-cash/days'), (route) =>
    route.fulfill(ok(DRIVER_CASH_DAYS))
  );

  await page.goto('/admin/settlements');

  const lane = page.locator('app-expense-approval-section app-expense-approval-lane');
  await expect(lane).toBeVisible({ timeout: 30_000 });
  // Every pending row reached the lane through the SAME mapper the log uses - a
  // resolved plate here is the proof the section carries its own vehicle labels.
  await expect(page.getByTestId('expense-approve-901')).toBeVisible();
  await expect(lane).toContainText('1 kx 1234');

  // Owner ruling A: FIRST on the page. Asserted as a document position, not by eye.
  const laneTop = await lane.boundingBox();
  const roundsTop = await page.locator('app-settlements-list').boundingBox();
  expect(laneTop!.y).toBeLessThan(roundsTop!.y);

  // AC-2: the page and its menu entry both say they cover the two jobs now.
  await expect(page.locator('.admin-topbar').first()).toContainText('เคลียร์ยอด-อนุมัติ');
  await expect(page.locator('app-admin-layout').first()).toContainText('เคลียร์ยอด-อนุมัติ');

  await page.screenshot({ path: `${ASSETS}/after-admin-settlements-approval-lane.png`, fullPage: true });
});

test('AC-4 AFTER: /admin/expenses keeps the form and the log, and no longer holds the lane', async ({ page }) => {
  await page.goto('/admin/expenses');

  await expect(page.locator('app-expense-list-table')).toBeVisible({ timeout: 30_000 });
  // The half that MOVED is not here any more...
  await expect(page.locator('app-expense-approval-lane')).toHaveCount(0);
  // ...and the half that stayed is intact: the add button, the envelope page button,
  // and the log with its edit/delete controls (AC-6, which needed no code change).
  await expect(page.getByTestId('expenses-open-batch')).toBeVisible();
  await expect(page.locator('app-expense-list-table')).toContainText('1 kx 1234');
  // Owner ruling B: the menu this page lives under is "คาใชจาย", which it already was -
  // measured on origin/dev, so the ruling cost no code. The frame is what says so.
  await expect(page.locator('app-admin-layout').first()).toContainText('ค่าใช้จ่าย');

  await page.screenshot({ path: `${ASSETS}/after-admin-expenses-menu.png`, fullPage: true });
});

/**
 * OBRS-1728 AC-4 rides this lane rather than opening a second one: it renames a button and a
 * menu entry on the page the frame above already shoots, and the two cards are stacked, so one
 * lane keeps the pair of AFTERs describing the same build.
 */
test('OBRS-1728 AFTER: the bill-batch entry point reads "บันทึกบิล", not "รับซองบิล"', async ({ page }) => {
  await page.goto('/admin/expenses');

  const openBatch = page.getByTestId('expenses-open-batch');
  await expect(openBatch).toBeVisible({ timeout: 30_000 });
  await expect(openBatch).toHaveText(/บันทึกบิล/);
  // The old name is gone from the whole shell, menu entry included - not merely from the button.
  await expect(page.locator('app-admin-layout').first()).not.toContainText('รับซองบิล');

  await page.screenshot({ path: `${ASSETS}/after-bill-batch-renamed.png`, fullPage: true });

  // ...and on the page the button opens, where the supporting copy had to stop saying
  // "ซอง"/"อู่" to agree with the new name (AC-2).
  await page.goto('/admin/expenses/batch');
  await expect(page.locator('app-expense-batch-page')).toBeVisible({ timeout: 30_000 });
  const shell = page.locator('app-admin-layout').first();
  // Every "ซอง" (envelope) on this page is gone — that is the half of AC-2 the owner's
  // reasoning settles outright: the name must not say how many bills there are.
  await expect(shell).not.toContainText('ซอง');
  // ⚠️ NOT `not.toContainText('อู่')`. The payee field keeps that word on purpose: the owner
  // ruled on 2026-08-24 that THIS screen's picker is garage-only, and the picker's code cites
  // that label as the reason (`expense-payee-picker.component.ts:108`). Reconciling that ruling
  // with OBRS-1728's "a bill need not come from a garage" is a question for the owner, raised on
  // the card rather than answered here — so the label stays as it is and this guard does not
  // pretend otherwise.
  await expect(shell).toContainText('อู่ซ่อมรถ');
  // The warning AC-2 says must survive the rewording.
  await expect(shell).toContainText('จะไม่มีใบไหนถูกบันทึกเลย');

  await page.screenshot({ path: `${ASSETS}/after-bill-batch-page-copy.png`, fullPage: true });
});

test('AC-3 AFTER: the salesperson cash panel is read-only - the button row is gone', async ({ page }) => {
  await page.route((u) => /\/private\/driver-cash\/schedules\/\d+\/day$/.test(u.pathname), (route) =>
    route.fulfill(ok(DRIVER_CASH_DAY))
  );
  await page.route((u) => u.pathname.endsWith('/private/driver-cash/my-day'), (route) =>
    route.fulfill(ok(MY_DAY))
  );
  await page.route((u) => /\/private\/schedules\/\d+$/.test(u.pathname), (route) =>
    route.fulfill(ok({ id: 77, departureDateTime: '2026-09-14T07:30:00+07:00' }))
  );
  await page.route((u) => u.pathname.endsWith('/boarding-list'), (route) =>
    route.fulfill(ok({ scheduleId: 77, passengers: [] }))
  );

  await page.addInitScript(() => {
    localStorage.setItem('auth_roles', JSON.stringify(['salesperson']));
    localStorage.setItem('auth_username', 'salesperson@system.local');
  });

  await page.goto('/staff/boarding/77');

  const panel = page.getByTestId('driver-cash-panel');
  await expect(panel).toBeVisible({ timeout: 30_000 });

  // The whole point of D2: not one of the four entry buttons is left.
  await expect(panel.locator('.dcp-actions')).toHaveCount(0);
  for (const testId of [
    'driver-cash-action-advance',
    'driver-cash-action-per-head',
    'driver-cash-action-expense',
    'driver-cash-action-repair',
  ]) {
    await expect(panel.getByTestId(testId)).toHaveCount(0);
  }

  // And what the card said must STAY has stayed: both totals boxes.
  await expect(panel.locator('app-driver-cash-day-summary')).toBeVisible();
  await expect(page.getByTestId('driver-cash-my-day')).toBeVisible();
  await expect(page.getByTestId('driver-cash-context-net')).toBeVisible();

  await page.screenshot({ path: `${ASSETS}/after-staff-cash-panel-readonly.png`, fullPage: true });
});
