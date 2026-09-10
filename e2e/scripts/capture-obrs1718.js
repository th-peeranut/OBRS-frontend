// Standalone visual-evidence capture for OBRS-1718 (not part of the Playwright
// suite).
//
// WHAT IT PROVES. The "สรุปการเดินทาง" card printed the WHOLE-ROUTE distance and
// duration (133 กม. / 139 - 220 นาที) before any stop pair was chosen, and kept
// printing them after only one side was chosen — while the two rows above had
// already switched to the chosen stop's name. The owner's call (2026-09-02) is to
// hide both rows until the selected segment resolves.
//
// So it shoots the three states the change is about, in both labels:
//   1  nothing selected      - BEFORE: 133 กม. / 139 - 220 นาที   AFTER: no such rows
//   2  pickup only           - BEFORE: same whole-route figures    AFTER: still no rows
//   3  pickup + drop-off     - identical in both labels (90 กม. / 95 นาที here)
//
// Fixtures, stubbing and the aborted Google Maps key are lifted from
// capture-obrs1496.js — same screen, same seeded shape.
//
// Usage (one server alive at a time):
//   npx ng serve --port 4718                  (this branch)  -> node e2e/scripts/capture-obrs1718.js AFTER
//   ... with a worktree detached at origin/dev (before)      -> node e2e/scripts/capture-obrs1718.js BEFORE
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const LABEL = (process.argv[2] || 'AFTER').toUpperCase();
const BASE = process.env.CAPTURE_BASE || 'http://localhost:4718';
const OUT_DIR =
  process.env.CAPTURE_OUT ||
  path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1718');
fs.mkdirSync(OUT_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const stop = (order, slug, name, km, min) => ({
  order,
  slug,
  name,
  address: 'ต.หนองชาก อ.บ้านบึง จ.ชลบุรี',
  approxTime: `${String(6 + order).padStart(2, '0')}:00`,
  distanceKmFromOrigin: km,
  offsetMinutesFromOrigin: min,
  latitude: null,
  longitude: null,
  primaryPhotoUrl: null,
  googleMapsUrl: null,
});

const PICKUP_STOPS = [
  stop(1, 'nong_chak', 'หนองชาก', 0, 0),
  stop(2, 'ban_bueng', 'บ้านบึง', 12.4, 20),
];
const DROPOFF_STOPS = [
  stop(3, 'arl_lat_krabang', 'แอร์พอร์ทลิงค์ลาดกระบัง', 90, 95),
  stop(4, 'bkr_mochit2', 'บขส. หมอชิต (หมอชิต 2)', 133.13, 139),
];

const ROUTE_META = {
  slug: 'chonburi_bangkok',
  titleLocalized: { en: 'Chonburi - Bangkok', th: 'ชลบุรี - กรุงเทพฯ', zh: '春武里 - 曼谷' },
  totalDistanceKm: 133.13,
  durationMinMinutes: 139,
  durationMaxMinutes: 220,
  originProvinceLabel: 'ชลบุรี',
  destinationProvinceLabel: 'กรุงเทพมหานคร',
};

const FIXTURES = [
  [/\/routes\/[^/]+\/pickup-dropoff$/, () => ok({ route: ROUTE_META, pickup: PICKUP_STOPS, dropoff: DROPOFF_STOPS })],
  [/\/stops$/, () => ok([...PICKUP_STOPS, ...DROPOFF_STOPS])],
  [
    /\/routes$/,
    () =>
      ok([
        {
          id: 1,
          slug: 'chonburi_bangkok',
          status: 'active',
          translations: { th: { label: 'ชลบุรี - กรุงเทพฯ' }, en: { label: 'Chonburi - Bangkok' } },
        },
      ]),
  ],
];

const summaryOf = (page) => page.locator('app-route-travel-summary').first();

async function shoot(page, name, note) {
  const summary = summaryOf(page);
  await summary.waitFor({ state: 'visible', timeout: 15_000 });
  const text = (await summary.innerText()).replace(/\s+/g, ' ').trim();
  const file = path.join(OUT_DIR, `${LABEL}-${name}.png`);
  await summary.screenshot({ path: file });
  console.log(`[${LABEL}] ${name.padEnd(22)} ${note}`);
  console.log(`         text: ${text}`);
  console.log(`         file: ${file}`);
  return text;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    const hit = FIXTURES.find(([re]) => re.test(url));
    return hit ? json(route, hit[1]()) : json(route, ok(null));
  });

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.locator('.stop-row--pickup').first().waitFor({ state: 'visible', timeout: 30_000 });

  const results = {};
  results.unselected = await shoot(page, '1-nothing-selected', 'AC-1: no distance/duration row');

  await page.locator('.stop-row--pickup').first().click();
  await page.waitForTimeout(300);
  results.pickupOnly = await shoot(page, '2-pickup-only', 'AC-1: still no rows, one side is not a segment');

  await page.locator('.p-tablist-tab-list .p-tab').nth(1).click();
  await page.locator('.stop-row--dropoff').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('.stop-row--dropoff').first().click();
  await page.waitForTimeout(300);
  results.bothSelected = await shoot(page, '3-both-selected', 'AC-3: segment figures, unchanged from before');

  fs.writeFileSync(
    path.join(OUT_DIR, `${LABEL}-summary-text.json`),
    JSON.stringify(results, null, 2) + '\n'
  );

  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
