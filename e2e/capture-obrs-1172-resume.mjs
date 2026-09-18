/**
 * OBRS-1172 QA setup, resumed — the ScheduleSet (route chonburi_bangkok/van, WEEKLY,
 * 2026-09-15..2026-10-06) already exists in obrs1172qa (DB id=1, measured via psql), so
 * this just generates its trips and captures the AFTER screenshots for items 2 and 3.
 *
 * node e2e/obrs-1172-resume.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'http://localhost:4517';
const OUT = path.resolve('e2e-evidence/obrs-1172');
const EMAIL = 'owner@system.local';
const PASSWORD = process.env.OBRS_1172_PASSWORD;

if (!PASSWORD) {
  throw new Error('OBRS_1172_PASSWORD is not set.');
}

async function login(page) {
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

  const rowCount = await page.locator('table.admin-table tbody tr').count();
  console.log(`[resume] schedule_set rows visible: ${rowCount}`);

  const row = page.locator('table.admin-table tbody tr').first();
  await row.waitFor({ state: 'visible', timeout: 15_000 });
  const rowText = await row.textContent();
  console.log(`[resume] row text: ${rowText?.replace(/\s+/g, ' ').trim()}`);

  await row.locator('.admin-icon-btn[aria-label="สร้างเที่ยวรถ"]').click();
  await dismissAlert(page);
  await page.reload({ waitUntil: 'networkidle' });
  console.log('[resume] generate-schedules clicked');

  // ── item 2 ──
  await page.locator('.schedule-extend-window-btn').waitFor({ state: 'visible', timeout: 15_000 });
  await page.screenshot({ path: path.join(OUT, 'OBRS-1172-AFTER-schedules-toolbar.png') });
  const extendBtnCountOnSetTab = await page.locator('.schedule-extend-window-btn').count();
  const extendBtnText = (await page.locator('.schedule-extend-window-btn span:last-child').textContent())?.trim();
  console.log(`[item2] extend button count on 'set' tab: ${extendBtnCountOnSetTab}, text: "${extendBtnText}"`);

  // ── item 3 ──
  await page.locator('.schedule-tab', { hasText: 'เที่ยวรถ' }).click();
  await page.waitForTimeout(500);
  const extendBtnCountOnTripTab = await page.locator('.schedule-extend-window-btn').count();
  console.log(`[item3] extend button count on trips tab: ${extendBtnCountOnTripTab}`);
  await page.screenshot({ path: path.join(OUT, 'OBRS-1172-item3-trips-tab-no-button.png') });

  await browser.close();
  console.log('[resume] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
