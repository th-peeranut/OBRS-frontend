// Standalone before/after capture for OBRS-70 (not part of the Playwright suite).
//
// WHAT IS BEING SHOWN, AND WHY IT IS STUBBED.
//
// OBRS-70's change is a DB seed value: stops.primary_photo_url for the
// `talat_nueang_chamnong` pickup stop. Its user-facing output is the photo on
// the /home route-map stop detail card, which the FE renders straight from the
// API's `primaryPhotoUrl` (route-stop-detail-card.component.html:34-35, an
// *ngIf + [src] with no transformation in between).
//
// So the honest way to photograph this change WITHOUT a deploy is to hold the
// frontend fixed and vary exactly the one field the change moves:
//
//   BEFORE = the value live SIT actually served on 2026-07-28, re-measured from
//            GET /api/routes/chonburi_bangkok/pickup-dropoff:
//            "https://placehold.co/640x360?text=talat_nueang_chamnong"
//   AFTER  = the value data.sql + V56 now seed, copied verbatim from
//            src/main/resources/db/migration/V56__seed_talat_nueang_chamnong_stop_photo.sql
//
// The AFTER image is fetched over the real network from lh3.googleusercontent.com
// (only `**/api/**` is intercepted), so it is the actual photo the seed points
// at, not a local copy — if that URL had rotted, this shot would be broken and
// would say so.
//
// This proves what the customer will see. It does NOT prove the seed executes —
// that is DevSeedBootstrapIT#freshDb_dataSql_realStopPhotoOutlivesThePlaceholderBlock,
// which runs schema.sql + lookups.sql + data.sql against a real Postgres.
// Live-SIT confirmation is deferred: promoting dev->sit is user-gated and the
// Actions allowance is exhausted until ~2026-08-01, so a push to `sit` today
// deploys nothing.
//
// NO BACKEND: /home is public (no auth) and ONE page.route('**/api/**') stubs
// every call, so no swal/error-toast can contaminate the shot (the OBRS-622
// trap). The script asserts that itself before saving.
//
// Usage:
//   npx ng serve --configuration development --port 4470
//   node e2e/scripts/capture-obrs70.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.CAPTURE_BASE || 'http://localhost:4470';
const OUT_DIR =
  process.env.CAPTURE_OUT ||
  path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-70');
fs.mkdirSync(OUT_DIR, { recursive: true });

const TARGET_SLUG = 'talat_nueang_chamnong';
const TARGET_NAME = 'ตลาดเนื่องจำนงค์';

const PHOTO_BEFORE = 'https://placehold.co/640x360?text=talat_nueang_chamnong';
const PHOTO_AFTER =
  'https://lh3.googleusercontent.com/place-photos/AJRVUZOoPkfPPAsEHeEwPCl1V3PYUsMOlCIDLpgXhmSGGJCvTYVS3eDDhQrNEi305DQE6kRSc8teAppGUK1Q3BVeQw6LDV68JVY9JQtnmeQeRtF3WDfQFKamTbdWF6WfUQd40N2zEM1ZlaMtbi5-6FM=s4800-w640';

const ok = (data) => ({ code: 200, message: 'OK', data });

// Stop shape mirrors capture-obrs746/763's fixture — the contract the detail
// card reads. Only the target stop's primaryPhotoUrl varies between runs.
const stop = (order, slug, name, address, lat, lng, photo) => ({
  order,
  slug,
  name,
  address,
  approxTime: `${String(6 + order).padStart(2, '0')}:30`,
  distanceKmFromOrigin: order * 12,
  offsetMinutesFromOrigin: order * 20,
  latitude: lat,
  longitude: lng,
  primaryPhotoUrl: photo,
  googleMapsUrl: `https://maps.google.com/?q=${lat},${lng}`,
});

const pickupStops = (targetPhoto) => [
  stop(1, 'nong_chak', 'หนองชาก', 'ต.หนองชาก อ.บ้านบึง จ.ชลบุรี', 13.2836, 101.0654, `https://placehold.co/640x360?text=nong_chak`),
  stop(2, TARGET_SLUG, TARGET_NAME, 'ต.บ้านบึง อ.บ้านบึง จ.ชลบุรี', 13.288465, 101.173981, targetPhoto),
  stop(3, 'lotus_ban_bueng', 'โลตัส บ้านบึง', 'ต.บ้านบึง อ.บ้านบึง จ.ชลบุรี', 13.3121, 101.1149, `https://placehold.co/640x360?text=lotus_ban_bueng`),
];

const DROPOFF_STOPS = [
  stop(4, 'bts_mo_chit', 'BTS หมอชิต', 'เขตจตุจักร กรุงเทพมหานคร', 13.8025, 100.5537, 'https://placehold.co/640x360?text=bts_mo_chit'),
];

const ROUTE_META = {
  slug: 'chonburi_bangkok',
  titleLocalized: { en: 'Chonburi - Bangkok', th: 'ชลบุรี - กรุงเทพฯ', zh: '春武里 - 曼谷' },
  totalDistanceKm: 120,
  durationMinMinutes: 120,
  durationMaxMinutes: 150,
  originProvinceLabel: 'ชลบุรี',
  destinationProvinceLabel: 'กรุงเทพมหานคร',
};

async function installFixtures(page, targetPhoto) {
  const PICKUP = pickupStops(targetPhoto);
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    const body = /\/routes\/[^/]+\/pickup-dropoff/.test(url)
      ? ok({ route: ROUTE_META, pickup: PICKUP, dropoff: DROPOFF_STOPS })
      : /\/stops(\?|$)/.test(url)
        ? ok([...PICKUP, ...DROPOFF_STOPS])
        : /\/routes(\?|$)/.test(url)
          ? ok([
              {
                id: 1,
                slug: 'chonburi_bangkok',
                status: 'active',
                translations: { th: { label: 'ชลบุรี - กรุงเทพฯ' }, en: { label: 'Chonburi - Bangkok' } },
              },
            ])
          : ok([]);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function shoot(page, label, targetPhoto, fileName) {
  await installFixtures(page, targetPhoto);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });

  // The stop list only exists once the route fixture answers.
  await page.waitForSelector('.stop-row', { timeout: 30000 });

  const row = page.locator('.stop-row', { hasText: TARGET_NAME }).first();
  await row.waitFor({ timeout: 15000 });
  await row.click();

  const card = page.locator('.route-stop-detail-card').first();
  await card.waitFor({ timeout: 15000 });

  // Assert the EFFECT, not the click: the card must be showing OUR stop with
  // OUR photo, and the <img> must have actually decoded. A 0-width naturalWidth
  // is a dead URL, which is exactly the failure this card is trying to outlive.
  const img = card.locator('img.detail-photo');
  await img.waitFor({ timeout: 20000 });
  const state = await img.evaluate((el) => ({
    src: el.getAttribute('src'),
    naturalWidth: el.naturalWidth,
    complete: el.complete,
  }));
  if (state.src !== targetPhoto) {
    throw new Error(`[${label}] detail card shows the wrong stop photo: ${state.src}`);
  }
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return el && el.complete && el.naturalWidth > 0;
    },
    'img.detail-photo',
    { timeout: 25000 }
  );

  const name = await card.locator('.detail-name').innerText();
  if (!name.includes(TARGET_NAME)) {
    throw new Error(`[${label}] detail card is for the wrong stop: ${name}`);
  }

  // OBRS-622 trap: an error overlay makes a passing state photograph as broken.
  const dirty = await page.evaluate(() => ({
    swal: document.querySelectorAll('.swal2-popup').length,
    toast: document.querySelectorAll('.route-error, .p-toast-message').length,
  }));
  if (dirty.swal || dirty.toast) {
    throw new Error(`[${label}] refusing to save a contaminated shot: ${JSON.stringify(dirty)}`);
  }

  // Grow the viewport past the card's bottom edge so Playwright never returns a
  // partially-unpainted element box (OBRS-702).
  const bottom = await card.evaluate((el) => Math.ceil(el.getBoundingClientRect().bottom));
  const vp = page.viewportSize();
  if (bottom + 40 > vp.height) {
    await page.setViewportSize({ width: vp.width, height: bottom + 40 });
    await page.waitForTimeout(300);
  }
  const scrolled = await card.evaluate((node) => {
    const out = [];
    for (let el = node; el && el !== document.documentElement; el = el.parentElement) {
      if (el.scrollTop !== 0) out.push(`${el.tagName}.${el.className}=${el.scrollTop}`);
    }
    return { out, windowScrollY: window.scrollY };
  });
  if (scrolled.out.length || scrolled.windowScrollY !== 0) {
    throw new Error(`[${label}] scrolled ancestors would clip the shot: ${JSON.stringify(scrolled)}`);
  }

  const file = path.join(OUT_DIR, fileName);
  await card.screenshot({ path: file });
  const bytes = fs.statSync(file).size;
  console.log(`${label}: ${fileName}  img=${state.naturalWidth}px-wide  ${bytes} bytes`);
  await page.unroute('**/api/**');
  return { file, naturalWidth: state.naturalWidth, bytes };
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 520, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  const before = await shoot(page, 'BEFORE', PHOTO_BEFORE, 'OBRS-70-BEFORE-placeholder-box.png');
  const after = await shoot(page, 'AFTER', PHOTO_AFTER, 'OBRS-70-AFTER-real-photo.png');

  await browser.close();

  if (after.naturalWidth <= before.naturalWidth) {
    console.log(
      `NOTE: after image (${after.naturalWidth}px) is not wider than the placeholder (${before.naturalWidth}px) — check the shot by eye.`
    );
  }
  console.log(`\nSaved to ${OUT_DIR}`);
})().catch((err) => {
  console.error('CAPTURE FAILED:', err.message);
  process.exit(1);
});
