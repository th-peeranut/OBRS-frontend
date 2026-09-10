/**
 * OBRS-1364 evidence — the seat next to a woman is closed to a monk, and the seat map says so.
 *
 *   npx ng serve --port 4310
 *   OBRS_VARIANT=BEFORE node e2e/capture-obrs-1364-blocked-seats.mjs
 *   OBRS_VARIANT=AFTER  node e2e/capture-obrs-1364-blocked-seats.mjs
 *
 * NO BACKEND, NO DATABASE. Every `/api/**` call this walk makes is answered by the script itself,
 * which is what makes the two variants comparable: the only thing that differs between them is the
 * one response the card is about.
 *
 *  - **BEFORE** answers `GET /schedules/{id}/blocked-seats` with `[]`. That is byte-identical to
 *    what `origin/dev` renders, and not by assumption: on `origin/dev` the endpoint does not exist
 *    and the frontend never calls it, so `blockedSeats` stays at its `[]` default and every seat
 *    box takes the same branch. Serving a second build of the old code would photograph the same
 *    pixels.
 *  - **AFTER** answers with `["7"]`, which is what the real endpoint returns for a monk when seat 6
 *    is held by a female passenger on this van: seat 6 is row 2 column 2, seat 7 is column 3 beside
 *    her, and seat 5 is column 0 — across the gap where the aisle physically is. That the BACKEND
 *    computes exactly this list is proven by `GenderSeatAdjacencyTest` and `ScheduleServiceTest`,
 *    not by these images; what the images prove is the half a unit test cannot photograph.
 *
 * The seat map is reached by seeding the cross-tab booking context (`obrs.booking_context`, the
 * same localStorage entry OBRS-903 restores from) rather than by walking home → search → results.
 * That walk is three pages of mocked traffic for a screen none of the images show, and every one of
 * its steps is a way for this script to break for a reason that has nothing to do with the card.
 *
 * Screens per language (th, en, zh):
 *   seat-map-<lang>.png   the outbound seat map with passenger 1 marked as a monk
 *
 * Every run also prints what it actually read off the page — the classes on seat 7 and whether the
 * legend row rendered — so a silently blank screenshot cannot pass as a pass.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4310';
const VARIANT = (process.env.OBRS_VARIANT ?? 'AFTER').toUpperCase();
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve(`e2e-evidence/obrs-1364/${VARIANT.toLowerCase()}`);
const LANGS = ['th', 'en', 'zh'];

const SCHEDULE_ID = 9001;
const FROM_STOP_ID = 101;
const TO_STOP_ID = 102;
/** Seat 6 is the one held by a female passenger; 7 is the seat beside her. */
const OCCUPIED_SEAT = '6';
const BLOCKED_SEATS = VARIANT === 'BEFORE' ? [] : ['7'];

/** A 13-seat van, exactly the `prod_seed.sql` vehicle_type_id = 1 layout. */
const ALL_SEATS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'];
const AVAILABLE_SEATS = ALL_SEATS.filter((s) => s !== OCCUPIED_SEAT);

const SCHEDULE = {
  id: SCHEDULE_ID,
  vehicleType: 'van',
  departureDateTime: '2033-06-10T01:00:00Z',
  arrivalDateTime: '2033-06-10T09:00:00Z',
  pricePerSeat: '500.00',
  availableSeats: AVAILABLE_SEATS.length,
  availableSeatNumbers: AVAILABLE_SEATS,
  routeSlug: 'chonburi_bangkok',
  seatingMode: 'ASSIGNED',
};

const FILTER = {
  roundTrip: { name: 'One way', code: 'one_way' },
  passengerInfo: [{ type: 'ADULT', count: 1 }],
  startStationId: FROM_STOP_ID,
  stopStationId: TO_STOP_ID,
  departureDate: '2033-06-10',
  returnDate: null,
  adultCount: 1,
  kidsCount: 0,
};

const SEARCH_PAYLOAD = {
  bookingType: 'one_way',
  numberOfPassengers: 1,
  fromStop: 'nong_chak',
  toStop: 'mo_chit',
  departureDate: '2033-06-10',
};

const SEAT_MAP = ALL_SEATS.map((seatNumber, i) => ({
  seatNumber,
  rowIndex: [0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4][i],
  columnIndex: [0, 1, 2, 3, 0, 2, 3, 0, 2, 3, 0, 2, 3][i],
  isWheelchairAccessible: false,
  isExtraLegroom: false,
}));

// `code`, not `status` — that is the field name on `ResponseAPI`, and getting it
// wrong is invisible here (the two calls this walk depends on read only `.data`)
// but not everywhere: `ScheduleBookingEffect.revalidateRestoredScheduleBooking$`
// tests `response?.code !== 200`, so a `status` key would make the restored
// selection silently skip revalidation instead of passing it.
const ok = (data) => ({ code: 200, message: 'OK', data });

const measured = {};

async function contextFor(browser, lang) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await ctx.addInitScript(
    ([language, envelope]) => {
      window.localStorage.setItem('app_language', language);
      window.localStorage.setItem('obrs.booking_context', envelope);
    },
    [
      lang,
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        value: { filter: FILTER, searchPayload: SEARCH_PAYLOAD, selection: [SCHEDULE] },
      }),
    ]
  );
  return ctx;
}

async function mockApi(page, seen) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;

    if (/\/schedules\/\d+\/blocked-seats$/.test(p)) {
      seen.blockedSeatsCalls.push({
        passengerType: url.searchParams.get('passengerType'),
        fromStopId: url.searchParams.get('fromStopId'),
        toStopId: url.searchParams.get('toStopId'),
      });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(BLOCKED_SEATS)) });
    }
    if (/\/schedules\/\d+\/seats$/.test(p)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(SEAT_MAP)) });
    }
    if (/\/schedules\/search$/.test(p)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({ schedules: [SCHEDULE], departureSchedules: [SCHEDULE] })),
      });
    }
    // Everything else this screen touches (stations, policies, promotions) is
    // irrelevant to the seat map and is answered with a shape that renders nothing.
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) });
  });
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
  await page.route('**/accounts.google.com/**', (route) => route.abort());
}

async function captureLang(browser, lang) {
  const seen = { blockedSeatsCalls: [] };
  const ctx = await contextFor(browser, lang);
  const page = await ctx.newPage();
  await mockApi(page, seen);

  await page.goto(`${BASE}/passenger-info`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('app-passenger-seat-van, app-passenger-seat-bus', { state: 'visible', timeout: 60000 });

  // Passenger 1 is a monk. This is the only input the walk makes; everything else
  // on the screen is left as the customer would first meet it.
  // The label, not the input: the radio itself is styled out of the way, and a
  // forced click on it lands without changing the control.
  await page.locator('label[for="gender_monk-0"]').click();
  await page.waitForTimeout(1200);

  const seatSelector = (label) =>
    `app-passenger-seat-box:has(.seat-box:text-is("${label}")) .seat-box`;
  const readSeat = async (label) => {
    const box = page.locator(seatSelector(label)).first();
    return (await box.count()) ? (await box.getAttribute('class')) : '(seat not rendered)';
  };

  measured[lang] = {
    blockedSeatsCalls: seen.blockedSeatsCalls,
    seat6Class: await readSeat('A6'),
    seat7Class: await readSeat('A7'),
    seat5Class: await readSeat('A5'),
    legendBlockedRendered: (await page.locator('.seat-map-legend-blocked').count()) > 0,
  };

  await page.locator('app-passenger-seat-van, app-passenger-seat-bus').first()
    .screenshot({ path: path.join(OUT, `seat-map-${lang}.png`) });
  await page.screenshot({ path: path.join(OUT, `page-${lang}.png`), fullPage: false });

  await ctx.close();
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
for (const lang of LANGS) {
  await captureLang(browser, lang);
}
await browser.close();

await writeFile(path.join(OUT, 'measured.json'), JSON.stringify({ variant: VARIANT, blockedSeats: BLOCKED_SEATS, measured }, null, 2));
console.log(`${VARIANT} — blocked-seats answered with ${JSON.stringify(BLOCKED_SEATS)}`);
console.log(JSON.stringify(measured, null, 2));
console.log(`images + measured.json in ${OUT}`);
