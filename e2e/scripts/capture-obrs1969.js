// Standalone capture script for OBRS-1969 visual evidence (not a Playwright test, not part of the suite).
//
// Same stubbed lane as capture-obrs1967.js, which photographs this exact page — no backend. The
// stub sends ONE payload to both builds: `status.code` plus the `status.label` the server would
// have resolved from a Thai request. origin/dev prints that label raw, so the badge stays Thai on
// an English table — the defect — and this branch reads the code instead:
//   node e2e/scripts/capture-obrs1969.js after  http://localhost:4200   (this branch)
//   node e2e/scripts/capture-obrs1969.js before http://localhost:4200   (origin/dev served instead)
//
// The assertion that cannot be faked is in frame 2: the script counts boarding-list requests across
// the language switch. The words must change without the count moving.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1969');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const PHASE = process.argv[2] === 'before' ? 'BEFORE' : 'AFTER';
const BASE_URL = process.argv[3] || 'http://localhost:4200';
const SCHEDULE_ID = 42;

const ok = (data) => ({ code: 200, message: 'OK', data });

// The label is what a Thai-language fetch returns — exactly what the server sends today.
const CHECKED_IN = { code: 'checked_in', label: 'เช็คอินแล้ว' };
const CONFIRMED = { code: 'confirmed', label: 'ยืนยันแล้ว' };

const NONG_CHAK = { th: 'หนองชาก', en: 'Nong Chak' };
const SRINAKARIN = { th: 'ศรีนครินทร์', en: 'Srinakarin' };

const row = (ticketId, seatNumber, passengerName, status, boardedAt = null) => ({
  ticketId,
  ticketNumber: `TCK-1002${40 + ticketId}`,
  bookingNumber: `BK-ABC${100 + ticketId}`,
  seatNumber,
  passengerTitle: 'MR',
  passengerName,
  fromStop: 'nong_chak',
  fromStopLabels: NONG_CHAK,
  toStop: 'srinakarin',
  toStopLabels: SRINAKARIN,
  status,
  boardedAt,
  boardedBy: boardedAt ? 9 : null,
  boardedByName: boardedAt ? 'มาลี พนักงาน' : null,
  fareCategory: 'adult',
});

const MANIFEST = ok([
  row(1, '1', 'สมชาย ใจดี', CHECKED_IN, '2026-09-18T01:12:00Z'),
  row(2, '2', 'มาลี ทองดี', CHECKED_IN, '2026-09-18T01:12:00Z'),
  row(3, '3', 'ก้อง ใจดี', CONFIRMED),
]);

const SCHEDULE = ok({
  id: SCHEDULE_ID,
  departureDateTime: '2026-09-18T09:00:00+07:00',
  status: 'scheduled',
  delayedDepartureDateTime: null,
  delayReason: null,
  route: {
    slug: 'chonburi_bangkok',
    translations: [
      { locale: 'th', label: 'หนองชาก-บ้านบึง-กรุงเทพฯ' },
      { locale: 'en', label: 'Nong Chak - Ban Bueng - Bangkok' },
    ],
  },
  vehicle: { numberPlate: '30-1234 ชลบุรี', vehicleNumber: 'V-07' },
  driver: { id: 5, fullName: 'สมศักดิ์ ขับดี' },
});

let manifestRequests = 0;

async function newSeededPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1200 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'fake-driver-token-for-capture');
    localStorage.setItem('auth_username', 'driver@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['driver']));
  });

  const json = (route, body) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  // Catch-all FIRST (lowest priority — last-registered wins in Playwright).
  await page.route('**/api/**', (route) => json(route, ok(null)));
  await page.route(`**/schedules/${SCHEDULE_ID}`, (route) => json(route, SCHEDULE));
  await page.route('**/boarding-list**', (route) => {
    manifestRequests += 1;
    return json(route, MANIFEST);
  });
  return page;
}

function card(page) {
  return page.locator('.card').last();
}

async function shot(page, name, expect) {
  const text = (await page.locator('table.table tbody').innerText()).replace(/\s+/g, ' ');
  for (const needle of expect.contains ?? []) {
    if (!text.includes(needle)) {
      throw new Error(`refusing to save ${name}: table does not contain ${needle}`);
    }
  }
  for (const needle of expect.absent ?? []) {
    if (text.includes(needle)) {
      throw new Error(`refusing to save ${name}: table still shows ${needle}`);
    }
  }
  await card(page).screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log('captured', name);
}

async function switchLanguageTo(page, endonym) {
  await page.locator('.navbar-lang-trigger').first().click();
  await page.locator('.navbar-lang-item', { hasText: endonym }).first().click();
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await chromium.launch();
  const page = await newSeededPage(browser);
  await page.goto(`${BASE_URL}/staff/boarding/${SCHEDULE_ID}`, { waitUntil: 'networkidle' });
  await page.locator('table.table tbody tr').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(400);

  // 1 — the Thai manifest. Nothing is wrong here, and that is the point: the badge only
  //     misreads once the reader moves.
  await shot(page, `OBRS-1969-${PHASE}-1-manifest-thai.png`, {
    contains: ['เช็คอินแล้ว', 'ยืนยันแล้ว'],
  });

  const requestsBeforeSwitch = manifestRequests;
  await switchLanguageTo(page, 'English');

  if (PHASE === 'BEFORE') {
    // origin/dev: the whole table turned English and the badge did not.
    await shot(page, 'OBRS-1969-BEFORE-2-badge-stuck-in-thai.png', {
      contains: ['เช็คอินแล้ว'],
    });
  } else {
    await shot(page, 'OBRS-1969-AFTER-2-english-badge-after-language-switch.png', {
      contains: ['Checked in', 'Confirmed'],
      absent: ['เช็คอินแล้ว', 'ยืนยันแล้ว'],
    });
    if (manifestRequests !== requestsBeforeSwitch) {
      throw new Error(
        `refusing to pass: the language switch refetched the manifest (${requestsBeforeSwitch} -> ${manifestRequests})`
      );
    }
    console.log(`language switch made no extra manifest request (still ${manifestRequests})`);
  }

  await browser.close();
  console.log(`DONE (${PHASE})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
