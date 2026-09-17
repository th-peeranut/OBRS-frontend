/**
 * OBRS-1949 — BEFORE/AFTER evidence for the font-size token sweep.
 *
 * The whole card is typography, so a photograph on its own proves very little: a 1px or 2px
 * step is exactly the size of difference an eye talks itself into seeing. Every frame here is
 * therefore STAMPED with the computed font-size this script read out of the live DOM for the
 * selectors the card changed, so the pair is read by comparing numbers, not by squinting.
 *
 * THE DATA IS STUBBED, ENTIRELY. No backend runs. AuthService.isAuthenticated() is a pure
 * localStorage check, so seeding auth_token walks the AuthGuard, and every /api/** call is
 * fulfilled here. The catch-all is registered FIRST because the last matching route wins in
 * Playwright — leave one call unstubbed and error.interceptor.ts throws a swal over the page,
 * which photographs a passing AC as a broken screen.
 *
 * Run (serve BOTH builds first, plain `ng serve`, no backend needed):
 *   node e2e/scripts/capture-obrs1949.js http://localhost:4430 AFTER
 *   node e2e/scripts/capture-obrs1949.js http://localhost:4431 BEFORE
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const BASE = process.argv[2] || 'http://localhost:4430';
const TAG = (process.argv[3] || 'AFTER').toUpperCase();
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1949');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (data) => ({ code: 200, message: 'OK', data });
const page0 = (content) => ok({ content, totalElements: content.length, totalPages: 1, number: 0, size: 20 });

const DESKTOP = { width: 1280, height: 1000 };
const MOBILE = { width: 390, height: 900 };

// ---------------------------------------------------------------------------- fixtures
const stop = (id, slug, label) => ({ id, slug, name: label, nameEn: label, latitude: 13.3, longitude: 101.1 });
const STATIONS = [stop(101, 'nong_chak', 'Nong Chak'), stop(202, 'bkr_mochit2', 'Mo Chit 2 Terminal')];

function bangkokDatePlus(days) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  now.setDate(now.getDate() + days);
  return now.toISOString().slice(0, 10);
}
const DEPARTURE_DATE = bangkokDatePlus(3);

/** One outbound round. `seatingMode: OPEN` is what puts the open-seating banner on screen. */
const round = (id, hhmm, seatingMode) => ({
  id,
  vehicleType: 'minibus',
  departureDateTime: `${DEPARTURE_DATE}T${hhmm}:00+07:00`,
  arrivalDateTime: `${DEPARTURE_DATE}T${String(Number(hhmm.slice(0, 2)) + 2).padStart(2, '0')}:30:00+07:00`,
  pricePerSeat: '180',
  availableSeats: 12,
  availableSeatNumbers: ['A1', 'A2', 'A3'],
  routeSlug: 'chonburi_bangkok',
  seatingMode,
});
const ROUNDS = [round(301, '08:00', 'OPEN'), round(302, '13:00', 'OPEN')];

const MY_BOOKING = {
  id: 1949,
  bookingNumber: 'BK-1949',
  totalAmount: 360,
  status: 'confirmed',
  bookingType: 'one_way',
  bookingChannel: 'online',
  createdAt: `${DEPARTURE_DATE}T09:00:00+07:00`,
  rescheduleCount: 1,
  seatChangeCount: 1,
  stopChangeCount: 1,
  bookingSchedules: [
    {
      id: 1,
      departureDateTime: `${DEPARTURE_DATE}T08:00:00+07:00`,
      passengerCount: 2,
      fromStop: { id: 101, slug: 'nong_chak', translations: [] },
      toStop: { id: 202, slug: 'bkr_mochit2', translations: [] },
    },
  ],
};

const STORE_SEED = {
  filter: {
    roundTrip: { id: 'one_way', name: 'One way' },
    passengerInfo: [{ type: 'adult', count: 1 }],
    startStationId: 'nong_chak',
    stopStationId: 'bkr_mochit2',
    departureDate: DEPARTURE_DATE,
    returnDate: null,
    adultCount: 1,
    kidsCount: 0,
  },
  list: { departureSchedules: ROUNDS, arrivalSchedules: null },
  booking: { schedule: [ROUNDS[0]] },
  passengers: [
    {
      isAdult: true,
      title: 1,
      firstName: 'สมชาย',
      middleName: '',
      lastName: 'ใจดี',
      phoneNumber: '0812345678',
      gender: '',
      isSelectSeat: true,
      passengerSeat: 'A1',
      useBookerInfo: false,
      email: 'customer@system.local',
      seatPreference: null,
      seatRequirement: null,
    },
  ],
  bookingResult: { id: 501, bookingNumber: 'B-000501', totalAmount: 180, status: 'pending' },
};

/** `empty` swaps the two list responses for empty pages so the empty-state card renders. */
function fixtures({ empty = false, noResults = false } = {}) {
  return [
    [/\/private\/bookings\/me/, () => page0(empty ? [] : [MY_BOOKING])],
    [/\/schedules\/availability$/, () => ok({ availableDates: [DEPARTURE_DATE], effectiveDays: 7 })],
    [
      /\/schedules\/search/,
      () =>
        ok({
          departureSchedules: noResults ? [] : ROUNDS,
          arrivalSchedules: null,
          returnBoardingStop: null,
        }),
    ],
    [/\/stations/, () => ok(STATIONS)],
    [/\/stops/, () => ok(STATIONS)],
    [/\/provinces/, () => ok([{ id: 1, name: 'Chonburi', nameEn: 'Chonburi', stations: STATIONS, stops: STATIONS }])],
    [
      /\/routes\/[^/]+\/pickup-dropoff/,
      () => ({
        status: 'success',
        message: 'OK',
        data: {
          route: { id: 1, slug: 'chonburi_bangkok', translations: { th: { label: 'ชลบุรี - กรุงเทพฯ' } } },
          pickup: [],
          dropoff: [],
        },
      }),
    ],
  ];
}

// ---------------------------------------------------------------------------- harness
async function newPage(browser, viewport, opts = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'th-TH' });
  await context.addInitScript(
    (ctx) => {
      localStorage.setItem('lang', 'th');
      localStorage.setItem('app_language', 'th');
      localStorage.setItem('auth_token', 'obrs-1949-capture-token');
      localStorage.setItem('auth_username', 'customer@system.local');
      localStorage.setItem('auth_roles', JSON.stringify(['user']));
      // e2e/support/analytics-consent.ts seeds the same key lane-wide; an unanswered
      // consent bar is `position: fixed; bottom: 0` and bleeds into the frame.
      localStorage.setItem('obrs_analytics_consent_v1', 'denied');
      if (ctx.bookingContext) localStorage.setItem('obrs.booking_context', JSON.stringify(ctx.bookingContext));
    },
    { bookingContext: opts.bookingContext || null }
  );

  const page = await context.newPage();
  const table = fixtures(opts);
  await page.route('**/api/**', async (route) => {
    const pathname = route.request().url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    for (const [re, make] of table) {
      if (re.exec(pathname)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(make()) });
      }
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) });
  });
  await page.route('**/maps.googleapis.com/**', (r) => r.abort());
  await page.route('**/accounts.google.com/**', (r) => r.abort());
  await page.route('**/ssl.gstatic.com/**', (r) => r.abort());
  return page;
}

/** The loading swal is a real transient state, so settle first, then refuse a covered frame. */
async function assertClean(page, label) {
  await page.waitForFunction(() => document.querySelectorAll('.swal2-popup').length === 0, undefined, { timeout: 15000 })
    .catch(() => {});
  const swal = await page.locator('.swal2-popup').count();
  const toast = await page.locator('.p-toast-message-error, .toast-error, .alert-danger').count();
  if (swal || toast) {
    const text = swal ? (await page.locator('.swal2-popup').first().innerText()).slice(0, 200) : '';
    throw new Error(`${label}: refusing to save — ${swal} swal / ${toast} toast on screen. ${text}`);
  }
}

/**
 * Reads getComputedStyle().fontSize off the FIRST match of each selector and paints the
 * readings into the frame. A selector that matched nothing is printed as MISSING rather than
 * quietly skipped — a frame that silently lost its subject is worse than one that says so.
 */
async function stampMeasurements(page, heading, selectors) {
  return page.evaluate(
    ([heading, selectors]) => {
      const old = document.getElementById('obrs1949-stamp');
      if (old) old.remove();

      const readings = selectors.map(([label, sel]) => {
        const el = document.querySelector(sel);
        if (!el) return { label, sel, px: null };
        return { label, sel, px: getComputedStyle(el).fontSize };
      });

      const width = Math.max(...readings.map((r) => r.label.length));
      const lines = readings.map(
        (r) => r.label.padEnd(width) + ' : ' + (r.px === null ? 'MISSING (' + r.sel + ')' : r.px)
      );

      const box = document.createElement('div');
      box.id = 'obrs1949-stamp';
      box.style.cssText = [
        'position:fixed', 'left:0', 'right:0', 'top:0', 'z-index:2147483647',
        'background:#101418', 'color:#e8eaf0', 'font:11px/1.5 Consolas,monospace',
        'padding:8px 12px', 'white-space:pre-wrap', 'border-bottom:3px solid #4da3ff',
      ].join(';');
      box.textContent = heading + '\n' + lines.join('\n');
      document.body.appendChild(box);
      return readings;
    },
    [heading, selectors]
  );
}

async function shoot(page, slug, selectors) {
  const readings = await stampMeasurements(
    page,
    `OBRS-1949 ${TAG} — ${slug} — computed font-size read from the live DOM (data STUBBED)`,
    selectors
  );
  const missing = readings.filter((r) => r.px === null).map((r) => r.label);
  const name = `OBRS-1949-${TAG}-${slug}.png`;
  await page.screenshot({ path: path.join(OUT, name) });
  const summary = readings.map((r) => `${r.label}=${r.px || 'MISSING'}`).join(' ');
  console.log(`saved ${name} :: ${summary}`);
  if (missing.length) console.log(`  !! MISSING on ${slug}: ${missing.join(', ')}`);
  return readings;
}

/**
 * /passenger-info and /review-schedule-booking are driven by the checkout NgRx session and
 * have no deep link, so they are seeded the way e2e/support/customer-pages.ts seeds them:
 * dispatch the real action types into the real Store through `window.ng` (present because
 * this is a development build), then flush a tick — a dispatch from inside page.evaluate()
 * runs in the browser ROOT zone and schedules none.
 */
async function seedStore(page) {
  await page.waitForFunction(
    () => {
      const ng = window.ng;
      if (!ng || !ng.getComponent) return false;
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const cmp = ng.getComponent(el);
        if (cmp && cmp.store && typeof cmp.store.dispatch === 'function') return true;
      }
      return false;
    },
    undefined,
    { timeout: 30000 }
  );

  await page.evaluate((seed) => {
    const ng = window.ng;
    let store = null;
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cmp = ng.getComponent(el);
      if (cmp && cmp.store && typeof cmp.store.dispatch === 'function') {
        store = cmp.store;
        break;
      }
    }
    if (!store) throw new Error('no component on the page exposes an NgRx Store');
    store.dispatch({ type: '[ScheduleFilter API] Set Schedule Filter Success', schedule_filter: seed.filter });
    store.dispatch({ type: '[ScheduleList API] Set Schedule List Success', schedule_list: seed.list });
    store.dispatch({ type: '[ScheduleBooking API] Set Schedule Booking Success', schedule_booking: seed.booking });
    store.dispatch({ type: '[PassengerInfo API] Set Passenger Info Success', passengerInfo: seed.passengers });
    store.dispatch({ type: '[Booking API] Set Booking Success', booking: seed.bookingResult });
  }, STORE_SEED);

  await page.evaluate(() => {
    const ng = window.ng;
    if (!ng || !ng.applyChanges || !ng.getComponent) return;
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cmp = ng.getComponent(el);
      if (cmp) {
        ng.applyChanges(cmp);
        return;
      }
    }
  });
}

// ---------------------------------------------------------------------------- screens
async function simpleScreen(browser, { slug, url, viewport, selectors, opts, waitFor }) {
  const page = await newPage(browser, viewport || DESKTOP, opts);
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  if (waitFor) await page.locator(waitFor).first().waitFor({ state: 'visible', timeout: 30000 });
  await sleep(1200);
  await assertClean(page, slug);
  await shoot(page, slug, selectors);
  await page.context().close();
}

const BOOKING_CONTEXT = {
  version: 1,
  savedAt: Date.now(),
  value: {
    filter: {
      roundTrip: { id: 1, name: 'เที่ยวเดียว' },
      passengerInfo: [{ type: 'ADULT', count: 1 }],
      startStationId: 101,
      stopStationId: 202,
      departureDate: DEPARTURE_DATE,
      returnDate: null,
      adultCount: 1,
      kidsCount: 0,
    },
    searchPayload: null,
    selection: null,
  },
};

async function scheduleBooking(browser, { slug, noResults, selectors }) {
  const page = await newPage(browser, DESKTOP, { noResults, bookingContext: BOOKING_CONTEXT });
  await page.goto(BASE + '/schedule-booking', { waitUntil: 'networkidle' });
  // Click the page's own Search rather than trusting the restored filter to auto-search: on a
  // cold profile the station roster is still in flight when the restored filter emits, so the
  // id->slug mapping is not ready and the auto-search is skipped (capture-obrs1951.js §).
  await sleep(2500);
  await page.locator('button.btn-search').click();
  await page.waitForSelector(noResults ? '.no-results' : '.schedule-item', { timeout: 30000 });
  await sleep(1200);
  await assertClean(page, slug);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, slug, selectors);
  await page.context().close();
}

async function funnelStep(browser, { slug, url, selectors, waitFor }) {
  const page = await newPage(browser, MOBILE, {});
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  await seedStore(page);
  await sleep(1500);
  if (waitFor) await page.locator(waitFor).first().waitFor({ state: 'visible', timeout: 30000 });
  await assertClean(page, slug);
  // The buttons this card changes sit at the bottom of a long form.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(600);
  await shoot(page, slug, selectors);
  await page.context().close();
}

// ---------------------------------------------------------------------------- main
async function main() {
  const browser = await chromium.launch();

  await simpleScreen(browser, {
    slug: 'my-bookings-list',
    url: '/my-bookings',
    waitFor: '.my-bookings__header',
    selectors: [
      ['h1 (28px -> $font-size-2xl 30px)', '.my-bookings__header h1'],
      ['header p (15px -> $font-size-sm 14px)', '.my-bookings__header p'],
      ['booking-card dd (15px -> 14px)', '.booking-card__meta dd'],
    ],
  });

  await simpleScreen(browser, {
    slug: 'my-parcels-empty',
    url: '/my-parcels',
    opts: { empty: true },
    waitFor: '.my-parcels__header',
    selectors: [
      ['h1 (28px -> $font-size-2xl 30px)', '.my-parcels__header h1'],
      ['header p (15px -> $font-size-sm 14px)', '.my-parcels__header p'],
      ['state-card p (15px -> 14px)', '.state-card p'],
    ],
  });

  await simpleScreen(browser, {
    slug: 'my-reports-empty',
    url: '/my-reports',
    opts: { empty: true },
    waitFor: '.my-reports__header',
    selectors: [
      ['h1 (28px -> $font-size-2xl 30px)', '.my-reports__header h1'],
      ['header p (15px -> $font-size-sm 14px)', '.my-reports__header p'],
      ['state-card p (15px -> 14px)', '.state-card p'],
    ],
  });

  await simpleScreen(browser, {
    slug: 'account',
    url: '/account',
    waitFor: '.account-page__header',
    selectors: [
      ['h1 (28px -> $font-size-2xl 30px)', '.account-page__header h1'],
      ['header p (15px -> $font-size-sm 14px)', '.account-page__header p'],
    ],
  });

  await simpleScreen(browser, {
    slug: 'notification-preferences',
    url: '/account/notification-preferences',
    waitFor: '.npref-page__header',
    selectors: [
      ['h1 (28px -> $font-size-2xl 30px)', '.npref-page__header h1'],
      ['header p (15px -> $font-size-sm 14px)', '.npref-page__header p'],
    ],
  });

  await scheduleBooking(browser, {
    slug: 'schedule-booking-results',
    selectors: [
      ['page .title (AC2: 18px -> $font-size-lg 20px)', '.booking-container > .title'],
      ['open-seating __title (15px -> $font-size-base 16px)', '.open-seating-banner__title'],
      ['open-seating __body (14px -> $font-size-sm)', '.open-seating-banner__body'],
    ],
  });

  await scheduleBooking(browser, {
    slug: 'schedule-booking-no-results',
    noResults: true,
    selectors: [
      ['page .title (AC2: 18px -> $font-size-lg 20px)', '.booking-container > .title'],
      ['.no-results (15px -> $font-size-sm 14px)', '.booking-container .no-results'],
    ],
  });

  await funnelStep(browser, {
    slug: 'passenger-info-390',
    url: '/passenger-info',
    waitFor: 'app-booker-info-form',
    selectors: [
      ['.btn-back @<=576 (15px -> $font-size-base 16px)', '.btn-back'],
      ['.btn-next @<=576 (15px -> $font-size-base 16px)', '.btn-next'],
    ],
  });

  await funnelStep(browser, {
    slug: 'review-schedule-booking-390',
    url: '/review-schedule-booking',
    selectors: [
      ['.btn-change-info @<=768 (15px -> $font-size-base 16px)', '.btn-change-info'],
      ['page .title (AC2 reference: already 20px)', 'app-review-schedule-booking-summary .title'],
    ],
  });

  await browser.close();
  console.log('DONE ' + TAG);
}

main().catch((err) => {
  console.error('CAPTURE FAILED: ' + err.message);
  process.exit(1);
});
