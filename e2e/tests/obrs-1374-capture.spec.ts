/**
 * OBRS-1374 — the CAPTURE lane for AC-11 evidence.
 *
 *   npx playwright test --config=playwright.obrs1374capture.config.ts
 *
 * Served with the DEFAULT configuration, so `apiUrl` points at http://localhost:8080
 * where nothing is listening and every request is either fulfilled here or fails as a
 * network error. Nothing reaches SIT and no database is involved.
 *
 * What the pictures have to show, per AC-11:
 *   1. the LIST rendering a four-line repair bill as ONE row (AC-1 — the whole reason
 *      this card exists rather than the split-into-N-rows design it rejected);
 *   2. the FORM with those four lines in it, one of them with no part at all (AC-3),
 *      and the running total agreeing with the bill (AC-9);
 *   3. the mismatch warning firing BEFORE save when a line is edited so the lines no
 *      longer add up (AC-5) — the state the owner must never be able to submit.
 *
 * The lines' AMOUNTS being enforced server-side is proved by ExpenseServiceTest, not
 * here: this lane stubs the API, so it can only photograph the screen.
 */

import { test, expect, Page } from '@playwright/test';
import { expectNoEscapedGateCalls, seedGateAdminSession } from '../support/gate-admin-session';

const ASSETS = 'e2e-evidence/obrs-1374';

/**
 * OBRS-1626: /admin/expenses now opens filtered to the CURRENT month, so a stub
 * row dated in a fixed month falls outside the default filter as soon as that
 * month passes and this capture photographs an empty table. The dates below are
 * built from today's month for that reason - do not pin them back.
 */
const CAPTURE_MONTH = (() => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
})();

/** One four-line repair bill: three parts plus a labour line that has no part (AC-3). */
const FOUR_LINE_BILL = {
  id: 4001,
  ownerId: 7,
  vehicleId: 1,
  category: 'REPAIR',
  categoryOtherLabel: null,
  amount: 3100,
  vatAmount: 217,
  expenseDate: `${CAPTURE_MONTH}-20`,
  receiptNo: 'RC-8842',
  paidBy: 'อู่ช่างเล็ก',
  note: 'เข้าอู่หลังวิ่งรอบบ่าย',
  source: 'MANUAL',
  approvalStatus: 'APPROVED',
  items: [
    { id: 1, lineNo: 1, part: 'BRAKE_PADS', description: 'ผ้าเบรกหน้า', quantity: 2, unitPrice: 600, amount: 1200 },
    { id: 2, lineNo: 2, part: 'BRAKE_FLUID', description: 'น้ำมันเบรก DOT4', quantity: 1, unitPrice: 400, amount: 400 },
    { id: 3, lineNo: 3, part: 'ENGINE_OIL', description: 'น้ำมันเครื่อง 5W-30', quantity: 6, unitPrice: 150, amount: 900 },
    { id: 4, lineNo: 4, part: null, description: 'ค่าแรงช่าง', quantity: null, unitPrice: null, amount: 600 },
  ],
};

/** A second, ordinary bill with NO breakdown — AC-4's "the child table stays optional". */
const PLAIN_BILL = {
  id: 4002,
  ownerId: 7,
  vehicleId: 1,
  category: 'FUEL',
  categoryOtherLabel: null,
  amount: 1800,
  vatAmount: null,
  expenseDate: `${CAPTURE_MONTH}-19`,
  receiptNo: null,
  paidBy: 'เงินสดหน้าปั๊ม',
  note: null,
  source: 'MANUAL',
  approvalStatus: 'APPROVED',
  items: [],
};

const VEHICLE = { id: 1, vehicleNumber: 'V1', numberPlate: '30-0001 ชลบุรี' };

const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'OK', data }),
});

async function stubExpensesScreen(page: Page): Promise<void> {
  // Narrower stubs are registered AFTER the shell's catch-all on purpose — Playwright
  // matches routes in reverse registration order (see gate-admin-session's header).
  await page.route('**/private/vehicles', (route) => route.fulfill(ok([VEHICLE])));
  await page.route('**/private/vehicle-types', (route) => route.fulfill(ok([])));
  await page.route('**/private/lookups**', (route) => route.fulfill(ok([])));
  await page.route('**/private/owners', (route) => route.fulfill(ok([])));
  await page.route('**/private/expenses/pending', (route) => route.fulfill(ok([])));
  await page.route(
    (url) => url.pathname.endsWith('/private/expenses'),
    (route) => route.fulfill(ok([FOUR_LINE_BILL, PLAIN_BILL]))
  );
}

async function openExpenses(page: Page): Promise<void> {
  await page.goto('/admin/expenses', { waitUntil: 'domcontentloaded' });
  await page.locator('app-expense-list-table').waitFor({ state: 'visible', timeout: 30_000 });
  await expect(page.getByText('RC-8842')).toBeVisible();
}

test.describe('OBRS-1374 — bill lines', () => {
  test.beforeEach(async ({ page }) => {
    await seedGateAdminSession(page, { roles: ['owner'], language: 'th' });
    await stubExpensesScreen(page);
  });

  test('AFTER: a four-line bill is one row in the list, four lines in the form', async ({ page }) => {
    await openExpenses(page);

    // AC-1 / AC-11 picture 1: the bill the owner broke into four lines is still ONE row,
    // carrying the ONE total (3,100.00). The FUEL bill below it has no breakdown at all.
    const rows = page.locator('app-expense-list-table tbody tr');
    await expect(rows).toHaveCount(2);
    await page.screenshot({ path: `${ASSETS}/OBRS-1374-AFTER-1-list-one-row-per-bill.png`, fullPage: true });

    // Open that bill for edit.
    await page.locator('app-expense-list-table tbody tr').first().getByRole('button').first().click();
    await page.locator('[data-testid="expense-items"]').waitFor({ state: 'visible', timeout: 15_000 });

    // AC-11 picture 2: four line rows, the fourth on "not a part" (AC-3), and the running
    // total under them reading 3,100.00 with no warning (AC-9).
    await expect(page.locator('[data-testid^="expense-item-row-"]')).toHaveCount(4);
    await expect(page.locator('[data-testid="expense-items-total"]')).toContainText('3,100.00');
    await expect(page.locator('[data-testid="expense-items-mismatch"]')).toHaveCount(0);
    await page.screenshot({ path: `${ASSETS}/OBRS-1374-AFTER-2-form-four-lines.png`, fullPage: true });

    // AC-5 / AC-11 picture 3: change one line so the lines no longer add up, and the
    // warning appears BEFORE anything is saved.
    await page.locator('[data-testid="expense-item-row-0"] input[type="number"]').last().fill('1250');
    await expect(page.locator('[data-testid="expense-items-total"]')).toContainText('3,150.00');
    await expect(page.locator('[data-testid="expense-items-mismatch"]')).toBeVisible();
    await page.screenshot({ path: `${ASSETS}/OBRS-1374-AFTER-3-mismatch-warning.png`, fullPage: true });

    await expectNoEscapedGateCalls(page);
  });
});
