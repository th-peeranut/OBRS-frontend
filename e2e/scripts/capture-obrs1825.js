// Standalone capture script for OBRS-1825 visual evidence. Not a Playwright test and not part
// of the suite - run it by hand:
//
//   AFTER  : cd OBRS-frontend-wt-obrs-1825        && npx ng serve --port 4325
//   BEFORE : cd OBRS-frontend-wt-obrs-1825-before && npx ng serve --port 4326   (detached at origin/dev)
//   node e2e/scripts/capture-obrs1825.js [AFTER|BEFORE]   (omit the arg to shoot both)
//
// No backend - every /api call is stubbed with page.route() (the OBRS-677 lane), so BEFORE and
// AFTER are photographed against the SAME wire bytes and the only difference is the code.
//
// This card changes ONLY the `track` expression of two `@for` loops, so the point of these
// frames is that NOTHING moved. The real assertion is not the picture at all: each shot prints
// the rendered rows AND the browser console, because the defect this card fixes announces
// itself as NG0956 ("track by identity caused re-creation of the entire collection") - a line
// no screenshot can ever show.
//
// The fixtures here are deliberately ORDINARY (one booking, two payments, six lookups).
// OBRS-1800 stuffed all eight payment slugs into one booking to see the whole value set in one
// frame, and that dense fixture produced an artefact I then reported as a production bug. A
// frame whose shape exists only in the harness cannot testify about production.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1825');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const json = (route, body) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const BOOKING_ID = 1825;

const BOOKINGS_LIST = ok({
  content: [
    {
      id: BOOKING_ID,
      bookingNumber: 'B-Y3T4CJ',
      totalAmount: '1280',
      status: { code: 'confirmed', label: 'ยืนยันแล้ว' },
      createdAt: '2026-08-20T10:00:00+07:00',
      contact: { fullName: 'สมชาย ใจดี', phoneNumber: '0812345678', email: 'somchai@example.com' },
      payment: {
        overallPaymentStatus: 'paid',
        totalAmount: '1280',
        paidAmount: '1280',
        outstandingAmount: '0',
        refundedAmount: '0',
        currency: 'THB',
        status: 'paid',
      },
    },
  ],
  totalElements: 1,
  totalPages: 1,
  size: 100,
  number: 0,
  numberOfElements: 1,
});

const BOOKING_DETAIL = ok({
  id: BOOKING_ID,
  bookingNumber: 'B-Y3T4CJ',
  bookingType: { code: 'one_way', label: 'เที่ยวเดียว' },
  status: { code: 'confirmed', label: 'ยืนยันแล้ว' },
  createdAt: '2026-08-20T10:00:00+07:00',
  expiredAt: '2026-08-20T10:30:00+07:00',
  contact: { fullName: 'สมชาย ใจดี', phoneNumber: '0812345678', email: 'somchai@example.com' },
  journeys: [],
  pricing: { totalAmount: '1280', currency: 'THB' },
  payment: {
    overallPaymentStatus: 'paid',
    totalAmount: '1280',
    paidAmount: '1280',
    outstandingAmount: '0',
    refundedAmount: '0',
    currency: 'THB',
    status: 'paid',
  },
});

// Two transactions sharing one method, on purpose: they produce two timeline entries with the
// SAME labelKey, which is why the fix cannot track the timeline by label (NG0955 duplicate key).
const BOOKING_PAYMENTS = ok({
  bookingId: BOOKING_ID,
  paymentSummary: BOOKING_DETAIL.data.payment,
  transactions: [
    {
      transactionId: 'TX-1825-1',
      paymentMethod: 'qr_promptpay',
      amount: 640,
      currency: 'THB',
      status: 'success',
      paidAt: '2026-08-20T10:05:00+07:00',
    },
    {
      transactionId: 'TX-1825-2',
      paymentMethod: 'qr_promptpay',
      amount: 640,
      currency: 'THB',
      status: 'success',
      paidAt: '2026-08-20T10:12:00+07:00',
    },
  ],
});

const tr = (en, th) => [
  { locale: 'en', label: en, description: '-' },
  { locale: 'th', label: th, description: '-' },
];

// Three categories so the grouped table has more than one group row to keep or rebuild.
const LOOKUPS = ok([
  { id: 1, category: 'booking_status', slug: 'confirmed', translations: tr('Confirmed', 'ยืนยันแล้ว') },
  { id: 2, category: 'booking_status', slug: 'cancelled', translations: tr('Cancelled', 'ยกเลิกแล้ว') },
  { id: 3, category: 'payment_method', slug: 'cash', translations: tr('Cash', 'เงินสด') },
  { id: 4, category: 'payment_method', slug: 'qr_promptpay', translations: tr('PromptPay QR', 'พร้อมเพย์ QR') },
  { id: 5, category: 'role_status', slug: 'active', translations: tr('Active', 'ใช้งาน') },
  { id: 6, category: 'role_status', slug: 'inactive', translations: tr('Inactive', 'ปิดใช้งาน') },
]);

/** Every browser console line, so an NG0956/NG0100 cannot pass unnoticed behind a clean frame. */
function collectConsole(page) {
  const lines = [];
  page.on('console', (msg) => lines.push(msg.type().toUpperCase() + ': ' + msg.text()));
  page.on('pageerror', (err) => lines.push('PAGEERROR: ' + err.message));
  return lines;
}

async function adminPage(browser, lang) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
  await page.addInitScript((l) => {
    localStorage.setItem('app_language', l);
    localStorage.setItem('auth_token', 'fake-token-for-capture');
    localStorage.setItem('auth_username', 'admin@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['admin']));
  }, lang);

  // Catch-all FIRST - Playwright gives the LAST registered route priority.
  await page.route('**/api/**', (route) => json(route, ok(null)));
  await page.route('**/private/lookups', (route) => json(route, LOOKUPS));
  await page.route('**/private/admin/bookings**', (route) => json(route, BOOKINGS_LIST));
  await page.route('**/private/bookings/' + BOOKING_ID, (route) => json(route, BOOKING_DETAIL));
  await page.route('**/private/bookings/' + BOOKING_ID + '/payments', (route) => json(route, BOOKING_PAYMENTS));
  return page;
}

/** Guards the OBRS-702 lesson: a global error swal photographs a passing AC as broken. */
async function assertNoErrorOverlay(page) {
  await page.waitForTimeout(600); // the loading swal is a real transient state - let it settle
  const popups = await page.locator('.swal2-popup').count();
  if (popups > 0) {
    throw new Error('refusing to save: a SweetAlert popup is covering the page');
  }
}

function report(name, rows, consoleLines) {
  console.log(name, JSON.stringify(rows));
  const noisy = consoleLines.filter((l) => /NG0\d{3}/.test(l));
  console.log(name, 'angular diagnostics:', noisy.length ? JSON.stringify(noisy) : 'none');
}

async function shotTimeline(browser, baseUrl, name) {
  const page = await adminPage(browser, 'th');
  const consoleLines = collectConsole(page);
  await page.goto(baseUrl + '/admin/bookings', { waitUntil: 'networkidle' });

  const row = page.locator('tbody tr', { hasText: 'B-Y3T4CJ' }).first();
  await row.waitFor({ state: 'visible', timeout: 30000 });
  await row.locator('button.admin-btn-small').first().click();

  const modal = page.locator('.bk-detail-modal');
  await modal.waitFor({ state: 'visible', timeout: 15000 });
  const timeline = modal.locator('.bk-timeline');
  await timeline.waitFor({ state: 'visible', timeout: 15000 });
  // The payments fetch is what adds the two payment entries; shoot only once they are in.
  await timeline.locator('li').nth(4).waitFor({ state: 'visible', timeout: 15000 });
  await assertNoErrorOverlay(page);

  // Assert the SUBJECT before saving (OBRS-981), but assert what must be true of BOTH
  // builds - the fixture supplies five events, so anything less is a half-rendered frame.
  // The count ABOVE five is the defect itself and must be photographed, not rejected:
  // on BEFORE the repeater leaves the destroyed nodes in the list, so this reads 10 <li>
  // for 5 events, five of them blank. That is the artefact OBRS-1800 photographed and
  // mis-filed as a production bug.
  const rows = await timeline.locator('li').allInnerTexts();
  if (rows.length < 5) {
    throw new Error('refusing to save ' + name + ': expected at least 5 timeline entries, got ' + rows.length);
  }
  const blank = rows.filter((t) => !t.trim()).length;
  console.log(name, 'entries:', rows.length, 'blank:', blank);
  report(name, rows, consoleLines);
  await timeline.screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log('captured', name);
  await page.close();
}

async function shotLookupGroups(browser, baseUrl, name) {
  const page = await adminPage(browser, 'th');
  const consoleLines = collectConsole(page);
  await page.goto(baseUrl + '/admin/lookups', { waitUntil: 'networkidle' });

  const table = page.locator('table.admin-table').first();
  await table.locator('tr.admin-group-row').first().waitFor({ state: 'visible', timeout: 30000 });
  await assertNoErrorOverlay(page);

  const rows = await table.locator('tr.admin-group-row').allInnerTexts();
  if (rows.length < 3) {
    throw new Error('refusing to save ' + name + ': expected at least 3 category groups, got ' + rows.length);
  }
  console.log(name, 'group rows:', rows.length);
  report(name, rows, consoleLines);
  await table.screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log('captured', name);
  await page.close();
}

const TARGETS = {
  AFTER: 'http://localhost:4325',
  BEFORE: 'http://localhost:4326',
};

(async () => {
  const which = (process.argv[2] || '').toUpperCase();
  const targets = which ? [which] : ['BEFORE', 'AFTER'];
  const browser = await chromium.launch();
  try {
    for (const target of targets) {
      const baseUrl = TARGETS[target];
      if (!baseUrl) {
        throw new Error('unknown target ' + target + ' (expected AFTER or BEFORE)');
      }
      await shotTimeline(browser, baseUrl, 'OBRS-1825-' + target + '-booking-timeline.png');
      await shotLookupGroups(browser, baseUrl, 'OBRS-1825-' + target + '-lookup-groups.png');
    }
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
