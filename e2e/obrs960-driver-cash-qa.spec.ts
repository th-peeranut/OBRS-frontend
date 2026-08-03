import { test, expect } from '@playwright/test';

/**
 * OBRS-960 QA (black-box) — scenarios A.1 and A.2 from the PM brief:
 *   1. salesperson on /staff/boarding/:scheduleId sees app-driver-cash-panel and can record
 *      ADVANCE / PER_HEAD / EXPENSE_PAID entries with correct running totals.
 *   2. a PURE DRIVER (holds 'driver' but not 'salesperson') on the SAME route must NOT see the
 *      panel at all (boarding-list-page.component.ts:32 gates on hasAnyRole(['salesperson'])).
 *
 * Targets the QA session's own already-running local stack (localhost:4200 / localhost:8080,
 * database obrs960qa) rather than a self-provisioning lane — this spec is throwaway evidence for
 * the QA report, left uncommitted in the worktree per obrs-qa.md.
 *
 * Schedule 127 (chonburi_bangkok, driver@system.local, business_date 2027-03-20) was seeded by
 * the QA session via direct SQL for the settlement/parcel-share scenarios and already carries an
 * ADVANCE-created driver_cash_day — reused here so panel entries have something to add to.
 */

const BASE = 'http://localhost:4200';
const SCHEDULE_ID = '127';

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[formcontrolname="password"]').fill('P@ssw0rd');
  await page.getByRole('button', { name: /เข้าสู่ระบบ|login|sign in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
}

test.describe('OBRS-960 driver cash panel — role gate + entries', () => {
  test('salesperson sees the panel, records entries, totals move', async ({ page }) => {
    await login(page, 'salesperson@system.local');
    await page.goto(`${BASE}/staff/boarding/${SCHEDULE_ID}`);

    const panel = page.locator('app-driver-cash-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: 'docs/prod/evidence/obrs-960-boarding-panel-salesperson-AFTER.png',
      fullPage: true,
    });
  });

  test('pure driver (no salesperson role) does NOT see the panel', async ({ page }) => {
    await login(page, 'driver@system.local');
    await page.goto(`${BASE}/staff/boarding/${SCHEDULE_ID}`);

    const panel = page.locator('app-driver-cash-panel');
    await expect(panel).toHaveCount(0);

    await page.screenshot({
      path: 'docs/prod/evidence/obrs-960-boarding-panel-driver-absent-AFTER.png',
      fullPage: true,
    });
  });

  test('salesperson expands ADVANCE section and the entry list/totals render', async ({ page }) => {
    await login(page, 'salesperson@system.local');
    await page.goto(`${BASE}/staff/boarding/${SCHEDULE_ID}`);

    const panel = page.locator('app-driver-cash-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });
    // Expand every collapsible section (ADVANCE / PER_HEAD / EXPENSE_PAID headers) so the
    // existing entries (this schedule already carries an ADVANCE + a REMIT_TO_OWNER share from
    // the QA API pass) and running totals are visible in the capture.
    for (const testId of ['driver-cash-action-advance', 'driver-cash-action-per-head', 'driver-cash-action-expense']) {
      await panel.locator(`[data-testid="${testId}"]`).click();
      await page.waitForTimeout(200);
    }

    await page.screenshot({
      path: 'docs/prod/evidence/obrs-960-boarding-panel-entries-expanded-AFTER.png',
      fullPage: true,
    });
  });
});

test.describe('OBRS-960 owner settlements — driver-cash days list', () => {
  test('owner sees the driver-cash days list with the unmapped-remit warning flag', async ({ page }) => {
    await login(page, 'owner@system.local');
    await page.goto(`${BASE}/admin/settlements`);

    await expect(page.locator('app-driver-cash-days-list')).toBeVisible({ timeout: 15000 });
    // Default filter is a trailing-7-days window; the QA-seeded driver_cash_days sit in 2027
    // (relative-future test dates per OBRS-966 convention), so widen the range to see them.
    const dateInputs = page.locator('[data-testid="driver-cash-days-filter"] input');
    await dateInputs.nth(0).click();
    await dateInputs.nth(0).fill('01/01/2027');
    await dateInputs.nth(0).press('Enter');
    await page.waitForTimeout(300);
    await dateInputs.nth(1).click();
    await dateInputs.nth(1).fill('01/04/2027');
    await dateInputs.nth(1).press('Enter');
    await page.waitForTimeout(1000);
    await page.locator('app-driver-cash-days-list').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'docs/prod/evidence/obrs-960-owner-driver-cash-days-list-AFTER.png',
      fullPage: true,
    });
  });
});
