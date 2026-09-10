// Standalone capture script for OBRS-1584 visual evidence (not a Playwright
// test, not part of the suite). Same seeding trick and same fixture as
// capture-obrs33.js — 12 schedules over four days, the oldest 19 days back —
// because this card is the OBRS-33 symptom reappearing through the date input.
//
// Both labels are shot against ONE server on :4400, one after the other, so
// only one `ng serve` is alive at a time:
//   npx ng serve --port 4400   (this branch)        -> node e2e/scripts/capture-obrs1584.js AFTER
//   ... with the fix reverted  (origin/dev)         -> node e2e/scripts/capture-obrs1584.js BEFORE
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const LABEL = (process.argv[2] || 'AFTER').toUpperCase();
const BASE = 'http://localhost:4400';
const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1584');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

const TODAY = new Date();
const iso = (d, hhmm) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${hhmm}:00+07:00`;
const dayOffset = (n) => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return d; };
const ddmmyyyy = (d) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

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

const SCHEDULES = [
  [-19, '07:00'], [-19, '13:30'], [-19, '18:00'],
  [-7, '06:30'], [-7, '12:00'], [-7, '17:30'],
  [0, '18:00'], [0, '06:30'], [0, '12:00'], [0, '09:15'],
  [1, '06:30'], [1, '15:00'],
].map(([offset, hhmm], i) => ({
  id: 101 + i,
  departureDateTime: iso(dayOffset(offset), hhmm),
  status: 'scheduled',
  updatedAt: iso(dayOffset(offset), hhmm),
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

/** Clear the field the way a user does: focus, select all, delete. No blur. */
async function clearDateField(page) {
  const input = page.locator('.p-datepicker input').first();
  await input.click();
  await page.keyboard.press('Escape'); // drop the panel so it does not cover the table
  await input.press('Control+a');
  await input.press('Backspace');
  await page.waitForTimeout(500);
  return input;
}

async function shoot(page, name, note) {
  const rows = await dataRows(page);
  const shown = await page.locator('.p-datepicker input').first().inputValue();
  await page.screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log(`captured ${name} — field="${shown}" · ${rows.length} data rows · first=${JSON.stringify(rows[0] ?? null)} · ${note}`);
  return { field: shown, rowCount: rows.length, firstRow: rows[0] ?? null };
}

async function main() {
  const browser = await chromium.launch();
  const summary = {};

  for (const [route, name] of [['/staff/schedules', 'schedules'], ['/staff/boarding', 'boarding']]) {
    const page = await open(browser, route);
    await clearDateField(page);
    summary[`${name}-cleared`] = await shoot(
      page,
      `OBRS-1584-${LABEL}-${name}-cleared.png`,
      'date field emptied, not yet blurred'
    );
    // Blur: OBRS-1584 re-emits the day actually in effect so the field stops
    // disagreeing with the rows underneath it.
    await page.locator('h1, body').first().click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(600);
    summary[`${name}-after-blur`] = await shoot(
      page,
      `OBRS-1584-${LABEL}-${name}-after-blur.png`,
      'after leaving the field'
    );
    await page.close();
  }

  // AC-2: typing a date with the keyboard, one character at a time — every
  // prefix arrives as null, so this is the capability the fix had to keep.
  {
    const page = await open(browser, '/staff/schedules');
    const input = await clearDateField(page);
    const tomorrow = ddmmyyyy(dayOffset(1));
    await input.pressSequentially(tomorrow, { delay: 60 });
    await page.waitForTimeout(600);
    summary['schedules-typed'] = await shoot(
      page,
      `OBRS-1584-${LABEL}-schedules-typed.png`,
      `typed ${tomorrow} key by key`
    );
    await page.close();
  }

  // Regression: the untouched path. Pick a day from the calendar panel (click,
  // never type) and then leave the field — the new blur handler must not
  // disturb what the panel just selected.
  {
    const page = await open(browser, '/staff/schedules');
    const target = dayOffset(1);
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
    summary['schedules-panel-pick-then-blur'] = await shoot(
      page,
      `OBRS-1584-${LABEL}-schedules-panel-pick.png`,
      `picked ${ddmmyyyy(target)} from the panel, then blurred`
    );
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(ASSETS_DIR, `row-report-${LABEL}.json`), JSON.stringify(summary, null, 2));
  console.log('DONE');
}

main().catch((e) => { console.error(e); process.exit(1); });
