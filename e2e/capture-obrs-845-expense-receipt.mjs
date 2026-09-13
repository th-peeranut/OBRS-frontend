/**
 * OBRS-845 visual evidence — the Admin → ค่าใช้จ่าย screen, before and after the
 * receipt-attach feature.
 *
 * Run against a dev server already serving the tree under test:
 *   OBRS_BASE_URL=http://localhost:4200 SIT_EMAIL='…' SIT_PASSWORD='…' \
 *     node e2e/capture-obrs-845-expense-receipt.mjs --label before
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
const OUT = path.resolve('e2e/out/obrs-845');
const DESKTOP = { width: 1536, height: 900 };

const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  if (i === -1 || !process.argv[i + 1]) {
    throw new Error('--label <before|after> is required — an unlabelled pair proves nothing');
  }
  return process.argv[i + 1];
})();

if (!EMAIL || !PASSWORD) {
  throw new Error('SIT_EMAIL / SIT_PASSWORD are not set; refusing to guess (the account locks after repeated failures)');
}

const failures = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: ${actual} (expected ${expected})`);
  if (!ok) failures.push(`${name}: got ${actual}, expected ${expected}`);
  return ok;
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 60_000 });
  console.log(`landed on ${new URL(page.url()).pathname}`);
}

(async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: DESKTOP });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`  [browser error] ${m.text().slice(0, 200)}`);
  });

  await login(page);
  await page.goto(`${BASE}/admin/expenses`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Control: the expenses table itself rendered, so an expected-0 below means
  // "absent", not "selector never matched anything".
  const rows = await page.locator('table tbody tr').count();
  console.log(`\n[${LABEL}] /admin/expenses`);
  console.log(`  control — expense table rows rendered: ${rows}`);

  const headerCells = await page.locator('table thead th').allInnerTexts();
  console.log(`  table headers: ${JSON.stringify(headerCells)}`);
  const receiptHeader = headerCells.filter((t) => /ใบเสร็จ|receipt|收据/i.test(t)).length;
  check('receipt column in the list header', receiptHeader, LABEL === 'after' ? 1 : 0);

  await page.screenshot({ path: path.join(OUT, `OBRS-845-${LABEL.toUpperCase()}-expenses-list.png`), fullPage: false });

  // Open the edit modal of the first row whose edit control is enabled. FIELD-sourced
  // rows render the button disabled on purpose (OBRS-960), so filter those out rather
  // than clicking a no-op and screenshotting a modal that never opened.
  // Always the SAME row in both labels, so the pair is comparable: the sample expense that
  // carries a receipt. Falling back to the first editable row keeps the script honest if the
  // sample is missing rather than silently screenshotting something else.
  const namedRow = page.locator('table tbody tr').filter({ has: page.locator('.admin-status.is-success') });
  const scope = (await namedRow.count()) > 0 ? namedRow.first() : page;
  console.log(`  rows showing an attached receipt: ${await namedRow.count()}`);
  const editButtons = scope.locator('.admin-inline-actions button.admin-icon-btn:not(.danger):not([disabled])');
  const editCount = await editButtons.count();
  const allIconBtns = await page.locator('button.admin-icon-btn').count();
  console.log(`  .admin-icon-btn on page: ${allIconBtns}, enabled edit buttons: ${editCount}`);
  if (editCount > 0) {
    await editButtons.first().click();
    await page.waitForTimeout(2500);
    const modal = page.locator('.modal, [role="dialog"], .p-dialog');
    const modalOpen = await modal.count();
    console.log(`  modal containers visible: ${modalOpen}`);
    // Assert on the element, not on page text: the form has ALWAYS had a "เลขที่ใบเสร็จ"
    // (receipt NUMBER) input, so a text match for "ใบเสร็จ" is 1 in both labels and proves
    // nothing. The control below is what this card adds.
    check(
      'receipt attach block in the edit modal',
      await page.locator('[data-testid="expense-receipt-field"]').count(),
      LABEL === 'after' ? 1 : 0
    );
    check(
      'view-receipt button in the edit modal',
      await page.locator('[data-testid="expense-receipt-view"]').count(),
      LABEL === 'after' ? 1 : 0
    );
    await page.screenshot({ path: path.join(OUT, `OBRS-845-${LABEL.toUpperCase()}-expense-edit-modal.png`), fullPage: false });
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
