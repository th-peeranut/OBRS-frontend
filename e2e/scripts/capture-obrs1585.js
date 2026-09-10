// Standalone capture script for OBRS-1585 visual evidence (not a Playwright
// test, not part of the suite). Same seeding trick as capture-obrs1584.js, but
// the fixture is the point: `departureDateTime` comes back as `Z` instead of
// `+07:00`.
//
// That is not what prod serves today — `spring.jackson.time-zone:
// Asia/Bangkok` makes the MVC mapper emit `+07:00`, which is why the card is a
// Task and not a Bug. The fixture is the one config line away, and it is the
// only way to SHOW what the three clocks do when they disagree, because with
// `+07:00` they never do.
//
// Both labels are shot against ONE server on :4400, one after the other, so
// only one `ng serve` is alive at a time:
//   npx ng serve --port 4400   (this branch)       -> node e2e/scripts/capture-obrs1585.js AFTER
//   ... with the two components reverted           -> node e2e/scripts/capture-obrs1585.js BEFORE
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const LABEL = (process.argv[2] || 'AFTER').toUpperCase();
const BASE = 'http://localhost:4400';
const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1585');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

const TODAY = new Date();
const dayOffset = (n) => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return d; };
const ddmmyyyy = (d) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/** Bangkok wall-clock `hh:mm` on `d`, written the way the API writes it today. */
const isoBangkok = (d, hhmm) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${hhmm}:00+07:00`;

/** The SAME instant, written as `Z`. A departure before 07:00 Bangkok lands on
 * the previous calendar day once the offset is folded in — 06:30 becomes
 * 23:30Z yesterday — which is exactly what a raw string split reads. */
const isoZ = (d, hhmm) => {
  const [hour, minute] = hhmm.split(':').map(Number);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), hour - 7, minute, 0));
  return `${utc.toISOString().slice(0, 19)}Z`;
};

const ROUTES = [
  { id: 1, slug: 'nakhonratchasima-bangkok', translations: [{ locale: 'th', label: 'นครราชสีมา - กรุงเทพฯ' }, { locale: 'en', label: 'Nakhon Ratchasima - Bangkok' }] },
  { id: 2, slug: 'bangkok-nakhonratchasima', translations: [{ locale: 'th', label: 'กรุงเทพฯ - นครราชสีมา' }, { locale: 'en', label: 'Bangkok - Nakhon Ratchasima' }] },
];
const VEHICLES = [
  { id: 1, vehicleNumber: '10-1234', numberPlate: '10-1234' },
  { id: 2, vehicleNumber: '10-5678', numberPlate: '10-5678' },
];
const VEHICLE_TYPES = [{ id: 1, slug: 'van', totalSeats: 13 }];
const DRIVERS = [
  { id: 11, fullName: 'สมชาย ใจดี' },
  { id: 12, fullName: 'ประเสริฐ ขยัน' },
];

// Four trips. Only #201 crosses the day boundary as `Z`; #202 is the same day
// in both readings (09:15 - 7h is still tomorrow), #203 carries the offset prod
// actually sends, and #200 is a plain row on today so the day being shown is
// never empty.
const TRIPS = [
  { id: 200, when: isoBangkok(dayOffset(0), '08:00'), note: 'today 08:00 +07:00' },
  { id: 201, when: isoZ(dayOffset(1), '06:30'), note: 'tomorrow 06:30 sent as Z' },
  { id: 202, when: isoZ(dayOffset(1), '09:15'), note: 'tomorrow 09:15 sent as Z' },
  { id: 203, when: isoBangkok(dayOffset(1), '18:00'), note: 'tomorrow 18:00 +07:00' },
];

const SCHEDULES = TRIPS.map((t, i) => ({
  id: t.id,
  departureDateTime: t.when,
  status: 'scheduled',
  updatedAt: t.when,
  route: ROUTES[i % 2],
  vehicle: VEHICLES[i % 2],
  vehicleType: VEHICLE_TYPES[0],
  driver: DRIVERS[i % 2],
  deletable: true,
  confirmedBookingCount: 0,
}));

async function newSeededPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'fake-salesperson-token-for-capture');
    localStorage.setItem('auth_username', 'sales@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['salesperson']));
  });
  const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/**', (route) => json(route, ok([])));
  await page.route('**/private/schedules**', (route) => json(route, ok(SCHEDULES)));
  await page.route('**/routes**', (route) => json(route, ok(ROUTES)));
  await page.route('**/private/vehicles**', (route) => json(route, ok(VEHICLES)));
  await page.route('**/private/vehicle-types**', (route) => json(route, ok(VEHICLE_TYPES)));
  await page.route('**/private/users/drivers**', (route) => json(route, ok(DRIVERS)));
  await page.route('**/private/lookups**', (route) => json(route, ok([])));
  return page;
}

/** Trip id + the departure cell the user actually reads, per data row. */
async function dataRows(page) {
  return page.$$eval('table tbody tr', (trs) =>
    trs
      .filter((tr) => tr.querySelector('td.fw-semibold'))
      .map((tr) => Array.from(tr.querySelectorAll('td')).slice(0, 2).map((td) => td.textContent.trim()))
  );
}

async function open(browser, route) {
  const page = await newSeededPage(browser);
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const swal = await page.locator('.swal2-popup').count();
  if (swal !== 0) throw new Error(`${route}: ${swal} swal popup(s) on screen`);
  return page;
}

/** Pick a day from the calendar panel (click, never type). */
async function pickDay(page, target) {
  await page.locator('.p-datepicker input').first().click();
  const panel = page.locator('.p-datepicker-panel');
  await panel.waitFor({ state: 'visible', timeout: 10000 });
  await panel
    .locator('td:not(.p-datepicker-other-month) span')
    .filter({ hasText: new RegExp(`^${target.getDate()}$`) })
    .first()
    .click();
  await page.waitForTimeout(600);
  await page.locator('h1, body').first().click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(600);
}

async function shoot(page, name, note) {
  const rows = await dataRows(page);
  const shown = await page.locator('.p-datepicker input').first().inputValue();
  await page.screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log(`captured ${name} — field="${shown}" · ${rows.length} data rows · ${JSON.stringify(rows)} · ${note}`);
  return { field: shown, rowCount: rows.length, rows, note };
}

async function main() {
  const browser = await chromium.launch();
  const summary = { fixture: TRIPS };
  const tomorrow = dayOffset(1);

  for (const [route, name] of [['/staff/schedules', 'schedules'], ['/staff/boarding', 'boarding']]) {
    // The day the page opens on. BEFORE, #201 is filed here — on TODAY — while
    // its own departure cell prints tomorrow 06:30.
    const todayPage = await open(browser, route);
    summary[`${name}-today`] = await shoot(
      todayPage,
      `OBRS-1585-${LABEL}-${name}-today.png`,
      `default day (${ddmmyyyy(TODAY)})`
    );
    await todayPage.close();

    // The day #201 belongs to and the day its cell names.
    const tomorrowPage = await open(browser, route);
    await pickDay(tomorrowPage, tomorrow);
    summary[`${name}-tomorrow`] = await shoot(
      tomorrowPage,
      `OBRS-1585-${LABEL}-${name}-tomorrow.png`,
      `picked ${ddmmyyyy(tomorrow)} from the panel`
    );
    await tomorrowPage.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(ASSETS_DIR, `row-report-${LABEL}.json`), JSON.stringify(summary, null, 2));
  console.log('DONE');
}

main().catch((e) => { console.error(e); process.exit(1); });
