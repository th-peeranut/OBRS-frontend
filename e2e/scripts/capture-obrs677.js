// Standalone capture script for OBRS-677 visual evidence (not a Playwright test, not committed to the suite).
//
// Approach: NO backend. AuthService.isAuthenticated() is a pure localStorage
// check (`!!getToken()`), and admin grants owner in ROLE_GRANTS, so seeding
// auth_token/auth_roles lets the AuthGuard through. Every API call is stubbed
// with page.route(), so we can inject a not-travelled block richer (negative
// retained, settled===null) than any seed could realistically produce.
//
// AFTER = this branch on :4200. BEFORE = origin/dev on :4205 (same mocks — the
// old modal simply ignores the extra JSON keys, so its block is absent).
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-677');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

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
      liveTotalAmount: '2410.00',
      ticketCount: 5,
    },
  ],
});

// PENDING round with a not-travelled block. The block is internally consistent
// (byMethod & byStatus both sum to collected 950 / refunded 540 / retained 410)
// and the `card` method row is OVER-refunded → retained -฿40.00 (AC 5).
const PENDING_DETAIL = ok({
  scheduleId: 42,
  originStopId: 5,
  originStopSlug: 'nong_chak',
  departureDateTime: '2026-07-10T08:00:00+07:00',
  status: 'PENDING',
  currency: 'THB',
  live: {
    totalAmount: '2410.00',
    ticketCount: 5,
    passengerCount: 5,
    byMethod: [
      { method: 'cash', amount: '850.00', ticketCount: 2 },
      { method: 'card', amount: '400.00', ticketCount: 1 },
      { method: 'bank_transfer', amount: '750.00', ticketCount: 2 },
    ],
    byChannel: [
      { channel: 'walk_in', amount: '1200.00', ticketCount: 3, remote: false },
      { channel: 'agent', amount: '750.00', ticketCount: 1, remote: true },
      { channel: 'online', amount: '460.00', ticketCount: 1, remote: true },
    ],
    onSiteTotal: '1200.00',
    agencyTotal: '1210.00',
    notTravelled: {
      ticketCount: 3,
      collectedAmount: '950.00',
      refundedAmount: '540.00',
      retainedAmount: '410.00',
      byMethod: [
        { key: 'cash', ticketCount: 2, collectedAmount: '650.00', refundedAmount: '200.00', retainedAmount: '450.00' },
        { key: 'card', ticketCount: 1, collectedAmount: '300.00', refundedAmount: '340.00', retainedAmount: '-40.00' },
      ],
      byStatus: [
        { key: 'cancelled', ticketCount: 2, collectedAmount: '550.00', refundedAmount: '540.00', retainedAmount: '10.00' },
        { key: 'no_show', ticketCount: 1, collectedAmount: '400.00', refundedAmount: '0.00', retainedAmount: '400.00' },
      ],
    },
  },
  settled: null,
  discrepancy: null,
});

// A round settled BEFORE OBRS-670 shipped: settled.notTravelled === null → the
// UI must say "no data", never 0.00 (AC 4).
const SETTLED_NULL_DETAIL = ok({
  scheduleId: 42,
  originStopId: 5,
  originStopSlug: 'nong_chak',
  departureDateTime: '2026-07-01T08:00:00+07:00',
  status: 'SETTLED',
  currency: 'THB',
  live: {
    totalAmount: '1800.00',
    ticketCount: 4,
    passengerCount: 4,
    byMethod: [{ method: 'cash', amount: '1800.00', ticketCount: 4 }],
    byChannel: [{ channel: 'walk_in', amount: '1800.00', ticketCount: 4, remote: false }],
    onSiteTotal: '1800.00',
    agencyTotal: '0.00',
    notTravelled: {
      ticketCount: 0, collectedAmount: '0.00', refundedAmount: '0.00', retainedAmount: '0.00',
      byMethod: [], byStatus: [],
    },
  },
  settled: {
    totalAmount: '1800.00',
    byMethod: [{ method: 'cash', amount: '1800.00' }],
    byChannel: [{ channel: 'walk_in', amount: '1800.00' }],
    settledBy: 9,
    settledByName: 'Owner Somchai',
    settledAt: '2026-07-01T09:05:00+07:00',
    notTravelled: null,
  },
  discrepancy: { hasDiscrepancy: false, settledTotal: '1800.00', liveTotal: '1800.00', deltaAmount: '0.00' },
});

async function newSeededPage(browser, { dark }) {
  // Tall viewport so `.admin-modal { max-height: calc(100vh - 32px); overflow:auto }`
  // does not clip the not-travelled tables below the fold — we want the WHOLE
  // modal in one shot, no internal scroll.
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
  await page.waitForTimeout(500);
}

async function shotModal(page, name) {
  await page.locator('.settlement-detail-modal').screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log('captured', name);
}

async function main() {
  const browser = await chromium.launch();

  // ---- AFTER :4200 ----
  {
    const page = await newSeededPage(browser, { dark: false });
    await openModal(page, 'http://localhost:4200', PENDING_DETAIL);
    await shotModal(page, 'OBRS-677-AFTER-pending-not-travelled-light.png');
    await page.close();
  }
  {
    const page = await newSeededPage(browser, { dark: true });
    await openModal(page, 'http://localhost:4200', PENDING_DETAIL);
    await shotModal(page, 'OBRS-677-AFTER-pending-not-travelled-dark.png');
    await page.close();
  }
  {
    const page = await newSeededPage(browser, { dark: false });
    await openModal(page, 'http://localhost:4200', SETTLED_NULL_DETAIL);
    await shotModal(page, 'OBRS-677-AFTER-settled-no-data-light.png');
    await page.close();
  }

  // ---- BEFORE :4205 (origin/dev — no not-travelled block) ----
  {
    const page = await newSeededPage(browser, { dark: false });
    await openModal(page, 'http://localhost:4205', PENDING_DETAIL);
    await shotModal(page, 'OBRS-677-BEFORE-pending-no-not-travelled-light.png');
    await page.close();
  }

  await browser.close();
  console.log('DONE');
}

main().catch((e) => { console.error(e); process.exit(1); });
