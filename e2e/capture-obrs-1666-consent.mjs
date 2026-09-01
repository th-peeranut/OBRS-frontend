/**
 * OBRS-1666 evidence — the explicit-consent box that appears only for monk/nun, never pre-ticked.
 *
 *   npx ng serve --port 4316
 *   node e2e/capture-obrs-1666-consent.mjs
 *
 * NO BACKEND, NO DATABASE. Every `/api/**` call this walk makes is answered by the script, and the
 * booking context is seeded straight into localStorage (`obrs.booking_context`, the entry OBRS-903
 * restores from) rather than walked home -> search -> results. Both choices are copied from
 * `capture-obrs-1364-blocked-seats.mjs` for the same reason it gives: three pages of mocked traffic
 * for a screen none of these images show is three more ways to fail for a reason that is not the
 * card's.
 *
 * ⚠️ AFTER ONLY, deliberately. The control is compiled into the bundle, so a BEFORE image would
 * need a second `ng serve` of `origin/dev`. It would also show nothing: on `origin/dev` this
 * markup does not exist, which `git grep -c passengerTypeConsent origin/dev -- src` proves at zero
 * cost and a photograph of its absence proves no better.
 *
 * Three states per language, which is the whole behaviour the card asked for:
 *   1. female-<lang>.png  a non-sensitive type: no consent box at all
 *   2. monk-<lang>.png    monk selected: the box appears, UNTICKED
 *   3. ticked-<lang>.png  the box after the traveller ticks it
 *
 * Every run prints what it actually read off the page - whether the box exists and whether it is
 * checked - so a blank or mis-clipped screenshot cannot pass as a pass.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4316';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e-evidence/obrs-1666/after');
const LANGS = ['th', 'en', 'zh'];

const SCHEDULE_ID = 9001;
const FROM_STOP_ID = 101;
const TO_STOP_ID = 102;
/** Seat 6 is held by someone else, exactly as in capture-obrs-1364-blocked-seats.mjs, so this
  * walk meets the same seat map. Nothing here is about blocked seats: that request is answered
  * with [] below. */
const OCCUPIED_SEAT = '6';

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

async function mockApi(page) {
  await page.route('**/api/**', async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (/\/schedules\/\d+\/blocked-seats$/.test(p)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok([])) });
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
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) });
  });
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
  await page.route('**/accounts.google.com/**', (route) => route.abort());
}

/** The consent box for passenger 1, or null when the markup is not on the page at all. */
const CONSENT_INPUT = '#passenger-type-consent-0';

async function readState(page) {
  const input = page.locator(CONSENT_INPUT);
  const present = (await input.count()) > 0;
  return {
    consentBoxPresent: present,
    consentBoxChecked: present ? await input.isChecked() : null,
    labelText: present
      ? (await page.locator(`label[for="passenger-type-consent-0"]`).innerText()).trim().slice(0, 200)
      : null,
  };
}

/** Shoot the gender row plus whatever sits under it, which is where the box appears. */
async function shoot(page, file) {
  const row = page.locator('.form-check-input[id^="gender_male-0"]').first();
  const box = await row.evaluate((el) => {
    const card = el.closest('.row') ?? el.parentElement;
    const r = card.getBoundingClientRect();
    return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 190 };
  });
  await page.screenshot({ path: file, clip: box });
}

async function captureLang(browser, lang) {
  const ctx = await contextFor(browser, lang);
  const page = await ctx.newPage();
  await mockApi(page);

  await page.goto(`${BASE}/passenger-info`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('label[for="gender_monk-0"]', { state: 'visible', timeout: 60000 });

  // 1) a non-sensitive type: nothing is asked for.
  await page.locator('label[for="gender_female-0"]').click();
  await page.waitForTimeout(600);
  const female = await readState(page);
  await shoot(page, path.join(OUT, `female-${lang}.png`));

  // 2) monk: the box appears, and it appears UNTICKED.
  await page.locator('label[for="gender_monk-0"]').click();
  await page.waitForTimeout(600);
  const monk = await readState(page);
  await shoot(page, path.join(OUT, `monk-${lang}.png`));

  // 3) the traveller ticks it.
  await page.locator(`label[for="passenger-type-consent-0"]`).click();
  await page.waitForTimeout(400);
  const ticked = await readState(page);
  await shoot(page, path.join(OUT, `ticked-${lang}.png`));

  // 4) and switching to nun withdraws it again - the box must come back unticked.
  await page.locator('label[for="gender_nun-0"]').click();
  await page.waitForTimeout(600);
  const afterSwitch = await readState(page);

  measured[lang] = { female, monk, ticked, afterSwitch };
  await ctx.close();
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
for (const lang of LANGS) {
  await captureLang(browser, lang);
}
await browser.close();

await writeFile(path.join(OUT, 'measured.json'), JSON.stringify({ measured }, null, 2));
console.log(JSON.stringify(measured, null, 2));
console.log(`images + measured.json in ${OUT}`);
