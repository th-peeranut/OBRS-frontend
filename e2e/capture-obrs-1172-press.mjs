/**
 * OBRS-1172 — one generic "press the extend button, confirm, wait for the REAL
 * result (success/info/error icon, not the loading state), screenshot + print it"
 * step. Reused for item 5 (plain success), item 8 (schedulesCreated===0 -> info,
 * distinct wording) and item 9 (ALREADY_COVERED -> info, not a red error).
 *
 * node e2e/obrs-1172-press.mjs <label-for-screenshot-filename>
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'http://localhost:4517';
const OUT = path.resolve('e2e-evidence/obrs-1172');
const EMAIL = 'owner@system.local';
const PASSWORD = process.env.OBRS_1172_PASSWORD;
const LABEL = process.argv[2];

if (!PASSWORD) throw new Error('OBRS_1172_PASSWORD is not set.');
if (!LABEL) throw new Error('usage: node e2e/obrs-1172-press.mjs <label>');

async function main() {
  await mkdir(OUT, { recursive: true });
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
  await page.locator('.schedule-extend-window-btn').click();
  await page.locator('.swal2-container').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('.swal2-confirm').click();

  // Wait for the LOADING popup to be gone, i.e. the icon-bearing result popup —
  // polling the icon element directly rather than container visibility, since the
  // container can stay continuously visible across loading -> result.
  await page.waitForSelector('.swal2-icon.swal2-success, .swal2-icon.swal2-info, .swal2-icon.swal2-error', {
    timeout: 30_000,
    state: 'visible',
  });
  await page.waitForTimeout(200);

  const iconClass = await page.locator('.swal2-icon').first().getAttribute('class');
  const titleText = (await page.locator('.swal2-title').textContent())?.trim();
  const htmlText = (await page.locator('.swal2-html-container').textContent().catch(() => ''))?.trim();
  console.log(`[press:${LABEL}] icon class: "${iconClass}"`);
  console.log(`[press:${LABEL}] title: "${titleText}"`);
  console.log(`[press:${LABEL}] body: "${htmlText}"`);
  await page.screenshot({ path: path.join(OUT, `OBRS-1172-AFTER-${LABEL}.png`) });

  await page.locator('.swal2-confirm').click({ timeout: 5_000 }).catch(() => undefined);
  await page.locator('.swal2-container').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
