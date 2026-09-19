/**
 * OBRS-1988 — BEFORE/AFTER evidence for the OPEN-seating passenger-count card on
 * /passenger-info. The headcount is chosen once, on the search page; this card
 * only reports it, so the +/- stepper (a second edit point that never wrote back
 * to `scheduleFilter`) is gone and the card no longer draws its own frame.
 *
 * Two scenarios, because the card renders from three different outlets:
 *   alllegs — one-way OPEN: every leg is open, so the whole seat-selection block
 *             is replaced by this one shared card inside `.card-container`.
 *             availableSeats = 3 (<= LOW_SEAT_THRESHOLD 5) so the gated
 *             "เหลือ 3 ที่นั่ง" line is IN frame and proven still there.
 *   mixed   — round trip, OPEN outbound + ASSIGNED return: the per-leg outlet,
 *             sitting beside the return leg's real seat map. availableSeats = 9
 *             (> 5) so the same line is proven still HIDDEN (no inventory
 *             reveal) — the two scenarios photograph both sides of that gate.
 *
 * NO BACKEND, same recipe as capture-obrs1943.js: every `/api/**` call is served
 * from `page.route` fixtures, and the booking is seeded through
 * `obrs.booking_context` (the OBRS-903 TTL envelope the booking stores rehydrate
 * from). The passenger rows come from `filter.passengerInfo` — 2 adults here, so
 * the frame shows the card reporting a number it did not ask for.
 *
 * ⛔ Serve with `--configuration gate`, never `sit`: the SIT flags redirect
 * /passenger-info to the homepage.
 *
 * Every claim in the images is ASSERTED here (including the removed border, read
 * off getComputedStyle rather than judged by eye) and the script throws rather
 * than save a screenshot that disagrees with its own scenario.
 *
 * Usage:
 *   npx ng serve --configuration gate --port <port>
 *   CAPTURE_BASE=http://localhost:<port> node e2e/scripts/capture-obrs1988.js AFTER
 *   CAPTURE_BASE=http://localhost:<port> node e2e/scripts/capture-obrs1988.js BEFORE
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const TAG = (process.argv[2] || 'AFTER').toUpperCase();
const BASE = process.env.CAPTURE_BASE || 'http://localhost:4361';
const OUT_DIR =
  process.env.CAPTURE_OUT ||
  path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1988');
fs.mkdirSync(OUT_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const SECTION_HINT = 'ที่นั่งแบบไม่ระบุที่นั่ง';
const SEAT_REMAIN = 'เหลือ';
const PASSENGER_COUNT = 2;

// --- fixtures ---------------------------------------------------------------
const STOPS = [
  {
    id: 11,
    slug: 'nong-chak',
    status: 'ACTIVE',
    stopType: { name: 'จุดจอด' },
    createdAt: '2026-01-01T00:00:00+07:00',
    updatedAt: '2026-01-01T00:00:00+07:00',
    display: [
      { locale: 'th', label: 'หนองจอก', description: null },
      { locale: 'en', label: 'Nong Chak', description: null },
    ],
  },
  {
    id: 22,
    slug: 'mo-chit-2',
    status: 'ACTIVE',
    stopType: { name: 'สถานีขนส่ง' },
    createdAt: '2026-01-01T00:00:00+07:00',
    updatedAt: '2026-01-01T00:00:00+07:00',
    display: [
      { locale: 'th', label: 'หมอชิต 2', description: null },
      { locale: 'en', label: 'Mo Chit 2', description: null },
    ],
  },
];

const outbound = (seatingMode, availableSeats) => ({
  id: 9001,
  vehicleType: 'van',
  departureDateTime: '2026-12-20 08:00:00',
  arrivalDateTime: '2026-12-20 09:48:00',
  pricePerSeat: '250',
  availableSeats,
  availableSeatNumbers: ['1', '2', '3', '4'],
  routeSlug: 'nong-chak-bangkok',
  seatingMode,
});

const inbound = (seatingMode, availableSeats) => ({
  id: 9002,
  vehicleType: 'van',
  departureDateTime: '2026-12-22 08:00:00',
  arrivalDateTime: '2026-12-22 09:48:00',
  pricePerSeat: '250',
  availableSeats,
  availableSeatNumbers: ['1', '2', '3', '4', '5', '6'],
  routeSlug: 'bangkok-nong-chak',
  seatingMode,
});

// One scenario per outlet the card renders from — all three have to change
// together, so all three are photographed:
//   alllegs    — one-way OPEN, near-full        -> the shared all-legs-OPEN card
//   mixed      — OPEN out + ASSIGNED back       -> the per-leg OUTBOUND outlet
//   openreturn — ASSIGNED out + OPEN back       -> the per-leg RETURN outlet
const SCENARIOS = {
  alllegs: { selection: [outbound('OPEN', 3)], roundTrip: false, seatRemain: true },
  mixed: {
    selection: [outbound('OPEN', 9), inbound('ASSIGNED', 9)],
    roundTrip: true,
    seatRemain: false,
  },
  openreturn: {
    selection: [outbound('ASSIGNED', 9), inbound('OPEN', 3)],
    roundTrip: true,
    seatRemain: true,
  },
};

const bookingContext = ({ selection, roundTrip }) => ({
  version: 1,
  savedAt: Date.now(),
  value: {
    filter: {
      roundTrip: roundTrip
        ? { name: 'Round trip', code: 'round_trip' }
        : { name: 'One way', code: 'one_way' },
      passengerInfo: [{ type: 'adult', count: PASSENGER_COUNT }],
      startStationId: 11,
      stopStationId: 22,
      departureDate: '2026-12-20',
      returnDate: roundTrip ? '2026-12-22' : null,
      adultCount: PASSENGER_COUNT,
      kidsCount: 0,
    },
    searchPayload: {
      bookingType: roundTrip ? 'round_trip' : 'one_way',
      numberOfPassengers: PASSENGER_COUNT,
      fromStop: 'nong-chak',
      toStop: 'mo-chit-2',
      departureDate: '2026-12-20',
      returnDate: roundTrip ? '2026-12-22' : null,
    },
    selection,
  },
});

async function installFixtures(page, scenario) {
  // ⚠️ ORDER MATTERS AND IT IS BACKWARDS FROM READING ORDER: Playwright runs the
  // LAST-registered matching handler first, so the broad catch-all goes in FIRST
  // and the specific stub after it.
  await page.route('**/api/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.includes('/schedules/search')) {
      return json(
        route,
        ok({
          departureSchedules: [scenario.selection[0]],
          arrivalSchedules: scenario.selection[1] ? [scenario.selection[1]] : null,
        })
      );
    }
    return json(route, ok(null));
  });
  await page.route('**/api/stops**', (route) => json(route, ok(STOPS)));
  await page.route('**://*.googleapis.com/**', (route) => route.abort());
  await page.route('**://*.gstatic.com/**', (route) => route.abort());
}

async function seed(page, scenario) {
  await page.addInitScript((context) => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('obrs.booking_context', JSON.stringify(context));
    // The consent bar is an overlay across the middle of the page.
    localStorage.setItem('obrs_analytics_consent_v1', 'denied');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_roles');
    localStorage.removeItem('obrs.stations.v1');
  }, bookingContext(scenario));
}

/** Reads the card back out of the DOM — including the border, which is the
 *  whole point of AC-6 and cannot be judged from a picture. */
async function measure(page) {
  return page.evaluate(() => {
    const card = document.querySelector('app-passenger-info-form .open-seat-card');
    const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      url: location.pathname,
      cards: document.querySelectorAll('app-passenger-info-form .open-seat-card').length,
      cardText: text(card),
      countText: text(card?.querySelector('.open-seat-card-count')),
      plus: document.querySelectorAll('app-passenger-info-form .passenger-add').length,
      minus: document.querySelectorAll('app-passenger-info-form .passenger-minus').length,
      borderTopWidth: card ? getComputedStyle(card).borderTopWidth : null,
      seatMaps: document.querySelectorAll('app-passenger-seat-van, app-passenger-seat-bus').length,
      passengerRows: document.querySelectorAll('app-passenger-info-form [id^="firstName-"]').length,
      swals: document.querySelectorAll('.swal2-popup').length,
      toasts: document.querySelectorAll('.p-toast-message-error, .toast-error').length,
    };
  });
}

/** Grows the viewport to the card's LIVE bottom — an element screenshot taller
 *  than the viewport is cropped, never stitched. */
async function fitViewport(page, width) {
  const bottom = await page.evaluate(() => {
    const el = document
      .querySelector('app-passenger-info-form .open-seat-card')
      ?.closest('.card-container');
    return el ? el.getBoundingClientRect().bottom + window.scrollY : 0;
  });
  await page.setViewportSize({ width, height: Math.max(800, Math.ceil(bottom) + 48) });
  await page.waitForTimeout(400);
}

async function capture(browser, { label, width, device }) {
  const scenario = SCENARIOS[label];
  const context = await browser.newContext({
    viewport: { width, height: 1100 },
    deviceScaleFactor: 2,
    locale: 'th-TH',
  });
  const page = await context.newPage();
  await installFixtures(page, scenario);
  await seed(page, scenario);

  await page.goto(`${BASE}/passenger-info`, { waitUntil: 'networkidle' });
  await page.waitForSelector('app-passenger-info-form .open-seat-card', { timeout: 30000 });
  // The loading swal is a real transient state; let it close before deciding
  // the page is dirty.
  await page.waitForTimeout(1500);

  const m = await measure(page);
  const fail = (why) => {
    throw new Error(`[${TAG}/${label}/${device}] ${why} — not saving. DOM: ${JSON.stringify(m)}`);
  };

  if (m.swals > 0 || m.toasts > 0) {
    fail(`page is dirty: ${m.swals} swal(s), ${m.toasts} error toast(s)`);
  }
  if (m.cards !== 1) {
    fail(`expected exactly 1 open-seat card, DOM has ${m.cards}`);
  }
  if (m.passengerRows !== PASSENGER_COUNT) {
    fail(`expected ${PASSENGER_COUNT} passenger rows seeded from the search page, DOM has ${m.passengerRows}`);
  }
  // A mixed trip keeps the ASSIGNED leg's seat map; alllegs has no map at all.
  const expectedMaps = label === 'alllegs' ? 0 : 1;
  if (m.seatMaps !== expectedMaps) {
    fail(`expected ${expectedMaps} seat map(s) for this scenario, DOM has ${m.seatMaps}`);
  }
  if (!m.cardText.includes(SECTION_HINT)) {
    fail(`the OPEN_SEAT_SECTION_HINT wording is missing from the card`);
  }
  if (scenario.seatRemain !== m.cardText.includes(SEAT_REMAIN)) {
    const openLeg = scenario.selection.find((s) => s.seatingMode === 'OPEN');
    fail(
      `the "${SEAT_REMAIN} X ที่นั่ง" line should be ${scenario.seatRemain ? 'SHOWN' : 'HIDDEN'} at availableSeats=${openLeg.availableSeats}`
    );
  }
  if (!m.cardText.includes(String(PASSENGER_COUNT))) {
    fail(`the card does not report the seeded headcount ${PASSENGER_COUNT}`);
  }

  if (TAG === 'AFTER') {
    if (m.plus || m.minus) {
      fail(`the stepper is still rendered: ${m.plus} plus, ${m.minus} minus`);
    }
    if (m.borderTopWidth !== '0px') {
      fail(`the card still draws its own frame (border-top-width ${m.borderTopWidth})`);
    }
  } else {
    if (m.plus !== 1 || m.minus !== 1) {
      fail(`BEFORE must still have the stepper, DOM has ${m.plus} plus / ${m.minus} minus`);
    }
    if (m.borderTopWidth === '0px') {
      fail(`BEFORE must still draw its own frame — this tree already has the fix`);
    }
  }

  await fitViewport(page, width);
  const file = path.join(OUT_DIR, `OBRS-1988-${TAG}-${label}-${device}.png`);
  await page
    .locator('app-passenger-info-form .card-container:has(.open-seat-card)')
    .screenshot({ path: file });
  console.log(
    `shot -> ${path.basename(file)}  ${JSON.stringify({
      count: m.countText,
      plus: m.plus,
      border: m.borderTopWidth,
    })}`
  );

  await context.close();
  return { file: path.basename(file), ...m };
}

(async () => {
  const browser = await chromium.launch();
  const results = {};
  for (const label of Object.keys(SCENARIOS)) {
    for (const [device, width] of [
      ['desktop', 1400],
      ['390px', 390],
    ]) {
      results[`${label}:${device}`] = await capture(browser, { label, width, device });
    }
  }
  await browser.close();
  const outFile = path.join(OUT_DIR, `OBRS-1988-${TAG.toLowerCase()}-result.json`);
  fs.writeFileSync(outFile, JSON.stringify({ tag: TAG, base: BASE, results }, null, 2));
  console.log('DONE', outFile);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
