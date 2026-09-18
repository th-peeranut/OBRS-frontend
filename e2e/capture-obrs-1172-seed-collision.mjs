/**
 * OBRS-1172 item 8 setup — pre-creates the exact trip (route chonburi_bangkok,
 * 2026-11-17 08:00) that the NEXT extend press will try to generate for its own
 * (van-shaped) lineage, using a DIFFERENT vehicleType (minibus) so this manual set is
 * a different ShapeKey and does not itself become a "winner" in the window
 * calculation — but generateSchedulesFromScheduleSetId's existsByRouteIdAndDepartureDateTime
 * check is keyed on (route_id, departure_date_time) only, regardless of vehicle type, so
 * the upcoming press's copy will find this date already taken and skip it: setsExtended=1,
 * schedulesCreated=0, a REAL (not stubbed) reproduction of the "every trip already existed"
 * case.
 *
 * node e2e/obrs-1172-seed-collision.mjs
 */
import { chromium } from '@playwright/test';
const BASE = 'http://localhost:4517';
const EMAIL = 'owner@system.local';
const PASSWORD = process.env.OBRS_1172_PASSWORD;
if (!PASSWORD) throw new Error('OBRS_1172_PASSWORD is not set.');

async function dismissAlert(page) {
  const overlay = page.locator('.swal2-container');
  const appeared = await overlay.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
  if (!appeared) return;
  await overlay.locator('.swal2-confirm').click({ timeout: 5_000 }).catch(() => undefined);
  await overlay.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
}

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();

  await page.addInitScript(() => localStorage.setItem('app_language', 'th'));
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });

  await page.goto(`${BASE}/admin/schedules`, { waitUntil: 'networkidle' });
  await page.locator('.admin-page-intro .admin-btn-primary').click();
  await page.locator('.admin-modal').waitFor({ state: 'visible' });

  await page.locator('.admin-modal input[formControlName="startDate"]').fill('2026-11-17');
  await page.locator('.admin-modal input[formControlName="startDate"]').press('Tab');
  await page.locator('.admin-modal input[formControlName="endDate"]').fill('2026-11-17');
  await page.locator('.admin-modal input[formControlName="endDate"]').press('Tab');
  await page.locator('.admin-modal textarea[formControlName="departureTimesText"]').fill('08:00');

  const dd = page.locator('.admin-modal .admin-form-grid app-admin-dropdown');

  // frequency: Weekly (matches the shape the real lineage uses; irrelevant to the
  // existsByRouteIdAndDepartureDateTime collision itself, kept for consistency)
  await dd.nth(0).locator('.admin-dropdown-trigger').click();
  await dd.nth(0).locator('.admin-dropdown-option', { hasText: 'Weekly' }).click();

  // route: SAME first option as the main lineage (chonburi_bangkok)
  await dd.nth(1).locator('.admin-dropdown-trigger').click();
  const routeOpt = dd.nth(1).locator('.admin-dropdown-option').first();
  const routeLabel = (await routeOpt.textContent())?.trim();
  await routeOpt.click();

  // vehicleType: SECOND option (minibus) — deliberately different from the main
  // lineage's van, so this does not become a "winner" for that shape.
  await dd.nth(2).locator('.admin-dropdown-trigger').click();
  const vtOpt = dd.nth(2).locator('.admin-dropdown-option').nth(1);
  const vtLabel = (await vtOpt.textContent())?.trim();
  await vtOpt.click();

  await dd.nth(3).locator('.admin-dropdown-trigger').click();
  await dd.nth(3).locator('.admin-dropdown-option').first().click();

  await page.locator('.admin-modal .admin-modal-actions .admin-btn-primary').click();
  await dismissAlert(page);
  await page.reload({ waitUntil: 'networkidle' });
  console.log(`[seed] created collision set — route="${routeLabel}" vehicleType="${vtLabel}" 2026-11-17`);

  // #SET-4 by DB fact (MAX(id) was 3 immediately before this run, measured via psql).
  const row = page.locator('table.admin-table tbody tr', { hasText: '#SET-4' });
  await row.waitFor({ state: 'visible', timeout: 15_000 });
  await row.locator('.admin-icon-btn[aria-label="สร้างเที่ยวรถ"]').click();
  await dismissAlert(page);
  console.log('[seed] generated the collision trip');

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
