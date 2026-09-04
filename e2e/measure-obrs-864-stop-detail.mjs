/**
 * OBRS-864 — measures the two claims the card refuses to take on trust, and
 * captures the screenshots for the board.
 *
 *   AC-4  the card must not change height when the stop data lands.
 *         `GET /api/routes/<slug>/pickup-dropoff` is held for OBRS_STOPS_DELAY_MS
 *         so there is a real window in which the rows exist and the stop lines
 *         do not. Every `.schedule-item` is measured inside that window and
 *         again after the lines render; the two lists are compared per row.
 *   AC-7  one search must not cost more HTTP requests than it did before.
 *         Every request to the API host is recorded with its method and path,
 *         so the two runs (baseline / patched) are compared by COUNT, not by
 *         reading the diff and concluding.
 *
 * Run it twice against the SAME `ng serve` (it rebuilds on checkout), once per
 * side, and diff the two JSON files:
 *
 *   npx ng serve --port 4200            # local backend CORS is pinned to 4200
 *   OBRS_LABEL=after  node e2e/measure-obrs-864-stop-detail.mjs
 *   git stash && OBRS_LABEL=before node e2e/measure-obrs-864-stop-detail.mjs && git stash pop
 *
 * `OBRS_LANG` (th|en|zh) and `OBRS_THEME` (light|dark) pick the capture lane;
 * the file names carry both so the four of them do not overwrite each other.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const API = process.env.OBRS_API_URL ?? 'http://localhost:8080';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e-evidence/obrs-864');
const LABEL = process.env.OBRS_LABEL ?? 'after';
const LANG = process.env.OBRS_LANG ?? 'th';
const THEME = process.env.OBRS_THEME ?? 'light';
const DELAY_MS = Number(process.env.OBRS_STOPS_DELAY_MS ?? 12000);

// The one SIT pair that carries rounds tomorrow (same pair OBRS-1597 uses).
const FROM_SLUG = process.env.OBRS_FROM_STOP ?? 'nong_chak';
const TO_SLUG = process.env.OBRS_TO_STOP ?? 'mo_chit_2_bus_terminal';

const tag = `${LABEL}-${LANG}-${THEME}`;

async function stopLabels() {
  const res = await fetch(`${API}/api/stops`, { headers: { 'Accept-Language': LANG } });
  const stops = (await res.json()).data ?? [];
  const label = (slug) => {
    const hit = stops.find((s) => s.slug === slug);
    // The seed carries th/en labels only - a stop has no `zh` label today, and
    // the app falls back to `en` for it, so the picker must look for the same
    // string the dropdown actually renders.
    const text =
      hit?.translations?.[LANG]?.label ??
      hit?.translations?.en?.label ??
      hit?.translations?.th?.label;
    if (!text) throw new Error(`stop '${slug}' is not in ${API}/api/stops`);
    return text.trim();
  };
  return { from: label(FROM_SLUG), to: label(TO_SLUG) };
}

async function searchFromHome(page, labels, onBeforeSearch) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.btn-search').waitFor({ timeout: 60000 });

  // One-way: a round trip drags a second leg into a measurement about one card.
  // `force` because the hero's decorative `.home-bg` <img> sits over the form in
  // the unoptimized local build and Playwright refuses an intercepted click.
  await page.locator('.trip-type-toggle__btn').first().click({ force: true });

  const tomorrow = new Date(Date.now() + 86400000);
  await page.locator('#home-departure-date').click({ force: true });
  await page
    .locator('.app-date-field-panel td:not(.p-datepicker-other-month) span')
    .filter({ hasText: new RegExp(`^${tomorrow.getDate()}$`) })
    .first()
    .click();

  const groups = page.locator('.station-group app-dropdown-group-obrs');
  await groups.first().locator('.dropdown-btn').click({ force: true });
  await groups
    .first()
    .locator('.dropdown-menu.show .dropdown-option')
    .first()
    .waitFor({ timeout: 30000 });
  await groups
    .first()
    .locator('.dropdown-menu.show .dropdown-option')
    .filter({ hasText: labels.from })
    .first()
    .click();

  // The destination list is rebuilt from the chosen origin.
  await page.waitForTimeout(1000);
  await groups.nth(1).locator('.dropdown-btn').click({ force: true });
  await page.waitForTimeout(500);
  await groups
    .nth(1)
    .locator('.dropdown-menu.show .dropdown-option')
    .filter({ hasText: labels.to })
    .first()
    .click();

  if (onBeforeSearch) onBeforeSearch();
  await page.locator('.btn-search').click({ force: true });
}

const measureHeights = (page) =>
  page.$$eval('.schedule-item', (cards) =>
    cards.map((card, index) => ({
      index,
      height: Math.round(card.getBoundingClientRect().height * 100) / 100,
      stopRows: card.querySelectorAll('.stop-detail__row').length,
    }))
  );

async function main() {
  await mkdir(OUT, { recursive: true });
  const labels = await stopLabels();

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // SIT's service worker can answer from cache straight past `page.route`.
    serviceWorkers: 'block',
  });
  await context.addInitScript(
    ([lang, theme]) => {
      localStorage.setItem('app_language', lang);
      if (theme === 'dark') localStorage.setItem('app_admin_theme', 'dark');
      else localStorage.removeItem('app_admin_theme');
    },
    [LANG, THEME]
  );
  const page = await context.newPage();

  const requests = [];
  let searchPressedAt = 0;
  page.on('request', (req) => {
    if (!req.url().startsWith(API)) return;
    requests.push({
      method: req.method(),
      path: req.url().slice(API.length).split('?')[0],
      afterSearchMs: searchPressedAt ? Date.now() - searchPressedAt : null,
    });
  });

  // Hold the stop data so the "not yet resolved" state is a real, measurable
  // window instead of a frame nobody can catch.
  let held = 0;
  await page.route('**/api/routes/*/pickup-dropoff*', async (route) => {
    held += 1;
    await new Promise((r) => setTimeout(r, DELAY_MS));
    await route.continue();
  });

  await searchFromHome(page, labels, () => {
    searchPressedAt = Date.now();
  });

  await page.waitForSelector('.schedule-item', { timeout: 60000 });
  // AC-4 is a claim about EVERY frame between "the rows exist" and "the stop
  // lines exist", not about two of them. Sample the whole window at 100ms and
  // keep each card's distinct heights, so a shift anywhere in it is caught -
  // and a run where the held response landed before the rows rendered is
  // visible as `framesWithNoStopRows: 0` instead of passing quietly.
  const frames = [];
  const deadline = Date.now() + DELAY_MS + 4000;
  while (Date.now() < deadline) {
    frames.push({ t: Date.now(), cards: await measureHeights(page) });
    await page.waitForTimeout(100);
  }
  const before = frames[0].cards;
  const after = frames[frames.length - 1].cards;
  const framesWithNoStopRows = frames.filter((f) =>
    f.cards.every((c) => c.stopRows === 0)
  ).length;
  const framesWithStopRows = frames.filter((f) =>
    f.cards.every((c) => c.stopRows > 0)
  ).length;
  const distinctHeights = before.map((_, i) => ({
    index: i,
    heights: [...new Set(frames.map((f) => f.cards[i]?.height).filter((h) => h !== undefined))],
  }));

  const themeApplied = await page.evaluate(() => document.body.classList.contains('is-dark'));

  const shifted = before
    .map((row, i) => ({ index: i, from: row.height, to: after[i]?.height }))
    .filter((row) => row.to !== undefined && row.from !== row.to);

  await page.screenshot({
    path: path.join(OUT, `OBRS-864-${LABEL === 'before' ? 'BEFORE' : 'AFTER'}-stop-detail-${LANG}-${THEME}.png`),
    fullPage: false,
  });

  const report = {
    tag,
    label: LABEL,
    lang: LANG,
    theme: THEME,
    themeAppliedToBody: themeApplied,
    heldPickupDropoffResponses: held,
    delayMs: DELAY_MS,
    cardsMeasured: before.length,
    framesSampled: frames.length,
    framesWithNoStopRows,
    framesWithStopRows,
    distinctHeightsPerCardAcrossAllFrames: distinctHeights,
    heightsFirstFrame: before,
    heightsLastFrame: after,
    cardsThatChangedHeight: shifted,
    apiRequestsTotal: requests.length,
    apiRequestsAfterSearch: requests.filter((r) => r.afterSearchMs !== null).length,
    apiRequestsByPath: requests.reduce((acc, r) => {
      const key = `${r.method} ${r.path}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  };
  await writeFile(path.join(OUT, `measure-${tag}.json`), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
