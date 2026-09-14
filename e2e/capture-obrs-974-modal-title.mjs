/**
 * OBRS-974 evidence — the confirm-modal TITLE on the two staff pages must be a
 * translation, not the raw key `ADMIN.MESSAGES.DELETE_CONFIRM_TITLE`.
 *
 *   npx ng serve --port 4974
 *   OBRS_BASE_URL=http://localhost:4974 OBRS_OUT_DIR=... node e2e/capture-obrs-974-modal-title.mjs
 *
 * NO BACKEND, NO DATABASE, NO LOGIN — same seeding as capture-obrs-1752-checkout-visibility.mjs:
 * `AuthGuard` only reads `auth_token` + `auth_roles` from localStorage, and every /api/**
 * call is answered here. That also means this same script drives a BEFORE server (a
 * throwaway worktree at origin/dev) and an AFTER server with identical data, so the only
 * difference between the two image sets is the change under review.
 *
 * Two surfaces, both in `delete` mode (the arm that was broken):
 *   1. staff-schedules.png  /staff/schedules -> the row's trash button
 *   2. sell.png             /staff/sell -> the trip action menu -> the delete item
 *
 * The title STRING is read off the live DOM into measured.json before each shutter, so a
 * mis-clipped or blank PNG cannot pass as a pass: `titleIsRawKey` is the whole verdict.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4974';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e-evidence/obrs-974');
const LANG = 'th';

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso(new Date());

const ROUTE = { id: 1, slug: 'chonburi_bangkok', name: 'Chonburi - Bangkok', routeName: 'Chonburi - Bangkok' };
const VEHICLE_TYPE = { id: 1, slug: 'van', name: 'Van', totalSeats: 13 };
const VEHICLE = { id: 1, licensePlate: 'AB-1234', vehicleType: VEHICLE_TYPE };
const DRIVER = { id: 1, firstName: 'Somchai', lastName: 'Rakdee', fullName: 'Somchai Rakdee' };

// `deletable: true` is what puts the modal in `delete` mode - the arm whose key was
// missing from all three locale files. `false` would open the cancel-trip arm instead.
const SCHEDULE = {
  id: 9101,
  departureDateTime: `${TODAY}T08:00:00`,
  updatedAt: `${TODAY}T07:00:00`,
  status: 'scheduled',
  route: ROUTE,
  vehicle: VEHICLE,
  vehicleType: VEHICLE_TYPE,
  driver: DRIVER,
  deletable: true,
  confirmedBookingCount: 0,
};

/** WalkInTripDto - field for field from staff-api.service.ts. */
const TRIP = {
  scheduleId: 9101,
  vehicleType: 'van',
  licensePlate: 'AB-1234',
  driverName: 'Somchai',
  departureDateTime: `${TODAY}T08:00:00`,
  arrivalDateTime: `${TODAY}T11:00:00`,
  pricePerSeat: '500',
  capacity: 13,
  availableCount: 13,
  reservedUnpaidCount: 0,
  soldPaidCount: 0,
  availableSeatNumbers: ['1', '2', '3'],
  deletable: true,
  confirmedBookingCount: 0,
  seatingMode: 'ASSIGNED',
  normalCapacity: 13,
};

const ROUTE_GROUPS = [{ routeSlug: ROUTE.slug, routeLabel: ROUTE.name, trips: [TRIP] }];

const ok = (data) => ({ code: 200, message: 'OK', data });

async function mockApi(page) {
  await page.route('**/api/**', async (route) => {
    const p = new URL(route.request().url()).pathname;
    const send = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(data)) });
    if (/\/private\/schedules\/walk-in$/.test(p)) return send(ROUTE_GROUPS);
    if (/\/private\/schedules$/.test(p)) return send([SCHEDULE]);
    if (/\/routes$/.test(p)) return send([ROUTE]);
    if (/\/private\/vehicles$/.test(p)) return send([VEHICLE]);
    if (/\/private\/vehicle-types$/.test(p)) return send([VEHICLE_TYPE]);
    if (/\/private\/users\/drivers$/.test(p)) return send([DRIVER]);
    return send([]);
  });
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
  await page.route('**/accounts.google.com/**', (route) => route.abort());
}

/** The verdict, as data: what the modal heading actually says. */
async function readTitle(page) {
  const title = (await page.locator('.modal-title').first().innerText()).trim();
  return {
    title,
    titleIsRawKey: /^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)+$/.test(title),
    swalOnScreen: await page.locator('.swal2-container').count(),
  };
}

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript((language) => {
    window.localStorage.setItem('app_language', language);
    window.localStorage.setItem('auth_token', 'capture-only-not-a-real-token');
    window.localStorage.setItem('auth_roles', JSON.stringify(['owner', 'salesperson']));
  }, LANG);
  const page = await ctx.newPage();
  await mockApi(page);

  // 1) /staff/schedules - the trash button on the row opens the modal directly.
  await page.goto(`${BASE}/staff/schedules`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('tbody .btn-outline-danger', { state: 'visible', timeout: 90000 });
  await page.locator('tbody .btn-outline-danger').first().click();
  await page.waitForSelector('.modal-title', { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(400);
  const staffSchedules = await readTitle(page);
  await page.screenshot({ path: path.join(OUT, 'staff-schedules.png') });

  // 2) /staff/sell - the same modal, reached through the trip action menu.
  await page.goto(`${BASE}/staff/sell`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.trip-actions-btn', { state: 'visible', timeout: 90000 });
  await page.locator('.trip-actions-btn').first().click();
  await page.waitForSelector('.p-menu-overlay .p-menu-item-link', { state: 'visible', timeout: 30000 });
  await page.locator('.p-menu-overlay .p-menu-item-link').last().click();
  await page.waitForSelector('.modal-title', { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(400);
  const sell = await readTitle(page);
  await page.screenshot({ path: path.join(OUT, 'sell.png') });

  const measured = { base: BASE, capturedAt: new Date().toISOString(), staffSchedules, sell };
  await writeFile(path.join(OUT, 'measured.json'), JSON.stringify(measured, null, 2));
  console.log(JSON.stringify(measured, null, 2));

  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
