// Standalone capture script for OBRS-635 visual evidence (not a Playwright test, not committed to the suite).
//
// Approach: NO backend. AuthService.isAuthenticated() is a pure localStorage check, so seeding
// auth_token/auth_username/auth_roles clears the AuthGuard on /my-bookings, and page.route()
// stubs EVERY /api call. That matters more than usual here: /my-bookings is a customer page
// behind the global HTTP-error interceptor, so a single unstubbed call paints a swal over the
// card list and the evidence photographs as broken (the OBRS-622 failure).
//
// The whole point of this card is that BEFORE and AFTER see the SAME server payload. So both
// runs are fed one identical body in which every leg has `tickets: null` (what
// GET /api/private/bookings/me actually sends) and a real `passengerCount`. BEFORE counted the
// null ticket list -> 0 on every card; AFTER reads passengerCount -> 1 / 2 / 4.
//
//   AFTER  = the merged branch  on :4300
//   BEFORE = ae8f9710 (pre-fix) on :4400
//
// Run:  node e2e/scripts/capture-obrs635.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-635');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

const stop = (id, code, th, en) => ({ id, code, display: { th: { label: th }, en: { label: en } } });

// One leg exactly as the list projection sends it: tickets NULL, passengerCount populated.
const leg = (id, departure, passengerCount, from, to) => ({
  id,
  departureDateTime: departure,
  arrivalDateTime: null,
  legType: 'outbound',
  fromStop: from,
  toStop: to,
  tickets: null,
  passengerCount,
  routeSlug: 'nongchak-bangkok',
  seatingMode: 'ASSIGNED',
});

const NONG_CHAK = stop(1, 'nong_chak', 'หนองจอก', 'Nong Chak');
const MO_CHIT = stop(2, 'mo_chit', 'หมอชิต', 'Mo Chit');

// Three rows chosen to make the fix legible at a glance:
//   #1 single passenger        -> 1
//   #2 ROUND TRIP for 2 people -> 2 (the count is the FIRST leg's, not the sum of 4 tickets)
//   #3 group of four           -> 4
const BOOKINGS = [
  {
    id: 9001,
    bookingNumber: 'BK-2608-0001',
    totalAmount: '450.00',
    status: 'confirmed',
    bookingType: 'one_way',
    bookingChannel: 'online',
    createdAt: '2026-08-01T09:12:00+07:00',
    rescheduleCount: 0,
    seatChangeCount: 0,
    stopChangeCount: 0,
    contact: { fullName: 'Somchai P.', phoneNumber: '0812345678' },
    bookingSchedules: [leg(11, '2026-08-20T08:00:00+07:00', 1, NONG_CHAK, MO_CHIT)],
  },
  {
    id: 9002,
    bookingNumber: 'BK-2608-0002',
    totalAmount: '1800.00',
    status: 'confirmed',
    // 'return', not 'round_trip' — the lookup slug the backend actually stores
    // (OBRS-backend/src/main/resources/lookups.sql: ('booking_type','return')).
    // The wrong slug renders the raw i18n key on the card and would put a defect
    // that does not exist into the evidence.
    bookingType: 'return',
    bookingChannel: 'online',
    createdAt: '2026-08-01T10:40:00+07:00',
    rescheduleCount: 0,
    seatChangeCount: 0,
    stopChangeCount: 0,
    contact: { fullName: 'Somchai P.', phoneNumber: '0812345678' },
    bookingSchedules: [
      leg(12, '2026-08-22T08:00:00+07:00', 2, NONG_CHAK, MO_CHIT),
      leg(13, '2026-08-25T17:00:00+07:00', 2, MO_CHIT, NONG_CHAK),
    ],
  },
  {
    id: 9003,
    bookingNumber: 'BK-2608-0003',
    totalAmount: '1800.00',
    status: 'pending',
    bookingType: 'one_way',
    bookingChannel: 'online',
    createdAt: '2026-08-02T18:05:00+07:00',
    rescheduleCount: 0,
    seatChangeCount: 0,
    stopChangeCount: 0,
    contact: { fullName: 'Somchai P.', phoneNumber: '0812345678' },
    bookingSchedules: [leg(14, '2026-08-28T08:00:00+07:00', 4, NONG_CHAK, MO_CHIT)],
  },
];

const PAGE = ok({
  content: BOOKINGS,
  totalElements: BOOKINGS.length,
  totalPages: 1,
  size: 5,
  number: 0,
  numberOfElements: BOOKINGS.length,
});

async function seededPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'fake-customer-token-for-capture');
    localStorage.setItem('auth_username', 'customer@example.com');
    localStorage.setItem('auth_roles', JSON.stringify(['customer']));
  });
  // Catch-all FIRST: Playwright runs the LAST-registered matching handler, so the specific
  // /bookings/me route below wins while everything else still gets a contract-shaped 200
  // instead of reaching the error interceptor.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) }),
  );
  await page.route('**/api/private/bookings/me**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PAGE) }),
  );
  return page;
}

/** Read what is actually PAINTED, not what we hoped for. */
async function readCards(page) {
  return page.$$eval('.booking-card:not(.booking-card--skeleton)', (cards) =>
    cards.map((card) => {
      const ref = card.querySelector('.booking-card__ref .value, .booking-card__ref')?.textContent?.trim() ?? '';
      const rows = Array.from(card.querySelectorAll('.booking-card__meta > div'));
      const passengerRow = rows[1];
      return {
        ref: ref.replace(/\s+/g, ' '),
        label: passengerRow?.querySelector('dt')?.textContent?.trim() ?? '',
        value: passengerRow?.querySelector('dd')?.textContent?.trim() ?? '',
      };
    }),
  );
}

async function capture(browser, { baseUrl, name, expected }) {
  const page = await seededPage(browser);
  await page.goto(`${baseUrl}/my-bookings`, { waitUntil: 'networkidle' });
  await page.locator('.booking-card:not(.booking-card--skeleton)').first().waitFor({ state: 'visible', timeout: 30000 });

  // The loading swal is a real transient state on the way in - wait it out, then require zero.
  await page
    .waitForFunction(() => document.querySelectorAll('.swal2-popup').length === 0, null, { timeout: 15000 })
    .catch(() => {});
  const dirty = await page.evaluate(() => ({
    swal: document.querySelectorAll('.swal2-popup').length,
    errorCard: document.querySelectorAll('.state-card--error').length,
    toast: document.querySelectorAll('.route-error').length,
  }));
  if (dirty.swal || dirty.errorCard || dirty.toast) {
    throw new Error(`${name}: contaminated frame ${JSON.stringify(dirty)} - refusing to save`);
  }

  const cards = await readCards(page);
  const values = cards.map((c) => c.value);
  console.log(`${name} painted:`, JSON.stringify(cards));
  if (values.length !== expected.length || values.some((v, i) => v !== expected[i])) {
    throw new Error(`${name}: expected passenger cells ${JSON.stringify(expected)} but the DOM says ${JSON.stringify(values)} - refusing to save`);
  }

  const target = page.locator('.my-bookings__inner');
  const box = await target.boundingBox();
  if (box.y + box.height > page.viewportSize().height) {
    // Playwright does not stitch an over-tall element - it returns the box with the
    // off-screen part unpainted white (OBRS-702). Grow the window instead of scrolling.
    await page.setViewportSize({ width: 1280, height: Math.ceil(box.y + box.height) + 40 });
    await page.waitForTimeout(300);
  }
  const scrolled = await page.evaluate(() => {
    const out = [];
    let el = document.querySelector('.my-bookings__inner');
    for (; el && el !== document.documentElement; el = el.parentElement) {
      if (el.scrollTop !== 0) out.push(`${el.tagName}.${el.className}=${el.scrollTop}`);
    }
    return { scrolled: out, windowY: window.scrollY };
  });
  if (scrolled.scrolled.length || scrolled.windowY !== 0) {
    throw new Error(`${name}: something is scrolled ${JSON.stringify(scrolled)} - the shot would be clipped`);
  }

  const file = path.join(ASSETS_DIR, name);
  await target.screenshot({ path: file });
  console.log('captured', file);
  await page.close();
}

async function main() {
  const browser = await chromium.launch();
  try {
    await capture(browser, {
      baseUrl: 'http://localhost:4400',
      name: 'OBRS-635-BEFORE-my-bookings-passengers-zero.png',
      expected: ['0', '0', '0'],
    });
    await capture(browser, {
      baseUrl: 'http://localhost:4300',
      name: 'OBRS-635-AFTER-my-bookings-passengers-real.png',
      expected: ['1', '2', '4'],
    });
  } finally {
    await browser.close();
  }
  console.log('DONE');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
