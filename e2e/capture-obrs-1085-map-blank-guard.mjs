// OBRS-1085 evidence: the route map's draw-failure state, before and after.
//
// WHY A SCRIPT AND NOT A SCREENSHOT
//
// The state this card is about is visually a WHITE BOX, and a white box is the
// one thing a screenshot cannot tell apart from its neighbours: the pre-existing
// `.route-map-placeholder` (no key / no coordinates) is also a pale box with an
// icon, and "the map simply has not painted yet" is also a pale box. So the BEFORE
// image only proves the bug if we can also show that the map had ALREADY MOUNTED
// when the box went blank -- that is precisely what made the old `@else` branch
// unreachable (`showMap` was a one-way door). Hence assertion 1 below, which no
// image carries.
//
// WHAT EACH PHASE MEASURES
//
//   --phase before   (run against pristine `route-map-panel` sources)
//     1. <google-map> IS mounted (so showMap was true -- we are past the door)
//     2. tiles were genuinely blocked: >0 aborted maps/vt requests, 0 painted tiles
//     3. THE BUG: after the watchdog window there is still no `.route-error`,
//        no `.route-map-placeholder`, and no readable text inside the map box.
//        Zero-count assertions, so a typo'd selector fails instead of passing.
//
//   --phase after    (run against the fix)
//     1-2 identical, then:
//     3. `.route-error[role=alert]` is present, its text is RESOLVED i18n (not a
//        raw `HOME.ROUTE_MAP.*` key), and a retry button exists and is enabled
//     4. the blank <google-map> is gone (count 0) -- the box was replaced, not
//        merely overlaid
//     5. RETRY GENUINELY RE-INITS: unblock the tiles, click retry, and require
//        (a) a NEW <google-map> to mount, (b) at least one tile <img> with
//        naturalWidth > 0, and (c) a page-load sentinel planted before the click
//        to still be present -- (c) is what proves "without a full page reload",
//        which AC#2 asks for and which no screenshot can show.
//
// A tile <img> whose request was aborted still exists in the DOM with its class
// intact, so tile assertions are always naturalWidth > 0, never element count
// (same lesson as OBRS-831's leaflet probe).
//
// Usage (serve the worktree first; 4200 keeps SIT's CORS allowlist happy):
//   npx ng serve --configuration sit --port 4200
//   node e2e/capture-obrs-1085-map-blank-guard.mjs http://localhost:4200 e2e-evidence/obrs-1085 before
//   node e2e/capture-obrs-1085-map-blank-guard.mjs http://localhost:4200 e2e-evidence/obrs-1085 after
//
// Requires src/environments/environment.local.ts to carry a real mapsApiKey
// (gitignored); with a blank key showMap is false and NOTHING here is reachable.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:4200';
const OUT = process.argv[3] || 'e2e-evidence/obrs-1085';
const PHASE = process.argv[4] || 'after';

if (!['before', 'after'].includes(PHASE)) {
  console.error(`phase must be 'before' or 'after', got '${PHASE}'`);
  process.exit(2);
}

// Longer than MAP_TILES_TIMEOUT_MS (8_000) in route-map-panel.component.ts, with
// room for the mount itself. Kept as its own constant so a change to the card's
// 8s is a one-line change here rather than a hunt through waits.
const WATCHDOG_WINDOW_MS = 12_000;

mkdirSync(OUT, { recursive: true });

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.log(`  FAIL  ${msg}`);
};
const pass = (msg) => console.log(`  pass  ${msg}`);

const browser = await chromium.launch();
// 1536x864 is the window the bug was originally reported at (card, 2026-08-06).
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

let blockedTileRequests = 0;
let tilesBlocked = true;
// Google serves raster/vector tiles from .../maps/vt and the khms* hosts. Block
// both: leaving one open means `tilesloaded` can still fire and the whole run
// silently becomes a no-op that LOOKS like a pass.
const TILE_PATTERNS = ['**/maps/vt*', '**/kh?*/**', '**/maps/vt/**'];
for (const p of TILE_PATTERNS) {
  await page.route(p, (route) => {
    if (tilesBlocked) {
      blockedTileRequests++;
      return route.abort();
    }
    return route.continue();
  });
}

console.log(`\n=== OBRS-1085 capture — phase: ${PHASE} — ${BASE} ===\n`);

await page.goto(BASE, { waitUntil: 'domcontentloaded' });

// The panel is not rendered until the visitor asks for the map (OBRS-1211), so
// the CTA is the gate; without it there is no <google-map> and nothing to test.
const cta = page.locator('.map-placeholder-cta');
await cta.waitFor({ state: 'visible', timeout: 30_000 });
await cta.click();

// ── 1. the map actually mounted (this is what makes the box "blank", not "absent")
const mapEl = page.locator('google-map');
try {
  await mapEl.first().waitFor({ state: 'attached', timeout: 15_000 });
  pass('<google-map> mounted — showMap was true, so we are past the one-way door');
} catch {
  fail(
    '<google-map> never mounted — showMap was false (blank mapsApiKey in ' +
      'environment.local.ts, or no stop coordinates). Nothing below is meaningful.'
  );
}

// ── 2. tiles really were blocked
await page.waitForTimeout(WATCHDOG_WINDOW_MS);

const paintedTiles = await page.evaluate(
  () =>
    Array.from(document.querySelectorAll('google-map img')).filter(
      (i) => i.naturalWidth > 0
    ).length
);
if (blockedTileRequests > 0) pass(`tile requests aborted: ${blockedTileRequests}`);
else fail('0 tile requests were aborted — the block never engaged, so a pass here means nothing');
if (paintedTiles === 0) pass('painted tiles: 0 (naturalWidth > 0)');
else fail(`painted tiles: ${paintedTiles} — tiles got through, the map did not fail`);

// ── 3. what the user can actually read, right now
const state = await page.evaluate(() => {
  const err = document.querySelector('.route-error');
  const box = document.querySelector('google-map');
  const btn = err?.querySelector('button');
  return {
    mapCount: document.querySelectorAll('google-map').length,
    placeholderCount: document.querySelectorAll('.route-map-placeholder').length,
    errorCount: document.querySelectorAll('.route-error').length,
    errorRole: err?.getAttribute('role') ?? null,
    errorText: (err?.textContent ?? '').trim(),
    retryLabel: (btn?.textContent ?? '').trim(),
    retryDisabled: btn?.disabled ?? null,
    // What a user staring at the map area would read. Empty string here IS the bug.
    mapAreaText: (box?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  };
});

await page.screenshot({
  path: join(OUT, `OBRS-1085-${PHASE.toUpperCase()}-0-map-draw-failed.png`),
  fullPage: false,
});

if (PHASE === 'before') {
  if (state.errorCount === 0) pass('no .route-error — the failure is unannounced (the bug)');
  else fail(`.route-error present (${state.errorCount}) — pristine code should not have one`);

  if (state.placeholderCount === 0)
    pass('no .route-map-placeholder — the @else branch is unreachable once showMap went true (the bug)');
  else fail(`.route-map-placeholder present (${state.placeholderCount}) — expected unreachable here`);

  if (state.mapAreaText === '')
    pass('map area carries NO readable text — a white box with no way out (the bug, measured)');
  else fail(`map area has text: "${state.mapAreaText.slice(0, 120)}"`);
} else {
  if (state.errorCount === 1) pass('.route-error rendered exactly once');
  else fail(`.route-error count = ${state.errorCount}, expected 1`);

  if (state.errorRole === 'alert') pass('role="alert" present (screen readers are told)');
  else fail(`role = ${state.errorRole}, expected "alert"`);

  if (state.errorText && !state.errorText.includes('HOME.ROUTE_MAP'))
    pass(`error text resolved through i18n: "${state.errorText}"`);
  else fail(`error text is missing or a raw key: "${state.errorText}"`);

  if (state.retryLabel && state.retryDisabled === false)
    pass(`retry button present and enabled: "${state.retryLabel}"`);
  else fail(`retry button missing/disabled (label="${state.retryLabel}", disabled=${state.retryDisabled})`);

  if (state.mapCount === 0) pass('the blank <google-map> was replaced, not overlaid');
  else fail(`<google-map> still mounted (${state.mapCount}) — the blank box is still on screen`);

  // ── 4. retry genuinely re-inits, and does NOT reload the page
  await page.evaluate(() => {
    window.__obrs1085NoReload = true;
  });
  tilesBlocked = false;
  await page.locator('.route-error button').click();

  let reinit = { mapCount: 0, painted: 0, sentinel: false };
  try {
    await page.locator('google-map').first().waitFor({ state: 'attached', timeout: 15_000 });
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('google-map img')).some((i) => i.naturalWidth > 0),
      { timeout: 30_000 }
    );
  } catch {
    // fall through — the measurements below report what actually happened
  }
  reinit = await page.evaluate(() => ({
    mapCount: document.querySelectorAll('google-map').length,
    painted: Array.from(document.querySelectorAll('google-map img')).filter(
      (i) => i.naturalWidth > 0
    ).length,
    sentinel: window.__obrs1085NoReload === true,
    errorCount: document.querySelectorAll('.route-error').length,
  }));

  if (reinit.mapCount >= 1) pass('retry re-mounted a <google-map>');
  else fail('retry did not re-mount the map — the button is theatre');

  if (reinit.painted > 0) pass(`retry produced ${reinit.painted} painted tiles — a real re-init`);
  else fail('retry mounted a map that still painted nothing');

  if (reinit.errorCount === 0) pass('error state cleared after a successful retry');
  else fail(`.route-error still present after retry (${reinit.errorCount})`);

  if (reinit.sentinel)
    pass('window sentinel survived — the map re-inited WITHOUT a page reload (AC#2)');
  else fail('window sentinel gone — the page reloaded, which AC#2 explicitly rules out');

  await page.screenshot({
    path: join(OUT, 'OBRS-1085-AFTER-1-retry-recovered.png'),
    fullPage: false,
  });
}

const gmapsErrors = consoleErrors.filter((e) => /google|maps|gm_authfailure/i.test(e));
console.log(`\nconsole errors mentioning google/maps: ${gmapsErrors.length}`);
for (const e of gmapsErrors.slice(0, 5)) console.log(`    ${e}`);

await browser.close();

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} CHECK(S) FAILED`}`);
process.exit(failures.length === 0 ? 0 : 1);
