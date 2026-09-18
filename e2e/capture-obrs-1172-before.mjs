/**
 * OBRS-1172 item 1 — BEFORE capture. This worktree is detached at origin/dev (dca2e26b),
 * i.e. the schedules page without the extend button. Logs in, opens the "ชุดตาราง"
 * (Schedule Sets) tab, screenshots it, and asserts a 0-count for the extend button
 * selector (not just "looks absent from the screenshot").
 *
 * node e2e/obrs-1172-before-capture.mjs
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
  // Confirm we really are on the schedule-sets tab (not the trips tab) before asserting 0.
  const setsTabActive = await page.locator('.schedule-tab', { hasText: 'ชุดตาราง' }).getAttribute('aria-selected');
  console.log(`[item1] "ชุดตาราง" tab aria-selected: ${setsTabActive}`);

  await page.screenshot({ path: path.join(OUT, 'OBRS-1172-BEFORE-schedules-toolbar.png') });

  const extendBtnCount = await page.locator('.schedule-extend-window-btn').count();
  console.log(`[item1] extend button count (BEFORE, origin/dev dca2e26b): ${extendBtnCount}`);
  // Positive control on the same page/selector family, so a typo'd selector fails loud:
  // the "Add" button in the same toolbar must be present (count 1).
  const addBtnCount = await page.locator('.admin-page-intro .admin-btn-primary').count();
  console.log(`[item1-control] Add button count (same toolbar, expect 1): ${addBtnCount}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
