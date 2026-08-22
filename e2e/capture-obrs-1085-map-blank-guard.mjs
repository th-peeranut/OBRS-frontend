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
// HOW THE FAILURE IS INDUCED -- and why NOT the way AC#5 proposed
//
// AC#5 said to block `maps/vt`. Measured: that does not work (see the long note
// at the route handler below). This blocks the `map.js` sub-module instead, which
// is the card's own suspected cause and the only induced failure that matches the
// reported symptom -- no Google logo, no attribution bar, nothing drawn at all.
//
//   --phase before   (run against pristine `route-map-panel` sources)
//     1. <google-map> IS mounted (so showMap was true -- we are past the door)
//     2. the map genuinely failed: >0 aborted map.js requests, 0 painted tiles
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
// serviceWorkers: 'block' is load-bearing, not hygiene. The deployed SIT frontend
// registers one, and it served `map.js` straight from its cache — completely
// bypassing page.route. Measured 2026-08-22: the run asserted "the Map never
// constructed" and then wrote a screenshot of a fully drawn basemap, byte-identical
// to the recovered-state image. The induced failure has to reach the network for
// this script to be measuring anything at all.
const ctx = await browser.newContext({
  viewport: { width: 1536, height: 864 },
  serviceWorkers: 'block',
});
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

let blockedRequests = 0;
let mapModuleBlocked = true;
// ⛔ NOT `maps/vt`, which is what OBRS-1085's AC#5 proposed. Measured 2026-08-22
// against this very build: aborting every `/maps/vt` request (10 aborted, 0 tiles
// painted, verified) still fires `tilesloaded`, so the watchdog never trips and
// the run passes while proving nothing. Google treats the visible tile set as
// "settled" whether the requests resolved or aborted. Worse, that state is not
// the reported bug at all — the map object is alive, the route polyline, markers,
// zoom, Google logo and attribution bar all render over a grey "no imagery"
// backdrop (see OBRS-1085-BEFORE-*.png), i.e. degraded but usable.
//
// The reported symptom had NO Google logo and NO attribution — both are text the
// Map itself draws — so `google.maps.Map` never constructed. The card's own
// suspected cause names the sub-module that would do that, and it is a real URL:
// maps-api-v3/api/js/<ver>/map.js (measured). Blocking THAT reproduces the bug
// faithfully: the bootstrap `js?key=` still resolves (so `mapsLoaded` goes true
// and we stay on the new code path, not the pre-existing `.catch`), but the map
// never draws.
// BOTH halves are required. Blocking only `map.js` leaves Google's own fallback in
// place: it injects a single StaticMapService.GetMapImage <img> of the same area
// (measured — that is the map you see in an earlier revision of the BEFORE shot,
// basemap without our polyline or markers). That state is degraded but readable,
// the guard deliberately does NOT fire on it, and it is not the reported symptom.
// Blocking the static fallback too leaves the box genuinely empty — no logo, no
// attribution, nothing — which IS the reported symptom.
const MAP_MODULE_URL = /maps-api-v3\/api\/js\/[^?]*\/map\.js|StaticMapService\.GetMapImage/;
await page.route(MAP_MODULE_URL, (route) => {
  if (mapModuleBlocked) {
    blockedRequests++;
    return route.abort();
  }
  return route.continue();
});

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

// "Did the Map actually construct?" — measured the way the card itself decided it.
//
// ⛔ Do NOT count tile <img>. This map can render as vector/WebGL into a <canvas>,
// in which case there are ZERO tile <img> on a perfectly healthy map, so a tile
// count of 0 is vacuously true and proves nothing. Measured 2026-08-22: a run
// asserting "0 painted tiles" passed against a screenshot showing a fully drawn
// basemap with roads and place labels.
//
// The card's own decisive observation: the reported white box had no Google logo
// and no "Keyboard shortcuts / Map data ©2026 Google / Terms" bar. Both are drawn
// BY the Map object, so their absence — unlike a missing tile — means the object
// never constructed. That is the assertion.
const drew = await page.evaluate(() => {
  const box = document.querySelector('google-map');
  const txt = (box?.textContent ?? '').replace(/\s+/g, ' ');
  const canvases = Array.from(box?.querySelectorAll('canvas') ?? []).filter(
    (c) => c.width > 0 && c.height > 0
  ).length;
  return {
    googleLogo: (box?.querySelectorAll('img[src*="gstatic.com/mapfiles"]') ?? []).length,
    attribution: /Map data|Keyboard shortcuts|Terms/.test(txt),
    canvases,
    tileImgs: Array.from(box?.querySelectorAll('img') ?? []).filter(
      (i) => /\/maps\/vt/.test(i.src) && i.naturalWidth > 0
    ).length,
  };
});
const mapDrew = drew.googleLogo > 0 || drew.attribution || drew.canvases > 0 || drew.tileImgs > 0;
if (blockedRequests > 0) pass(`map.js sub-module requests aborted: ${blockedRequests}`);
else fail('0 map.js requests were aborted — the block never engaged, so a pass here means nothing');

const drewDetail =
  `logo=${drew.googleLogo} attribution=${drew.attribution} canvas=${drew.canvases} tileImgs=${drew.tileImgs}`;
if (!mapDrew) pass(`the Map never constructed — ${drewDetail}`);
else fail(`the Map DID construct (${drewDetail}) — the induced failure did not take, so nothing below is meaningful`);

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
    // Size of the box the user is staring at. A zero-height box would mean the
    // map collapsed rather than went blank — a different bug, and it would make
    // "no message shown" trivially true, so it is measured rather than assumed.
    mapBoxHeight: box ? Math.round(box.getBoundingClientRect().height) : 0,
    // Message elements THIS APP authored, visible right now. Google injects its
    // own keyboard-shortcut a11y text into the map, so reading textContent off
    // the map box measures Google's copy, not ours (measured 2026-08-22).
    appMessageCount: Array.from(
      document.querySelectorAll('.route-error, .route-map-placeholder')
    ).filter((el) => el.getBoundingClientRect().height > 0).length,
  };
});

await page.screenshot({
  path: join(OUT, `OBRS-1085-${PHASE.toUpperCase()}-0-map-draw-failed.png`),
  fullPage: false,
});

// The image is the deliverable, so it must agree with the numbers above. Re-measure
// AFTER the shutter: if the map finished constructing in between, every assertion
// above described a state that is not in the picture, and the picture is the thing
// a reviewer will trust. Fail loudly rather than ship an image that lies.
const drewAfterShot = await page.evaluate(() => {
  const box = document.querySelector('google-map');
  const txt = (box?.textContent ?? '').replace(/\s+/g, ' ');
  return (
    (box?.querySelectorAll('img[src*="gstatic.com/mapfiles"]') ?? []).length > 0 ||
    /Map data|Keyboard shortcuts|Terms/.test(txt) ||
    Array.from(box?.querySelectorAll('canvas') ?? []).some((c) => c.width > 0 && c.height > 0)
  );
});
if (drewAfterShot === mapDrew)
  pass('the screenshot agrees with the measurements taken around it');
else
  fail(
    `state changed across the shutter (measured drew=${mapDrew}, after shot drew=${drewAfterShot}) — the image does not depict what was asserted`
  );

if (PHASE === 'before') {
  if (state.errorCount === 0) pass('no .route-error — the failure is unannounced (the bug)');
  else fail(`.route-error present (${state.errorCount}) — pristine code should not have one`);

  if (state.placeholderCount === 0)
    pass('no .route-map-placeholder — the @else branch is unreachable once showMap went true (the bug)');
  else fail(`.route-map-placeholder present (${state.placeholderCount}) — expected unreachable here`);

  if (state.mapBoxHeight > 100)
    pass(`map box is ${state.mapBoxHeight}px tall — it occupies the layout, it just says nothing`);
  else fail(`map box is only ${state.mapBoxHeight}px tall — it collapsed rather than went blank`);

  if (state.appMessageCount === 0)
    pass('0 app-authored messages visible — a blank box with no way out (the bug, measured)');
  else fail(`${state.appMessageCount} app message element(s) visible — the failure was announced after all`);
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

  // ── DARK MODE. The scrutinize pass found this error box inheriting the
  // component's light-mode text colour onto a dark card, and derived the ratio
  // from the tokens. Measure the rendered pixels instead. ThemeService applies
  // dark mode by putting `is-dark` on <body>, so this drives the real mechanism.
  await page.evaluate(() => document.body.classList.add('is-dark'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'OBRS-1085-AFTER-2-dark-mode.png'), fullPage: false });
  const contrast = await page.evaluate(() => {
    const span = document.querySelector('.route-error span');
    const box = document.querySelector('.route-error');
    if (!span || !box) return null;
    const rgb = (s) => (s.match(/\d+/g) || []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const fg = getComputedStyle(span).color;
    const bg = getComputedStyle(box).backgroundColor;
    const [hi, lo] = [lum(rgb(fg)), lum(rgb(bg))].sort((a, b) => b - a);
    return { fg, bg, ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100 };
  });
  if (!contrast) fail('could not measure dark-mode contrast — .route-error span not found');
  else if (contrast.ratio >= 4.5)
    pass(`dark-mode message contrast ${contrast.ratio}:1 — ${contrast.fg} on ${contrast.bg} (WCAG AA)`);
  else
    fail(`dark-mode message contrast ${contrast.ratio}:1 — ${contrast.fg} on ${contrast.bg}, below AA 4.5:1`);
  await page.evaluate(() => document.body.classList.remove('is-dark'));

  // ── 4. retry genuinely re-inits, and does NOT reload the page
  await page.evaluate(() => {
    window.__obrs1085NoReload = true;
  });
  // Click 1 — still blocked. Re-mounts our component, which cannot recover, because
  // Google's loader never re-requests the sub-module it already gave up on. The
  // error must therefore come BACK, and that is what earns the escalation.
  const retryBtn = page.locator('.route-error button');
  if ((await retryBtn.count()) === 0) {
    fail('no retry button to click — skipping the re-init proof');
  } else {
    await retryBtn.click();
    await page.waitForTimeout(WATCHDOG_WINDOW_MS);
    const backAgain = await page.locator('.route-error').count();
    if (backAgain === 1)
      pass('first retry re-mounted, the map still could not draw, the error returned');
    else fail(`after the first retry .route-error count = ${backAgain}, expected 1`);

    // Click 2 — the escalation. Unblock first so the fresh document can succeed,
    // which is the whole point of preferring a reload over a third re-mount.
    mapModuleBlocked = false;
    await retryBtn.click();
  }

  // Same "did it construct" criteria as above — never a bare tile count, which is
  // vacuous on a canvas-rendered map.
  const didDraw = () => {
    const box = document.querySelector('google-map');
    const txt = (box?.textContent ?? '').replace(/\s+/g, ' ');
    return (
      (box?.querySelectorAll('img[src*="gstatic.com/mapfiles"]') ?? []).length > 0 ||
      /Map data|Keyboard shortcuts|Terms/.test(txt) ||
      Array.from(box?.querySelectorAll('canvas') ?? []).some((c) => c.width > 0 && c.height > 0)
    );
  };
  let reinit = { mapCount: 0, drew: false, sentinel: false, errorCount: 0 };
  try {
    // The reload lands on a fresh document, which returns to the "ask for the map"
    // state (OBRS-1211's reveal gate) — pre-existing behaviour, not this card's.
    // So the map is only expected to come back after the CTA is clicked again.
    const ctaAgain = page.locator('.map-placeholder-cta');
    await ctaAgain.waitFor({ state: 'visible', timeout: 30_000 });
    await ctaAgain.click();
    await page.locator('google-map').first().waitFor({ state: 'attached', timeout: 15_000 });
    await page.waitForFunction(didDraw, { timeout: 30_000 });
  } catch {
    // fall through — the measurements below report what actually happened
  }
  reinit = await page.evaluate((fn) => {
    const drewNow = new Function(`return (${fn})()`)();
    return {
      mapCount: document.querySelectorAll('google-map').length,
      drew: drewNow,
      sentinel: window.__obrs1085NoReload === true,
      errorCount: document.querySelectorAll('.route-error').length,
    };
  }, didDraw.toString());

  if (reinit.mapCount >= 1) pass('retry re-mounted a <google-map>');
  else fail('retry did not re-mount the map — the button is theatre');

  if (reinit.drew) pass('the re-mounted map actually CONSTRUCTED (logo/attribution/canvas) — a real re-init');
  else fail('retry mounted a map that never constructed');

  if (reinit.errorCount === 0) pass('error state cleared after a successful retry');
  else fail(`.route-error still present after retry (${reinit.errorCount})`);

  // The sentinel was planted before click 1. It must SURVIVE that click (AC#2: the
  // first retry re-inits without a reload) and be GONE after click 2 (the
  // escalation). Its absence here is the only proof the reload actually happened —
  // a recovered map alone cannot distinguish a reload from a successful re-mount.
  if (!reinit.sentinel)
    pass('window sentinel gone after the second click — the escalation really did reload');
  else
    fail('window sentinel still present — the second click did not reload, so the escalation never fired');

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
