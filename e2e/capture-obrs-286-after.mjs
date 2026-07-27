// OBRS-286 AFTER evidence + re-verification of the manual-refund worklist.
//
// This exists because the QA run that first verified this card deleted its own
// Playwright specs after running them, so nothing could be re-run by the person
// who has to trust the result. The assertions below are deliberately made against
// the RENDERED row text, not the API JSON: a field-name mismatch between the
// backend response and `formatMoney(row.amountOwed)` is silent, and would paint
// THB 0.00 on every row of the one screen that tells an owner how much to transfer.
//
// Usage: node e2e/capture-obrs-286-after.mjs <baseUrl> <outDir>

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:4200';
const OUT = process.argv[3] || '.';
mkdirSync(OUT, { recursive: true });

// Seeded in the isolated QA database obrs286qa. Values come from
// manual_refund_requests, read directly with psql before this run.
const EXPECTED = [
  { ref: 'MRQA-B1', amount: '875.50', method: 'bank_transfer', dest: ['Kasikorn', '1234567890'], queued: '24/07/2026' },
  { ref: 'MRQA-B2', amount: '432.25', method: 'qr_promptpay', dest: ['0891234567'], queued: '27/07/2026' },
];

const results = [];
const fail = (what, detail) => {
  results.push({ ok: false, what, detail });
  console.log(`FAIL  ${what} :: ${detail}`);
};
const pass = (what, detail) => {
  results.push({ ok: true, what, detail });
  console.log(`pass  ${what} :: ${detail}`);
};

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').waitFor({ timeout: 45000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill('P@ssw0rd');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45000 });
}

for (const mode of ['light', 'dark']) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(
    ([k, v]) => {
      try {
        window.localStorage.setItem(k, v);
      } catch {}
    },
    ['app_admin_theme', mode]
  );
  const page = await ctx.newPage();

  await login(page, 'owner@system.local');
  await page.goto(`${BASE}/admin/manual-refunds`, { waitUntil: 'networkidle' });
  await page.locator('table.admin-table tbody tr').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);

  // Assert the theme precondition actually landed, or a light screenshot ships
  // under the name "dark".
  const isDark = await page.evaluate(() => document.body.classList.contains('is-dark'));
  if (isDark !== (mode === 'dark')) {
    fail(`theme precondition (${mode})`, `body.is-dark=${isDark}`);
  } else {
    pass(`theme precondition (${mode})`, `body.is-dark=${isDark}`);
  }

  const rowTexts = await page.locator('table.admin-table tbody tr').allInnerTexts();
  writeFileSync(join(OUT, `OBRS-286-rows-${mode}.txt`), rowTexts.join('\n---\n'));

  for (const exp of EXPECTED) {
    const row = rowTexts.find((t) => t.includes(exp.ref));
    if (!row) {
      fail(`row rendered (${mode}) ${exp.ref}`, 'no row containing this booking number');
      continue;
    }
    // The money assertion is the point of this file. Check the digits, and
    // separately check that the cell is not the 0.00 a missing field produces.
    if (!row.includes(exp.amount)) {
      fail(`amount rendered (${mode}) ${exp.ref}`, `expected ${exp.amount} in: ${JSON.stringify(row)}`);
    } else if (/\b0\.00\b/.test(row)) {
      fail(`amount rendered (${mode}) ${exp.ref}`, `row also renders 0.00: ${JSON.stringify(row)}`);
    } else {
      pass(`amount rendered (${mode}) ${exp.ref}`, exp.amount);
    }

    if (!row.includes(exp.method)) fail(`method (${mode}) ${exp.ref}`, JSON.stringify(row));
    else pass(`method (${mode}) ${exp.ref}`, exp.method);

    const missingDest = exp.dest.filter((d) => !row.includes(d));
    if (missingDest.length) fail(`destination unmasked for OWNER (${mode}) ${exp.ref}`, `missing ${missingDest.join(',')}`);
    else pass(`destination unmasked for OWNER (${mode}) ${exp.ref}`, exp.dest.join(' / '));

    if (!row.includes(exp.queued)) fail(`queuedAt (${mode}) ${exp.ref}`, JSON.stringify(row));
    else pass(`queuedAt (${mode}) ${exp.ref}`, exp.queued);
  }

  await page.screenshot({ path: join(OUT, `OBRS-286-AFTER-worklist-${mode}.png`), fullPage: true });

  // Mark-refunded modal, same theme, for the second AFTER surface.
  const btn = page.locator('table.admin-table tbody tr').first().locator('button').last();
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(900);
    const dialog = page.locator('[role="dialog"], .p-dialog, .admin-modal').first();
    if (await dialog.count()) {
      pass(`mark-refunded modal opens (${mode})`, 'dialog present');
      await page.screenshot({ path: join(OUT, `OBRS-286-AFTER-mark-refunded-modal-${mode}.png`), fullPage: true });
    } else {
      fail(`mark-refunded modal opens (${mode})`, 'no dialog after clicking the row action');
    }
  } else {
    fail(`mark-refunded modal opens (${mode})`, 'no action button in the first row');
  }

  await browser.close();
}

// RBAC: a hidden nav item is not authorization. Ask for the URL directly.
{
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 960 } });
  const page = await ctx.newPage();
  await login(page, 'salesperson@system.local');
  await page.goto(`${BASE}/admin/manual-refunds`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const landed = new URL(page.url()).pathname;
  const tableCount = await page.locator('table.admin-table tbody tr').count();
  if (landed.includes('/admin/manual-refunds')) {
    fail('RBAC: SALESPERSON blocked from the worklist route', `stayed on ${landed}`);
  } else {
    pass('RBAC: SALESPERSON blocked from the worklist route', `redirected to ${landed}`);
  }
  if (tableCount > 0) fail('RBAC: no worklist rows rendered for SALESPERSON', `${tableCount} rows`);
  else pass('RBAC: no worklist rows rendered for SALESPERSON', '0 rows');
  await browser.close();
}

writeFileSync(join(OUT, 'OBRS-286-after.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
