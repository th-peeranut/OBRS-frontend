// Standalone capture script for OBRS-1136 AC-1 / AC-3 visual evidence.
// Not a Playwright test and not part of the suite — run it by hand:
//
//   AFTER  : cd OBRS-frontend-wt-1136        && npx ng serve --port 4200
//   BEFORE : cd OBRS-frontend-wt-1136-before && npx ng serve --port 4205   (detached at origin/dev)
//   node e2e/scripts/capture-obrs1136.js
//
// No backend. Every /api call is stubbed with page.route() (the OBRS-677 lane), which is what lets
// the two builds be photographed against the SAME wire bytes — the only thing that differs between
// the frames is the code. The BEFORE build simply ignores the extra `manualRefundDueDays` key, so
// its frames show what the customer reads today.
//
// AC-1 is /refund-policy (public, no auth). AC-3 is the cancel dialog on /my-bookings, which needs
// the auth_token seed because AuthService.isAuthenticated() is a pure localStorage check.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1136');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

// 7 is the shipped default and the number the AC-4 payout clock counts with, so this is what a
// customer sees on the day this ships — the point of the frame is that the page says it at all.
const MANUAL_REFUND_DUE_DAYS = 7;

const CANCELLATION_POLICY = ok({
  cancelWindowHours: 2,
  earlyWindowHours: 24,
  refundRateEarly: 0.8,
  refundRateLate: 0.5,
  manualRefundDueDays: MANUAL_REFUND_DUE_DAYS,
});

// One confirmed booking, paid by PromptPay — the lane that CANNOT be auto-refunded (OBRS-287 §4)
// and therefore the only one whose dialog shows the manual-refund note at all.
const MY_BOOKINGS = ok({
  content: [
    {
      id: 1136,
      bookingNumber: 'BK-1136',
      totalAmount: 500,
      status: 'confirmed',
      bookingType: 'one_way',
      bookingChannel: 'online',
      createdAt: '2026-08-01T09:00:00+07:00',
      rescheduleCount: 1, // keeps the reschedule offer out of the frame — it is not what this card changes
      seatChangeCount: 1,
      stopChangeCount: 1,
      bookingSchedules: [
        {
          id: 1,
          departureDateTime: '2026-09-20T08:00:00+07:00',
          passengerCount: 1,
          fromStop: { id: 1, slug: 'nong_chak', translations: [] },
          toStop: { id: 2, slug: 'mo_chit', translations: [] },
        },
      ],
    },
  ],
  totalElements: 1,
  totalPages: 1,
  number: 0,
  size: 20,
});

const CANCEL_POLICY_PREVIEW = ok({
  originalAmount: 500,
  refundAmount: 400,
  penaltyAmount: 100,
  refundRatePercent: '80%',
  refundMethod: 'MANUAL_REFUND_REQUIRED',
  policyWindow: 'EARLY',
  cancellationDeadline: '2026-09-19T08:00:00+07:00',
  earliestDepartureDateTime: '2026-09-20T08:00:00+07:00',
  manualRefundDueDays: MANUAL_REFUND_DUE_DAYS,
});

async function newPage(browser, { authed }) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  await page.addInitScript(
    ([isAuthed]) => {
      localStorage.setItem('app_language', 'th');
      if (isAuthed) {
        localStorage.setItem('auth_token', 'fake-customer-token-for-capture');
        localStorage.setItem('auth_username', 'somchai@example.com');
        localStorage.setItem('auth_roles', JSON.stringify(['user']));
      }
    },
    [!!authed],
  );

  // Catch-all FIRST — last-registered wins in Playwright, so the specific routes below override it.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) }));
  await page.route('**/api/cancellation-policy**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CANCELLATION_POLICY) }));
  await page.route('**/api/private/bookings/me**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MY_BOOKINGS) }));
  await page.route('**/api/private/bookings/*/cancel-policy', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CANCEL_POLICY_PREVIEW) }));
  return page;
}

/** Guards the OBRS-702 lesson: a global error swal over the page photographs a passing AC as broken. */
async function assertNoErrorOverlay(page) {
  await page.waitForTimeout(600); // the loading swal is a real transient state — let it settle first
  const popups = await page.locator('.swal2-popup').count();
  if (popups > 0) {
    throw new Error('refusing to save: a SweetAlert popup is covering the page');
  }
}

async function shotRefundPolicy(browser, baseUrl, name) {
  const page = await newPage(browser, { authed: false });
  await page.goto(`${baseUrl}/refund-policy`, { waitUntil: 'networkidle' });
  await page.locator('.policy-card').waitFor({ state: 'visible', timeout: 30000 });
  await assertNoErrorOverlay(page);
  await page.locator('.policy-card').screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log('captured', name);
  await page.close();
}

async function shotCancelModal(browser, baseUrl, name) {
  const page = await newPage(browser, { authed: true });
  await page.goto(`${baseUrl}/my-bookings`, { waitUntil: 'networkidle' });

  const menuBtn = page.locator('.actions-menu-btn').first();
  await menuBtn.waitFor({ state: 'visible', timeout: 30000 });
  await menuBtn.click();

  // The overflow menu is a PrimeNG p-menu rendered at body level; the cancel entry is the danger one.
  const cancelItem = page.locator('.action-menu-item--danger').first();
  await cancelItem.waitFor({ state: 'visible', timeout: 15000 });
  await cancelItem.click();

  const modal = page.locator('.crdm-modal');
  await modal.waitFor({ state: 'visible', timeout: 15000 });
  await assertNoErrorOverlay(page);
  await modal.screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log('captured', name);
  await page.close();
}

async function main() {
  const browser = await chromium.launch();

  await shotRefundPolicy(browser, 'http://localhost:4200', 'OBRS-1136-AFTER-6-refund-policy-th.png');
  await shotCancelModal(browser, 'http://localhost:4200', 'OBRS-1136-AFTER-7-cancel-modal-th.png');

  await shotRefundPolicy(browser, 'http://localhost:4205', 'OBRS-1136-BEFORE-2-refund-policy-th.png');
  await shotCancelModal(browser, 'http://localhost:4205', 'OBRS-1136-BEFORE-3-cancel-modal-th.png');

  await browser.close();
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
