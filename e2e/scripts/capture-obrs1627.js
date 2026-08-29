// Standalone capture script for OBRS-1627 visual evidence (not a Playwright
// test, not part of the suite). Same seeding trick as capture-obrs1584.js:
// every /api call is stubbed, so no backend, no Postgres, no SIT.
//
// Both labels are shot against ONE server on :4400, one after the other, so
// only one `ng serve` is alive at a time:
//   npx ng serve --port 4400   (this branch)   -> node e2e/scripts/capture-obrs1627.js AFTER
//   ... from an origin/dev worktree            -> node e2e/scripts/capture-obrs1627.js BEFORE
//
// The fixture is shaped like prod, deliberately: ONE operator (distinct
// ownerId = 1 across all 8,580 rows), and vatAmount / receiptNo / paidBy null
// on every row (0 / 8,580 on prod). The single `source: 'FIELD'` row is the one
// thing here prod does NOT have (0 / 8,580) - it is in the fixture because the
// chip that row renders is what MOVED, and a chip nobody can see in either
// frame proves nothing about where it went.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const LABEL = (process.argv[2] || 'AFTER').toUpperCase();
const BASE = 'http://localhost:4400';
const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1627');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

// The page opens on the CURRENT month (OBRS-1626), so the rows must be in it.
const NOW = new Date();
const day = (d) => `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const OWNERS = [
  { id: 7, slug: 'nj-travel', displayName: 'หจก. เอ็นเจ ทราเวล', legalName: 'ห้างหุ้นส่วนจำกัด เอ็นเจ ทราเวล' },
];
const VEHICLES = [
  { id: 1, vehicleNumber: '51-25', numberPlate: '16-8368' },
  { id: 2, vehicleNumber: '51-29', numberPlate: '17-1102' },
];
const PAYEES = [
  { id: 1, name: 'อู่ช่างเล็ก', active: true },
  { id: 2, name: 'ปั๊ม ปตท. สีคิ้ว', active: true },
];

const EXPENSES = [
  { id: 1, ownerId: 7, vehicleId: 1, category: 'FUEL', amount: 3200, expenseDate: day(3), note: 'เติมน้ำมันขาไป', payeeId: 2, payeeName: 'ปั๊ม ปตท. สีคิ้ว', source: 'FIELD' },
  { id: 2, ownerId: 7, vehicleId: 2, category: 'REPAIR', amount: 8450, expenseDate: day(5), note: 'เปลี่ยนผ้าเบรกหน้า', payeeId: 1, payeeName: 'อู่ช่างเล็ก' },
  { id: 3, ownerId: 7, vehicleId: null, category: 'CENTRAL', amount: 1500, expenseDate: day(7), note: 'ค่าส่วนกลางประจำเดือน' },
  { id: 4, ownerId: 7, vehicleId: 1, category: 'TOLL', amount: 260, expenseDate: day(9), note: '' },
  { id: 5, ownerId: 7, vehicleId: 2, category: 'DRIVER_WAGE', amount: 4800, expenseDate: day(11), note: 'ค่าแรงคนขับ 4 เที่ยว' },
  { id: 6, ownerId: 7, vehicleId: 1, category: 'OTHER', categoryOtherLabel: 'ล้างรถ', amount: 350, expenseDate: day(13), note: '' },
].map((e) => ({
  // prod shape: these three are empty on every one of the 8,580 rows.
  vatAmount: null,
  receiptNo: null,
  paidBy: null,
  payeeId: null,
  payeeName: null,
  categoryOtherLabel: null,
  source: 'MANUAL',
  items: [],
  ...e,
}));

async function newSeededPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'fake-admin-token-for-capture');
    localStorage.setItem('auth_username', 'admin@system.local');
    // admin, not owner: the operator COLUMN this card removes was admin-only,
    // so an owner session would photograph a table that never had it.
    localStorage.setItem('auth_roles', JSON.stringify(['admin']));
  });
  const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  // Catch-all FIRST, specifics after: Playwright resolves last-registered first.
  await page.route('**/api/**', (route) => json(route, ok([])));
  await page.route('**/private/expenses**', (route) => json(route, ok(EXPENSES)));
  await page.route('**/private/expenses/pending**', (route) => json(route, ok([])));
  await page.route('**/private/vehicles**', (route) => json(route, ok(VEHICLES)));
  await page.route('**/private/owners**', (route) => json(route, ok(OWNERS)));
  await page.route('**/private/expense-payees**', (route) => json(route, ok(PAYEES)));
  return page;
}

async function main() {
  const browser = await chromium.launch();
  const page = await newSeededPage(browser);
  await page.goto(`${BASE}/admin/expenses`, { waitUntil: 'networkidle' });
  await page.waitForSelector('table tbody tr', { timeout: 20000 });
  await page.waitForTimeout(1000);

  const swal = await page.locator('.swal2-popup').count();
  if (swal !== 0) throw new Error(`${swal} swal popup(s) on screen - the frame would photograph an error, not the feature`);

  const headers = await page.$$eval('thead th', (ths) => ths.map((th) => th.textContent.trim()));
  const firstRow = await page.$$eval('tbody tr:first-child td', (tds) => tds.map((td) => td.textContent.trim()));
  const filters = await page.$$eval('.admin-page-filters app-admin-dropdown', (ds) => ds.map((d) => d.textContent.trim().split('\n')[0].trim()));

  const name = `OBRS-1627-${LABEL}-expenses-table.png`;
  await page.screenshot({ path: path.join(ASSETS_DIR, name), fullPage: true });
  console.log(`captured ${name}`);
  console.log(`  headers (${headers.length}): ${JSON.stringify(headers)}`);
  console.log(`  first row (${firstRow.length}): ${JSON.stringify(firstRow)}`);
  console.log(`  filter dropdowns (${filters.length}): ${JSON.stringify(filters)}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
