/**
 * OBRS-1752 evidence — the walk-in POS checkout column must not be on screen before a
 * trip is picked.
 *
 *   npx ng serve --port 4352
 *   OBRS_OUT_DIR=... node e2e/capture-obrs-1752-checkout-visibility.mjs
 *
 * NO BACKEND, NO DATABASE, NO LOGIN — same seeding as capture-obrs-1666-pos-consent.mjs:
 * `AuthGuard` only reads `auth_token` + `auth_roles` from localStorage, and every /api/**
 * call is answered here.
 *
 * Two states, both read off the live page before the shutter so a mis-clipped or blank
 * screenshot cannot pass as a pass:
 *   1. no-trip.png    landing on /staff/sell with nothing selected
 *   2. trip-picked.png  the first trip row clicked
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4352';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e-evidence/obrs-1752');
const LANG = 'th';

const ROUTE_SLUG = 'chonburi_bangkok';
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso(new Date());

/** WalkInTripDto — field for field from staff-api.service.ts:121. */
const trip = (scheduleId, hh) => ({
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
  seatingMode: 'ASSIGNED',
  normalCapacity: 13,
});

const ROUTE_GROUPS = [
  {
    routeSlug: ROUTE_SLUG,
    routeLabel: 'Chonburi - Bangkok',
    trips: [trip(9101, '08'), trip(9102, '11')],
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
    { stopOrder: 1, offsetMinutesFromOrigin: 0, stop: { id: 101, code: 'nong_chak' } },
    { stopOrder: 2, offsetMinutesFromOrigin: 180, stop: { id: 102, code: 'mo_chit' } },
  ],
  defaultPickupStopSlug: 'nong_chak',
};

const ok = (data) => ({ code: 200, message: 'OK', data });

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

/**
 * What the images are supposed to prove, read as numbers so the pass does not rest on
 * someone eyeballing a PNG: is the checkout component mounted at all, and how wide is
 * the centre column that is supposed to reclaim its space.
 */
async function readState(page) {
  const checkout = page.locator('app-walk-in-checkout');
  const centre = page.locator('app-walk-in-center-panel');
  return {
    checkoutMounted: (await checkout.count()) > 0,
    passengerFormInputs: await page.locator('app-walk-in-checkout input').count(),
    centreColClass: await centre
      .evaluate((el) => el.closest('[class*="col-"]')?.className ?? null)
      .catch(() => null),
    centreColWidthPx: await centre
      .evaluate((el) => Math.round(el.closest('[class*="col-"]').getBoundingClientRect().width))
      .catch(() => null),
  };
}

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript((language) => {
    window.localStorage.setItem('app_language', language);
    window.localStorage.setItem('auth_token', 'capture-only-not-a-real-token');
    window.localStorage.setItem('auth_roles', JSON.stringify(['salesperson']));
  }, LANG);
  const page = await ctx.newPage();
  await mockApi(page);

  await page.goto(`${BASE}/staff/sell`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.trip-row', { state: 'visible', timeout: 60000 });
  await page.waitForTimeout(600);

  const noTrip = await readState(page);
  await page.screenshot({ path: path.join(OUT, 'no-trip.png') });

  await page.locator('.trip-row').first().click();
  await page.waitForTimeout(1500);
  const tripPicked = await readState(page);
  await page.screenshot({ path: path.join(OUT, 'trip-picked.png') });

  const measured = { base: BASE, noTrip, tripPicked };
  await writeFile(path.join(OUT, 'measured.json'), JSON.stringify(measured, null, 2));
  console.log(JSON.stringify(measured, null, 2));

  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
