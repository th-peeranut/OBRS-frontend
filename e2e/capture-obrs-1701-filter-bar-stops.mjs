/**
 * OBRS-1701 visual evidence — the /schedule-booking filter bar's origin and
 * destination dropdowns.
 *
 * The twin of `capture-obrs-1213-bookable-stops.mjs`, aimed one screen to the
 * right. Run TWICE with nothing changed but `--label` and `OBRS_BASE_URL`:
 * once against live prod (BEFORE — the unfixed code) and once against a dev
 * server serving this branch (AFTER). SIT and prod carry identical route data
 * (measured 2026-09-01 against both routes' `pickup-dropoff`: 18/6 and
 * 5/20 stops, 23 origins, 28 stops on the roster), so the pair is a controlled
 * comparison and not two different systems.
 *
 *   OBRS_BASE_URL=https://nj-phuyaipu.com node e2e/capture-obrs-1701-filter-bar-stops.mjs --label before
 *   OBRS_BASE_URL=http://localhost:4200   node e2e/capture-obrs-1701-filter-bar-stops.mjs --label after
 *
 * It PRINTS every option it reads out of the DOM plus the counts, because a
 * PNG of a scrolled list asks a reviewer to trust my eyes about what is below
 * the fold — 27 options do not fit one screenshot and 6 do.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
// `e2e/out/` is gitignored: the evidence lives on the Jira card, the SCRIPT is
// what the repo keeps.
const OUT = path.resolve('e2e/out/obrs-1701');
const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  if (i === -1 || !process.argv[i + 1]) {
    throw new Error('--label <before|after> is required — an unlabelled pair proves nothing');
  }
  return process.argv[i + 1];
})();

const FILTER = 'app-schedule-booking-filter app-dropdown-group-obrs';

/**
 * Every stop that is a `dropoff` somewhere and a `pickup` nowhere — it can
 * never be an origin, and the bar offered all of them before the fix.
 *
 * All FIVE of them, derived from the prod API on 2026-09-01 (28 on the roster
 * minus the 23-stop union of both routes' `pickup`), not from the four Bangkok
 * names this list first carried by memory. ตลาดเนื่องจำนงค์ is the one a
 * remembered list drops: it reads as an ordinary Chonburi stop and is a
 * drop-off on the inbound route only.
 */
const NEVER_AN_ORIGIN = [
  'ตลาดเนื่องจำนงค์',
  'แอร์พอร์ทลิงค์ลาดกระบัง',
  'BTS หมอชิต',
  'ห้าแยกลาดพร้าว',
  'ศรีนครินทร์',
];

/** Chonburi stops that the van has already passed by the time it leaves
 *  หนองชาก (its first pickup) — none may appear as a destination for it. */
const NOT_REACHABLE_FROM_NONG_CHAK = [
  'ตลาดเนื่องจำนงค์',
  'วิทยาลัยเทคนิคชลบุรี',
  'บ้านบึง (ตลาดวิศิษฐ์ชัย)',
];

async function openDropdown(page, index) {
  const group = page.locator(FILTER).nth(index);
  const menu = group.locator('.dropdown-menu');
  if (!(await menu.isVisible())) {
    await group.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(200);
    await group.locator('.dropdown-btn').click();
    await page.waitForTimeout(400);
  }
  return group;
}

async function readDropdown(page, index) {
  const group = await openDropdown(page, index);
  const options = await group.locator('a.dropdown-option').allInnerTexts();
  return options.map((o) => o.trim()).filter(Boolean);
}

/** The province headings the menu renders, if any. Empty before the fix — the
 *  grouped branch only fires when the options arrive already bucketed. */
async function readGroupHeadings(page, index) {
  const group = page.locator(FILTER).nth(index);
  const headings = await group.locator('li.dropdown-header').allInnerTexts();
  return headings.map((h) => h.trim()).filter(Boolean);
}

async function closeDropdown(page, index) {
  const group = page.locator(FILTER).nth(index);
  if (await group.locator('.dropdown-menu').isVisible()) {
    await group.locator('.dropdown-btn').click();
    await page.waitForTimeout(200);
  }
}

async function chooseOption(page, index, text) {
  await openDropdown(page, index);
  await page
    .locator(FILTER)
    .nth(index)
    .locator('a.dropdown-option', { hasText: text })
    .first()
    .click();
  await page.waitForTimeout(600);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/schedule-booking`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const report = { label: LABEL, base: BASE, screen: '/schedule-booking' };

  // ---- origin dropdown -----------------------------------------------------
  const origins = await readDropdown(page, 0);
  report.originCount = origins.length;
  report.origins = origins;
  report.neverAnOriginStillOffered = NEVER_AN_ORIGIN.filter((n) => origins.includes(n));
  report.originGroupHeadings = await readGroupHeadings(page, 0);

  await page.screenshot({
    path: path.join(OUT, `OBRS-1701-${LABEL.toUpperCase()}-0-origin-dropdown.png`),
  });
  await closeDropdown(page, 0);

  // ---- the reported case: destinations for หนองชาก -------------------------
  // The owner's two screenshots are exactly this pair — same origin, /home
  // offering 6 and this bar offering the whole roster.
  await chooseOption(page, 0, 'หนองชาก');

  const destinations = await readDropdown(page, 1);
  report.chosenOrigin = 'หนองชาก';
  report.destinationCount = destinations.length;
  report.destinations = destinations;
  report.unreachableStillOffered = NOT_REACHABLE_FROM_NONG_CHAK.filter((n) =>
    destinations.includes(n)
  );
  report.destinationGroupHeadings = await readGroupHeadings(page, 1);

  await page.screenshot({
    path: path.join(OUT, `OBRS-1701-${LABEL.toUpperCase()}-1-destinations-for-nong-chak.png`),
  });
  await closeDropdown(page, 1);

  await writeFile(
    path.join(OUT, `OBRS-1701-${LABEL}-result.json`),
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
