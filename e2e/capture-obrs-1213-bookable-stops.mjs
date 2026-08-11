/**
 * OBRS-1213 visual evidence — the /home origin and destination dropdowns.
 *
 * Run TWICE with nothing changed but `--label` and `OBRS_BASE_URL`: once
 * against live prod (BEFORE — the unfixed code) and once against a dev server
 * serving this branch (AFTER). SIT and prod carry byte-identical route data
 * (measured 2026-08-10: 28 stops, 2 routes, 24 origins / 10 destinations, the
 * same four non-origins), so the pair is a controlled comparison.
 *
 *   OBRS_BASE_URL=https://nj-phuyaipu.com node e2e/capture-obrs-1213-bookable-stops.mjs --label before
 *   OBRS_BASE_URL=http://localhost:4200   node e2e/capture-obrs-1213-bookable-stops.mjs --label after
 *
 * It PRINTS every option it reads out of the DOM, plus a per-endpoint count of
 * the API requests the page issued (AC#4). A count and a name list are evidence
 * a reviewer can check; a PNG alone asks them to trust my eyes.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
// `e2e/out/` is gitignored: the capture evidence lives on the Jira card, which
// is the review surface; the SCRIPT is what the repo keeps.
const OUT = path.resolve('e2e/out/obrs-1213');
const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  if (i === -1 || !process.argv[i + 1]) {
    throw new Error('--label <before|after> is required — an unlabelled pair proves nothing');
  }
  return process.argv[i + 1];
})();

/** The four stops the card is about: `dropoff` on `chonburi_bangkok` and on no
 *  pickup list anywhere, so they can never be an origin. */
const NEVER_AN_ORIGIN = [
  'แอร์พอร์ทลิงค์ลาดกระบัง',
  'BTS หมอชิต',
  'ห้าแยกลาดพร้าว',
  'ศรีนครินทร์',
];

/** Opens the dropdown whose label starts with `labelText` and returns its
 *  option strings. The control is a Bootstrap dropdown: the trigger is a
 *  `.dropdown-btn`, the options are `a.dropdown-option` inside the menu. */
async function readDropdown(page, index) {
  const group = page.locator('app-home-booking app-dropdown-group-obrs').nth(index);
  const menu = group.locator('.dropdown-menu');

  if (!(await menu.isVisible())) {
    // The menu opens upward and is taller than the fold, so without this the
    // screenshot shows a list clipped by the top of the viewport.
    await group.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 260));
    await page.waitForTimeout(200);
    await group.locator('.dropdown-btn').click();
    await page.waitForTimeout(300);
  }

  const options = await group.locator('a.dropdown-option').allInnerTexts();
  return options.map((o) => o.trim()).filter(Boolean);
}

/**
 * Types `term` into the open dropdown's search box and returns what survives.
 *
 * This is the legible half of the evidence: 24 options do not fit one
 * screenshot, but "search ลาดพร้าว in ORIGIN" is one line either way — a stop
 * before, nothing after. The same term in DESTINATION still finds it, which is
 * what shows the stop was filtered by ROLE and not simply deleted.
 */
async function searchInDropdown(page, index, term) {
  const group = page.locator('app-home-booking app-dropdown-group-obrs').nth(index);
  await group.locator('.dropdown-search-input').fill(term);
  await page.waitForTimeout(400);
  const options = await group.locator('a.dropdown-option').allInnerTexts();
  return options.map((o) => o.trim()).filter(Boolean);
}

async function closeDropdown(page, index) {
  const group = page.locator('app-home-booking app-dropdown-group-obrs').nth(index);
  if (await group.locator('.dropdown-menu').isVisible()) {
    await group.locator('.dropdown-btn').click();
    await page.waitForTimeout(200);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();

  // AC#4: every API request the page issues, counted per endpoint. Recorded
  // from the very first navigation so the "before" and "after" totals are
  // comparable without hand-waving.
  const apiCalls = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/')) {
      apiCalls.push(url.replace(/^https?:\/\/[^/]+/, ''));
    }
  });

  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const report = { label: LABEL, base: BASE };

  // ---- origin dropdown -----------------------------------------------------
  const origins = await readDropdown(page, 0);
  report.originCount = origins.length;
  report.origins = origins;
  report.neverAnOriginStillOffered = NEVER_AN_ORIGIN.filter((n) => origins.includes(n));

  await page.screenshot({
    path: path.join(OUT, `OBRS-1213-${LABEL.toUpperCase()}-0-origin-dropdown.png`),
    fullPage: false,
  });

  // The readable proof: "ลาดพร้าว" matches exactly one stop in the system, and
  // that stop is a drop-off on `chonburi_bangkok` and a pickup nowhere.
  report.originSearchLatPhrao = await searchInDropdown(page, 0, 'ลาดพร้าว');
  await page.screenshot({
    path: path.join(OUT, `OBRS-1213-${LABEL.toUpperCase()}-3-origin-search-lat-phrao.png`),
    fullPage: false,
  });

  // "หมอชิต" matches TWO stops — `บขส. หมอชิต (หมอชิต 2)` (a real pickup) and
  // `BTS หมอชิต` (drop-off only). Only the second may disappear; a filter that
  // took both would be over-filtering, and this shot is what tells them apart.
  report.originSearchMoChit = await searchInDropdown(page, 0, 'หมอชิต');
  await page.screenshot({
    path: path.join(OUT, `OBRS-1213-${LABEL.toUpperCase()}-4-origin-search-mo-chit.png`),
    fullPage: false,
  });

  await searchInDropdown(page, 0, '');
  await closeDropdown(page, 0);

  // ---- destination dropdown, no origin chosen ------------------------------
  const destinations = await readDropdown(page, 1);
  report.destinationCount = destinations.length;
  report.destinations = destinations;

  await page.screenshot({
    path: path.join(OUT, `OBRS-1213-${LABEL.toUpperCase()}-1-destination-dropdown.png`),
    fullPage: false,
  });

  // The control for the shot above: the same term the ORIGIN box now finds
  // nothing for still finds the stop here, so this is a role filter and not a
  // stop that vanished from the system.
  report.destinationSearchLatPhrao = await searchInDropdown(page, 1, 'ลาดพร้าว');
  await page.screenshot({
    path: path.join(OUT, `OBRS-1213-${LABEL.toUpperCase()}-5-destination-search-lat-phrao.png`),
    fullPage: false,
  });

  await searchInDropdown(page, 1, '');
  await closeDropdown(page, 1);

  // ---- destination dropdown AFTER choosing an origin (AC#3) ----------------
  // "หนองชาก" is the first pickup on `chonburi_bangkok`; picking it must leave
  // only the stops the van reaches after it.
  await page.locator('app-home-booking app-dropdown-group-obrs').nth(0).locator('.dropdown-btn').click();
  await page.waitForTimeout(300);
  await page
    .locator('app-home-booking app-dropdown-group-obrs')
    .nth(0)
    .locator('a.dropdown-option', { hasText: 'หนองชาก' })
    .first()
    .click();
  await page.waitForTimeout(600);

  const narrowed = await readDropdown(page, 1);
  report.chosenOrigin = 'หนองชาก';
  report.destinationsAfterOriginCount = narrowed.length;
  report.destinationsAfterOrigin = narrowed;

  await page.screenshot({
    path: path.join(OUT, `OBRS-1213-${LABEL.toUpperCase()}-2-destinations-for-nong-chak.png`),
    fullPage: false,
  });

  // ---- request accounting --------------------------------------------------
  const byEndpoint = {};
  for (const call of apiCalls) {
    byEndpoint[call] = (byEndpoint[call] ?? 0) + 1;
  }
  report.apiRequestTotal = apiCalls.length;
  report.apiRequestsByEndpoint = byEndpoint;

  await writeFile(
    path.join(OUT, `OBRS-1213-${LABEL}-result.json`),
    JSON.stringify(report, null, 2),
    'utf8'
  );

  console.log(JSON.stringify(report, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
