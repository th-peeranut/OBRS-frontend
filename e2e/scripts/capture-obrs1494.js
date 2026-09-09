// Standalone capture script for OBRS-1494 visual evidence (not a Playwright test, not part of
// the suite runner).
//
// WHAT THIS PROVES. The stop picker printed a wall-clock time next to every stop -- 05:00 at
// nong_chak and the whole line tallied off that base -- while `schedules/search` for the same
// route returns 07:00 09:00 11:00 13:00 15:00 17:30. The customer is reading a departure that
// no round can honour, at a step where no round has been chosen yet. AC-2 was decided by the
// owner as (a): take the clock off this step. `approxTime` STAYS in the API payload, so the
// fixture below still sends it -- what these images have to show is that the screen no longer
// prints it, not that the field is gone.
//
// NO BACKEND. The home route map is public; every /api call is stubbed with page.route(), the
// catch-all registered FIRST because Playwright resolves last-registered first (an unstubbed
// call paints a global swal over the evidence -- the OBRS-622 failure).
//
// BEFORE and AFTER come from ONE serve. `ng serve` watches, so the pair is shot as:
//   git checkout origin/dev -- <the 2 templates, the 2 stylesheets, the 3 i18n files>
//   node e2e/scripts/capture-obrs1494.js BEFORE
//   git checkout -- .            (back to this branch's work)
//   node e2e/scripts/capture-obrs1494.js AFTER
// Each phase ASSERTS the state it claims to be photographing and refuses to save otherwise, so
// a stale bundle cannot ship two images labelled BEFORE/AFTER that are the same picture.
//
// Run:  npm run start:local -- --port 4494        (in another terminal)
//       node e2e/scripts/capture-obrs1494.js BEFORE|AFTER
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const PHASE = (process.argv[2] || 'AFTER').toUpperCase();
if (PHASE !== 'BEFORE' && PHASE !== 'AFTER') throw new Error(`phase must be BEFORE or AFTER, got ${PHASE}`);
const PORT = process.env.CAPTURE_PORT || 4494;

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1494');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ status: 'success', message: 'OK', data });

// The four southbound pickup stops of `chonburi_bangkok` as prod serves them, base 05:00 --
// the exact numbers the reporter circled (measured 2026-08-21 against
// GET https://nj-phuyaipu.com/api/routes/chonburi_bangkok/pickup-dropoff).
const CB_PICKUP = [
  ['nong_chak', 'หนองชาก', 'ต.หนองชาก อ.บ้านบึง จ.ชลบุรี', '05:00', 0, 0],
  ['talat_nueang_chamnong', 'ตลาดเนื่องจำนงค์', 'ต.หนองชาก อ.บ้านบึง จ.ชลบุรี', '05:03', 0.15, 3],
  ['chonburi_technical_college', 'วิทยาลัยเทคนิคชลบุรี', 'ต.บ้านสวน อ.เมืองชลบุรี จ.ชลบุรี', '05:09', 4.25, 9],
  ['pt_station_ban_bueng', 'ปั๊ม PT บ้านบึง', 'ต.บ้านบึง อ.บ้านบึง จ.ชลบุรี', '05:14', 8.51, 14],
];
const CB_DROPOFF = [
  ['bts_mo_chit', 'BTS หมอชิต', 'แขวงจอมพล เขตจตุจักร กรุงเทพมหานคร', '06:35', 120.4, 95],
  ['mo_chit_2_bus_terminal', 'บขส. หมอชิต 2', 'แขวงจตุจักร เขตจตุจักร กรุงเทพมหานคร', '06:40', 123.6, 100],
];
// Northbound is the same defect mirrored: AC-4 asks for both directions because the list and
// the detail card read the same field on both.
const BC_PICKUP = [
  ['mo_chit_2_bus_terminal', 'บขส. หมอชิต 2', 'แขวงจตุจักร เขตจตุจักร กรุงเทพมหานคร', '05:00', 0, 0],
  ['airport_link_lat_krabang', 'แอร์พอร์ตลิงค์ลาดกระบัง', 'แขวงลาดกระบัง เขตลาดกระบัง กรุงเทพมหานคร', '05:26', 28.9, 26],
];
const BC_DROPOFF = [
  ['ban_bueng', 'บ้านบึง', 'ต.บ้านบึง อ.บ้านบึง จ.ชลบุรี', '06:31', 115.1, 91],
  ['nong_chak', 'หนองชาก', 'ต.หนองชาก อ.บ้านบึง จ.ชลบุรี', '06:35', 123.6, 95],
];

// `order` is the stop's position along the WHOLE route, not its index in its own half:
// refreshDropoffOptions() keeps only drop-offs with `order > pickup.order`, so numbering each
// half from 1 hides every drop-off but the last (measured - the first run of this script asserted
// 2 rows and got 1).
const toStops = (rows, startOrder) =>
  rows.map(([slug, name, address, approxTime, km, offset], i) => ({
    order: startOrder + i,
    slug,
    name,
    address,
    approxTime,
    distanceKmFromOrigin: km,
    offsetMinutesFromOrigin: offset,
    latitude: 13.2878,
    longitude: 101.1728,
    primaryPhotoUrl: null,
    googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=13.2878,101.1728',
  }));

const DIRECTIONS = {
  chonburi_bangkok: {
    file: 'chonburi-bangkok',
    meta: {
      slug: 'chonburi_bangkok',
      titleLocalized: { th: 'ชลบุรี - กรุงเทพฯ', en: 'Chonburi - Bangkok', zh: '春武里 - 曼谷' },
      totalDistanceKm: 123.6,
      durationMinMinutes: 120,
      durationMaxMinutes: 150,
      originProvinceLabel: 'ชลบุรี',
      destinationProvinceLabel: 'กรุงเทพมหานคร',
    },
    pickup: toStops(CB_PICKUP, 1),
    dropoff: toStops(CB_DROPOFF, CB_PICKUP.length + 1),
  },
  bangkok_chonburi: {
    file: 'bangkok-chonburi',
    meta: {
      slug: 'bangkok_chonburi',
      titleLocalized: { th: 'กรุงเทพฯ - ชลบุรี', en: 'Bangkok - Chonburi', zh: '曼谷 - 春武里' },
      totalDistanceKm: 123.6,
      durationMinMinutes: 120,
      durationMaxMinutes: 150,
      originProvinceLabel: 'กรุงเทพมหานคร',
      destinationProvinceLabel: 'ชลบุรี',
    },
    pickup: toStops(BC_PICKUP, 1),
    dropoff: toStops(BC_DROPOFF, BC_PICKUP.length + 1),
  },
};

const ROUTES_LIST = [
  {
    id: 1,
    slug: 'chonburi_bangkok',
    status: 'active',
    translations: { th: { label: 'ชลบุรี - กรุงเทพฯ' }, en: { label: 'Chonburi - Bangkok' } },
  },
  {
    id: 2,
    slug: 'bangkok_chonburi',
    status: 'active',
    translations: { th: { label: 'กรุงเทพฯ - ชลบุรี' }, en: { label: 'Bangkok - Chonburi' } },
  },
];

const CLOCK = /\b\d{1,2}:\d{2}\b/;

async function shoot(directionIndex) {
  const key = Object.keys(DIRECTIONS)[directionIndex];
  const dir = DIRECTIONS[key];

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    locale: 'th-TH',
  });
  // The PDPA analytics banner is position:fixed at the bottom of the viewport and lands inside
  // an element screenshot. Answer it before load - 'denied', so nothing is sent either.
  await context.addInitScript(() => {
    localStorage.setItem('obrs_analytics_consent_v1', 'denied');
  });
  const page = await context.newPage();

  // Catch-all FIRST, specifics after - Playwright resolves last-registered first.
  await page.route('**/api/**', (r) => r.fulfill({ json: ok([]) }));
  await page.route('**/api/routes', (r) => r.fulfill({ json: ok(ROUTES_LIST) }));
  await page.route('**/api/routes/*/pickup-dropoff', (r) => {
    const slug = new URL(r.request().url()).pathname.split('/').slice(-2)[0];
    const d = DIRECTIONS[slug] || dir;
    return r.fulfill({ json: ok({ route: d.meta, pickup: d.pickup, dropoff: d.dropoff }) });
  });

  // `ng serve` binds [::1] here, so 127.0.0.1 is refused - go through the name.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.stop-row--pickup', { timeout: 60000 });

  if (directionIndex > 0) {
    await page.locator('.p-selectbutton .p-togglebutton').nth(directionIndex).click();
    await page.waitForTimeout(700);
    await page.waitForSelector('.stop-row--pickup', { timeout: 30000 });
  }

  const die = (m) => {
    throw new Error(`${PHASE}/${key}: ${m}`);
  };
  const save = async (locator, name) => {
    const out = path.join(ASSETS_DIR, `OBRS-1494-${PHASE}-${dir.file}-${name}.png`);
    await locator.screenshot({ path: out });
    return path.basename(out);
  };
  // Both tabs render an <app-route-stop-list>, so a bare selector matches two lists and every
  // count is the sum. Scope each measurement to the list that holds the rows it is about.
  // The layout ships a desktop copy and a mobile copy of both the list and the detail card, so
  // every selector matches twice and `.first()` can land on the hidden one (measured - the
  // screenshot timed out on "element is not visible"). Take the painted one on both sides.
  const seen = (sel) => page.locator(sel).locator('visible=true').first();
  const readList = (sel) =>
    page.evaluate((s) => {
      const list =
        Array.from(document.querySelectorAll(s)).find((el) => el.offsetParent !== null) ??
        document.querySelector(s);
      return {
        swal: document.querySelectorAll('.swal2-popup').length,
        banner: document.querySelectorAll('app-analytics-consent-banner *').length,
        rows: list ? list.querySelectorAll('.stop-row').length : 0,
        stopTimes: list ? list.querySelectorAll('.stop-time').length : -1,
        text: list ? (list.textContent || '').replace(/\s+/g, ' ').trim() : '',
      };
    }, sel);

  // --- the pickup list: the panel the reporter circled ---------------------
  // Shot BEFORE any row is clicked. Picking a pickup advances the wizard to the drop-off tab,
  // which hides this panel - measured: the first version clicked first and the screenshot then
  // waited out 30 s on a selector with zero visible matches.
  await page
    .waitForFunction(() => document.querySelectorAll('.swal2-popup').length === 0, { timeout: 10000 })
    .catch(() => {});
  const pick = await readList('.route-stop-list:has(.stop-row--pickup)');
  if (pick.swal !== 0) die(`${pick.swal} swal popup(s) over the shot`);
  if (pick.banner !== 0) die('PDPA consent banner still painted over the shot');
  if (pick.rows !== dir.pickup.length) die(`${pick.rows} pickup rows, expected ${dir.pickup.length}`);
  const files = [await save(seen('.route-stop-list:has(.stop-row--pickup)'), 'stop-list')];

  // --- the drop-off detail card: the second place that printed the same clock ---
  await page.locator('.stop-row--pickup').first().click();
  await seen('.stop-row--dropoff').waitFor({ state: 'visible', timeout: 20000 });
  await seen('.stop-row--dropoff').click();
  await page.waitForTimeout(400);
  const drop = await readList('.route-stop-list:has(.stop-row--dropoff)');
  if (drop.rows !== dir.dropoff.length) die(`${drop.rows} drop-off rows, expected ${dir.dropoff.length}`);
  const cardText = await page.evaluate(() =>
    Array.from(document.querySelectorAll('app-route-stop-detail-card'))
      .filter((el) => el.offsetParent !== null)
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()),
  );
  if (cardText.length < 1) die('no detail card painted - the row click did not select');
  files.push(await save(seen('app-route-stop-detail-card'), 'detail-card'));

  const listClock = CLOCK.test(pick.text) || CLOCK.test(drop.text);
  const cardClock = cardText.some((t) => CLOCK.test(t));
  const stopTimes = pick.stopTimes + drop.stopTimes;
  const rows = pick.rows + drop.rows;
  // Refuse to leave behind a file whose caption would be a guess: assert the state each phase
  // claims to be photographing. The files are already written, so a failure removes them.
  try {
    if (PHASE === 'BEFORE') {
      if (stopTimes !== rows) die(`${stopTimes} .stop-time for ${rows} rows`);
      if (!listClock) die('no clock in the stop list - this is not the pre-fix bundle');
      if (!cardClock) die('no clock in the detail card - this is not the pre-fix bundle');
    } else {
      if (stopTimes !== 0) die(`${stopTimes} .stop-time still rendered`);
      if (listClock) die(`a clock survives in a stop list: "${CLOCK.test(pick.text) ? pick.text : drop.text}"`);
      if (cardClock) die(`a clock survives in a detail card: "${cardText.find((t) => CLOCK.test(t))}"`);
    }
  } catch (e) {
    for (const f of files) fs.rmSync(path.join(ASSETS_DIR, f), { force: true });
    throw e;
  }

  console.log(
    `${PHASE} ${key}: rows=${rows} .stop-time=${stopTimes} ` +
      `listClock=${listClock} cardClock=${cardClock} -> ${files.join(', ')}`,
  );

  await context.close();
  await browser.close();
}

(async () => {
  await shoot(0);
  await shoot(1);
})();
