// Standalone capture script for OBRS-1967 visual evidence (not a Playwright test, not part of the suite).
//
// Approach: NO backend — the same stubbed lane as capture-obrs1659.js, which photographs this
// exact page. The manifest reads two endpoints and both are fulfilled here.
//
// The stub sends the SAME payload to both builds: `fromStop`/`toStop` (the slug, unchanged) plus
// the new `fromStopLabels`/`toStopLabels` bags. origin/dev ignores the extra keys and prints the
// slug — which is the defect — so one fixture produces both halves of the evidence:
//   node e2e/scripts/capture-obrs1967.js after  http://localhost:4200   (this branch)
//   node e2e/scripts/capture-obrs1967.js before http://localhost:4200   (origin/dev served instead)
//
// Frame 3 is the one that cannot be faked: it clicks the navbar language switcher and shoots the
// table again, while this script counts the boarding-list requests. The count must not move.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1967');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const PHASE = process.argv[2] === 'before' ? 'BEFORE' : 'AFTER';
const BASE_URL = process.argv[3] || 'http://localhost:4200';
const SCHEDULE_ID = 42;

const ok = (data) => ({ code: 200, message: 'OK', data });
const status = (code, label) => ({ code, label });

// The two named stops, exactly as the backend now resolves them: one entry per locale that has a
// sign, absent where it has none. `khlong_luang` deliberately has NO bag at all — a stop nobody
// has translated yet still has to be readable, and the slug is what it falls back to (AC-5).
const NONG_CHAK = { th: 'หนองชาก', en: 'Nong Chak' };
const BAN_BUENG = { th: 'บ้านบึง', en: 'Ban Bueng' };
const SRINAKARIN = { th: 'ศรีนครินทร์', en: 'Srinakarin' };
const PATTAYA_TAI = { th: 'พัทยาใต้', en: 'Pattaya Tai' };

const row = (ticketId, seatNumber, passengerName, from, fromLabels, to, toLabels, extra = {}) => ({
  ticketId,
  ticketNumber: `TCK-1002${40 + ticketId}`,
  bookingNumber: `BK-ABC${100 + ticketId}`,
  seatNumber,
  passengerTitle: extra.title ?? 'MR',
  passengerName,
  fromStop: from,
  toStop: to,
  ...(fromLabels ? { fromStopLabels: fromLabels } : {}),
  ...(toLabels ? { toStopLabels: toLabels } : {}),
  status: extra.boardedAt ? status('checked_in', 'เช็คอินแล้ว') : status('confirmed', 'ยืนยันแล้ว'),
  boardedAt: extra.boardedAt ?? null,
  boardedBy: extra.boardedAt ? 9 : null,
  boardedByName: extra.boardedAt ? 'มาลี พนักงาน' : null,
  fareCategory: 'adult',
});

// Ordered by stop then seat, the way the backend's ORDER BY hands it over — the grouping still
// keys on the SLUG, so these three groups must stay three groups after the names appear.
const MANIFEST = ok([
  row(1, '1', 'สมชาย ใจดี', 'nong_chak', NONG_CHAK, 'srinakarin', SRINAKARIN, { boardedAt: '2026-09-18T01:12:00Z' }),
  row(2, '2', 'มาลี ทองดี', 'nong_chak', NONG_CHAK, 'srinakarin', SRINAKARIN, { title: 'MISS', boardedAt: '2026-09-18T01:12:00Z' }),
  row(3, '3', 'ก้อง ใจดี', 'nong_chak', NONG_CHAK, 'pattaya_tai', PATTAYA_TAI, {}),
  row(4, '5', 'ปราณี มั่นคง', 'ban_bueng', BAN_BUENG, 'srinakarin', SRINAKARIN, { title: 'MRS' }),
  row(5, '6', 'ธนากร พูนผล', 'ban_bueng', BAN_BUENG, 'srinakarin', SRINAKARIN, {}),
  row(6, '9', 'วิชัย สุขใจ', 'khlong_luang', null, 'srinakarin', SRINAKARIN, {}),
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
  const page = await browser.newPage({ viewport: { width: 1700, height: 1400 }, deviceScaleFactor: 2 });
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

async function openManifest(page) {
  await page.goto(`${BASE_URL}/staff/boarding/${SCHEDULE_ID}`, { waitUntil: 'networkidle' });
  await page.locator('table.table tbody tr').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(400);
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
  await openManifest(page);

  if (PHASE === 'BEFORE') {
    // origin/dev renders the snapshot column raw, so the Thai page hands the driver the slug.
    await shot(page, 'OBRS-1967-BEFORE-manifest-prints-the-slug.png', {
      contains: ['nong_chak', 'srinakarin'],
    });
    await browser.close();
    console.log('DONE (BEFORE)');
    return;
  }

  // 1 — the whole manifest in Thai: both columns and every stop-group header read as a NAME.
  //     `khlong_luang` is still there, untranslated, and still legible.
  await shot(page, 'OBRS-1967-AFTER-1-manifest-thai-stop-names.png', {
    contains: ['หนองชาก', 'บ้านบึง', 'ศรีนครินทร์', 'พัทยาใต้', 'khlong_luang'],
    absent: ['nong_chak', 'ban_bueng', 'srinakarin'],
  });

  // 2 — the pickup filter: the driver picks a NAME, the component still filters on the slug,
  //     so the table narrows to that group exactly as before.
  await page.locator('[data-testid="boarding-stop-filter"] button').first().click();
  await page.waitForTimeout(200);
  await card(page).screenshot({ path: path.join(ASSETS_DIR, 'OBRS-1967-AFTER-2-stop-filter-reads-names.png') });
  console.log('captured OBRS-1967-AFTER-2-stop-filter-reads-names.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 3 — the same rows, in English, after clicking the navbar switcher. The request counter is
  //     the assertion: the names changed without going back to the server.
  const requestsBeforeSwitch = manifestRequests;
  await switchLanguageTo(page, 'English');
  await shot(page, 'OBRS-1967-AFTER-3-english-after-language-switch.png', {
    contains: ['Nong Chak', 'Ban Bueng', 'Srinakarin'],
    absent: ['หนองชาก'],
  });
  if (manifestRequests !== requestsBeforeSwitch) {
    throw new Error(
      `refusing to pass: the language switch refetched the manifest (${requestsBeforeSwitch} -> ${manifestRequests})`
    );
  }
  console.log(`language switch made no extra manifest request (still ${manifestRequests})`);

  await browser.close();
  console.log('DONE (AFTER)');
}

main().catch((e) => { console.error(e); process.exit(1); });
