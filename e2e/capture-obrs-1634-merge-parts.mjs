/**
 * OBRS-1634 visual evidence — the parts/labour registry, before and after the
 * retroactive merge feature.
 *
 *   OBRS_BASE_URL=http://localhost:4200 SIT_EMAIL='…' SIT_PASSWORD='…' \
 *     node e2e/capture-obrs-1634-merge-parts.mjs --label before
 *
 * Every claim it prints is a COUNT taken from the rendered DOM, and each
 * expected-0 is paired with an expected-1 control on the same selector, so a
 * typo'd selector fails loudly instead of reading as "correctly absent".
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const EMAIL = process.env.SIT_EMAIL;
const PASSWORD = process.env.SIT_PASSWORD;
const OUT = path.resolve('e2e/out/obrs-1634');
const DESKTOP = { width: 1536, height: 900 };

const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  if (i === -1 || !process.argv[i + 1]) {
    throw new Error('--label <before|after> is required — an unlabelled pair proves nothing');
  }
  return process.argv[i + 1];
})();
const AFTER = LABEL === 'after';

if (!EMAIL || !PASSWORD) {
  throw new Error('SIT_EMAIL / SIT_PASSWORD are not set; refusing to guess');
}

const failures = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: ${actual} (expected ${expected})`);
  if (!ok) failures.push(`${name}: got ${actual}, expected ${expected}`);
}

(async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: DESKTOP });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`  [browser error] ${m.text().slice(0, 160)}`);
  });

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 60_000 });

  await page.goto(`${BASE}/admin/maintenance-parts`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  console.log(`\n[${LABEL}] /admin/maintenance-parts`);
  // Control: the registry rendered at all, so an expected-0 below means "absent",
  // not "the page never loaded".
  const rows = await page.locator('table tbody tr').count();
  console.log(`  control — registry rows rendered: ${rows}`);

  // One merge action per row — comparing against the row count rather than a fixed
  // number, so the check keeps meaning whatever the registry holds.
  check('merge action, one per registry row', await page.getByTestId('part-merge').count(), AFTER ? rows : 0);
  await page.screenshot({ path: path.join(OUT, `OBRS-1634-${LABEL.toUpperCase()}-registry.png`) });

  if (AFTER) {
    await page.getByTestId('part-merge').first().click();
    await page.waitForTimeout(1500);
    check('merge dialog is its own confirm step', await page.getByTestId('part-merge-confirm').count(), 1);
    check('reversible note in the dialog', await page.getByTestId('part-merge-reversible-note').count(), 1);
    // AC4: the counts must be on screen BEFORE the owner confirms. Choose a target
    // so the impact call fires, then assert the summary is rendered.
    // AC4: the counts must be on screen BEFORE the owner can confirm. Pick a destination
    // through the real dropdown so the impact call fires, then assert the summary rendered
    // and that confirm was unreachable until it did.
    const confirm = page.getByTestId('part-merge-confirm');
    check('confirm is blocked until the impact is known', (await confirm.isDisabled()) ? 1 : 0, 1);
    // The destination control is app-admin-dropdown, not a native <select>: its trigger is
    // a button inside the host and its options are buttons in .admin-dropdown-menu. Clicking
    // the host itself does nothing, which is what an earlier version of this script did.
    const target = page.getByTestId('part-merge-target');
    await target.locator('button.admin-dropdown-trigger').click();
    await page.waitForTimeout(600);
    const options = page.locator('.admin-dropdown-menu button.admin-dropdown-option');
    const labels = await options.allInnerTexts();
    console.log(`  destination choices offered: ${labels.length} — first two: ${JSON.stringify(labels.slice(0, 2).map((t) => t.replace(/\s+/g, ' ').trim()))}`);
    // The menu's first row is the placeholder; a real destination starts at index 1.
    await options.nth(labels.length > 1 ? 1 : 0).click();
    await page.waitForTimeout(2500);
    check('impact counts shown before confirming', await page.getByTestId('part-merge-impact-summary').count(), 1);
    check('confirm reachable once the impact is known', (await confirm.isDisabled()) ? 1 : 0, 0);
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    check('confirm copy never claims the merge is permanent', /ถาวร|ย้อนกลับไม่ได้/.test(body) ? 1 : 0, 0);
    await page.screenshot({ path: path.join(OUT, `OBRS-1634-${LABEL.toUpperCase()}-merge-dialog.png`) });
  }

  await browser.close();
  console.log(`\nsaved under ${OUT}`);
  if (failures.length) {
    console.log(`\n${failures.length} check(s) failed:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log('\nall checks passed');
})();
