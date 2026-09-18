/**
 * OBRS-1172 — item 4 (confirm dialog + cancel = no request), item 10 (button/overlay
 * disabled while the request is in flight) and the first successful extend (item 5's
 * on-screen numbers, cross-checked against the DB separately via psql). Records a
 * webm video of the whole press-to-result flow (Playwright's bundled ffmpeg is
 * webm-only).
 *
 * node e2e/obrs-1172-extend1.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir, rename, readdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'http://localhost:4517';
const OUT = path.resolve('e2e-evidence/obrs-1172');
const VIDEO_DIR = path.join(OUT, '_video');
const EMAIL = 'owner@system.local';
const PASSWORD = process.env.OBRS_1172_PASSWORD;

if (!PASSWORD) throw new Error('OBRS_1172_PASSWORD is not set.');

async function dismissAlert(page) {
  const overlay = page.locator('.swal2-container');
  const appeared = await overlay.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
  if (!appeared) return false;
  await overlay.locator('.swal2-confirm').click({ timeout: 5_000 }).catch(() => undefined);
  await overlay.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
  return true;
}

async function main() {
  await mkdir(VIDEO_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1600, height: 1000 } },
  });
  const page = await context.newPage();

  let extendCallCount = 0;
  page.on('request', (req) => {
    if (req.url().includes('/private/schedule-set/extend') && req.method() === 'POST') {
      extendCallCount += 1;
      console.log(`[network] POST /schedule-set/extend fired (#${extendCallCount})`);
    }
  });

  await page.addInitScript(() => localStorage.setItem('app_language', 'th'));
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });

  await page.goto(`${BASE}/admin/schedules`, { waitUntil: 'networkidle' });
  const rowCountBefore = await page.locator('table.admin-table tbody tr').count();
  console.log(`[pre] schedule_set row count: ${rowCountBefore}`);

  // ── item 4: click, confirm dialog appears, Cancel -> no request, count unchanged ──
  await page.locator('.schedule-extend-window-btn').click();
  await page.locator('.swal2-container').waitFor({ state: 'visible', timeout: 10_000 });
  await page.screenshot({ path: path.join(OUT, 'OBRS-1172-AFTER-confirm-dialog.png') });
  const dialogTitle = (await page.locator('.swal2-title').textContent())?.trim();
  const confirmBtnText = (await page.locator('.swal2-confirm').textContent())?.trim();
  const cancelBtnText = (await page.locator('.swal2-cancel').textContent())?.trim();
  console.log(`[item4] dialog title: "${dialogTitle}", confirm btn: "${confirmBtnText}", cancel btn: "${cancelBtnText}"`);

  await page.locator('.swal2-cancel').click();
  await page.locator('.swal2-container').waitFor({ state: 'detached', timeout: 10_000 });
  await page.waitForTimeout(500);
  console.log(`[item4] extend POST count after Cancel: ${extendCallCount} (expect 0)`);
  const rowCountAfterCancel = await page.locator('table.admin-table tbody tr').count();
  console.log(`[item4] schedule_set row count after Cancel: ${rowCountAfterCancel} (expect ${rowCountBefore})`);

  // ── item 10: delay the real request artificially (test-side route interception,
  //    not an app change) so the disabled/loading state is actually observable ──
  await page.route('**/api/private/schedule-set/extend', async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });

  await page.locator('.schedule-extend-window-btn').click();
  await page.locator('.swal2-container').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('.swal2-confirm').click();

  // Give the click a moment to land, then read the REAL DOM disabled attribute and
  // the loading overlay while the (artificially slowed) request is still in flight.
  await page.waitForTimeout(300);
  const btnDisabled = await page.locator('.schedule-extend-window-btn').getAttribute('disabled');
  const loadingOverlayVisible = await page.locator('.swal2-container').isVisible().catch(() => false);
  const loadingText = await page.locator('.swal2-container .swal2-html-container, .swal2-container .swal2-title').first().textContent().catch(() => null);
  console.log(`[item10] mid-flight: button disabled attr = ${JSON.stringify(btnDisabled)}, loading overlay visible = ${loadingOverlayVisible}, overlay text = ${JSON.stringify(loadingText?.trim())}`);
  await page.screenshot({ path: path.join(OUT, 'OBRS-1172-item10-mid-flight-disabled.png') });

  // ── item 5: wait for the success/info result, screenshot + read numbers ──
  await page.locator('.swal2-container').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(300); // let the icon swap from loading to success/info settle
  const resultIconSuccess = await page.locator('.swal2-icon.swal2-success').isVisible().catch(() => false);
  const resultIconInfo = await page.locator('.swal2-icon.swal2-info').isVisible().catch(() => false);
  const resultTitle = (await page.locator('.swal2-title').textContent())?.trim();
  console.log(`[item5] result icon success=${resultIconSuccess} info=${resultIconInfo}`);
  console.log(`[item5] result message: "${resultTitle}"`);
  await page.screenshot({ path: path.join(OUT, 'OBRS-1172-AFTER-extend1-success.png') });
  await dismissAlert(page);
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  await context.close();
  await browser.close();

  // Rename the recorded video to a stable, findable name.
  const files = await readdir(VIDEO_DIR);
  const webm = files.find((f) => f.endsWith('.webm'));
  if (webm) {
    const dest = path.join(OUT, 'OBRS-1172-press-to-result.webm');
    await rename(path.join(VIDEO_DIR, webm), dest);
    console.log(`[video] saved: ${dest}`);
  } else {
    console.log('[video] WARNING: no .webm file found in', VIDEO_DIR);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
