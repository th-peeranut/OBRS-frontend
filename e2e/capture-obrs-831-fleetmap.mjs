// OBRS-831 evidence: the staff fleet live map, with `features.fleetMap` on.
//
// The card's ACs are deliberately not "look at it" -- OBRS-532 could not close
// them because no map surface in any build could instantiate Leaflet at all,
// and the reason was the feature flag, not the MapTiler key. So this script
// measures the three things a screenshot cannot distinguish:
//
//   1. THE GATE ACTUALLY OPENED. `/staff/fleet-map` is behind
//      featureEnabledGuard('fleetMap'), which redirects to '/' when the flag is
//      off. A screenshot of the home page is indistinguishable from a screenshot
//      of a broken map page unless you read the landed URL, so the run fails if
//      window.location.pathname is not the fleet-map route -- never `expect` on
//      content alone (see the OBRS-887 redirect lesson).
//   2. TILES PAINTED, not merely "a map element exists". Leaflet raster tiles
//      are <img>, and an img whose request 403'd still exists in the DOM with
//      its class intact. The assertion is therefore naturalWidth > 0 on at least
//      one `img.leaflet-tile`, plus zero `.fleet-map-unavailable` placeholders
//      (FleetMapPanelComponent renders that instead of the map whenever
//      maptilerKey is blank -- the empty-key path every fresh clone takes).
//   3. THE MAPTILER RESPONSES THEMSELVES. AC4 exists because OBRS-532's tile
//      probe forged the Origin header server-side; a real browser cannot. Every
//      response from api.maptiler.com is recorded with its status, so a 403
//      (origin restriction rejecting this origin) can never be read as a pass.
//
// AC7 (inherited from OBRS-540) is the marker count: real vehicles at real
// coordinates from GET /api/private/vehicles/positions, no mocks anywhere in
// this script -- it talks to whatever apiUrl the served build was built with.
//
// Usage:
//   $env:SIT_PASSWORD='...'
//   node e2e/capture-obrs-831-fleetmap.mjs http://localhost:4231 e2e-evidence/obrs-831 salesperson@system.local

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:4231';
const OUT = process.argv[3] || 'e2e-evidence/obrs-831';
const EMAIL = process.argv[4] || 'salesperson@system.local';
const PASSWORD = process.env['SIT_PASSWORD'];

if (!PASSWORD) {
  console.error('SIT_PASSWORD is not set. Refusing to run: a blank password would fail login and the');
  console.error('run would report "map not reachable", which is a false negative about the feature flag.');
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.log(`  FAIL  ${msg}`);
};
const pass = (msg) => console.log(`  pass  ${msg}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await ctx.newPage();

// Record every MapTiler response before the first navigation, so nothing that
// fires during the map's first paint can be missed.
const tileResponses = [];
page.on('response', (res) => {
  const url = res.url();
  if (url.includes('api.maptiler.com')) {
    tileResponses.push({ status: res.status(), url: url.replace(/key=[^&]+/, 'key=<redacted>') });
  }
});
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
});

console.log(`\nOBRS-831 fleet-map measurement -- ${BASE} as ${EMAIL}`);

// --- 1. log in through the real form -------------------------------------
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('input[formControlName="email"]').fill(EMAIL);
await page.locator('input[formControlName="password"]').fill(PASSWORD);
await page.locator('button.login-btn[type="submit"]').click();
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 });
const afterLogin = await page.evaluate(() => window.location.pathname);
console.log(`  landedOn after login: ${afterLogin}`);
if (afterLogin.includes('/login')) fail('login did not leave /login -- everything below would be measured logged out');

// --- 2. AC2: the nav link is back ----------------------------------------
const navHrefs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a[href]'))
    .map((a) => a.getAttribute('href'))
    .filter((h) => h && h.startsWith('/staff'))
);
const navHasFleetMap = navHrefs.some((h) => h.includes('fleet-map'));
console.log(`  staff nav links (${navHrefs.length}): ${navHrefs.join(' ')}`);
navHasFleetMap
  ? pass('AC2 nav: a /staff/fleet-map link is rendered in the staff nav')
  : fail('AC2 nav: no /staff/fleet-map link in the staff nav');
await page.screenshot({ path: join(OUT, 'OBRS-831-01-staff-nav.png'), fullPage: false });

// --- 3. AC2: the route is reachable, read from the URL that landed --------
await page.goto(`${BASE}/staff/fleet-map`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000); // first positions fetch + Leaflet tile load
const landed = await page.evaluate(() => window.location.pathname);
console.log(`  landedOn /staff/fleet-map: ${landed}`);
landed === '/staff/fleet-map'
  ? pass('AC2 route: the feature gate allowed /staff/fleet-map (no redirect)')
  : fail(`AC2 route: redirected to ${landed} -- the gate is still closed, so no measurement below means anything`);

// --- 4. AC3 + AC7: what actually painted ---------------------------------
const dom = await page.evaluate(() => {
  const tiles = Array.from(document.querySelectorAll('img.leaflet-tile'));
  return {
    leafletContainers: document.querySelectorAll('.leaflet-container').length,
    fleetMapCanvas: document.querySelectorAll('.fleet-map-canvas').length,
    fleetMapUnavailable: document.querySelectorAll('.fleet-map-unavailable').length,
    tripTrackUnavailable: document.querySelectorAll('.trip-track-panel__map-unavailable').length,
    emptyFleetBanner: document.querySelectorAll('.fleet-map-empty-banner').length,
    stateCard: document.querySelectorAll('.fleet-map-state-card').length,
    tilesTotal: tiles.length,
    tilesPainted: tiles.filter((t) => t.naturalWidth > 0).length,
    tileWidths: tiles.slice(0, 5).map((t) => `${t.naturalWidth}x${t.naturalHeight}`),
    markers: document.querySelectorAll('.leaflet-marker-icon').length,
    listRows: document.querySelectorAll('app-fleet-vehicle-status-list li, app-fleet-vehicle-status-list tr').length,
    plates: (document.querySelector('app-fleet-vehicle-status-list')?.textContent ?? '').match(/\d{2}-\d{4}/g) ?? [],
  };
});
console.log('  DOM:', JSON.stringify(dom));

dom.fleetMapCanvas > 0 && dom.leafletContainers > 0
  ? pass(`AC3 map instantiated: .fleet-map-canvas=${dom.fleetMapCanvas} .leaflet-container=${dom.leafletContainers}`)
  : fail('AC3 map instantiated: no Leaflet container on the page');
dom.fleetMapUnavailable === 0 && dom.tripTrackUnavailable === 0
  ? pass('AC3 placeholders: zero .fleet-map-unavailable / .trip-track-panel__map-unavailable')
  : fail(`AC3 placeholders: ${dom.fleetMapUnavailable} fleet + ${dom.tripTrackUnavailable} trip placeholder(s) rendered -- the key path degraded`);
dom.tilesPainted > 0
  ? pass(`AC3 tiles: ${dom.tilesPainted}/${dom.tilesTotal} img.leaflet-tile have naturalWidth>0 (${dom.tileWidths.join(' ')})`)
  : fail(`AC3 tiles: 0 of ${dom.tilesTotal} img.leaflet-tile painted -- the elements exist but no image decoded`);
dom.markers > 0
  ? pass(`AC7 markers: ${dom.markers} .leaflet-marker-icon from real positions; list shows plates ${[...new Set(dom.plates)].join(' ')}`)
  : fail('AC7 markers: 0 .leaflet-marker-icon -- tiles may be fine while the data path is not');

// --- 5. AC4: the MapTiler responses, from a real browser ------------------
const byStatus = tileResponses.reduce((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
console.log(`  api.maptiler.com responses: ${tileResponses.length} -> ${JSON.stringify(byStatus)}`);
if (tileResponses.length === 0) {
  fail('AC4: the browser made no request to api.maptiler.com at all');
} else if (byStatus['200'] > 0 && Object.keys(byStatus).every((s) => s === '200')) {
  pass(`AC4: every one of ${tileResponses.length} api.maptiler.com responses was 200 from a real browser origin`);
} else {
  fail(`AC4: non-200 responses present -> ${JSON.stringify(byStatus)} (403 = this origin is not on the key's allow-list)`);
  tileResponses.filter((r) => r.status !== 200).slice(0, 3).forEach((r) => console.log(`        ${r.status} ${r.url}`));
}

// --- 6. AC5: the screenshots -------------------------------------------
await page.screenshot({ path: join(OUT, 'OBRS-831-02-fleet-map-page.png'), fullPage: false });
const panel = page.locator('app-fleet-map-panel');
if (await panel.count()) await panel.screenshot({ path: join(OUT, 'OBRS-831-03-map-closeup.png') });
const list = page.locator('app-fleet-vehicle-status-list');
if (await list.count()) await list.screenshot({ path: join(OUT, 'OBRS-831-04-vehicle-list.png') });

if (consoleErrors.length) {
  console.log(`  console errors (${consoleErrors.length}):`);
  consoleErrors.slice(0, 5).forEach((e) => console.log(`        ${e}`));
}

await browser.close();
console.log(`\nscreenshots -> ${OUT}`);
console.log(`failures: ${failures.length}`);
failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
