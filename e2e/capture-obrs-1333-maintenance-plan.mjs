/**
 * OBRS-1333 QA evidence -- preventive maintenance plans per part.
 *
 * Verified against a LOCAL backend (obrs1333qa Postgres DB, seeded by
 * scripts/new-local-db.ps1 + a QA fixture script), NOT SIT -- this branch has
 * not been deployed. UI language is Thai (this office's default) -- selectors
 * below use the Thai strings from public/i18n/th.json. Run with the local dev
 * servers already up:
 *
 *   OBRS_BASE_URL=http://localhost:4200 node e2e/capture-obrs-1333-maintenance-plan.mjs
 *
 * Screens captured (all under e2e/out/obrs-1333):
 *   0-plans-list.png       owner dashboard, vehicle 16-9310, plan list populated
 *   1-part-dropdown.png    Add-plan modal, part dropdown open, all 13 parts visible
 *   2-interval-error.png   cross-field "at least one interval" error under BOTH fields
 *   3-inactive-badge.png   vehicle 1 list showing a deactivated plan's "ปิดใช้งาน" badge
 *   4-owner-inbox.png      owner's notification bell panel, plan-due reminder
 *   5-driver-inbox.png     driver2's notification bell panel, same plan-due reminder
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e/out/obrs-1333');
const PASSWORD = process.env.OBRS_QA_PASSWORD ?? 'QaLocal!2026';

const TH = {
  managePlans: 'จัดการแผนบำรุงรักษา',
  addPlan: 'เพิ่มแผนบำรุงรักษา',
  save: 'บันทึก',
  intervalError: 'ต้องกรอกรอบระยะ (กม.) หรือรอบวันอย่างน้อย 1 อย่าง',
  inactiveBadge: 'ปิดใช้งาน',
};

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45000 });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = {};

  // ---- Owner: plans list, add modal, dropdown, cross-field error ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await login(page, 'owner@system.local');

    await page.goto(`${BASE}/admin/vehicles`, { waitUntil: 'networkidle' });
    const row2 = page.locator('table.admin-table tbody tr', { hasText: '16-9310' });
    await row2.getByRole('button', { name: TH.managePlans }).click();
    await page.waitForSelector('app-vehicle-maintenance-plan-panel table.admin-table', { timeout: 15000 });
    await page.screenshot({ path: path.join(OUT, '0-plans-list.png'), fullPage: true });
    console.log('captured 0-plans-list.png');

    await page.getByRole('button', { name: TH.addPlan }).click();
    await page.waitForSelector('.admin-modal', { timeout: 10000 });
    await page.locator('.admin-modal .admin-dropdown-trigger').click();
    await page.waitForTimeout(300);
    const openCount = await page.locator('.admin-modal .admin-dropdown-menu .admin-dropdown-option').count();
    results.partDropdownOptionCount = openCount;
    console.log('part dropdown open item count (expect 14 = placeholder + 13 parts):', openCount);
    await page.screenshot({ path: path.join(OUT, '1-part-dropdown.png'), fullPage: true });
    console.log('captured 1-part-dropdown.png');

    // Pick a real part (skip the placeholder row), then submit with BOTH intervals
    // blank to trigger the cross-field error.
    await page.locator('.admin-modal .admin-dropdown-menu .admin-dropdown-option').nth(1).click();
    await page.getByRole('button', { name: TH.save, exact: true }).click();
    await page.waitForTimeout(400);
    // The invalid-submit path also fires a blocking SweetAlert toast (ADMIN.VALIDATION.FORM_INVALID)
    // that visually covers the per-field error text -- dismiss it so the screenshot shows the real
    // evidence (the red text under both interval fields), not the generic toast on top of it.
    await page.getByRole('button', { name: 'OK' }).click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(200);
    const errorCount = await page.locator('.admin-modal .admin-error', { hasText: TH.intervalError }).count();
    results.intervalErrorNodeCount = errorCount;
    console.log('cross-field error node count (expect 2, under both fields):', errorCount);
    await page.screenshot({ path: path.join(OUT, '2-interval-error.png'), fullPage: true });
    console.log('captured 2-interval-error.png');
    await page.locator('.admin-modal button:has-text("ยกเลิก")').click().catch(() => {});

    // ---- Vehicle 1: deactivated plan badge ----
    await page.goto(`${BASE}/admin/vehicles`, { waitUntil: 'networkidle' });
    const row1 = page.locator('table.admin-table tbody tr', { hasText: 'กข 1234' });
    await row1.getByRole('button', { name: TH.managePlans }).click();
    await page.waitForSelector('app-vehicle-maintenance-plan-panel table.admin-table', { timeout: 15000 });
    const inactiveBadgeCount = await page.locator('app-vehicle-maintenance-plan-panel .admin-status.is-neutral', { hasText: TH.inactiveBadge }).count();
    results.inactiveBadgeCount = inactiveBadgeCount;
    console.log('inactive badge count (expect >=1):', inactiveBadgeCount);
    await page.screenshot({ path: path.join(OUT, '3-inactive-badge.png'), fullPage: true });
    console.log('captured 3-inactive-badge.png');

    // ---- Owner inbox ----
    await page.goto(`${BASE}/admin/vehicles`, { waitUntil: 'networkidle' });
    await page.locator('.notification-bell-trigger').click();
    await page.waitForTimeout(600);
    const ownerHasPlanDue = await page.locator('text=BRAKE_PADS').count();
    results.ownerInboxPlanDueCount = ownerHasPlanDue;
    console.log('owner inbox rows mentioning BRAKE_PADS plan-due (expect >=1):', ownerHasPlanDue);
    await page.screenshot({ path: path.join(OUT, '4-owner-inbox.png') });
    console.log('captured 4-owner-inbox.png');

    await ctx.close();
  }

  // ---- Driver2: inbox showing the same plan-due reminder ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await login(page, 'driver2@system.local');
    await page.goto(`${BASE}/staff/driver`, { waitUntil: 'networkidle' });
    await page.locator('.notification-bell-trigger').click();
    await page.waitForTimeout(600);
    const driverHasPlanDue = await page.locator('text=BRAKE_PADS').count();
    results.driverInboxPlanDueCount = driverHasPlanDue;
    console.log('driver2 inbox rows mentioning BRAKE_PADS plan-due (expect >=1):', driverHasPlanDue);
    await page.screenshot({ path: path.join(OUT, '5-driver-inbox.png') });
    console.log('captured 5-driver-inbox.png');
    await ctx.close();
  }

  await browser.close();
  console.log('RESULTS_JSON:', JSON.stringify(results));
  console.log('DONE');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
