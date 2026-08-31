// Standalone capture script for OBRS-1613 AC3/AC4/AC5 visual evidence (not a
// Playwright test, not part of the suite). No backend, no Docker: the screen's
// whole input is one JSON response, so `page.route` answers it — and answers it
// the way the API does, by reading `partId` off the query string, so the picker
// and the chart cannot drift apart inside the capture the way they could if
// every request got the same body.
//
//   npx ng serve --port 4613          (this branch)
//   node e2e/scripts/capture-obrs1613-report.js
//
// The numbers below are a FIXTURE, not the owner's bills. They are chosen so
// that everything VISIBLE reconciles: the picker's per-part counts add to the
// coverage strip's "6 of 9 lines", the excluded chips in the table add to its
// "2 lines", and the three bucket amounts sum to the total. The per-line
// `amount` the buckets are built from is a field this screen never shows (it
// prints ราคา/หน่วย, not the line total), so summing the visible price column
// is not meant to reproduce them. The backend contract these shapes stand in
// for is proved separately by PartUnitPriceReportIT (5 tests, real Postgres).
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:4613';
const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1613');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

const PARTS = {
  1: { partId: 1, partName: 'จาระบี', partCode: null, lineCount: 2, comparableLineCount: 2 },
  2: { partId: 2, partName: 'โช้คอัพหน้า', partCode: null, lineCount: 3, comparableLineCount: 1 },
  3: { partId: 3, partName: 'น้ำมันเครื่อง', partCode: 'ENGINE_OIL', lineCount: 2, comparableLineCount: 2 },
  4: { partId: 4, partName: 'สายพานคอมแอร์', partCode: null, lineCount: 1, comparableLineCount: 1 },
};

const LINES = {
  // Two bills, one unit, a year apart — the only shape that is a comparison.
  1: [
    { expenseId: 101, expenseDate: '2025-01-16', payeeName: 'อู่ช่างปุ้น', unit: 'กระป๋อง', unitPrice: '480.00', status: 'COMPARABLE' },
    { expenseId: 108, expenseDate: '2026-07-28', payeeName: 'อู่พรชัยการช่าง', unit: 'กระป๋อง', unitPrice: '400.00', status: 'COMPARABLE' },
  ],
  // AC4's two exclusions, kept apart: ฿0 is "the owner supplied the part", and a
  // missing price is "the bill never wrote one". One bar, so no comparison yet.
  2: [
    { expenseId: 103, expenseDate: '2025-11-02', payeeName: 'อู่ช่างปุ้น', unit: 'ต้น', unitPrice: '2950.00', status: 'COMPARABLE' },
    { expenseId: 106, expenseDate: '2026-03-14', payeeName: 'อู่พรชัยการช่าง', unit: 'ต้น', unitPrice: '0.00', status: 'EXCLUDED_ZERO_PRICE' },
    { expenseId: 109, expenseDate: '2026-06-08', payeeName: 'อู่ลุงหมู', unit: 'ต้น', unitPrice: null, status: 'EXCLUDED_NO_UNIT_PRICE' },
  ],
  // Two real prices that are still not a comparison, because ฿780 per แกลลอน
  // and ฿250 per ลิตร are not the same measurement.
  3: [
    { expenseId: 104, expenseDate: '2025-09-05', payeeName: 'ปั๊มบางจาก สาขาบ้านบึง', unit: 'แกลลอน', unitPrice: '780.00', status: 'COMPARABLE' },
    { expenseId: 107, expenseDate: '2026-05-20', payeeName: 'อู่พรชัยการช่าง', unit: 'ลิตร', unitPrice: '250.00', status: 'COMPARABLE' },
  ],
  4: [
    { expenseId: 105, expenseDate: '2026-02-11', payeeName: 'อู่ช่างปุ้น', unit: 'เส้น', unitPrice: '1200.00', status: 'COMPARABLE' },
  ],
};

// comparable = 960 + 1200 (จาระบี) + 2950 (โช้คอัพ) + 780 + 1000 (น้ำมันเครื่อง) + 1200 (สายพาน)
// unnamed    = 1730, the one "หลายอย่างราคาเดียว" line the owner ruled must stay unlinked (ทาง ค)
// noPrice    = 0 (the ฿0 line) + 300 (the line with no per-unit price)
const COVERAGE = {
  totalAmount: '10120.00',
  totalLineCount: 9,
  comparableAmount: '8090.00',
  comparableLineCount: 6,
  unnamedAmount: '1730.00',
  unnamedLineCount: 1,
  excludedPriceAmount: '300.00',
  excludedPriceLineCount: 2,
};

const report = (partId) => ({
  partId,
  partOptions: Object.values(PARTS),
  lines: partId === null ? [] : (LINES[partId] ?? []),
  coverage: COVERAGE,
});

async function newSeededPage(browser, { dark = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 }, deviceScaleFactor: 2 });
  await page.addInitScript((isDark) => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'fake-owner-token-for-capture');
    localStorage.setItem('auth_username', 'owner@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['owner']));
    if (isDark) localStorage.setItem('app_admin_theme', 'dark');
  }, dark);
  const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  // Catch-all first, specifics after: Playwright runs the LAST registered match.
  await page.route('**/api/**', (route) => json(route, ok([])));
  await page.route('**/private/admin/reports/part-unit-price**', (route) => {
    const raw = new URL(route.request().url()).searchParams.get('partId');
    json(route, ok(report(raw === null ? null : Number(raw))));
  });
  return page;
}

async function open(browser, opts) {
  const page = await newSeededPage(browser, opts);
  await page.goto(`${BASE}/admin/part-unit-price-report`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.part-price-coverage', { timeout: 15000 });
  await page.waitForTimeout(600);
  const swal = await page.locator('.swal2-popup').count();
  if (swal !== 0) throw new Error(`${swal} swal popup(s) on screen`);
  return page;
}

/** Pick from app-admin-dropdown: open the trigger, click the option by label. */
async function pickPart(page, namePrefix) {
  await page.locator('.admin-dropdown-trigger').first().click();
  await page.locator('.admin-dropdown-menu').waitFor({ state: 'visible', timeout: 5000 });
  await page
    .locator('.admin-dropdown-option')
    .filter({ hasText: namePrefix })
    .first()
    .click();
  await page.waitForTimeout(900);
}

async function readState(page) {
  return page.evaluate(() => ({
    trigger: document.querySelector('.admin-dropdown-trigger')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    bars: document.querySelectorAll('.part-price-bar-fill').length,
    unitHeadings: Array.from(document.querySelectorAll('.part-price-unit-heading')).map((h) => h.textContent.trim()),
    rows: document.querySelectorAll('table.part-price-table tbody tr').length,
    excludedChips: document.querySelectorAll('.part-price-status.is-excluded').length,
    noComparison: document.querySelector('.part-price-no-comparison')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    pickAPart: Array.from(document.querySelectorAll('p.admin-muted')).some((p) => p.textContent.includes('เลือก 1 รายการ')),
    coverage: document.querySelector('.part-price-coverage')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
  }));
}

/**
 * Refuse to save a frame that does not show what the shot claims. A capture
 * script cannot see its own output (OBRS-847), so the assertion is the only
 * thing standing between a wrong frame and a Jira card.
 */
async function shoot(page, name, expect, note) {
  const state = await readState(page);
  for (const [key, want] of Object.entries(expect)) {
    const got = state[key];
    if (got !== want) throw new Error(`${name}: expected ${key}=${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
  await page.screenshot({ path: path.join(ASSETS_DIR, name), fullPage: true });
  console.log(`captured ${name} — ${note}`);
  return state;
}

async function main() {
  const browser = await chromium.launch();
  const summary = {};

  {
    const page = await open(browser);
    summary['01-pick-a-part'] = await shoot(
      page,
      'OBRS-1613-AFTER-01-pick-a-part.png',
      { bars: 0, rows: 0, pickAPart: true },
      'nothing selected yet — the coverage still renders, because an empty report is exactly where it matters most'
    );

    await pickPart(page, 'จาระบี');
    summary['02-two-prices-one-unit'] = await shoot(
      page,
      'OBRS-1613-AFTER-02-two-prices-one-unit.png',
      { bars: 2, rows: 2, excludedChips: 0 },
      'AC3 — two bills, one unit, ฿480 -> ฿400'
    );

    await pickPart(page, 'โช้คอัพหน้า');
    summary['03-excluded-lines'] = await shoot(
      page,
      'OBRS-1613-AFTER-03-excluded-lines.png',
      { bars: 0, rows: 3, excludedChips: 2 },
      'AC4 — ฿0 and "no per-unit price" are different exclusions and both stay in the table'
    );

    await pickPart(page, 'น้ำมันเครื่อง');
    summary['04-two-units-no-comparison'] = await shoot(
      page,
      'OBRS-1613-AFTER-04-two-units-no-comparison.png',
      { bars: 0, rows: 2, excludedChips: 0 },
      'AC4 — two real prices in two units is not a price rise, so nothing is drawn'
    );
    await page.close();
  }

  {
    const page = await open(browser, { dark: true });
    await pickPart(page, 'จาระบี');
    summary['05-dark'] = await shoot(
      page,
      'OBRS-1613-AFTER-05-dark-two-prices.png',
      { bars: 2, rows: 2 },
      'dark mode — the status chip here was the theme-token gate\'s one real catch'
    );
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(ASSETS_DIR, 'capture-after.json'), JSON.stringify(summary, null, 2));
  console.log('DONE');
}

main().catch((e) => { console.error(e); process.exit(1); });
