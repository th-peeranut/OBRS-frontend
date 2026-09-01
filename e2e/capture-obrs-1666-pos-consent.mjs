/**
 * OBRS-1666 evidence — the SECOND entry point, which the first evidence run missed entirely:
 * the walk-in POS (`/staff/sell`). Ten images were attached to the card and not one of them
 * showed this screen, even though the card adds a consent checkbox to it.
 *
 *   npx ng serve --port 4318
 *   node e2e/capture-obrs-1666-pos-consent.mjs
 *
 * NO BACKEND, NO DATABASE, NO LOGIN. `AuthGuard` on `/staff` needs two things and checks nothing
 * else: `isAuthenticated()` is `!!getToken()` (no JWT decode — auth.service.ts:420) and
 * `hasAnyRole(['driver','salesperson'])` reads `auth_roles` out of localStorage. So both are
 * seeded directly and every `/api/**` call is answered here. Walking a real login would need a
 * live backend for a screen none of these images show.
 *
 * WHY AN OPEN-SEATING TRIP IS IN THIS SET
 * The owner asked whether the seat-selection screen is shown for open seating (it is not — the
 * seat map is gated on `seatingMode`). That question exposed a real defect in the POS consent
 * text: the passenger-facing label scopes the seating purpose to "services with numbered seats"
 * and the POS one did not, while the POS sells OPEN trips too. State 4 is that fix photographed
 * on the trip where it matters — the consent box present, the wording scoped, and no seat map.
 *
 * Four states per language, all four read off the live page before the shutter:
 *   1. female-<lang>.png   a non-sensitive type: no consent box at all
 *   2. monk-<lang>.png     monk selected: the box appears, UNTICKED
 *   3. ticked-<lang>.png   the box after the clerk ticks it
 *   4. open-monk-<lang>.png  the same box on an OPEN-seating trip, no seat map
 *
 * Every run prints what it actually read - whether the box exists, whether it is checked, and
 * whether a seat map is on screen - so a blank or mis-clipped screenshot cannot pass as a pass.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4318';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e-evidence/obrs-1666-pos');
const LANGS = ['th', 'en', 'zh'];

const ROUTE_SLUG = 'chonburi_bangkok';
const ASSIGNED_ID = 9101;
const OPEN_ID = 9102;

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso(new Date());

/** WalkInTripDto — field for field from staff-api.service.ts:121. */
const trip = (scheduleId, hh, seatingMode) => ({
  scheduleId,
  vehicleType: 'van',
  licensePlate: 'AB-1234',
  driverName: 'Somchai',
  departureDateTime: `${TODAY}T${hh}:00:00`,
  arrivalDateTime: `${TODAY}T${String(Number(hh) + 3).padStart(2, '0')}:00:00`,
  pricePerSeat: '500',
  capacity: 13,
  availableCount: 12,
  reservedUnpaidCount: 0,
  soldPaidCount: 1,
  availableSeatNumbers: ['1', '2', '3', '4', '5', '7', '8', '9', '10', '11', '12', '13'],
  deletable: false,
  confirmedBookingCount: 1,
  seatingMode,
  normalCapacity: 13,
});

const ROUTE_GROUPS = [
  {
    routeSlug: ROUTE_SLUG,
    routeLabel: 'Chonburi - Bangkok',
    trips: [trip(ASSIGNED_ID, '08', 'ASSIGNED'), trip(OPEN_ID, '11', 'OPEN')],
  },
];

const STOP = (slug, name) => ({ slug, name });
const SEGMENTS = {
  route: STOP(ROUTE_SLUG, 'Chonburi - Bangkok'),
  stopPairs: [
    {
      segmentId: 1,
      fromStop: STOP('nong_chak', 'Nong Chak'),
      toStop: STOP('mo_chit', 'Mo Chit'),
      vehicleType: STOP('van', 'Van'),
      fare: '500',
      estimatedDurationMinutes: 180,
    },
  ],
  popularPickupStops: [{ slug: 'nong_chak', name: 'Nong Chak', count: 9 }],
  popularDropoffStops: [{ slug: 'mo_chit', name: 'Mo Chit', count: 9 }],
};

const ROUTE_STOPS = {
  stops: [
    // `stop` is `{ code: string; id?: number }` (RouteStopTimeDto, staff-api.service.ts:228)
    // — no `name`. A mock that invents a field is how the next reader learns a DTO wrong.
    { stopOrder: 1, offsetMinutesFromOrigin: 0, stop: { id: 101, code: 'nong_chak' } },
    { stopOrder: 2, offsetMinutesFromOrigin: 180, stop: { id: 102, code: 'mo_chit' } },
  ],
  defaultPickupStopSlug: 'nong_chak',
};

// `code`, not `status` — that is the field name on `ResponseAPI`.
const ok = (data) => ({ code: 200, message: 'OK', data });

const measured = {};

async function contextFor(browser, lang) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  await ctx.addInitScript((language) => {
    window.localStorage.setItem('app_language', language);
    // AuthGuard reads exactly these two. No JWT is decoded anywhere on this path.
    window.localStorage.setItem('auth_token', 'capture-only-not-a-real-token');
    window.localStorage.setItem('auth_roles', JSON.stringify(['salesperson']));
  }, lang);
  return ctx;
}

async function mockApi(page) {
  await page.route('**/api/**', async (route) => {
    const p = new URL(route.request().url()).pathname;
    const send = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(data)) });
    if (/\/private\/schedules\/walk-in$/.test(p)) return send(ROUTE_GROUPS);
    if (/\/private\/segments\//.test(p)) return send(SEGMENTS);
    if (/\/private\/route-stops\//.test(p)) return send(ROUTE_STOPS);
    if (/\/private\/users\/drivers$/.test(p)) return send([]);
    return send(null);
  });
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
  await page.route('**/accounts.google.com/**', (route) => route.abort());
}

const CONSENT_INPUT = '#walkin-passenger-type-consent';

async function readState(page) {
  const input = page.locator(CONSENT_INPUT);
  const present = (await input.count()) > 0;
  return {
    consentBoxPresent: present,
    consentBoxChecked: present ? await input.isChecked() : null,
    // Recorded because the first run of this script found the box rendered 2x14 px - a
    // sliver, tick state unreadable - and no unit spec could ever have seen that: they
    // assert the control's VALUE, never its rendered size. Expect ~14x14.
    consentBoxSizePx: present
      ? await input.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return `${Math.round(r.width)}x${Math.round(r.height)}`;
        })
      : null,
    labelText: present
      ? (await page.locator('label[for="walkin-passenger-type-consent"]').innerText()).trim().slice(0, 260)
      : null,
    // The two mutually exclusive halves of the OBRS-324 branch. Recording both is the point:
    // one of them alone cannot tell "OPEN trip" apart from "selector typo".
    seatMapOnScreen:
      (await page.locator('app-passenger-seat-van, app-passenger-seat-bus').count()) > 0,
    openSeatingCountOnScreen: (await page.locator('.open-seating-count').count()) > 0,
    activeType: await page
      .locator('.ptype-tile[aria-pressed="true"] .ptype-label')
      .first()
      .innerText()
      .catch(() => null),
  };
}

/** Shoot the passenger-type row plus whatever sits under it, which is where the box appears. */
async function shoot(page, file) {
  const row = page.locator('.ptype-row').first();
  const box = await row.evaluate((el) => {
    const r = el.getBoundingClientRect();
    // 64px of left margin, not 12: the consent checkbox sits OUTSIDE the type row's left edge,
    // and a first run clipped it off - an image of a consent box that cannot show the tick is
    // the one thing this evidence must not be.
    return { x: Math.max(0, r.x - 64), y: Math.max(0, r.y - 12), width: r.width + 128, height: r.height + 260 };
  });
  await page.screenshot({ path: file, clip: box });
}

/** index into `passengerTypeOptions` — male, female, monk, nun (component ts:184). */
const PTYPE = { male: 0, female: 1, monk: 2, nun: 3 };
const pickType = async (page, name) => {
  await page.locator('.ptype-tile').nth(PTYPE[name]).click();
  await page.waitForTimeout(400);
};

/** `.trip-row` order follows ROUTE_GROUPS above: 0 = ASSIGNED 08:00, 1 = OPEN 11:00. */
const pickTrip = async (page, index) => {
  await page.locator('.trip-row').nth(index).click();
  await page.waitForTimeout(1200);
};

async function captureLang(browser, lang) {
  const ctx = await contextFor(browser, lang);
  const page = await ctx.newPage();
  await mockApi(page);

  await page.goto(`${BASE}/staff/sell`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.trip-row', { state: 'visible', timeout: 60000 });
  await pickTrip(page, 0);
  await page.waitForSelector('.ptype-tile', { state: 'visible', timeout: 30000 });

  // 1) a non-sensitive type: nothing is asked for.
  await pickType(page, 'female');
  const female = await readState(page);
  await shoot(page, path.join(OUT, `female-${lang}.png`));

  // 2) monk: the box appears, and it appears UNTICKED.
  await pickType(page, 'monk');
  const monk = await readState(page);
  await shoot(page, path.join(OUT, `monk-${lang}.png`));

  // 3) the clerk ticks it.
  await page.locator('label[for="walkin-passenger-type-consent"]').click();
  await page.waitForTimeout(400);
  const ticked = await readState(page);
  await shoot(page, path.join(OUT, `ticked-${lang}.png`));

  // 4) the same box on an OPEN-seating trip: no seat map, and the label must say the seating
  //    purpose only applies to services with numbered seats.
  await pickTrip(page, 1);
  await pickType(page, 'monk');
  const openMonk = await readState(page);
  await shoot(page, path.join(OUT, `open-monk-${lang}.png`));

  measured[lang] = { female, monk, ticked, openMonk };
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
