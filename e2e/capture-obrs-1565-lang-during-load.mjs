/**
 * OBRS-1565 visual evidence — switching language WHILE the route map is still loading.
 *
 * Run against ONE dev server (`ng serve --configuration sit`, so every payload is real
 * SIT data), three times, changing nothing but `--label` and the component under test:
 *
 *   node e2e/capture-obrs-1565-lang-during-load.mjs --label control        # no switch at all
 *   node e2e/capture-obrs-1565-lang-during-load.mjs --label before         # component at dev HEAD
 *   node e2e/capture-obrs-1565-lang-during-load.mjs --label after          # component with the fix
 *
 * ⚠️ The two route calls are held for `--delay-ms` (default 2500) by a Playwright route
 * handler before being let through to the REAL backend. The bodies are untouched — this
 * only pins the width of the `loading` window. Without it the pair is not the same
 * experiment: measured on this dev server, the window was 6,443 ms on a cold first load
 * and had already closed before the navbar rendered on the next run, so BEFORE and AFTER
 * would be answering different questions. The window being wide enough for a human to
 * reach the switcher is AC-1's measurement, not something this delay is claiming.
 *
 * It prints, alongside the PNG:
 *  - the direction selector labels (translated CLIENT-side)  } the two halves the card
 *  - the pickup stop names (translated by the BACKEND)       } says end up disagreeing
 *  - a 100 ms time series of the route-map block, collapsed to the moments it changed.
 *    AC-3 is that the fix's re-fetch adds NO second `loading` — that flip is what
 *    unmounts <app-route-map-panel> and re-loads the paid Maps SDK (OBRS-1211).
 *  - every /pickup-dropoff request with the Accept-Language it actually carried.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4260';
const OUT = path.resolve('e2e/out/obrs-1565');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 || !process.argv[i + 1] ? fallback : process.argv[i + 1];
};
const LABEL = arg('--label', null);
if (!LABEL) {
  throw new Error('--label <control|before|after> is required — an unlabelled pair proves nothing');
}
const DELAY_MS = Number(arg('--delay-ms', '2500'));
const SWITCH = LABEL !== 'control';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

// Hold the two calls of the home page's forkJoin, then let the real request through.
// Off during the warm-up visit below, on for the measured visit.
let holdRoutes = false;
const hold = async (route) => {
  if (holdRoutes) {
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  await route.continue();
};
await context.route('**/api/routes*', hold);
await context.route('**/api/routes/*/pickup-dropoff*', hold);

const page = await context.newPage();

// A time series of the route-map block, read from the DOM rather than from a component
// field a screenshot cannot show. A MutationObserver cannot be used here: addInitScript
// runs at document creation, where `document.documentElement` does not exist yet, so
// observing it throws and kills the rest of the init script silently (measured — the
// first version of this file returned an empty list for exactly that reason).
await page.addInitScript(() => {
  window.__samples = [];
  setInterval(() => {
    const firstStop = document.querySelector('app-route-stop-list .stop-name');
    const directions = document.querySelector('p-selectbutton');
    window.__samples.push({
      t: Math.round(performance.now()),
      loading: !!document.querySelector('.route-loading-text'),
      stop: firstStop ? firstStop.textContent.trim() : null,
      directions: directions ? directions.textContent.replace(/\s+/g, ' ').trim() : null,
    });
  }, 100);
});

const consoleLines = [];
const requests = [];
// Stamped on the PAGE's clock so a request lines up with the DOM samples below.
let timeOrigin = Date.now();
page.on('request', (req) => {
  const url = req.url();
  const at = () => Math.round(Date.now() - timeOrigin);
  if (url.includes('/pickup-dropoff') || url.endsWith('/api/routes') || url.includes('/i18n/')) {
    requests.push({ url, lang: req.headers()['accept-language'] ?? '(none)', t: at() });
  }
  if (url.includes('maps.googleapis.com')) {
    requests.push({ url: 'GOOGLE MAPS SDK', lang: '-', t: at() });
  }
});
page.on('console', (msg) => {
  if (msg.text().includes('[1565]')) {
    consoleLines.push(msg.text());
  }
});
page.on('response', (res) => {
  const url = res.url();
  if (url.includes('/pickup-dropoff') || url.endsWith('/api/routes') || url.includes('/i18n/')) {
    requests.push({
      url: 'RESPONSE ' + url,
      lang: String(res.status()),
      t: Math.round(Date.now() - timeOrigin),
    });
  }
});

// ── Warm-up visit: put BOTH i18n bundles in the browser's HTTP cache ──────────
// This is the state of any returning visitor, and it is what decides whether this
// card's bug is permanent or merely long. `translate.use('en')` emits `onLangChange`
// only once `en.json` has loaded: with that file COLD the emission lands AFTER the
// route payload, so `reloadLocalizedStops()` finds `loadState === 'loaded'` and the
// page self-heals — measured on this dev server (`before-i18n-cold.json`): 2,289 ms
// of a visibly two-language page, then it fixes itself with nobody touching it.
// With the file warm the emission lands INSIDE the loading window, the guard drops
// it, and nothing comes back for it — the card's "only a second toggle fixes it".
await page.goto(BASE + '/', { waitUntil: 'commit' });
await page.waitForSelector('.navbar-lang-trigger', { state: 'visible', timeout: 30000 });
await page.locator('.navbar-lang-trigger').click();
await page.locator('.navbar-lang-item', { hasText: 'English' }).click();
await page.waitForTimeout(2500);
await page.locator('.navbar-lang-trigger').click();
await page.locator('.navbar-lang-item', { hasText: 'ไทย' }).click();
await page.waitForTimeout(2500);

// ── The measured visit ───────────────────────────────────────────────────────
holdRoutes = true;
requests.length = 0;
consoleLines.length = 0;
await page.goto(BASE + '/', { waitUntil: 'commit' });
timeOrigin = await page.evaluate(() => performance.timeOrigin);
await page.waitForSelector('.navbar-lang-trigger', { state: 'visible', timeout: 30000 });

let clickedAtPerfMs = null;
if (SWITCH) {
  await page.waitForSelector('.route-loading-text', { state: 'visible', timeout: 30000 });
  await page.locator('.navbar-lang-trigger').click();
  await page.locator('.navbar-lang-item', { hasText: 'English' }).click();
  clickedAtPerfMs = await page.evaluate(() => Math.round(performance.now()));
  if ((await page.locator('.route-loading-text').count()) === 0) {
    await browser.close();
    throw new Error(
      'the route map had already finished loading when the switch landed — that is OBRS-929, not this card'
    );
  }
} else {
  await page.locator('.navbar-lang-trigger').click();
  await page.locator('.navbar-lang-item', { hasText: 'English' }).click();
  clickedAtPerfMs = await page.evaluate(() => Math.round(performance.now()));
}

await page.waitForSelector('app-route-stop-list', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(6000);

const samples = await page.evaluate(() => window.__samples);
const report = {
  label: LABEL,
  base: BASE,
  delayMsPerRouteCall: DELAY_MS,
  switchedLanguageWhileLoading: SWITCH,
  switchedAtPagePerfMs: clickedAtPerfMs,
  htmlLang: await page.evaluate(() => document.documentElement.lang),
  directionSelector: (await page.locator('p-selectbutton').allInnerTexts())
    .join(' | ')
    .replace(/\s+/g, ' ')
    .trim(),
  pickupStopNames: (await page.locator('app-route-stop-list .stop-name').allInnerTexts()).map((s) =>
    s.trim()
  ),
  routeMapTimeline: samples.filter((s, i, a) => {
    if (i === 0) return true;
    const p = a[i - 1];
    return s.loading !== p.loading || s.stop !== p.stop || s.directions !== p.directions;
  }),
  consoleLines,
  requests: requests.map((r) => ({
    t: r.t,
    lang: r.lang,
    url: r.url.replace(/^https?:\/\/[^/]+/, ''),
  })),
};

await mkdir(OUT, { recursive: true });
// The route-map block itself, not the viewport: it sits well below the fold, so a
// plain viewport shot is byte-identical between before and after and proves nothing
// (measured — the first pair of PNGs here were the same 176,813 bytes).
await page.locator('app-route-map-home').scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.locator('app-route-map-home').screenshot({ path: path.join(OUT, `${LABEL}.png`) });
await writeFile(path.join(OUT, `${LABEL}.json`), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));

await browser.close();
