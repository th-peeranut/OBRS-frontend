// Standalone capture script for OBRS-636 visual evidence (not a Playwright test, not committed
// to the suite runner).
//
// Approach: NO backend. The home route map is public, so there is no auth to seed; every /api
// call is stubbed via page.route() so the picker renders against a deterministic fixture. The
// catch-all is registered FIRST (Playwright: last-registered wins) so nothing reaches the
// network - an unstubbed call on a customer page paints a global swal over the evidence
// (the OBRS-622 failure).
//
// The fixture is DERIVED FROM THE SEED, not invented:
//   'slug' mode = exactly what `data.sql` produced before this card -
//                 'ถนนตัวอย่าง ต.' || stops.slug || ' จ.ชลบุรี'
//   'real' mode = the 28x2 address rows this card seeded (tambon/amphoe/province)
//   'null' mode = what prod actually served - the old block sat inside a DEV-ONLY marker, so
//                 gen-prod-seed.ps1 stripped it and prod_seed.sql never set an address at all.
//
//   :4300 = AFTER  (ao/obrs-636-stop-address-guard, merged with origin/dev)
//   :4400 = BEFORE (origin/dev @ 905feb79, no @if guard)
//
// Run:  node e2e/scripts/capture-obrs636.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-636');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ status: 'success', message: 'OK', data });

// Seven consecutive pickup stops of route `chonburi_bangkok`, in stop_order, with the Thai
// labels and the addresses exactly as `data.sql` seeds them.
const SEED = [
  ['nong_chak', 'หนองชาก', 'ต.หนองชาก อ.บ้านบึง จ.ชลบุรี'],
  ['talat_nueang_chamnong', 'ตลาดเนื่องจำนงค์', 'ต.หนองชาก อ.บ้านบึง จ.ชลบุรี'],
  ['chonburi_technical_college', 'วิทยาลัยเทคนิคชลบุรี', 'ต.หนองชาก อ.บ้านบึง จ.ชลบุรี'],
  ['chulabhorn_science_school', 'โรงเรียนวิทยาศาสตร์จุฬาภรณราชวิทยาลัย', 'ต.หนองชาก อ.บ้านบึง จ.ชลบุรี'],
  ['qmb_company', 'บริษัท QMB', 'ต.หนองชาก อ.บ้านบึง จ.ชลบุรี'],
  ['pt_station_ban_bueng', 'ปั๊ม PT บ้านบึง', 'ต.หนองชาก อ.บ้านบึง จ.ชลบุรี'],
  ['thai_pp_dormitory', 'ตรงข้ามหอพักไทยพีพี', 'ต.หนองชาก อ.บ้านบึง จ.ชลบุรี'],
];

// The pre-fix string, reproduced from the statement this card deleted. Kept as a template so
// the image cannot drift from what the defect actually looked like.
const legacyAddress = (slug) => `ถนนตัวอย่าง ต.${slug} จ.ชลบุรี`;

function stops(mode) {
  return SEED.map(([slug, name, address], i) => ({
    order: i + 1,
    slug,
    name,
    address: mode === 'real' ? address : mode === 'slug' ? legacyAddress(slug) : null,
    approxTime: ['05:30', '05:32', '05:40', '05:40', '05:50', '05:50', '05:50'][i],
    distanceKmFromOrigin: [0, 0.15, 4.25, 4.25, 8.51, 8.51, 8.51][i],
    offsetMinutesFromOrigin: [0, 0, 5, 5, 10, 10, 10][i],
    latitude: 13.2878,
    longitude: 101.1728,
    primaryPhotoUrl: null,
    googleMapsUrl: null,
  }));
}

const DROPOFF = [
  { order: 1, slug: 'bts_mo_chit', name: 'BTS หมอชิต', address: 'แขวงจอมพล เขตจตุจักร กรุงเทพมหานคร' },
].map((s) => ({
  ...s,
  approxTime: '08:30',
  latitude: 13.8,
  longitude: 100.55,
  primaryPhotoUrl: null,
  googleMapsUrl: null,
}));

const ROUTE_META = {
  slug: 'chonburi_bangkok',
  titleLocalized: { th: 'ชลบุรี - กรุงเทพฯ', en: 'Chonburi - Bangkok', zh: '春武里 - 曼谷' },
  totalDistanceKm: 127.6,
  durationMinMinutes: 120,
  durationMaxMinutes: 150,
  originProvinceLabel: 'ชลบุรี',
  destinationProvinceLabel: 'กรุงเทพมหานคร',
};

async function shoot(port, mode, file, expectedAddressDivs, viewport = { width: 1600, height: 1000 }) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    locale: 'th-TH',
  });
  // The PDPA analytics banner is `position: fixed` at the bottom of the viewport, so at the
  // narrow width it paints OVER the last rows of the list and lands inside the element
  // screenshot. Answer it before the page loads - 'denied', so nothing is sent either.
  await context.addInitScript(() => {
    localStorage.setItem('obrs_analytics_consent_v1', 'denied');
  });

  const page = await context.newPage();

  // Catch-all FIRST, specifics after - Playwright resolves last-registered first.
  await page.route('**/api/**', (r) => r.fulfill({ json: ok([]) }));
  await page.route('**/api/routes', (r) =>
    r.fulfill({
      json: ok([
        {
          id: 1,
          slug: 'chonburi_bangkok',
          status: 'active',
          translations: { th: { label: 'ชลบุรี - กรุงเทพฯ' }, en: { label: 'Chonburi - Bangkok' } },
        },
      ]),
    }),
  );
  await page.route('**/api/routes/*/pickup-dropoff', (r) =>
    r.fulfill({ json: ok({ route: ROUTE_META, pickup: stops(mode), dropoff: DROPOFF }) }),
  );

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.route-stop-list .stop-row--pickup', { timeout: 30000 });

  // Both the pickup and the dropoff tab render an <app-route-stop-list>, so a bare
  // `.route-stop-list` matches two lists and every count is the sum of the two. Scope to the
  // one that holds pickup rows - the list the card is about.
  const PICKUP = '.route-stop-list:has(.stop-row--pickup)';

  // The global HTTP-error swal is a real transient on the way in - wait it out, then require
  // its absence, rather than photographing a spinner or an error dialog.
  await page
    .waitForFunction(() => document.querySelectorAll('.swal2-popup').length === 0, { timeout: 10000 })
    .catch(() => {});

  const measured = await page.evaluate((sel) => {
    const list = document.querySelector(sel);
    return {
      swal: document.querySelectorAll('.swal2-popup').length,
      banner: document.querySelectorAll('app-analytics-consent-banner *').length,
      rows: list.querySelectorAll('.stop-row').length,
      addressDivs: list.querySelectorAll('.stop-address').length,
      addressText: Array.from(list.querySelectorAll('.stop-address')).map((e) => e.textContent.trim()),
    };
  }, PICKUP);

  // Refuse to save rather than produce a file whose caption would be a guess.
  if (measured.swal !== 0) throw new Error(`${file}: ${measured.swal} swal popup(s) over the shot`);
  if (measured.banner !== 0) throw new Error(`${file}: PDPA consent banner still painted over the shot`);
  if (measured.rows !== SEED.length) throw new Error(`${file}: ${measured.rows} rows, expected ${SEED.length}`);
  if (measured.addressDivs !== expectedAddressDivs) {
    throw new Error(`${file}: ${measured.addressDivs} .stop-address, expected ${expectedAddressDivs}`);
  }

  const out = path.join(ASSETS_DIR, file);
  await page.locator(PICKUP).first().screenshot({ path: out });
  console.log(`${file}  rows=${measured.rows}  .stop-address=${measured.addressDivs}`);
  if (measured.addressText.length) console.log(`   first address: "${measured.addressText[0]}"`);

  await context.close();
  await browser.close();
}

(async () => {
  // Pair 1 - the reported defect. Same FE on both sides: the difference is DATA, so this pair
  // is shot from one serve and proves the seed fix, not a template change.
  await shoot(4300, 'slug', 'OBRS-636-BEFORE-slug-as-subdistrict.png', SEED.length);
  await shoot(4300, 'real', 'OBRS-636-AFTER-real-subdistrict.png', SEED.length);

  // Pair 2 - the same data change at the width where the line is NOT truncated. The desktop
  // panel is col-xl-3 (~380px), so `text-truncate` clips the province on both sides of pair 1
  // and the shot cannot show that the province is now right. Below 1200px the picker becomes
  // the full-width mobile strip and the whole address fits.
  const NARROW = { width: 900, height: 1100 };
  await shoot(4300, 'slug', 'OBRS-636-BEFORE-slug-full-width.png', SEED.length, NARROW);
  await shoot(4300, 'real', 'OBRS-636-AFTER-real-full-width.png', SEED.length, NARROW);

  // The NULL-address case (what prod_seed.sql actually shipped) gets NO screenshot pair, and
  // that is the finding, not an omission. MEASURED on both builds with three null-address
  // stops: the unguarded `.stop-address` renders at height 0 and the rows (46px) and the list
  // (232px) are identical on :4400 and :4300 -- the two PNGs came out byte-identical
  // (492x834, 68.4 KB). So the missing guard is a DOM defect, not a visible blank line; an
  // earlier write-up of this card claimed prod showed an empty row under every stop and that
  // claim is wrong. Labelling two identical images BEFORE/AFTER would smuggle it back in.
  // The user-visible half of this card is pair 1/2 above: the address text itself.
  fs.rmSync(path.join(ASSETS_DIR, 'OBRS-636-BEFORE-empty-address-line.png'), { force: true });
  fs.rmSync(path.join(ASSETS_DIR, 'OBRS-636-AFTER-row-closes-up.png'), { force: true });
})();
