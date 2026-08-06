// Standalone capture script for OBRS-1053 visual evidence (not a Playwright
// test, not committed to the suite's run — kept in-repo as the reproducible
// recipe, per the card-visual policy).
//
// NO backend. `AuthService.isAuthenticated()` is a pure localStorage check and
// `owner` clears the AdminGuard, so seeding auth_token/auth_roles gets in;
// every `/api/**` call is stubbed so the three changed surfaces render against
// deterministic fixtures that are RICHER than prod could currently produce —
// on prod today both parcel-share percentages are still `0`, so OBRS-992
// writes no clawback rows at all and every one of these screens would be
// empty. That is exactly why the fixtures are injected rather than seeded.
//
// There is no BEFORE for the /admin/reports section: it is a brand-new
// surface. For the two driver-cash surfaces the change is purely additive, so
// the honest "before" is the zero case, which is ALSO a real reachable state —
// captured here as its own shot rather than dressed up as a before/after pair.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.CAPTURE_BASE || 'http://localhost:4300';
const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1053');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

const CLAWBACKS = ok([
  {
    clawbackId: 41,
    parcelId: 9012,
    scheduleId: 331,
    payeeRole: 'SALESPERSON',
    payeeUserId: 44,
    payeeName: 'สมชาย ขายดี',
    businessDate: '2026-07-15',
    amount: '10.00',
    status: 'OUTSTANDING',
    reason: 'PARCEL_CANCEL',
    collectedAt: null,
    collectedVia: null,
    note: null,
  },
  {
    clawbackId: 42,
    parcelId: 9013,
    scheduleId: 331,
    payeeRole: 'DRIVER',
    payeeUserId: 12,
    payeeName: 'ประสิทธิ์ ขับดี',
    businessDate: '2026-07-15',
    amount: '15.00',
    status: 'OUTSTANDING',
    reason: 'PARCEL_CANCEL',
    collectedAt: null,
    collectedVia: null,
    note: null,
  },
  // Not in the OUTSTANDING view — proves the COLLECTED/ALL filter has content
  // and that a collected row keeps the note that is its only paper trail.
  {
    clawbackId: 38,
    parcelId: 8990,
    scheduleId: 320,
    payeeRole: 'SALESPERSON',
    payeeUserId: 45,
    payeeName: 'มานี มีนา',
    businessDate: '2026-07-09',
    amount: '7.50',
    status: 'COLLECTED',
    reason: 'PARCEL_CANCEL',
    collectedAt: '2026-07-10T09:12:00+07:00',
    collectedVia: 'MANUAL',
    note: 'รับคืนเป็นเงินสดที่หน้าเคาน์เตอร์',
  },
]);

const OUTSTANDING_ONLY = ok(CLAWBACKS.data.filter((c) => c.status === 'OUTSTANDING'));

const REPORTS_SUMMARY = ok({
  range: { from: '2026-07-01', to: '2026-07-31', timezone: 'Asia/Bangkok' },
  basis: { volume: 'booking_date', revenue: 'booking_date', occupancy: 'departure_date' },
  tiles: {
    bookingCount: 128,
    ticketsSold: 214,
    occupancyRatePct: 62.4,
    revenue: { net: '184250.00', paid: '184250.00', refunded: '0.00', currency: 'THB' },
  },
  daily: [
    {
      date: '2026-07-15',
      bookingCount: 12,
      ticketsSold: 19,
      occupancyRatePct: 58.2,
      seatsSold: 19,
      seatCapacity: 33,
      revenue: { net: '15400.00', paid: '15400.00', refunded: '0.00', currency: 'THB' },
    },
  ],
});

const PARCEL_SHARE_MONTHLY = ok([
  { payeeUserId: 44, payeeName: 'สมชาย ขายดี', total: '320.00' },
  { payeeUserId: 45, payeeName: 'มานี มีนา', total: '142.50' },
]);

const DAY_SUMMARY_ROW = {
  dayId: 77,
  driverId: 12,
  driverName: 'ประสิทธิ์ ขับดี',
  businessDate: '2026-07-15',
  vehicleId: 3,
  vehiclePlate: '10-1234 ชลบุรี',
  status: 'OPEN',
  expectedReturnAmount: '515.00',
  returnedAmount: null,
  discrepancy: null,
  hasUnmappedSalesPointRemit: false,
};

function makeDayDetail(clawback) {
  const withClawback = clawback !== '0.00';
  return ok({
    dayId: 77,
    driverId: 12,
    driverName: 'ประสิทธิ์ ขับดี',
    businessDate: '2026-07-15',
    vehicleId: 3,
    status: 'OPEN',
    entries: [
      { id: 1, type: 'ADVANCE', amount: '300.00', headCount: null, stopId: null, expenseCategory: null, note: null, fromUnmappedSalesPoint: false, createdAt: '2026-07-15T06:00:00+07:00' },
      { id: 2, type: 'PER_HEAD', amount: '200.00', headCount: 8, stopId: 5, expenseCategory: null, note: null, fromUnmappedSalesPoint: false, createdAt: '2026-07-15T09:30:00+07:00' },
    ],
    advanceTotal: '300.00',
    perHeadTotal: '200.00',
    expensePaidTotal: '0.00',
    parcelRemitTotal: '0.00',
    parcelClawbackTotal: clawback,
    expectedReturnAmount: withClawback ? '515.00' : '500.00',
    returnedAmount: null,
    returnedAt: null,
    returnedByUserId: null,
    returnedByName: null,
    discrepancy: null,
    discrepancyReason: null,
    perHeadRates: [],
    hasUnmappedSalesPointRemit: false,
  });
}

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function newSeededPage(browser, { dark, viewport }) {
  const page = await browser.newPage({ viewport: viewport || { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
  await page.addInitScript(
    ([isDark]) => {
      localStorage.setItem('app_language', 'th');
      localStorage.setItem('auth_token', 'fake-owner-token-for-capture');
      localStorage.setItem('auth_username', 'owner@system.local');
      localStorage.setItem('auth_roles', JSON.stringify(['owner', 'admin', 'salesperson']));
      if (isDark) localStorage.setItem('app_admin_theme', 'dark');
    },
    [!!dark]
  );
  // Catch-all FIRST — last-registered route wins in Playwright, so the
  // specific handlers below override it. Without this, a page whose fetches
  // 500 gets the global error swal painted over correct content.
  await page.route('**/api/**', (route) => route.fulfill(json(ok(null))));
  return page;
}

/** Refuse to save a shot that has an error dialog or toast over it. */
async function assertClean(page) {
  await page
    .waitForFunction(() => document.querySelectorAll('.swal2-popup').length === 0, null, { timeout: 8000 })
    .catch(() => {});
  const dirty = await page.evaluate(() => ({
    swal: document.querySelectorAll('.swal2-popup').length,
    err: document.querySelectorAll('.admin-error:not(:empty)').length,
  }));
  if (dirty.swal !== 0) {
    throw new Error(`refusing to save: ${dirty.swal} swal popup(s) over the page`);
  }
  return dirty;
}

async function shoot(locator, page, name) {
  await assertClean(page);
  const box = await locator.boundingBox();
  // 40px, not 80: the driver-cash pill ROW is legitimately ~78px tall and an
  // 80px floor refused two correct frames. The guard exists to catch a
  // collapsed/unrendered target, not to encode a minimum design height.
  if (!box || box.height < 40) {
    throw new Error(`refusing to save ${name}: target box is ${JSON.stringify(box)}`);
  }
  await locator.screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log('captured', name, JSON.stringify({ w: Math.round(box.width), h: Math.round(box.height) }));
}

async function captureReports(browser, { dark, filter, name }) {
  // 2400px tall on purpose. The global "รายงานปัญหา" FAB is `position: fixed`
  // bottom-right, so at a normal viewport height it lands ON TOP of the second
  // row's collect button — the one control this card exists for — and the
  // saved frame reads as a layout defect that does not exist. A viewport
  // taller than the page puts the FAB below the section instead of over it.
  const page = await newSeededPage(browser, { dark, viewport: { width: 1500, height: 2400 } });
  await page.route('**/admin/reports/summary**', (route) => route.fulfill(json(REPORTS_SUMMARY)));
  await page.route('**/parcel-share/monthly**', (route) => route.fulfill(json(PARCEL_SHARE_MONTHLY)));
  await page.route('**/parcel-share/clawbacks**', (route) => {
    const url = route.request().url();
    return route.fulfill(json(url.includes('status=OUTSTANDING') ? OUTSTANDING_ONLY : CLAWBACKS));
  });

  await page.goto(`${BASE}/admin/reports`, { waitUntil: 'networkidle' });
  const section = page.locator('[data-testid="parcel-share-clawbacks-section"]');
  await section.waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('[data-testid="parcel-share-clawback-row"]').first().waitFor({ timeout: 15000 });

  if (filter === 'ALL') {
    await section.locator('app-admin-dropdown').first().click();
    await page.locator('.admin-dropdown-menu li, .admin-dropdown-menu button, .admin-dropdown-item').last().click();
    await page.waitForTimeout(600);
  }

  // Assert the state by DOM, never by eye: the row count must match the
  // fixture the filter selects, or the frame is a claim we cannot back.
  const rows = await page.locator('[data-testid="parcel-share-clawback-row"]').count();
  const expected = filter === 'ALL' ? CLAWBACKS.data.length : OUTSTANDING_ONLY.data.length;
  if (rows !== expected) {
    throw new Error(`refusing to save ${name}: ${rows} rows rendered, fixture has ${expected}`);
  }
  const themed = await page.evaluate(() => !!document.querySelector('.is-dark, .admin-shell.is-dark, body.is-dark'));
  if (!!dark !== themed) {
    throw new Error(`refusing to save ${name}: dark=${!!dark} but themed=${themed}`);
  }

  await shoot(section, page, name);
  await page.close();
}

async function captureReturnModal(browser, { clawback, name }) {
  const page = await newSeededPage(browser, { dark: false, viewport: { width: 1280, height: 1400 } });
  await page.route('**/driver-cash/days?**', (route) => route.fulfill(json(ok([DAY_SUMMARY_ROW]))));
  await page.route('**/driver-cash/days/77', (route) => route.fulfill(json(makeDayDetail(clawback))));
  await page.route('**/settlements/pending**', (route) => route.fulfill(json(ok({ range: {}, items: [] }))));

  await page.goto(`${BASE}/admin/settlements`, { waitUntil: 'networkidle' });
  const openBtn = page
    .locator('[data-testid="driver-cash-days-list"] .admin-btn-small, app-driver-cash-days-list .admin-btn-small')
    .first();
  await openBtn.waitFor({ state: 'visible', timeout: 30000 });
  await openBtn.click();
  const modal = page.locator('.driver-cash-return-modal');
  await modal.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(600);

  const lines = await page.locator('[data-testid="driver-cash-return-parcel-clawback"]').count();
  const expected = clawback === '0.00' ? 0 : 1;
  if (lines !== expected) {
    throw new Error(`refusing to save ${name}: clawback line count ${lines}, expected ${expected}`);
  }

  await shoot(modal, page, name);
  await page.close();
}

async function captureStaffPanel(browser, { clawback, name }) {
  const page = await newSeededPage(browser, { dark: false, viewport: { width: 1280, height: 900 } });
  await page.route('**/driver-cash/schedules/*/day', (route) => route.fulfill(json(makeDayDetail(clawback))));
  await page.route('**/schedules/331/boarding-list', (route) => route.fulfill(json(ok({ items: [] }))));

  await page.goto(`${BASE}/staff/boarding/331`, { waitUntil: 'networkidle' });
  const summary = page.locator('[data-testid="driver-cash-summary"]');
  await summary.waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('[data-testid="driver-cash-net"]').waitFor({ timeout: 15000 });

  const pills = await page.locator('[data-testid="driver-cash-parcel-clawback"]').count();
  const expected = clawback === '0.00' ? 0 : 1;
  if (pills !== expected) {
    throw new Error(`refusing to save ${name}: clawback pill count ${pills}, expected ${expected}`);
  }

  await shoot(summary, page, name);
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

  await run('reports-outstanding-light', () =>
    captureReports(browser, { dark: false, filter: 'OUTSTANDING', name: 'OBRS-1053-AFTER-clawbacks-outstanding-light.png' })
  );
  await run('reports-outstanding-dark', () =>
    captureReports(browser, { dark: true, filter: 'OUTSTANDING', name: 'OBRS-1053-AFTER-clawbacks-outstanding-dark.png' })
  );
  await run('reports-all-light', () =>
    captureReports(browser, { dark: false, filter: 'ALL', name: 'OBRS-1053-AFTER-clawbacks-all-light.png' })
  );
  await run('return-modal-with-clawback', () =>
    captureReturnModal(browser, { clawback: '15.00', name: 'OBRS-1053-AFTER-driver-cash-return-clawback-line.png' })
  );
  await run('return-modal-zero', () =>
    captureReturnModal(browser, { clawback: '0.00', name: 'OBRS-1053-ZERO-driver-cash-return-no-clawback-line.png' })
  );
  await run('staff-panel-with-clawback', () =>
    captureStaffPanel(browser, { clawback: '15.00', name: 'OBRS-1053-AFTER-driver-cash-panel-clawback-pill.png' })
  );
  await run('staff-panel-zero', () =>
    captureStaffPanel(browser, { clawback: '0.00', name: 'OBRS-1053-ZERO-driver-cash-panel-no-pill.png' })
  );

  await browser.close();
  if (failures.length) {
    console.error('CAPTURE FAILURES:\n' + failures.join('\n'));
    process.exit(1);
  }
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
