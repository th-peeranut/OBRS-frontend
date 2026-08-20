/**
 * OBRS-1473 / OBRS-1474 evidence -- the admin status dropdown on a `resolved`
 * usability report, and the toast a rejected save produces.
 *
 * Verified against a LOCAL backend (dev,local profile on :8080 + local Postgres),
 * NOT SIT -- the reopen edge only exists on this branch. UI language is Thai
 * (this office's default), so the selectors below use the strings from
 * public/i18n/th.json.
 *
 * Run it twice against the same local backend, once per frontend:
 *
 *   # BEFORE -- a worktree at origin/dev served on :4200
 *   OBRS_MODE=before node e2e/capture-obrs-1473-reopen-resolved.mjs
 *   # AFTER -- this worktree served on :4200
 *   OBRS_MODE=after  node e2e/capture-obrs-1473-reopen-resolved.mjs
 *
 * Both modes start from a report that is already `resolved`; put it there with
 * the admin API before running BEFORE (see the card).
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const MODE = process.env.OBRS_MODE ?? 'after';
const REPORT_ID = process.env.OBRS_REPORT_ID ?? '6';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e/out/obrs-1473');
const PASSWORD = process.env.OBRS_SEED_PASSWORD;

if (!PASSWORD) {
  throw new Error('set OBRS_SEED_PASSWORD to the local seed password');
}

const TH = {
  view: 'ดูรายละเอียด',
  filterResolved: 'แก้ไขแล้ว',
  save: 'บันทึก',
  accepted: 'ยอมรับแล้ว',
  inReview: 'กำลังตรวจสอบ',
};

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45000 });
}

async function pickFilter(page, label) {
  const filter = page.locator('.admin-dropdown').first();
  await filter.locator('.admin-dropdown-trigger').click();
  await filter.locator('.admin-dropdown-option', { hasText: label }).first().click();
  await page.waitForTimeout(1500);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const result = { mode: MODE, base: BASE, reportId: REPORT_ID };

  await login(page, 'admin@system.local');
  await page.goto(`${BASE}/admin/usability-reports`, { waitUntil: 'networkidle' });
  await pickFilter(page, TH.filterResolved);

  const row = page.locator('table.admin-table tbody tr').filter({ hasText: TH.filterResolved }).first();
  await row.getByRole('button', { name: TH.view }).click();

  const statusBlock = page.locator('.ur-status-controls');
  await statusBlock.waitFor({ timeout: 15000 });
  // Scroll the control into the viewport BEFORE opening it: the modal body
  // scrolls independently, and without this the open menu sits below the fold —
  // the first run produced two byte-identical BEFORE/AFTER screenshots because
  // neither actually showed the dropdown.
  await statusBlock.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await statusBlock.locator('.admin-dropdown-trigger').click();
  await page.waitForTimeout(400);
  await statusBlock.locator('.admin-dropdown-menu').waitFor({ timeout: 5000 });

  // The measurement this evidence exists for: what the dropdown actually offers
  // an admin on a report whose status is `resolved`.
  result.options = (
    await statusBlock.locator('.admin-dropdown-menu .admin-dropdown-option').allTextContents()
  ).map((t) => t.replace(/check_circle/g, '').trim());
  console.log(`${MODE}: dropdown options =`, result.options);

  await page.screenshot({
    path: path.join(OUT, `OBRS-1473-${MODE.toUpperCase()}-0-dropdown-on-resolved-report.png`),
    fullPage: false,
  });
  // The status control is the LAST element in the modal, so its open menu always
  // renders past the modal's bottom edge and is clipped out of a viewport shot.
  // Screenshot the menu element itself so the option list is actually legible.
  await statusBlock.locator('.admin-dropdown-menu').screenshot({
    path: path.join(OUT, `OBRS-1473-${MODE.toUpperCase()}-0b-dropdown-options.png`),
  });

  const target = MODE === 'before' ? TH.accepted : TH.inReview;
  await statusBlock.locator('.admin-dropdown-option', { hasText: target }).first().click();
  await page.waitForTimeout(200);

  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/admin/usability-reports/') && r.url().endsWith('/status') && r.request().method() === 'PUT',
      { timeout: 20000 },
    ),
    page.getByRole('button', { name: TH.save, exact: true }).click(),
  ]);
  result.putStatus = response.status();
  try {
    result.putBody = await response.json();
  } catch {
    result.putBody = null;
  }
  console.log(`${MODE}: PUT ${target} -> HTTP ${result.putStatus}`);

  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(OUT, `OBRS-1473-${MODE.toUpperCase()}-1-save-${target === TH.accepted ? 'accepted' : 'in-review'}.png`),
    fullPage: false,
  });

  result.dialogText = await page
    .locator('.swal2-popup')
    .first()
    .textContent()
    .catch(() => null);

  await writeFile(path.join(OUT, `result-${MODE}.json`), JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
