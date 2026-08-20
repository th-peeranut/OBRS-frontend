/**
 * OBRS-1384 — before/after evidence for "the amount under the PromptPay QR is the
 * SEARCH page's headcount times the fare".
 *
 * Drives the REAL customer booking flow on SIT, because the API shortcut that
 * `sit-test-credentials` records for /payment (create the booking over the API, write
 * `localStorage['active_booking_id']`) cannot reproduce this bug: the passenger rows
 * this card is about only reach the NgRx `passengerInfo` store by walking through
 * /passenger-info, and the OPEN-seating +/- stepper that causes the divergence lives
 * on that page.
 *
 * The shape of the repro:
 *   search page says 1 passenger  ->  /passenger-info stepper + makes it 2
 *   BEFORE: QR amount 200.00 (one seat), summary "ผู้ใหญ่ 1 คน"
 *   AFTER : QR amount 400.00 (the charge the server created), summary "ผู้ใหญ่ 2 คน"
 *
 * Trip (measured 2026-08-20 against POST /api/schedules/search on SIT):
 * nong_chak -> mo_chit_2_bus_terminal, minibus, seatingMode OPEN, 200.00 THB/seat.
 *
 * Run (serve the branch first, SIT config, any localhost port — SIT CORS reflects it):
 *   node capture-obrs1384.js http://localhost:4300 <outDir> BEFORE
 *   node capture-obrs1384.js http://localhost:4400 <outDir> AFTER
 *
 * Every assertion is read off the DOM and printed; the images are the illustration,
 * the printed numbers are the evidence.
 */
const path = require('path');
const { chromium } = require(path.join(
  'C:', 'Users', 'thpee', 'Desktop', 'workshop', 'OBRS-frontend', 'node_modules', 'playwright'
));

const BASE = process.argv[2] || 'http://localhost:4200';
const OUT = process.argv[3] || process.cwd();
const TAG = process.argv[4] || 'AFTER';
const MODE = process.argv[5] || 'payment'; // 'payment' | 'backleg' (see step 5b)

const EMAIL = 'customer@system.local';
const PASSWORD = 'P@ssw0rd';

const FROM = 'หนองชาก';
const TO = 'หมอชิต 2';
const DEPART_DAY = 21; // 2026-08-21, the day probed above

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot(page, locator, name) {
  const file = path.join(OUT, `OBRS-1384-${TAG}-${name}.png`);
  await locator.screenshot({ path: file });
  console.log(`  shot -> ${file}`);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1100 },
    deviceScaleFactor: 2,
    locale: 'th-TH',
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 200));
  });

  // --- 1. log in through the real form -------------------------------------
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('.login-btn');
  await page.waitForFunction(() => !!localStorage.getItem('auth_token'), { timeout: 60000 });
  console.log('logged in as', EMAIL);

  // --- 2. home search: ONE passenger, one way ------------------------------
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await sleep(1500);

  // one-way (OBRS-1185 made round-trip the default; the pills are one tap).
  // Picking the wrong pill lands in OBRS-1336's "no return leg" confirm instead
  // of /review-schedule-booking, which reads exactly like a broken selector.
  const pills = page.locator('.trip-type-toggle__btn');
  console.log('trip-type pills:', JSON.stringify(await pills.allInnerTexts()));
  await pills.filter({ hasText: /เที่ยวเดียว|One[- ]?way/i }).first().click();
  await sleep(600);
  console.log(
    'trip type now:',
    JSON.stringify(
      await pills.evaluateAll((els) =>
        els.map((e) => `${e.innerText.trim()}=${e.getAttribute('aria-pressed')}`)
      )
    )
  );

  // OBRS-1224: the origin/destination triggers ARE search boxes — type, then pick.
  const combos = page.locator('input.dropdown-combo-input');
  await combos.nth(0).click();
  await combos.nth(0).fill(FROM);
  await sleep(900);
  await page.locator('.dropdown-menu.show .dropdown-option').first().click();
  await sleep(600);
  await combos.nth(1).click();
  await combos.nth(1).fill(TO);
  await sleep(900);
  await page.locator('.dropdown-menu.show .dropdown-option').first().click();
  await sleep(600);

  // p-calendar: drive the panel, typing does not update the model
  await page.locator('p-datepicker input, .p-datepicker input').first().click();
  await sleep(800);
  await page
    .locator('.p-datepicker-calendar td:not(.p-datepicker-other-month) span:not(.p-disabled)', {
      hasText: new RegExp(`^${DEPART_DAY}$`),
    })
    .first()
    .click();
  await sleep(600);

  const searchHeadcount = await page.locator('#dropdownObrsPassenger').innerText();
  console.log('search page headcount reads:', JSON.stringify(searchHeadcount.trim()));

  await page.locator('.btn-search').first().click();
  await page.waitForURL('**/schedule-booking**', { timeout: 60000 });
  await page.waitForSelector('.select-btn', { timeout: 60000 });
  console.log('on /schedule-booking');

  // --- 3. pick the OPEN-seating round --------------------------------------
  const selectBtns = page.locator('.select-btn:not(.select-btn--closed)');
  console.log('selectable rounds:', await selectBtns.count());
  await selectBtns.first().click();
  await sleep(2000);
  console.log('url after picking the round:', page.url());
  await page.waitForURL('**/review-schedule-booking**', { timeout: 60000 });
  await sleep(1500);

  const reviewRows = await page.locator('app-review-schedule-booking-total .card-body').innerText();
  console.log('/review-schedule-booking (forward leg) reads:\n   ', reviewRows.replace(/\n/g, ' | '));
  await shoot(
    page,
    page.locator('app-review-schedule-booking-total .card-container'),
    '0-review-forward-leg'
  );

  // sticky footer intercepts, hence force
  await page.locator('.btn-confirm').first().click({ force: true });
  await page.waitForURL('**/passenger-info**', { timeout: 60000 });
  await sleep(2500);
  console.log('on /passenger-info');

  // --- 4. the OPEN-seating stepper: 1 -> 2 ---------------------------------
  // OBRS-323's count card: the +/- are <img>, not buttons.
  await page.waitForSelector('.open-seat-card .passenger-add', { timeout: 60000 });
  console.log(
    'OPEN-seat count before +:',
    (await page.locator('.open-seat-card-count').first().innerText()).trim()
  );
  await page.locator('.open-seat-card .passenger-add').first().click();
  await sleep(2000);
  console.log(
    'OPEN-seat count after  +:',
    (await page.locator('.open-seat-card-count').first().innerText()).trim()
  );

  // --- 5. fill booker + both passengers ------------------------------------
  await page.fill('#booker-firstName', 'สมชาย');
  await page.fill('#booker-lastName', 'ทดสอบ');
  await page.fill('#booker-phoneNumber', '0812345678');
  await page.click('#booker-gender_male');
  const bookerEmail = page.locator('#booker-email');
  if (await bookerEmail.count()) await bookerEmail.fill(EMAIL);
  await sleep(500);

  const useBooker = page.locator('input[type="checkbox"][id*="useBookerInfo"]').first();
  if (await useBooker.count()) {
    await useBooker.check({ force: true });
    await sleep(800);
  }
  // passenger #1 (the seat the + added) never gets the booker copy
  for (const [id, value] of [
    ['#firstName-1', 'สมหญิง'],
    ['#lastName-1', 'ทดสอบ'],
    ['#phoneNumber-1', '0898765432'],
  ]) {
    const f = page.locator(id);
    if (await f.count()) await f.fill(value);
  }
  await sleep(1000);

  const summaryOnPassengerInfo = await page
    .locator('app-passenger-info-summary')
    .innerText()
    .catch(() => '(no summary)');
  console.log(
    '/passenger-info summary (already fixed by OBRS-1226) reads:\n   ',
    summaryOnPassengerInfo.replace(/\n/g, ' | ').slice(0, 400)
  );

  // --- 5b. AC-3's other arm: walk BACK to /review-schedule-booking ----------
  // Forward, that page has no passenger rows and the search filter is the only
  // source there is. Coming back from here it does, and they carry the + above.
  await page.locator('button, a', { hasText: /ย้อนกลับ|Back/ }).first().click({ force: true });
  await page.waitForURL('**/review-schedule-booking**', { timeout: 60000 });
  await sleep(2000);
  const reviewBack = await page.locator('app-review-schedule-booking-total').innerText();
  console.log('/review-schedule-booking (BACK leg) reads:\n   ', reviewBack.replace(/\n/g, ' | '));
  await shoot(
    page,
    page.locator('app-review-schedule-booking-total .card-container'),
    '4-review-back-leg'
  );
  // Coming back re-enters /passenger-info with an EMPTY form (the rows survive in
  // the store, the FormArray does not), so ถัดไป is disabled and this pass cannot
  // reach /payment. That is why the back leg is its own run: `MODE=backleg` shoots
  // AC-3's second arm and stops, `MODE=payment` (default) skips it and goes on.
  if (MODE === 'backleg') {
    await context.close();
    await browser.close();
    return;
  }
  await page.locator('.btn-confirm').first().click({ force: true });
  await page.waitForURL('**/passenger-info**', { timeout: 60000 });
  await sleep(2500);

  // --- 6. create the booking, land on /payment -----------------------------
  const next = page.locator('button.btn-next, .btn-next, button', { hasText: /ถัดไป|Next/ }).first();
  await next.click({ force: true });
  await page.waitForURL('**/payment**', { timeout: 90000 });
  console.log('on /payment');

  // the "booking saved" alert overlays the price panel
  const ok = page.locator('.swal2-confirm');
  if (await ok.count()) {
    await ok.click();
    await sleep(800);
  }
  await sleep(2000);

  // --- 7. the two subjects -------------------------------------------------
  const summaryText = await page.locator('app-payment-summary').first().innerText();
  console.log('/payment summary reads:\n   ', summaryText.replace(/\n/g, ' | '));
  await shoot(page, page.locator('.total-container'), '1-payment-summary-card-tab');

  const tabs = page.locator('.tab-group .tab');
  console.log('payment tabs:', JSON.stringify(await tabs.allInnerTexts()));
  await tabs.nth(1).click();
  await page.waitForSelector('.qr-panel', { timeout: 60000 });
  // the QR is a real Omise charge on SIT; wait for the image, not a timer
  await page
    .waitForFunction(() => {
      const img = document.querySelector('.qr-image');
      return !!img && img.getAttribute('src');
    }, { timeout: 90000 })
    .catch(() => console.log('  (QR image did not arrive inside 90s)'));
  await sleep(1500);

  const qrAmount = (await page.locator('.qr-amount').innerText()).trim();
  const qrRef = (await page.locator('.merchant-ref').innerText()).trim();
  console.log('AMOUNT UNDER THE QR:', qrAmount);
  console.log('reference:', qrRef);

  await shoot(page, page.locator('.qr-panel'), '2-qr-amount');
  await shoot(page, page.locator('.total-container'), '3-payment-qr-tab-full');

  console.log(
    JSON.stringify(
      { tag: TAG, searchHeadcount: searchHeadcount.trim(), qrAmount, summary: summaryText },
      null,
      2
    )
  );

  await context.close();
  await browser.close();
})().catch(async (err) => {
  console.error('CAPTURE FAILED:', err.message);
  process.exit(1);
});
