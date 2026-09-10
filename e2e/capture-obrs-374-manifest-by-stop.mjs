/**
 * OBRS-374 evidence -- the boarding manifest is grouped by PICKUP STOP, and staff can filter it
 * down to the one stop they are standing at.
 *
 * Run it twice against the SAME stack and the SAME local database (obrs374qa), once per branch
 * state:
 *
 *   # BEFORE -- worktree still on origin/dev's code
 *   OBRS_VARIANT=BEFORE OBRS_OUT_DIR=e2e/out/obrs-374/before node e2e/capture-obrs-374-manifest-by-stop.mjs
 *   # AFTER -- worktree carrying the OBRS-374 change
 *   OBRS_VARIANT=AFTER  OBRS_OUT_DIR=e2e/out/obrs-374/after  node e2e/capture-obrs-374-manifest-by-stop.mjs
 *
 * The seeded trip (schedule 1) deliberately INTERLEAVES its pickup stops against seat order --
 * seats 1/4/7 = Ban Bueng, 2/5/8 = Nong Chak, 3/6 = Chonburi -- so "ordered by seat" and "grouped
 * by stop" cannot photograph the same. That is the whole point of the fixture: on a trip whose
 * stops happen to already follow seat order the two states are indistinguishable and the image
 * would prove nothing.
 *
 * Every screen also PRINTS the (stop, seat) pairs it actually read out of the DOM, so the log is
 * evidence in its own right and a silently-empty table cannot pass as a pass.
 *
 * Screens:
 *   1-manifest.png        /staff/boarding/1 -- the whole manifest
 *   2-filtered.png        the same screen with the stop filter narrowed to one stop (AFTER only;
 *                         on BEFORE there is no such control and the script says so instead of
 *                         inventing one)
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4287';
const VARIANT = process.env.OBRS_VARIANT ?? 'AFTER';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve(`e2e/out/obrs-374/${VARIANT.toLowerCase()}`);
const PASSWORD = process.env.OBRS_QA_PASSWORD ?? 'P@ssw0rd';
const EMAIL = process.env.OBRS_STAFF_EMAIL ?? 'driver@system.local';
const SCHEDULE_ID = process.env.OBRS_SCHEDULE_ID ?? '1';
const FILTER_STOP = process.env.OBRS_FILTER_STOP ?? 'Nong Chak';

const measured = {};

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 });
}

/**
 * Reads the manifest table row by row. A group-header row has no seat cell, so it is reported as
 * `{ header }`; a passenger row is reported as `{ seat, stop }` off the SEAT and FROM columns.
 * Reading both shapes in one pass is what lets the BEFORE run (no headers at all) and the AFTER
 * run (headers between groups) be compared without two different readers.
 */
async function readManifest(page) {
  return page.evaluate(() => {
    const table = document.querySelector('.table');
    if (!table) return [];
    return [...table.querySelectorAll('tbody tr')].map((tr) => {
      const cells = [...tr.querySelectorAll('td')];
      if (cells.length === 1) {
        return { header: cells[0].innerText.replace(/\s+/g, ' ').trim() };
      }
      if (cells.length < 5) return null;
      return {
        seat: cells[1].innerText.trim(),
        stop: cells[3].innerText.trim(),
      };
    }).filter(Boolean);
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(() => window.localStorage.setItem('app_language', 'th'));
  const page = await ctx.newPage();

  await login(page);
  await page.goto(`${BASE}/staff/boarding/${SCHEDULE_ID}`, { waitUntil: 'networkidle' });
  await page.locator('table tbody tr').first().waitFor({ timeout: 30000 });

  measured['1-manifest'] = await readManifest(page);
  await page.screenshot({ path: path.join(OUT, '1-manifest.png'), fullPage: true });
  console.log(`1-manifest.png  rows = ${JSON.stringify(measured['1-manifest'])}`);

  // The stop filter only exists on the AFTER build. Probing for it rather than assuming it is what
  // makes the BEFORE run report its absence instead of failing on a missing selector.
  const filter = page.locator('[data-testid="boarding-stop-filter"]');
  if (await filter.count()) {
    // app-admin-dropdown is a button + a list of option buttons, not a native <select>, so the
    // stop is chosen the way a driver chooses it: open the trigger, click the row.
    await filter.locator('.admin-dropdown-trigger').click();
    await filter.locator('.admin-dropdown-option', { hasText: FILTER_STOP }).first().click();
    await page.waitForTimeout(300);
    measured['2-filtered'] = await readManifest(page);
    await page.screenshot({ path: path.join(OUT, '2-filtered.png'), fullPage: true });
    console.log(`2-filtered.png  stop=${FILTER_STOP}  rows = ${JSON.stringify(measured['2-filtered'])}`);
  } else {
    measured['2-filtered'] = 'NO STOP FILTER CONTROL ON THIS BUILD';
    console.log('2-filtered  skipped -- no [data-testid="boarding-stop-filter"] in the DOM');
  }

  // AC-7 is the card's explicit NON-goal: grouping and filtering must not gate boarding. Proving it
  // by boarding a passenger who is CURRENTLY HIDDEN by the filter is the only version of this claim
  // that a screenshot can carry -- a passing unit test cannot show the owner that the count moved.
  if (await filter.count()) {
    const hiddenStop = measured['1-manifest']
      .filter((r) => r.stop && r.stop !== FILTER_STOP)
      .map((r) => r.stop)[0];
    if (hiddenStop) {
      const before = measured['2-filtered'];
      // Board the first row of the stop that is NOT on screen, through the same API the row button
      // calls, then clear the filter and read the header counts back.
      await page.evaluate(async (stop) => {
        const token = window.localStorage.getItem('auth_token') ?? '';
        const list = await (await fetch('http://localhost:8080/api/private/schedules/1/boarding-list', {
          headers: { Authorization: `Bearer ${token}` },
        })).json();
        const rows = list.data ?? list;
        const target = rows.find((r) => r.fromStop === stop && !r.boardedAt);
        if (!target) return 'no unboarded row at that stop';
        const res = await fetch(`http://localhost:8080/api/private/tickets/${target.ticketId}/board`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` },
        });
        return `${res.status}`;
      }, hiddenStop).then((r) => console.log(`  boarded a hidden ${hiddenStop} row -> ${r}`));

      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('table tbody tr').first().waitFor({ timeout: 30000 });
      measured['3-scan-across-groups'] = await readManifest(page);
      await page.screenshot({ path: path.join(OUT, '3-scan-across-groups.png'), fullPage: true });
      console.log(`3-scan-across-groups.png  filtered-before = ${JSON.stringify(before.filter((r) => r.header))}`);
      console.log(`3-scan-across-groups.png  headers-after   = ${JSON.stringify(measured['3-scan-across-groups'].filter((r) => r.header))}`);
    }
  }

  await writeFile(path.join(OUT, 'measured.json'), JSON.stringify({ variant: VARIANT, measured }, null, 2));
  await ctx.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
