// Standalone capture script for OBRS-1149 visual evidence (not a Playwright
// test, not part of the suite's run — kept in-repo as the reproducible recipe,
// per the card-visual policy). Shape copied from capture-obrs1053.js, the
// sibling that shot these same two surfaces.
//
// NO backend. `AuthService.isAuthenticated()` is a pure localStorage check and
// `owner` clears the AdminGuard, so seeding auth_token/auth_roles gets in, and
// every `/api/**` call is stubbed. The fixtures are injected rather than
// seeded for the reason this card exists: a signed-off shortfall only lands in
// `driver_cash_days` when somebody closes a day with a mismatch, and no seed
// produces one.
//
// CAPTURE_PHASE=BEFORE points the same script at a serve of origin/dev, where
// none of the new test ids exist — the assertions below switch on the phase so
// the BEFORE frames prove the absence rather than throwing on it.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.CAPTURE_BASE || 'http://localhost:4300';
const PHASE = (process.env.CAPTURE_PHASE || 'AFTER').toUpperCase();
const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1149');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

function row(o) {
  return {
    dayId: 1,
    driverId: 12,
    driverName: 'ประสิทธิ์ ขับดี',
    holderRole: 'DRIVER',
    businessDate: '2026-09-11',
    vehicleId: 3,
    vehiclePlate: '10-1234 ชลบุรี',
    status: 'OPEN',
    expectedReturnAmount: '500.00',
    returnedAmount: null,
    discrepancy: null,
    overdueOpen: false,
    hasUnmappedSalesPointRemit: false,
    ...o,
  };
}

// Four rows, one per state the column has to read correctly: short, over,
// balanced (blank), and still open (blank).
const ROWS = [
  row({ dayId: 77, status: 'RETURNED', returnedAmount: '380.00', discrepancy: '-120.00' }),
  row({
    dayId: 78,
    driverName: 'สมชาย ขายดี',
    holderRole: 'SALESPERSON',
    status: 'RETURNED',
    returnedAmount: '550.00',
    discrepancy: '50.00',
  }),
  row({
    dayId: 79,
    driverName: 'มานี มีนา',
    businessDate: '2026-09-12',
    status: 'RETURNED',
    expectedReturnAmount: '620.00',
    returnedAmount: '620.00',
    discrepancy: '0.00',
  }),
  row({
    dayId: 80,
    driverName: 'วิรัช ตรงเวลา',
    businessDate: '2026-09-13',
    expectedReturnAmount: '740.00',
  }),
];

// The day behind row 77 — signed off 120.00 short, with the reason, the name
// and the timestamp that were written at sign-off and never read back.
const DAY_77 = ok({
  dayId: 77,
  driverId: 12,
  driverName: 'ประสิทธิ์ ขับดี',
  holderRole: 'DRIVER',
  businessDate: '2026-09-11',
  vehicleId: 3,
  status: 'RETURNED',
  entries: [
    {
      id: 1,
      type: 'ADVANCE',
      amount: '300.00',
      scheduleId: null,
      stopId: null,
      headCount: null,
      expenseCategory: null,
      expenseId: null,
      note: null,
      fromUnmappedSalesPoint: false,
      createdAt: '2026-09-11T06:00:00+07:00',
    },
    {
      id: 2,
      type: 'PER_HEAD',
      amount: '200.00',
      scheduleId: 331,
      stopId: 5,
      headCount: 8,
      expenseCategory: null,
      expenseId: null,
      note: null,
      fromUnmappedSalesPoint: false,
      createdAt: '2026-09-11T09:30:00+07:00',
    },
  ],
  advanceTotal: '300.00',
  perHeadTotal: '200.00',
  expensePaidTotal: '0.00',
  parcelRemitTotal: '0.00',
  parcelClawbackTotal: '0.00',
  expectedReturnAmount: '500.00',
  returnedAmount: '380.00',
  returnedAt: '2026-09-11T19:20:00+07:00',
  returnedByUserId: 9,
  returnedByName: 'เจ้าของกิจการ',
  discrepancy: '-120.00',
  discrepancyReason: 'เงินขาด 120 บาท คนขับแจ้งว่าจ่ายค่าที่จอดรถแล้วไม่ได้เก็บใบเสร็จ',
  perHeadRates: [],
  reopenCount: 0,
  reopens: [],
  hasUnmappedSalesPointRemit: false,
});

async function newSeededPage(browser, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'fake-owner-token-for-capture');
    localStorage.setItem('auth_username', 'owner@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['owner', 'admin', 'salesperson']));
  });
  // Catch-all FIRST — last-registered route wins in Playwright, so the
  // specific handlers below override it. Without this a 500 paints the global
  // error swal over correct content.
  await page.route('**/api/**', (route) => route.fulfill(json(ok(null))));
  await page.route('**/settlements/pending**', (route) => route.fulfill(json(ok({ range: {}, items: [] }))));
  await page.route('**/driver-cash/days?**', (route) => route.fulfill(json(ok(ROWS))));
  await page.route('**/driver-cash/days/77', (route) => route.fulfill(json(DAY_77)));
  return page;
}

/** Refuse to save a shot that has an error dialog over it. */
async function assertClean(page) {
  await page
    .waitForFunction(() => document.querySelectorAll('.swal2-popup').length === 0, null, { timeout: 8000 })
    .catch(() => {});
  const swal = await page.evaluate(() => document.querySelectorAll('.swal2-popup').length);
  if (swal !== 0) {
    throw new Error(`refusing to save: ${swal} swal popup(s) over the page`);
  }
}

async function shoot(locator, page, name) {
  await assertClean(page);
  const box = await locator.boundingBox();
  if (!box || box.height < 40) {
    throw new Error(`refusing to save ${name}: target box is ${JSON.stringify(box)}`);
  }
  await locator.screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log('captured', name, JSON.stringify({ w: Math.round(box.width), h: Math.round(box.height) }));
}

async function openList(page) {
  await page.goto(`${BASE}/admin/settlements`, { waitUntil: 'networkidle' });
  const table = page.locator('app-driver-cash-days-list table.admin-table');
  await table.waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('app-driver-cash-days-list tbody tr.settlements-row').first().waitFor({ timeout: 20000 });
  return table;
}

async function captureList(browser, name) {
  const page = await newSeededPage(browser, { width: 1500, height: 900 });
  const table = await openList(page);

  // Assert the state by DOM, never by eye. AFTER: exactly the two rows whose
  // day did not balance carry a reading, and each says which side it is on.
  // BEFORE: the column does not exist at all — that absence IS the card.
  const readings = await page.locator('[data-testid="driver-cash-day-discrepancy-side"]').count();
  const expected = PHASE === 'BEFORE' ? 0 : 2;
  if (readings !== expected) {
    throw new Error(`refusing to save ${name}: ${readings} discrepancy readings, expected ${expected}`);
  }
  const rows = await page.locator('app-driver-cash-days-list tbody tr.settlements-row').count();
  if (rows !== ROWS.length) {
    throw new Error(`refusing to save ${name}: ${rows} rows rendered, fixture has ${ROWS.length}`);
  }

  await shoot(table, page, name);
  await page.close();
}

async function captureModal(browser, name) {
  const page = await newSeededPage(browser, { width: 1280, height: 1200 });
  await openList(page);
  await page.locator('app-driver-cash-days-list tbody tr.settlements-row').first().locator('.admin-btn-small').click();
  const modal = page.locator('.driver-cash-return-modal');
  await modal.waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(600);

  const readBack = await page.locator('[data-testid="driver-cash-returned-summary"]').count();
  const expected = PHASE === 'BEFORE' ? 0 : 1;
  if (readBack !== expected) {
    throw new Error(`refusing to save ${name}: ${readBack} read-back blocks, expected ${expected}`);
  }
  // Both phases must actually be looking at the signed-off day, or the frames
  // are not comparable.
  const alreadyReturned = await modal.getByText('วันนี้มีการคืนเงินไปแล้ว').count();
  if (alreadyReturned !== 1) {
    throw new Error(`refusing to save ${name}: RETURNED branch not rendered (${alreadyReturned})`);
  }

  await shoot(modal, page, name);
  await page.close();
}

async function main() {
  const browser = await chromium.launch();
  const failures = [];
  const run = async (label, fn) => {
    try {
      await fn();
    } catch (e) {
      failures.push(`${label}: ${e.message}`);
      console.error('FAILED', label, e.message);
    }
  };

  await run('days-list', () => captureList(browser, `OBRS-1149-${PHASE}-driver-cash-days-list.png`));
  await run('return-modal', () => captureModal(browser, `OBRS-1149-${PHASE}-driver-cash-returned-modal.png`));

  await browser.close();
  if (failures.length) {
    console.error('CAPTURE FAILURES:\n' + failures.join('\n'));
    process.exit(1);
  }
  console.log('DONE', PHASE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
