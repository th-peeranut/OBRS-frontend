// OBRS-1082 live verification + card evidence: on /staff/fleet-map, switching
// the app language WITHOUT a reload must retranslate what is already drawn on
// the markers (popup / permanent label / hover tooltip) in the same tick —
// not 60 s later when the next poll tick overwrites it.
//
// Real SIT login, real GPS data, no API stubbing: the whole defect is that the
// marker strings come from `translate.instant()` baked into Leaflet layers, so
// anything that re-renders the page from scratch would hide it.
//
// NOTHING here is composed: the language is changed by clicking the real
// navbar switcher, and the popup is opened by clicking the real marker. The
// only scripted "state" is which marker gets clicked.
//
// Usage (two worktrees served in parallel — see the visual-evidence recipe):
//   CAPTURE_BASE=http://localhost:4300 node e2e/scripts/capture-obrs1082.js after
//   CAPTURE_BASE=http://localhost:4400 node e2e/scripts/capture-obrs1082.js before
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.CAPTURE_BASE || 'http://localhost:4300';
const TAG = (process.argv[2] || 'after').toUpperCase();
const EMAIL = process.env.SIT_EMAIL || 'salesperson@system.local';
const PASSWORD = process.env.SIT_PASSWORD || 'P@ssw0rd';
const OUT_DIR =
  process.env.CAPTURE_OUT ||
  path.resolve(__dirname, '..', '..', '..', 'obrs-agent-office', '.claude', 'agent-office', 'scripts', 'captures', 'obrs-1082');
fs.mkdirSync(OUT_DIR, { recursive: true });

const MAP_SEL = '.leaflet-container';
const MARKER_SEL = '.fleet-marker';
const POPUP_SEL = '.leaflet-popup-content';
const LABEL_SEL = '.fleet-marker-label';
const LANG_TRIGGER_SEL = '.navbar-lang-trigger';
const LANG_ITEM_SEL = '.navbar-lang-item';

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

/** What the user can actually READ off the map right now. Text content of the
 * rendered nodes — never a component field, and never the string we handed
 * Leaflet: the bug is precisely that the two disagree. */
async function readMap(page) {
  return page.evaluate(
    ({ popupSel, labelSel, markerSel }) => ({
      popup: (document.querySelector(popupSel)?.textContent || '').replace(/\s+/g, ' ').trim(),
      labels: Array.from(document.querySelectorAll(labelSel)).map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
      markerCount: document.querySelectorAll(markerSel).length,
      lang: localStorage.getItem('app_language'),
      href: location.href,
    }),
    { popupSel: POPUP_SEL, labelSel: LABEL_SEL, markerSel: MARKER_SEL }
  );
}

async function selectLanguage(page, endonym) {
  await page.locator(LANG_TRIGGER_SEL).first().click();
  await page.locator(LANG_ITEM_SEL, { hasText: endonym }).first().click();
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 2 });
  // Start in Thai — the state the reporter was in when they switched to English.
  await page.addInitScript(() => localStorage.setItem('app_language', 'th'));

  // No MapTiler key has ever been issued for local/SIT/prod (measured 3x:
  // OBRS-424, OBRS-426, OBRS-905 — `environment.local.ts` carries a 0-char
  // key), so `canShowMap` is false and L.map() is never constructed. The
  // worktree's gitignored env gets a PLACEHOLDER key to get past that gate and
  // the tile requests are rerouted to OSM here, so the capture shows a real
  // basemap. This changes only where the raster tiles come from — the markers,
  // popups and labels under test are drawn by our own code either way.
  await page.route('https://api.maptiler.com/**', (route) => {
    const m = route.request().url().match(/streets-v2\/(\d+)\/(\d+)\/(\d+)\.png/);
    if (!m) {
      return route.abort();
    }
    return route.fulfill({ status: 302, headers: { location: `https://tile.openstreetmap.org/${m[1]}/${m[2]}/${m[3]}.png` } });
  });

  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90_000 });

  await page.goto(`${BASE}/staff/fleet-map`);
  await page.locator(MARKER_SEL).first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(1_500); // let every marker + permanent label settle

  // Open a marker popup by clicking the marker, as staff do.
  await page.locator(MARKER_SEL).first().click();
  await page.locator(POPUP_SEL).waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(400);

  const before = await readMap(page);
  console.log(`[${TAG}] lang=${before.lang} markers=${before.markerCount}`);
  console.log(`[${TAG}] popup(th) = ${before.popup}`);
  console.log(`[${TAG}] label(th) = ${before.labels[0]}`);
  await page.locator(MAP_SEL).screenshot({ path: path.join(OUT_DIR, `OBRS-1082-${TAG}-1-thai.png`) });

  const startedAt = Date.now();
  const urlBefore = before.href;

  // ── The switch. No reload, no navigation, no second poll tick. ────────────
  await selectLanguage(page, 'English');
  await page.waitForTimeout(1_000); // one second — the poll interval is 60 s

  const after = await readMap(page);
  const elapsedMs = Date.now() - startedAt;
  console.log(`[${TAG}] popup(after switch, +${elapsedMs} ms) = ${after.popup}`);
  console.log(`[${TAG}] label(after switch) = ${after.labels[0]}`);
  await page.locator(MAP_SEL).screenshot({ path: path.join(OUT_DIR, `OBRS-1082-${TAG}-2-after-switch.png`) });

  // ── Assertions, all read off the rendered DOM ─────────────────────────────
  record('no reload / no navigation', after.href === urlBefore, `${urlBefore} -> ${after.href}`);
  record('language really switched', after.lang === 'en', `app_language=${after.lang}`);
  record('the switch happened well inside one poll tick', elapsedMs < 60_000, `${elapsedMs} ms < 60000 ms`);
  record('popup stayed OPEN through the switch', after.popup.length > 0, `popup text length ${after.popup.length}`);
  record(
    'popup is in ENGLISH after the switch',
    !/[฀-๿]/.test(after.popup) && after.popup.length > 0,
    after.popup
  );
  record(
    'permanent label is in ENGLISH after the switch',
    after.labels.length > 0 && !after.labels.some((l) => /[฀-๿]/.test(l)),
    after.labels.join(' / ')
  );
  record('marker count unchanged (nothing rebuilt/dropped)', after.markerCount === before.markerCount, `${before.markerCount} -> ${after.markerCount}`);

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n[${TAG}] ${results.length - failed.length}/${results.length} checks passed. Shots in ${OUT_DIR}`);
  // BEFORE is EXPECTED to fail the two "in ENGLISH" checks — that is the bug.
  // Exit non-zero only for the AFTER lane so a green run is a real verdict.
  process.exit(TAG === 'AFTER' && failed.length > 0 ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
