/**
 * OBRS-1944 — before/after evidence for "the booker's gender/status radios reach no
 * consumer, so the block is removed from the BOOKER form only".
 *
 * No backend, same lane as capture-obrs677.js: AuthService.isAuthenticated() is a pure
 * localStorage check, so seeding auth_token/auth_roles walks the AuthGuard, and every
 * /api/** call is fulfilled here. The catch-all is registered FIRST because the last
 * matching route registered wins in Playwright.
 *
 * /passenger-info is driven by the checkout NgRx session and has no deep link, so the
 * page is seeded the way e2e/support/customer-pages.ts seeds it for the customer sweep:
 * dispatch the real action types into the real Store through `window.ng` (present because
 * this lane serves a development build) and then flush a tick, because a dispatch from
 * inside page.evaluate() runs in the browser's ROOT zone and schedules none.
 *
 * Run (serve the branch first — SIT config is fine, the page needs no local-only data
 * and SIT CORS reflects any localhost origin):
 *   node e2e/scripts/capture-obrs1944.js http://localhost:4310 <outDir> AFTER
 *   node e2e/scripts/capture-obrs1944.js http://localhost:4311 <outDir> BEFORE
 *
 * The script REFUSES to save a shot while a swal or an error toast is on screen: with the
 * backend down and only auth stubbed, the global HTTP-error interceptor throws a modal over
 * every page, and a passing AC would photograph as a broken one.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(
  'C:', 'Users', 'thpee', 'Desktop', 'workshop', 'OBRS-frontend', 'node_modules', 'playwright'
));

const BASE = process.argv[2] || 'http://localhost:4310';
const OUT = process.argv[3] || path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1944');
const TAG = process.argv[4] || 'AFTER';

fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (data) => ({ code: 200, message: 'OK', data });

// Contract-shaped bodies, copied in shape from e2e/support/customer-pages.ts. A bare []
// here is what makes the page draw an error modal instead of a form.
const stop = (id, slug, label) => ({ id, slug, name: label, nameEn: label, latitude: 13.3, longitude: 101.1 });
const STATIONS = [stop(1, 'nong_chak', 'Nong Chak'), stop(4, 'bkr_mochit2', 'Mo Chit 2 Terminal')];

const schedule = (id, time, seats) => ({
  id,
  vehicleType: 'minibus',
  departureDateTime: `2030-06-17T${time}:00+07:00`,
  arrivalDateTime: `2030-06-17T${String(Number(time.slice(0, 2)) + 2).padStart(2, '0')}:30:00+07:00`,
  pricePerSeat: 180,
  availableSeats: seats,
  availableSeatNumbers: Array.from({ length: seats }, (_, i) => `A${i + 1}`),
  routeSlug: 'chonburi_bangkok',
  seatingMode: 'ASSIGNED',
});
const SCHEDULES = [schedule(101, '08:00', 12), schedule(102, '13:00', 3)];

const STORE_SEED = {
  filter: {
    roundTrip: { id: 'one_way', name: 'One way' },
    passengerInfo: [{ type: 'adult', count: 1 }],
    startStationId: 'nong_chak',
    stopStationId: 'bkr_mochit2',
    departureDate: '2030-06-17',
    returnDate: null,
    adultCount: 1,
    kidsCount: 0,
  },
  list: { departureSchedules: SCHEDULES, arrivalSchedules: null },
  booking: { schedule: [SCHEDULES[0]] },
  // useBookerInfo false: the tick is what USED to copy the booker's gender onto the
  // passenger, so the shot has to show both blocks in their own right.
  passengers: [
    {
      isAdult: true,
      title: 1,
      firstName: '',
      middleName: '',
      lastName: '',
      phoneNumber: '',
      gender: '',
      isSelectSeat: true,
      passengerSeat: 'A1',
      useBookerInfo: false,
      email: '',
      seatPreference: null,
      seatRequirement: null,
    },
  ],
  bookingResult: { id: 501, bookingNumber: 'B-000501', totalAmount: 180, status: 'pending' },
};

const FIXTURES = [
  [/\/schedules\/availability$/, () => ok({ availableDates: ['2030-06-17'], effectiveDays: 7 })],
  [/\/schedules\/search/, () => ok({ departureSchedules: SCHEDULES, arrivalSchedules: null })],
  [/\/stations/, () => ok(STATIONS)],
  [/\/stops/, () => ok(STATIONS)],
  [/\/provinces/, () => ok([{ id: 1, name: 'Chonburi', nameEn: 'Chonburi', stations: STATIONS }])],
];

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

  // The dispatches above ran outside the Angular zone, so nothing scheduled a tick.
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

/** Throws rather than saving: an error modal over the page is not evidence of an AC. */
async function assertClean(page, label) {
  const swal = await page.locator('.swal2-popup').count();
  const toast = await page.locator('.p-toast-message-error, .toast-error, .alert-danger').count();
  if (swal || toast) {
    const text = swal ? (await page.locator('.swal2-popup').first().innerText()).slice(0, 300) : '';
    throw new Error(`${label}: ${swal} swal / ${toast} error toast on screen — refusing to save. ${text}`);
  }
}

async function capture(browser, { width, height, name }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    locale: 'th-TH',
  });
  await context.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'obrs-1944-capture-token');
    localStorage.setItem('auth_username', 'customer@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['user']));
    // Same key/value as e2e/support/analytics-consent.ts seeds lane-wide. The consent bar
    // is `position: fixed; bottom: 0; z-index: 1000`, so an un-answered question bleeds
    // into an element screenshot once the viewport is grown to fit the block.
    localStorage.setItem('obrs_analytics_consent_v1', 'denied');
  });

  const page = await context.newPage();

  // Catch-all FIRST — the last matching route registered is the one that runs.
  await page.route('**/api/**', async (route) => {
    const pathname = route.request().url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    for (const [re, make] of FIXTURES) {
      if (re.exec(pathname)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(make()) });
      }
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) });
  });
  await page.route('**/maps.googleapis.com/**', (r) => r.abort());
  await page.route('**/accounts.google.com/**', (r) => r.abort());
  await page.route('**/ssl.gstatic.com/**', (r) => r.abort());

  await page.goto(`${BASE}/passenger-info`, { waitUntil: 'networkidle' });
  await seedStore(page);
  await sleep(1200);

  const block = page.locator('app-booker-info-form');
  await block.waitFor({ state: 'visible', timeout: 30000 });

  // The loading swal is a real transient state, so wait before judging it.
  await page.waitForFunction(() => document.querySelectorAll('.swal2-popup').length === 0, undefined, { timeout: 15000 })
    .catch(() => {});
  await assertClean(page, `${TAG} ${name}`);

  // An element screenshot taller than the viewport is NOT stitched — the off-screen
  // part comes back blank white and the run still goes green. Grow from a live
  // measurement of the rect's BOTTOM (height alone ignores everything above it).
  const bottom = await block.evaluate((el) => Math.ceil(el.getBoundingClientRect().bottom + window.scrollY));
  if (bottom + 40 > height) {
    await page.setViewportSize({ width, height: bottom + 40 });
    await sleep(500);
    await assertClean(page, `${TAG} ${name} (after grow)`);
  }

  const radios = await page.locator('input[type="radio"][id^="booker-gender_"]').count();
  const passengerRadios = await page.locator('input[type="radio"][id^="gender_"]').count();
  console.log(`  ${name}: booker gender radios = ${radios}, passenger gender radios = ${passengerRadios}`);

  const file = path.join(OUT, `OBRS-1944-${TAG}-${name}.png`);
  await block.screenshot({ path: file });
  console.log(`  shot -> ${file}`);

  await context.close();
  return { radios, passengerRadios };
}

(async () => {
  const browser = await chromium.launch();
  console.log(`${TAG} against ${BASE}`);
  const desktop = await capture(browser, { width: 1400, height: 1100, name: 'desktop' });
  const mobile = await capture(browser, { width: 390, height: 844, name: 'mobile-390' });
  await browser.close();

  // The images are the illustration; these counts are the evidence.
  console.log(JSON.stringify({ TAG, desktop, mobile }));
  console.log('DONE');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
