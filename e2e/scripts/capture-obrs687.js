// Standalone capture script for OBRS-687 visual evidence (not a Playwright test, not committed to the suite run).
//
// Same NO-backend approach as capture-obrs677.js: AuthService.isAuthenticated()
// is a pure localStorage check and admin/owner passes the AdminGuard, so seeding
// auth_token/auth_roles gets us in. Every API call is stubbed with page.route(),
// so the sign-off modal renders against deterministic data — no departed cash
// round has to exist anywhere.
//
// OBRS-687 adds the cash sign-off FORM (counted cash + expected/discrepancy +
// hander picker + conditional reason) to the PENDING modal, and a frozen cash
// RECONCILIATION block to the SETTLED modal. This mocks GET /users too, so the
// hander picker actually populates.
//
// AFTER = this branch. BEFORE = origin/dev (the old modal has only a single
// "Confirm Receipt" button — it ignores the extra JSON keys, so no form).
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-687');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const AFTER_URL = process.env.AFTER_URL || 'http://localhost:4390';
const BEFORE_URL = process.env.BEFORE_URL || 'http://localhost:4391';

const ok = (data) => ({ code: 200, message: 'OK', data });

const PENDING_LIST = ok({
  range: { from: '2026-07-04', to: '2026-07-10', timezone: 'Asia/Bangkok' },
  items: [
    {
      scheduleId: 42,
      originStopId: 5,
      originStopSlug: 'nong_chak',
      departureDateTime: '2026-07-10T08:00:00+07:00',
      routeSlug: 'bkk-cnx',
      liveTotalAmount: '2000.00',
      ticketCount: 5,
    },
  ],
});

// Salespeople for the hander picker. Includes the AdminRoleDto form + an admin
// (dropped) so the same fixture doubles as a filtering sanity check.
const USERS = ok([
  { id: 7, fullName: 'Sam Sales', roles: ['salesperson'], status: 'active' },
  { id: 5, firstName: 'Bee', lastName: 'Counter', roles: [{ slug: 'salesperson' }], status: 'active' },
  { id: 3, fullName: 'Anna Admin', roles: ['admin'], status: 'active' },
]);

// PENDING round — expected CASH = the `cash` bucket = 850.00.
const PENDING_DETAIL = ok({
  scheduleId: 42,
  originStopId: 5,
  originStopSlug: 'nong_chak',
  departureDateTime: '2026-07-10T08:00:00+07:00',
  status: 'PENDING',
  currency: 'THB',
  live: {
    totalAmount: '2000.00',
    ticketCount: 5,
    passengerCount: 5,
    byMethod: [
      { method: 'cash', amount: '850.00', ticketCount: 2 },
      { method: 'card', amount: '400.00', ticketCount: 1 },
      { method: 'bank_transfer', amount: '750.00', ticketCount: 2 },
    ],
    byChannel: [
      { channel: 'walk_in', amount: '1250.00', ticketCount: 3, remote: false },
      { channel: 'agent', amount: '750.00', ticketCount: 2, remote: true },
    ],
    onSiteTotal: '1250.00',
    agencyTotal: '750.00',
    notTravelled: {
      ticketCount: 0, collectedAmount: '0.00', refundedAmount: '0.00', retainedAmount: '0.00',
      byMethod: [], byStatus: [],
    },
  },
  settled: null,
  discrepancy: null,
});

// SETTLED round with a post-OBRS-671 cash reconciliation: a SHORT drawer
// (counted 830 vs expected 850 → −20.00) with a reason + hander.
const SETTLED_SHORT_DETAIL = ok({
  scheduleId: 42,
  originStopId: 5,
  originStopSlug: 'nong_chak',
  departureDateTime: '2026-07-08T08:00:00+07:00',
  status: 'SETTLED',
  currency: 'THB',
  live: {
    totalAmount: '2000.00', ticketCount: 5, passengerCount: 5,
    byMethod: [{ method: 'cash', amount: '850.00', ticketCount: 2 }],
    byChannel: [{ channel: 'walk_in', amount: '2000.00', ticketCount: 5, remote: false }],
    onSiteTotal: '2000.00', agencyTotal: '0.00',
    notTravelled: {
      ticketCount: 0, collectedAmount: '0.00', refundedAmount: '0.00', retainedAmount: '0.00',
      byMethod: [], byStatus: [],
    },
  },
  settled: {
    totalAmount: '2000.00',
    byMethod: [{ method: 'cash', amount: '850.00' }, { method: 'card', amount: '400.00' }, { method: 'bank_transfer', amount: '750.00' }],
    byChannel: [{ channel: 'walk_in', amount: '2000.00' }],
    settledBy: 9,
    settledByName: 'Owner Somchai',
    settledAt: '2026-07-08T09:05:00+07:00',
    notTravelled: { ticketCount: 0, collectedAmount: '0.00', refundedAmount: '0.00', retainedAmount: '0.00' },
    countedAmount: '830.00',
    expectedCashAmount: '850.00',
    discrepancyAmount: '-20.00',
    discrepancyReason: 'ขาด 20 (ทอนเงินผิด)',
    handedOverBy: 7,
    handedOverByName: 'Sam Sales',
  },
  discrepancy: { hasDiscrepancy: false, settledTotal: '2000.00', liveTotal: '2000.00', deltaAmount: '0.00' },
});

async function newSeededPage(browser, { dark }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 2100 } });
  await page.addInitScript(
    ([isDark]) => {
      localStorage.setItem('app_language', 'en');
      localStorage.setItem('auth_token', 'fake-owner-token-for-capture');
      localStorage.setItem('auth_username', 'owner@system.local');
      localStorage.setItem('auth_roles', JSON.stringify(['owner']));
      if (isDark) localStorage.setItem('app_admin_theme', 'dark');
    },
    [!!dark],
  );

  // Catch-all FIRST (lowest priority — last-registered wins in Playwright).
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) }));
  await page.route('**/private/users**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USERS) }));
  await page.route('**/settlements/pending**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PENDING_LIST) }));
  return page;
}

async function openModal(page, baseUrl, detail) {
  await page.route('**/settlements/schedules/*', (route) => {
    if (route.request().url().includes('/confirm')) return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) });
  });
  await page.goto(`${baseUrl}/admin/settlements`, { waitUntil: 'networkidle' });
  const viewBtn = page.locator('table.admin-table .admin-btn-small').first();
  await viewBtn.waitFor({ state: 'visible', timeout: 20000 });
  await viewBtn.click();
  await page.locator('.settlement-detail-modal').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(400);
}

async function shotModal(page, name) {
  await page.locator('.settlement-detail-modal').screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log('captured', name);
}

// Fill the sign-off form so the discrepancy + reason surface (AFTER only).
async function fillShortDrawer(page) {
  await page.locator('#counted-cash').fill('830.00'); // expected 850 → −20 short
  await page.locator('#handed-over-by').selectOption('7');
  await page.locator('#discrepancy-reason').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#discrepancy-reason').fill('ขาด 20 (ทอนเงินผิด)');
  await page.waitForTimeout(300);
}

async function main() {
  const browser = await chromium.launch();

  // ---- AFTER ----
  {
    const page = await newSeededPage(browser, { dark: false });
    await openModal(page, AFTER_URL, PENDING_DETAIL);
    await fillShortDrawer(page);
    await shotModal(page, 'OBRS-687-AFTER-signoff-form-short-drawer-light.png');
    await page.close();
  }
  {
    const page = await newSeededPage(browser, { dark: true });
    await openModal(page, AFTER_URL, PENDING_DETAIL);
    await fillShortDrawer(page);
    await shotModal(page, 'OBRS-687-AFTER-signoff-form-short-drawer-dark.png');
    await page.close();
  }
  {
    const page = await newSeededPage(browser, { dark: false });
    await openModal(page, AFTER_URL, SETTLED_SHORT_DETAIL);
    await shotModal(page, 'OBRS-687-AFTER-settled-cash-reconciliation-light.png');
    await page.close();
  }

  // ---- BEFORE (origin/dev — no sign-off form, just the Confirm button) ----
  {
    const page = await newSeededPage(browser, { dark: false });
    await openModal(page, BEFORE_URL, PENDING_DETAIL);
    await shotModal(page, 'OBRS-687-BEFORE-pending-no-signoff-form-light.png');
    await page.close();
  }

  await browser.close();
  console.log('DONE');
}

main().catch((e) => { console.error(e); process.exit(1); });
