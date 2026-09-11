// Standalone capture script for OBRS-1800 visual evidence. Not a Playwright test and not part
// of the suite - run it by hand:
//
//   AFTER  : cd OBRS-frontend-wt-obrs-1800        && npx ng serve --port 4310
//   BEFORE : cd OBRS-frontend-wt-obrs-1800-before && npx ng serve --port 4205   (detached at origin/dev)
//   node e2e/scripts/capture-obrs1800.js [AFTER|BEFORE]   (omit the arg to shoot both)
//
// No backend - every /api call is stubbed with page.route() (the OBRS-677 lane), which is what
// lets both builds be photographed against the SAME wire bytes: the only thing that differs
// between BEFORE and AFTER is the code. Both fixtures deliberately carry ALL EIGHT
// `EPaymentMethod` slugs, one per row, so a single frame shows the whole value set rather than
// the one slug the owner happened to photograph.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1800');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const json = (route, body) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** `EPaymentMethod` (OBRS-backend) - the closed set the API can send, in enum order. */
const SLUGS = ['cash', 'card', 'bank_transfer', 'qr_promptpay', 'truemoney', 'shopeepay', 'rabbit_linepay', 'other'];

const BOOKING_ID = 1800;

const BANKS = ok([
  { code: 'kbank', nameTh: 'กสิกรไทย', nameEn: 'Kasikornbank', nameZh: '开泰银行' },
]);

// One pending refund per method. The destination column alternates so the frame is not
// artificially uniform, but nothing there is what this card changes.
const PENDING_REFUNDS = ok({
  content: SLUGS.map((slug, i) => ({
    paymentId: 9000 + i,
    bookingId: BOOKING_ID + i,
    bookingNumber: 'B-Y3T4C' + i,
    customerName: 'สมชาย ใจดี',
    contactPhone: '0812345678',
    amount: 160,
    amountOwed: 160,
    paymentMethod: slug,
    paidAt: '2026-08-20T10:15:00+07:00',
    reason: 'full_cancel',
    queuedAt: '2026-08-20T10:20:00+07:00',
    overdue: true,
    destinationType: i % 2 === 0 ? 'bank_account' : 'promptpay',
    destination: i % 2 === 0
      ? { bank: 'kbank', accountNumber: '1718553748', accountName: 'สมชาย ใจดี' }
      : { promptpayPhone: '0812345678' },
  })),
  totalElements: SLUGS.length,
  totalPages: 1,
  size: 20,
  number: 0,
  numberOfElements: SLUGS.length,
});

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

// One transaction per method, same reason as the worklist fixture above.
const BOOKING_PAYMENTS = ok({
  bookingId: BOOKING_ID,
  paymentSummary: BOOKING_DETAIL.data.payment,
  transactions: SLUGS.map((slug, i) => ({
    transactionId: 'TX-' + (1800 + i),
    paymentMethod: slug,
    amount: 160,
    currency: 'THB',
    status: 'success',
    paidAt: '2026-08-20T1' + i + ':15:00+07:00',
  })),
});

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
  await page.route('**/api/private/banks', (route) => json(route, BANKS));
  await page.route('**/private/payments/refunds/pending**', (route) => json(route, PENDING_REFUNDS));
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

/**
 * Reads the payment-method column out of the DOM and prints it. The frame is the evidence, but
 * the assertion is what makes the frame trustworthy: a green PNG of the wrong column proves
 * nothing, and "the label is not the slug" is exactly the property under review.
 */
async function readColumn(table, columnIndex) {
  return table.locator('tbody tr').evaluateAll(
    (rows, i) => rows.map((r) => ((r.children[i] && r.children[i].textContent) || '').trim()),
    columnIndex,
  );
}

async function shotWorklist(browser, baseUrl, lang, name) {
  const page = await adminPage(browser, lang);
  await page.goto(baseUrl + '/admin/manual-refunds', { waitUntil: 'networkidle' });
  const table = page.locator('.admin-table').first();
  await table.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 30000 });
  await assertNoErrorOverlay(page);
  console.log(name, JSON.stringify(await readColumn(table, 2)));
  await page.locator('.admin-card').first().screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log('captured', name);
  await page.close();
}

async function shotBookingDetail(browser, baseUrl, lang, name, timelineName) {
  const page = await adminPage(browser, lang);
  await page.goto(baseUrl + '/admin/bookings', { waitUntil: 'networkidle' });

  const row = page.locator('tbody tr', { hasText: 'B-Y3T4CJ' }).first();
  await row.waitFor({ state: 'visible', timeout: 30000 });
  await row.locator('button.admin-btn-small').first().click();

  const modal = page.locator('.bk-detail-modal');
  await modal.waitFor({ state: 'visible', timeout: 15000 });
  // The transaction table only exists once the payments fetch resolves; without this the frame
  // can catch the 'updating' state, which photographs as a modal with no table at all.
  const table = modal.locator('table.admin-table').last();
  await table.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 15000 });
  await assertNoErrorOverlay(page);
  console.log(name, JSON.stringify(await readColumn(table, 1)));
  await table.screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log('captured', name);

  // The SAME modal says the method a second time, inside a translated sentence
  // ("ได้รับการชำระเงิน ({{method}})"). It is its own frame because it is a separate
  // render path - a `params:` interpolation in the .ts, not a cell in the table above -
  // and the first pass of this card fixed only the table.
  const timeline = modal.locator('.bk-timeline');
  await timeline.waitFor({ state: 'visible', timeout: 15000 });
  console.log(timelineName, JSON.stringify(await timeline.locator('li').allInnerTexts()));
  // PRE-EXISTING, not this card: the list carries ten empty <li> above the real entries, and
  // the BEFORE frames (origin/dev, untouched) carry the same band - so it is what the owner
  // sees on prod today. The frame is left uncropped for that reason: hiding it would make the
  // picture a claim about a UI that does not exist. Reported separately, not fixed here.
  await timeline.screenshot({ path: path.join(ASSETS_DIR, timelineName) });
  console.log('captured', timelineName);
  await page.close();
}

async function main() {
  const browser = await chromium.launch();
  // One build per run by default: two `ng serve` processes at once put this box into memory
  // pressure and both were killed mid-compile. Pass AFTER or BEFORE to shoot just that one.
  const only = (process.argv[2] || '').toUpperCase();
  const builds = [
    ['AFTER', 'http://localhost:4310'],
    ['BEFORE', 'http://localhost:4205'],
  ].filter((b) => !only || b[0] === only);

  for (const build of builds) {
    for (const lang of ['th', 'en']) {
      await shotWorklist(browser, build[1], lang, 'OBRS-1800-' + build[0] + '-manual-refunds-' + lang + '.png');
      await shotBookingDetail(
        browser,
        build[1],
        lang,
        'OBRS-1800-' + build[0] + '-booking-transactions-' + lang + '.png',
        'OBRS-1800-' + build[0] + '-booking-timeline-' + lang + '.png',
      );
    }
  }

  await browser.close();
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
