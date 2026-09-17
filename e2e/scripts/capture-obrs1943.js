/**
 * OBRS-1943 — BEFORE/AFTER evidence for the open-seating wording on
 * /passenger-info: one Thai phrase everywhere, and a seatless chip that stops
 * claiming a seat is "not chosen yet" on a trip that has no seat to choose.
 *
 * Two scenarios, because the second one is the regression guard:
 *   open     — seatingMode OPEN, seats are always null. The chip must read
 *              "ขึ้นนั่งตามที่ว่าง" (AFTER); BEFORE it read "ยังไม่เลือกที่นั่ง".
 *   assigned — seatingMode ASSIGNED and no seat picked yet. The chip must STILL
 *              read "ยังไม่เลือกที่นั่ง" in both trees — there really is a seat
 *              map waiting for the traveller.
 *
 * NO BACKEND, same recipe as capture-obrs1246.js: every `/api/**` call is served
 * from `page.route` fixtures, so nothing here touches SIT, prod or any DB, and
 * the booking is seeded through `obrs.booking_context` (the OBRS-903 TTL
 * envelope the two booking stores rehydrate from at initialState). The passenger
 * ROW itself cannot be seeded that way — `passengerInfo` starts null and is only
 * filled by the form's debounced `valueChanges` sync — so the script types a
 * name into `#firstName-0` the way a traveller does, then waits out the debounce.
 *
 * ⛔ Serve with `--configuration gate`, never `sit`: the SIT flags redirect
 * /passenger-info to the homepage, and its optimized build has no `window.ng`.
 *
 * Every claim in the images is also ASSERTED here and the script throws rather
 * than saving a screenshot that disagrees with its own scenario — including a
 * zero-swal / zero-error-toast check, because the global HTTP-error interceptor
 * would otherwise photograph a passing AC as a broken page.
 *
 * Usage:
 *   npx ng serve --configuration gate --port <port>
 *   CAPTURE_BASE=http://localhost:<port> node e2e/scripts/capture-obrs1943.js AFTER
 *   CAPTURE_BASE=http://localhost:<port> node e2e/scripts/capture-obrs1943.js BEFORE
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const TAG = (process.argv[2] || 'AFTER').toUpperCase();
const BASE = process.env.CAPTURE_BASE || 'http://localhost:4340';
const OUT_DIR =
  process.env.CAPTURE_OUT ||
  path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1943');
fs.mkdirSync(OUT_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const CHIP_OPEN = 'ขึ้นนั่งตามที่ว่าง';
const CHIP_NO_SEAT = 'ยังไม่เลือกที่นั่ง';
const BADGE_BEFORE = 'ไม่ระบุที่นั่ง (Open Seating)';

// --- fixtures ---------------------------------------------------------------
// `StationApi` rows exactly as the ENVELOPE of GET /api/stops carries them
// (ResponseAPI<StationApi[]>), so the summary card resolves real origin and
// destination names instead of drawing a half-empty card.
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

const schedule = (seatingMode) => ({
  id: 9001,
  vehicleType: 'van',
  departureDateTime: '2026-12-20 08:00:00',
  arrivalDateTime: '2026-12-20 09:48:00',
  pricePerSeat: '250',
  availableSeats: 9,
  availableSeatNumbers: ['1', '2', '3', '4'],
  routeSlug: 'nong-chak-bangkok',
  seatingMode,
});

const bookingContext = (seatingMode) => ({
  version: 1,
  savedAt: Date.now(),
  value: {
    filter: {
      roundTrip: { name: 'One way', code: 'one_way' },
      passengerInfo: [{ type: 'adult', count: 1 }],
      startStationId: 11,
      stopStationId: 22,
      departureDate: '2026-12-20',
      returnDate: null,
      adultCount: 1,
      kidsCount: 0,
    },
    searchPayload: {
      bookingType: 'one_way',
      numberOfPassengers: 1,
      fromStop: 'nong-chak',
      toStop: 'mo-chit-2',
      departureDate: '2026-12-20',
      returnDate: null,
    },
    selection: [schedule(seatingMode)],
  },
});

async function installFixtures(page, seatingMode) {
  // ⚠️ ORDER MATTERS AND IT IS BACKWARDS FROM READING ORDER: Playwright runs the
  // LAST-registered matching handler first, so the broad catch-all goes in FIRST
  // and the specific stub after it. The other way round the catch-all swallows
  // /api/stops and the card silently loses its station names.
  await page.route('**/api/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.includes('/schedules/search')) {
      return json(route, ok({ departureSchedules: [schedule(seatingMode)], arrivalSchedules: null }));
    }
    return json(route, ok(null));
  });
  await page.route('**/api/stops**', (route) => json(route, ok(STOPS)));
  await page.route('**://*.googleapis.com/**', (route) => route.abort());
  await page.route('**://*.gstatic.com/**', (route) => route.abort());
}

async function seed(page, seatingMode) {
  await page.addInitScript((context) => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('obrs.booking_context', JSON.stringify(context));
    // The consent bar is an overlay across the middle of the page and would sit
    // on top of the very card this evidence is about.
    localStorage.setItem('obrs_analytics_consent_v1', 'denied');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_roles');
    localStorage.removeItem('obrs.stations.v1');
  }, bookingContext(seatingMode));
}

/** Reads the card's own words back out of the DOM. */
async function measure(page) {
  return page.evaluate(() => {
    const card = document.querySelector('app-passenger-info-summary');
    const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      url: location.pathname,
      badges: [...(card?.querySelectorAll('.open-seating-badge') || [])].map(text),
      chips: [...(card?.querySelectorAll('.seat-passenger-chip') || [])].map(text),
      passengerRows: card?.querySelectorAll('.summary-passenger-row').length || 0,
      swals: document.querySelectorAll('.swal2-popup').length,
      toasts: document.querySelectorAll('.p-toast-message-error, .toast-error').length,
    };
  });
}

/** Grows the viewport to the card's LIVE bottom — an element screenshot taller
 *  than the viewport is cropped, never stitched. */
async function fitViewport(page, width) {
  const bottom = await page.evaluate(() => {
    const el = document.querySelector('app-passenger-info-summary .card-container');
    return el ? el.getBoundingClientRect().bottom + window.scrollY : 0;
  });
  await page.setViewportSize({ width, height: Math.max(800, Math.ceil(bottom) + 48) });
  await page.waitForTimeout(400);
}

async function capture(browser, { seatingMode, label, width, device }) {
  const context = await browser.newContext({
    viewport: { width, height: 1100 },
    deviceScaleFactor: 2,
    locale: 'th-TH',
  });
  const page = await context.newPage();
  await installFixtures(page, seatingMode);
  await seed(page, seatingMode);

  await page.goto(`${BASE}/passenger-info`, { waitUntil: 'networkidle' });
  await page.waitForSelector('app-passenger-info-summary .card-container', { timeout: 30000 });

  // The passenger ROW only exists once the form's debounced valueChanges sync
  // has pushed it into the store — type a name and wait the debounce out.
  await page.fill('#firstName-0', 'สมชาย');
  await page.waitForTimeout(1500);
  // The loading swal is a real transient state; give it time to close before
  // deciding the page is dirty.
  await page.waitForTimeout(1200);

  const m = await measure(page);
  const expectedChip =
    TAG === 'AFTER' && seatingMode === 'OPEN' ? CHIP_OPEN : CHIP_NO_SEAT;

  if (m.swals > 0 || m.toasts > 0) {
    throw new Error(`[${label}/${device}] page is dirty: ${m.swals} swal(s), ${m.toasts} error toast(s) — not saving`);
  }
  if (!m.passengerRows) {
    throw new Error(`[${label}/${device}] no passenger row rendered — the store never received the typed name`);
  }
  if (!m.chips.length || !m.chips.includes(expectedChip)) {
    throw new Error(
      `[${label}/${device}] expected a chip reading "${expectedChip}", DOM has ${JSON.stringify(m.chips)}`
    );
  }
  if (seatingMode === 'OPEN') {
    const expectedBadge = TAG === 'AFTER' ? CHIP_OPEN : BADGE_BEFORE;
    if (!m.badges.includes(expectedBadge)) {
      throw new Error(
        `[${label}/${device}] expected the leg badge to read "${expectedBadge}", DOM has ${JSON.stringify(m.badges)}`
      );
    }
  }

  await fitViewport(page, width);
  const file = path.join(OUT_DIR, `OBRS-1943-${TAG}-${label}-${device}.png`);
  await page.locator('app-passenger-info-summary .card-container').screenshot({ path: file });
  console.log(`shot -> ${path.basename(file)}  ${JSON.stringify({ badges: m.badges, chips: m.chips })}`);

  await context.close();
  return { file: path.basename(file), ...m };
}

(async () => {
  const browser = await chromium.launch();
  const results = {};
  for (const [label, seatingMode] of [['open', 'OPEN'], ['assigned', 'ASSIGNED']]) {
    for (const [device, width] of [['desktop', 1400], ['390px', 390]]) {
      results[`${label}:${device}`] = await capture(browser, { seatingMode, label, width, device });
    }
  }
  await browser.close();
  const outFile = path.join(OUT_DIR, `OBRS-1943-${TAG.toLowerCase()}-result.json`);
  fs.writeFileSync(outFile, JSON.stringify({ tag: TAG, base: BASE, results }, null, 2));
  console.log('DONE', outFile);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
