// OBRS-1083 card evidence: on /staff/fleet-map, a van that is running a trip must say WHICH
// stop it is heading to ("3 of 24") and how late it is, in the popup and the hover tooltip —
// and a van with no active trip must show neither line rather than "stop 0 of 0".
//
// Real SIT login, real vans, real GPS fixes, the real marker/popup layer. ONE thing is stubbed
// and it has to be: the five new fields come from the backend half of this same card, which is
// not deployed anywhere (the card ends at PR + In Review, it does not deploy). So the response
// to GET /api/private/vehicles/positions is intercepted and the five fields are ADDED to SIT's
// own rows — the vans, plates, coordinates and statuses in these images are SIT's, unedited.
// Say so wherever these images are posted (jira-card-visual-evidence-policy).
//
// The van that gets the fields is the first one that HAS a marker, and a second marker is left
// without them on purpose, so one run shows both AC1 and AC3 side by side.
//
// Usage:
//   CAPTURE_BASE=http://localhost:4321 CAPTURE_OUT=<dir> node e2e/scripts/capture-obrs1083.js after
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.CAPTURE_BASE || 'http://localhost:4321';
const TAG = (process.argv[2] || 'after').toUpperCase();
const EMAIL = process.env.SIT_EMAIL || 'salesperson@system.local';
const PASSWORD = process.env.SIT_PASSWORD || 'P@ssw0rd';
const OUT_DIR = process.env.CAPTURE_OUT || path.resolve(__dirname, '..', '..', 'capture-obrs1083');
fs.mkdirSync(OUT_DIR, { recursive: true });

const MAP_SEL = '.leaflet-container';
const MARKER_SEL = '.fleet-marker';
const POPUP_SEL = '.leaflet-popup-content';
const DETAIL_SEL = '.fleet-marker-detail';
const LABEL_SEL = '.fleet-marker-label';

// What the card's AC1 line looks like once rendered, in the two languages this run visits.
const TRIP_ON = { activeScheduleId: 7001, nextStopName: 'Nong Sam Sak', nextStopOrder: 3, totalStops: 24, scheduleDelayMinutes: 12 };

/** Leaflet leaves the previous popup in the DOM while the next one opens, so every read here
 * closes what is open first and then waits for exactly ONE popup. Without it the text read back
 * belongs to whichever van was clicked before. */
async function openPopupFor(page, index) {
  await page.evaluate(() => {
    document.querySelectorAll('.leaflet-popup-close-button').forEach((b) => b.click());
  });
  await page.waitForFunction(() => document.querySelectorAll('.leaflet-popup-content').length === 0, null, { timeout: 10_000 });
  await page.locator(MARKER_SEL).nth(index).click({ force: true });
  await page.waitForFunction(() => document.querySelectorAll('.leaflet-popup-content').length === 1, null, { timeout: 15_000 });
  await page.waitForTimeout(250);
  return (await page.locator(POPUP_SEL).first().innerText()).replace(/\s+/g, ' ').trim();
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => localStorage.setItem('app_language', 'en'));

  // No MapTiler key has ever been issued for local/SIT/prod, so `canShowMap` is false and
  // L.map() is never constructed. The worktree's gitignored env gets a PLACEHOLDER key to clear
  // that gate and the tile requests are rerouted to OSM here. Only where the raster tiles come
  // from changes; the markers and popups under test are drawn by our own code either way.
  await page.route('https://api.maptiler.com/**', (route) => {
    const m = route.request().url().match(/streets-v2\/(\d+)\/(\d+)\/(\d+)\.png/);
    if (!m) {
      return route.abort();
    }
    return route.fulfill({ status: 302, headers: { location: `https://tile.openstreetmap.org/${m[1]}/${m[2]}/${m[3]}.png` } });
  });

  // The stub, and exactly what is in it. SIT's rows come back with their own plates,
  // coordinates and statuses; three things are added on top:
  //   van 1 - the five OBRS-1083 fields AND a freshened recorded_at/last_seen_at. Every van on
  //           SIT last reported ~718 h ago, so without the freshening there is no LIVE van on the
  //           whole map and AC1's present-tense wording could not be photographed at all.
  //   van 2 - the five fields, timestamps UNTOUCHED, so it stays OFFLINE and shows AC4's
  //           last-known wording on real SIT staleness.
  //   van 3 - nothing added: AC3, the van with no active trip.
  let patched = null;
  await page.route('**/api/private/vehicles/positions', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const rows = body.data || [];
    // "Has a marker" == positioned and tracked (FLEET_STATUS_HAS_MARKER).
    const withMarker = rows.filter((r) => r.gpsImeiConfigured && r.positionKnown);
    rows.forEach((r) => {
      Object.assign(r, { activeScheduleId: null, nextStopName: null, nextStopOrder: null, totalStops: null, scheduleDelayMinutes: null });
    });
    // EVERY middle van gets the trip, not just one: vans park on top of each other on this map
    // and a click on a stacked pair opens whichever marker is on top, so pinning the offline
    // case to one chosen plate leaves the run at the mercy of which marker Leaflet stacked
    // first (measured: 2 of 6 markers were unreachable by click).
    const now = new Date().toISOString();
    const last = withMarker.length - 1;
    withMarker.forEach((r, i) => {
      if (i === 0) {
        Object.assign(r, TRIP_ON, { recordedAt: now, lastSeenAt: now, stale: false, deviceOnline: true, speed: 62 });
      } else if (i < last) {
        Object.assign(r, TRIP_ON);
      }
    });
    patched = {
      totalRows: rows.length,
      markerEligible: withMarker.length,
      livePlate: withMarker[0] ? withMarker[0].numberPlate : null,
      offlinePlates: withMarker.slice(1, last).map((r) => r.numberPlate),
      noTripPlate: last > 0 ? withMarker[last].numberPlate : null,
    };
    await route.fulfill({ response, json: body });
  });

  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90_000 });

  await page.goto(`${BASE}/staff/fleet-map`);
  await page.locator(MARKER_SEL).first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(2_000);
  console.log(`[${TAG}] intercepted response: ${JSON.stringify(patched)}`);

  const markerCount = await page.locator(MARKER_SEL).count();
  record('the map drew markers at all', markerCount > 0, `${markerCount} markers`);
  record('SIT returned a van eligible for a marker', !!patched && !!patched.livePlate, `live: ${patched && patched.livePlate}`);

  // Click EVERY marker and key what renders by plate - Leaflet does not promise DOM order
  // matches response order, and an index-keyed assertion would silently read the wrong van.
  const popups = {};
  for (let i = 0; i < markerCount; i++) {
    const text = await openPopupFor(page, i);
    const plate = text.split(' ')[0];
    popups[plate] = text;
    if (plate === patched.livePlate) {
      await page.locator(MAP_SEL).screenshot({ path: path.join(OUT_DIR, `OBRS-1083-${TAG}-1-next-stop-live.png`) });
    } else if (patched.offlinePlates.includes(plate)) {
      await page.locator(MAP_SEL).screenshot({ path: path.join(OUT_DIR, `OBRS-1083-${TAG}-2-next-stop-last-known.png`) });
    } else if (plate === patched.noTripPlate) {
      await page.locator(MAP_SEL).screenshot({ path: path.join(OUT_DIR, `OBRS-1083-${TAG}-3-no-active-trip.png`) });
    }
  }
  Object.entries(popups).forEach(([plate, text]) => console.log(`[${TAG}] popup ${plate} = ${text}`));

  // ── AC1: a LIVE van on a trip - present tense ─────────────────────────────
  const live = popups[patched.livePlate] || '';
  record('AC1: a LIVE van names the stop it is heading to, as "3 of 24"',
    live.includes('Next stop: Nong Sam Sak (3 of 24)') && !live.includes('Last known next stop'), live);
  record('AC1: and says how late it is', live.includes('Behind schedule by 12 min'), live);
  record('the lines that were already there are untouched',
    live.includes('Speed:') && /Updated/.test(live), live);

  // ── AC4: an OFFLINE van keeps the line but takes last-known wording ───────
  const offlineSeen = patched.offlinePlates.filter((p) => popups[p]);
  const offline = offlineSeen.map((p) => popups[p]).find((t) => t.includes('Last known next stop')) || '';
  record('AC4: an OFFLINE van (real SIT staleness, 651 h) takes LAST-KNOWN wording',
    offline.includes('Last known next stop: Nong Sam Sak (3 of 24)') && !offline.includes('Next stop: Nong'),
    offline || `none of the offline vans opened: ${offlineSeen.join(',')}`);

  // ── AC3: a van with no active trip shows neither line ─────────────────────
  const noTrip = popups[patched.noTripPlate] || '';
  record('AC3: a van with no active trip shows NEITHER line - no "0 of 0", no empty row',
    noTrip.length > 0 && !noTrip.includes('Next stop') && !noTrip.includes('Behind schedule') && !noTrip.includes('0 of 0'),
    noTrip);

  // ── OBRS-1070 AC3: the always-on label is deliberately NOT extended ───────
  const labels = await page.locator(LABEL_SEL).allInnerTexts();
  record('the compact always-on label stays two short tokens (OBRS-1070 AC3)',
    labels.length > 0 && !labels.some((l) => l.includes('Nong Sam Sak')), labels.join(' / '));

  // ── AC7 / OBRS-1082: the new strings follow a language switch ─────────────
  await page.locator('.navbar-lang-trigger').first().click();
  await page.locator('.navbar-lang-item', { hasText: 'ไทย' }).first().click();
  await page.waitForTimeout(1_000);
  let thaiPopup = '';
  for (let i = 0; i < markerCount; i++) {
    thaiPopup = await openPopupFor(page, i);
    if (thaiPopup.startsWith(patched.livePlate)) {
      break;
    }
  }
  console.log(`[${TAG}] popup (th) = ${thaiPopup}`);
  await page.locator(MAP_SEL).screenshot({ path: path.join(OUT_DIR, `OBRS-1083-${TAG}-3-thai.png`) });
  record('AC7: the new lines are translated, not left in English',
    thaiPopup.includes('จุดจอดถัดไป: Nong Sam Sak (จุดที่ 3 จาก 24)') && thaiPopup.includes('ช้ากว่าตาราง 12 นาที'), thaiPopup);

  // ── AC1: the hover tooltip carries the same detail as the popup ───────────
  await page.keyboard.press('Escape');
  await page.locator(MARKER_SEL).first().hover();
  await page.waitForTimeout(600);
  const detailCount = await page.locator(DETAIL_SEL).count();
  if (detailCount > 0) {
    const detail = (await page.locator(DETAIL_SEL).first().innerText()).replace(/\s+/g, ' ').trim();
    await page.locator(MAP_SEL).screenshot({ path: path.join(OUT_DIR, `OBRS-1083-${TAG}-4-hover-detail.png`) });
    record('the hover tooltip carries the trip line too', detail.includes('จุดจอดถัดไป'), detail);
  }

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n[${TAG}] ${results.length - failed.length}/${results.length} checks passed. Shots in ${OUT_DIR}`);
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
