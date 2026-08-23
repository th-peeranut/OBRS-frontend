// Standalone capture script for OBRS-33 visual evidence (not a Playwright test,
// not part of the suite).
//
// No backend: AuthService.isAuthenticated() is a pure localStorage check, so
// seeding auth_token/auth_roles as a salesperson clears the guard, and every
// /api call is stubbed so both pages render against the SAME fixture. That
// fixture is the point of the card — 12 schedules spread over four days, the
// oldest 19 days in the past, mirroring what the owner saw on prod.
//
// AFTER  = this branch          on :4400
// BEFORE = origin/dev throwaway on :4300
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-33');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

// The day the shots are taken. Pinned, not `new Date()`: the AFTER page defaults
// to the real today, so the fixture has to name that same day or the "today by
// default" claim photographs as an empty table.
const TODAY = new Date();
const iso = (d, hhmm) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${hhmm}:00+07:00`;
const dayOffset = (n) => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return d; };

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

// id order == insertion order, deliberately NOT departure order: the BEFORE
// page renders exactly this sequence, which is what put a 19-day-old trip on
// row 1.
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

  // Catch-all FIRST — last-registered wins in Playwright.
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

/** Rendered data rows (skeleton/empty placeholder rows have no <td class="fw-semibold">). */
async function dataRows(page) {
  return page.$$eval('table tbody tr', (trs) =>
    trs
      .filter((tr) => tr.querySelector('td.fw-semibold'))
      .map((tr) => Array.from(tr.querySelectorAll('td')).slice(0, 2).map((td) => td.textContent.trim()))
  );
}

async function shoot(page, url, name) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // Nothing dirty gets saved: an error dialog over a correct page reads as broken.
  const swal = await page.locator('.swal2-popup').count();
  if (swal !== 0) throw new Error(`${name}: ${swal} swal popup(s) on screen`);

  const rows = await dataRows(page);
  const file = path.join(ASSETS_DIR, name);
  await page.screenshot({ path: file });
  console.log(`captured ${name} — ${rows.length} data rows; first: ${JSON.stringify(rows[0] ?? null)}`);
  return rows;
}

async function main() {
  const browser = await chromium.launch();
  const summary = {};
  for (const [label, base] of [['BEFORE', 'http://localhost:4300'], ['AFTER', 'http://localhost:4400']]) {
    for (const [page_, name] of [['/staff/schedules', 'schedules'], ['/staff/boarding', 'boarding']]) {
      const page = await newSeededPage(browser);
      summary[`${label}-${name}`] = await shoot(page, `${base}${page_}`, `OBRS-33-${label}-${name}.png`);
      await page.close();
    }
  }
  // AFTER, a day with no trips: proves the picker stays on screen above the
  // empty state, so an empty day is not a dead end.
  {
    const page = await newSeededPage(browser);
    await page.goto('http://localhost:4400/staff/boarding', { waitUntil: 'networkidle' });
    // Drive the real control (open the panel, click the day) rather than
    // writing the model - the shot then shows a state a user can reach.
    const emptyDay = dayOffset(4);
    const typed = `${String(emptyDay.getDate()).padStart(2, '0')}/${String(emptyDay.getMonth() + 1).padStart(2, '0')}/${emptyDay.getFullYear()}`;
    await page.locator('.p-datepicker input').click();
    const panel = page.locator('.p-datepicker-panel');
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    await panel
      .locator('td:not(.p-datepicker-other-month) span')
      .filter({ hasText: new RegExp(`^${emptyDay.getDate()}$`) })
      .first()
      .click();
    await page.waitForTimeout(800);
    const shown = await page.locator('.p-datepicker input').inputValue();
    if (shown !== typed) throw new Error(`picker shows ${shown}, expected ${typed}`);
    const rows = await dataRows(page);
    if (rows.length !== 0) throw new Error(`empty-day shot still has ${rows.length} rows`);
    if ((await page.locator('.p-datepicker input').count()) !== 1) throw new Error('the date picker disappeared with the table');
    await page.screenshot({ path: path.join(ASSETS_DIR, 'OBRS-33-AFTER-boarding-empty-day.png') });
    console.log(`captured OBRS-33-AFTER-boarding-empty-day.png — 0 data rows, picker still present (${typed})`);
    summary['AFTER-boarding-empty-day'] = rows;
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(ASSETS_DIR, 'row-report.json'), JSON.stringify(summary, null, 2));
  console.log('DONE');
}

main().catch((e) => { console.error(e); process.exit(1); });
