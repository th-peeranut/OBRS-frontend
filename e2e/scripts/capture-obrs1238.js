// OBRS-1238 AFTER evidence — the three ticket-desk states under the walk-in fare tiles.
//
// THE DATA IS STUBBED, DELIBERATELY AND ENTIRELY. Say so wherever these frames are shown.
// The card's whole point is a predicate over `stops[].hasTicketDesk`, and the three states it
// has to keep apart are not three searches you can make against a live backend: SIT's stops
// carry whatever `has_ticket_desk` the V152 seed gave them, and "the catalogue failed to load"
// is not a state a real server offers on demand. So `GET /api/stops` is a fixture per frame.
// Everything else is this branch's real build: real router, real component, real template,
// real CSS, real i18n bundle.
//
// The catch-all `**/api/**` is registered FIRST and the specific routes after it, because a
// later route wins in Playwright. With calls left unstubbed, `error.interceptor.ts` raises a
// swal over the page and a passing AC photographs as a broken screen - which is the very bug
// this commit fixes, so the script asserts no dialog is on the frame before it saves one.
//
//   npx ng serve --port 4340
//   node e2e/scripts/capture-obrs1238.js catalogue-down
//   node e2e/scripts/capture-obrs1238.js no-desk
//   node e2e/scripts/capture-obrs1238.js has-desk
//
// `catalogue-down` is the frame the fix is about. Before it, that same failure raised a
// BLOCKING modal over the whole counter screen instead of this one line.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SCENARIO = (process.argv[2] || 'catalogue-down').toLowerCase();
const PORT = process.env.CAPTURE_PORT || '4340';
const BASE = process.env.CAPTURE_BASE || 'http://localhost:' + PORT;
const OUT_DIR = process.env.CAPTURE_OUT
  || path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1238');

const ok = (data) => ({ code: 200, message: 'OK', data });

const BUS_TRIP = {
  scheduleId: 201,
  vehicleType: 'bus',
  licensePlate: 'TH-8888',
  driverName: 'Somchai Driver',
  departureDateTime: '2026-09-01T08:00:00Z',
  arrivalDateTime: '2026-09-01T13:00:00Z',
  pricePerSeat: '350.00',
  capacity: 21,
  availableCount: 18,
  reservedUnpaidCount: 1,
  soldPaidCount: 2,
  seatingMode: 'ASSIGNED',
  availableSeatNumbers: ['1','2','4','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21'],
};

const SCHEDULES = ok([{ routeSlug: 'bkk-cnx', routeLabel: 'Bangkok - Chiang Mai', trips: [BUS_TRIP] }]);

const SEGMENTS = ok({
  route: { slug: 'route', name: 'Route' },
  stopPairs: [
    { segmentId: 1, fromStop: { slug: 'origin', name: 'Nong Chak' }, toStop: { slug: 'dest', name: 'Mo Chit' }, vehicleType: { slug: 'bus', name: 'Bus' }, fare: '350.00', estimatedDurationMinutes: 300 },
  ],
});

// The pickup the page resolves to is `origin`; only `hasTicketDesk` changes between frames.
const STOPS = (hasDesk) => ok([
  { id: 1, slug: 'origin', name: 'Nong Chak', hasTicketDesk: hasDesk },
  { id: 2, slug: 'dest', name: 'Mo Chit', hasTicketDesk: true },
]);

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  // A dialog on the frame means the page is broken, not photographed - fail loudly.
  let sawDialog = false;
  page.on('dialog', async (d) => { sawDialog = true; await d.dismiss(); });

  await context.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'obrs-1238-capture-token');
    localStorage.setItem('auth_username', 'salesperson@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['admin', 'owner', 'salesperson']));
  });

  await page.route('**/api/**', (route) => route.fulfill({ json: ok([]) }));
  await page.route('**/api/private/schedules/walk-in**', (route) => route.fulfill({ json: SCHEDULES }));
  await page.route('**/api/private/segments/**', (route) => route.fulfill({ json: SEGMENTS }));

  if (SCENARIO === 'catalogue-down') {
    // The failure the fix is about. `skipErrorAlert` keeps this off the global modal.
    await page.route('**/api/stops**', (route) => route.fulfill({ status: 503, json: { code: 503, message: 'Service Unavailable' } }));
  } else {
    await page.route('**/api/stops**', (route) => route.fulfill({ json: STOPS(SCENARIO === 'has-desk') }));
  }
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());

  await page.goto(BASE + '/staff/sell', { waitUntil: 'domcontentloaded' });
  await page.locator('.trip-row').first().waitFor({ timeout: 30_000 });
  await page.locator('.trip-row').first().click();
  await page.locator('.fare-category-row').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);

  if (sawDialog) throw new Error('a dialog was raised over the page - refusing to save this frame');
  const swal = await page.locator('.swal2-container').count();
  if (swal > 0) throw new Error('a SweetAlert2 modal is covering the page - refusing to save this frame');

  const file = path.join(OUT_DIR, 'AFTER-' + SCENARIO + '.png');
  const panel = page.locator('.fare-category-row').locator('xpath=ancestor::*[contains(@class,"card")][1]');
  await (await panel.count() ? panel.first() : page).screenshot({ path: file });
  console.log('saved ' + file);

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
