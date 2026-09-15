/**
 * OBRS-1172 QA setup — creates the ONE weekly ScheduleSet the manual test plan needs
 * (route chonburi_bangkok, vehicleType van, WEEKLY, anchored on a Tuesday since today
 * 2026-09-15 IS a Tuesday — item 6's precondition), generates its trips, and captures
 * the AFTER screenshots for items 2 and 3.
 *
 * node e2e/obrs-1172-setup.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'http://localhost:4517';
const OUT = path.resolve('e2e-evidence/obrs-1172');
const EMAIL = 'owner@system.local';
const PASSWORD = process.env.OBRS_1172_PASSWORD;

if (!PASSWORD) {
  throw new Error('OBRS_1172_PASSWORD is not set — refusing to hardcode the local seed password here.');
}

async function login(page) {
  // Thai — item 2's exact-text check ("ขยายตารางเดินรถอีกหนึ่งช่วง") and the manual test
  // plan's tab names ("ชุดตาราง" / "เที่ยวรถ") are Thai strings; frequencyOptions' Daily/
  // Weekly/Monthly labels are hardcoded English regardless of locale (component source).
  await page.addInitScript(() => localStorage.setItem('app_language', 'th'));
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
}

async function dismissAlert(page) {
  const overlay = page.locator('.swal2-container');
  const appeared = await overlay.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
  if (!appeared) return;
  await overlay.locator('.swal2-confirm').click({ timeout: 5_000 }).catch(() => undefined);
  await overlay.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();

  await login(page);
  await page.goto(`${BASE}/admin/schedules`, { waitUntil: 'networkidle' });

  // ── Create the WEEKLY schedule set: 2026-09-15 (Tue) .. 2026-10-06 (Tue) ──
  await page.locator('.admin-page-intro .admin-btn-primary').click();
  await page.locator('.admin-modal').waitFor({ state: 'visible' });

  await page.locator('.admin-modal input[formControlName="startDate"]').fill('2026-09-15');
  await page.locator('.admin-modal input[formControlName="startDate"]').press('Tab');
  await page.locator('.admin-modal input[formControlName="endDate"]').fill('2026-10-06');
  await page.locator('.admin-modal input[formControlName="endDate"]').press('Tab');
  await page.locator('.admin-modal textarea[formControlName="departureTimesText"]').fill('08:00');

  const dd = page.locator('.admin-modal .admin-form-grid app-admin-dropdown');

  // frequency (0): Weekly
  await dd.nth(0).locator('.admin-dropdown-trigger').click();
  const weeklyOpt = dd.nth(0).locator('.admin-dropdown-option', { hasText: 'Weekly' });
  await weeklyOpt.waitFor({ state: 'visible', timeout: 60_000 });
  await weeklyOpt.click();

  // route (1): first option — record its label for the collision-set step later
  await dd.nth(1).locator('.admin-dropdown-trigger').click();
  const routeOpt = dd.nth(1).locator('.admin-dropdown-option').first();
  await routeOpt.waitFor({ state: 'visible', timeout: 60_000 });
  const routeLabel = (await routeOpt.textContent())?.trim();
  await routeOpt.click();

  // vehicleType (2): first option — record its label
  await dd.nth(2).locator('.admin-dropdown-trigger').click();
  const vtOpt = dd.nth(2).locator('.admin-dropdown-option').first();
  await vtOpt.waitFor({ state: 'visible', timeout: 60_000 });
  const vtLabel = (await vtOpt.textContent())?.trim();
  await vtOpt.click();

  // status (3): first option
  await dd.nth(3).locator('.admin-dropdown-trigger').click();
  const statusOpt = dd.nth(3).locator('.admin-dropdown-option').first();
  await statusOpt.waitFor({ state: 'visible', timeout: 60_000 });
  await statusOpt.click();

  await page.locator('.admin-modal .admin-modal-actions .admin-btn-primary').click();
  await dismissAlert(page);
  await page.reload({ waitUntil: 'networkidle' });

  console.log(`[setup] created schedule set — route="${routeLabel}" vehicleType="${vtLabel}"`);

  // Find its row and generate schedules (bolt icon). The DB started with 0 schedule_set
  // rows (measured), so this is a fresh DB's only row — the table's date column is
  // locale-formatted (Thai/Buddhist calendar), not ISO, so match by row count instead.
  const row = page.locator('table.admin-table tbody tr').first();
  await row.waitFor({ state: 'visible', timeout: 15_000 });
  const rowCount = await page.locator('table.admin-table tbody tr').count();
  console.log(`[setup] schedule_set rows after create: ${rowCount}`);
  await row.locator('.admin-icon-btn[aria-label="สร้างเที่ยวรถ"]').click();
  await dismissAlert(page);
  await page.reload({ waitUntil: 'networkidle' });
  console.log('[setup] generated schedules for the new set');

  // ── item 2: AFTER screenshot — button present, in the same toolbar as Add ──
  await page.locator('.schedule-extend-window-btn').waitFor({ state: 'visible', timeout: 15_000 });
  await page.screenshot({ path: path.join(OUT, 'OBRS-1172-AFTER-schedules-toolbar.png') });
  const extendBtnCountOnSetTab = await page.locator('.schedule-extend-window-btn').count();
  console.log(`[item2] extend button count on 'set' tab: ${extendBtnCountOnSetTab}`);
  const extendBtnText = (await page.locator('.schedule-extend-window-btn span:last-child').textContent())?.trim();
  console.log(`[item2] extend button text: "${extendBtnText}"`);

  // ── item 3: switch to trips tab, assert 0 extend buttons ──
  await page.locator('.schedule-tab', { hasText: 'เที่ยวรถ' }).click();
  await page.waitForTimeout(500);
  const extendBtnCountOnTripTab = await page.locator('.schedule-extend-window-btn').count();
  console.log(`[item3] extend button count on 'schedule/trips' tab: ${extendBtnCountOnTripTab}`);
  await page.screenshot({ path: path.join(OUT, 'OBRS-1172-item3-trips-tab-no-button.png') });

  await browser.close();
  console.log('[setup] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
