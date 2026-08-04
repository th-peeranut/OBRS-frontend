/**
 * OBRS-1027 visual evidence — the "ช่วงเส้นทางและค่าโดยสาร" card on /admin/routes.
 *
 * Run against a dev server pointed at the SIT backend (`npm start`, i.e.
 * `ng serve --configuration sit`), because the card is about REAL fare data:
 * a mocked route with three tidy rows would not show the thing the owner
 * complained about (a long list, one origin repeated on every row, one vehicle
 * type at a time).
 *
 *   npm start                     # separate terminal, serves :4200
 *   node e2e/capture-obrs-1027-segments-table.mjs --label after
 *
 * Beyond the screenshots the script PRINTS what it measured — column headers,
 * row counts, the page-size control's value, the group-header chips. A PNG is
 * only evidence for whoever squints at it; the printed numbers are checkable
 * (CORE.md: measure, don't eyeball).
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const EMAIL = process.env.SIT_OWNER_EMAIL ?? 'owner@system.local';
const PASSWORD = process.env.SIT_PASSWORD;
const OUT = path.resolve('e2e/out/obrs-1027');

const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  if (i === -1 || !process.argv[i + 1]) {
    throw new Error('--label <before|after> is required — an unlabelled pair proves nothing');
  }
  return process.argv[i + 1];
})();

if (!PASSWORD) {
  throw new Error('SIT_PASSWORD is not set; refusing to guess (the account locks after 5 tries)');
}

// The SIT password is 8 characters. A 16-character value means DB_PASSWORD was
// reached for by mistake — check it here rather than spending a login attempt.
if (PASSWORD.length !== 8) {
  throw new Error(
    `SIT_PASSWORD is ${PASSWORD.length} characters; the SIT login password is 8. ` +
      'This is almost certainly the DB password, which would burn a login attempt for nothing.'
  );
}

async function shoot(page, name) {
  const file = path.join(OUT, `${LABEL}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  shot: ${file}`);
}

/** The segments card, located by its heading rather than by a class, so a
 *  restyle cannot silently point the camera at the wrong card. */
function segmentsCard(page) {
  return page.locator('article.admin-card', {
    has: page.locator('h4', { hasText: 'ช่วงเส้นทางและค่าโดยสาร' }),
  });
}

async function describeTable(page, when) {
  const card = segmentsCard(page);
  const headers = await card.locator('table thead th').allTextContents();
  const groupRows = await card.locator('tbody tr.group-row').count();
  const dataRows = await card.locator('tbody tr:not(.group-row)').count();
  const footer = (await card.locator('.admin-table-footer').first().innerText()).replace(/\s+/g, ' ');

  console.log(`\n[${when}]`);
  console.log(`  columns   : ${headers.map((h) => h.replace(/\s+/g, ' ').trim()).join(' | ')}`);
  console.log(`  group rows: ${groupRows}`);
  console.log(`  data rows : ${dataRows}`);
  console.log(`  footer    : ${footer}`);

  const chips = await card.locator('tbody tr.group-row .chip').allTextContents();
  if (chips.length) {
    console.log(`  chips     : ${chips.map((c) => c.replace(/\s+/g, ' ').trim()).join(' · ')}`);
  }

  // Measured, not eyeballed: the per-vehicle-type edit buttons wrapping onto a
  // second line doubles the height of every data row, which is the opposite of
  // what this card is for. Same `top` for both = one line.
  if (dataRows > 0) {
    const actions = card.locator('tbody tr:not(.group-row)').first().locator('.edit-fare-btn');
    const tops = await actions.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    const wrap = await card
      .locator('tbody tr:not(.group-row)')
      .first()
      .locator('.admin-inline-actions')
      .evaluate((el) => getComputedStyle(el).flexWrap);
    const rowHeight = await card
      .locator('tbody tr:not(.group-row)')
      .first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().height));
    console.log(
      `  actions   : ${tops.length} button(s), top=[${tops.join(', ')}] flex-wrap=${wrap} ` +
        `rowHeight=${rowHeight}px → ${new Set(tops).size === 1 ? 'ONE LINE' : 'WRAPPED'}`
    );
  }

  // Horizontal overflow is allowed (the wrap scrolls) but it hides the row
  // action, so it has to be a number in the evidence rather than a shrug.
  const overflow = await card
    .locator('.admin-table-wrap')
    .evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  console.log(
    `  width     : table ${overflow.scroll}px in ${overflow.client}px → ` +
      (overflow.scroll > overflow.client ? `OVERFLOW by ${overflow.scroll - overflow.client}px` : 'fits')
  );

  return { headers, groupRows, dataRows };
}

const browser = await chromium.launch();
// 1536x864 at 125% is the user's real desktop (see verify-visuals-by-measurement).
const context = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await context.newPage();

await mkdir(OUT, { recursive: true });

console.log(`base=${BASE} label=${LABEL}`);

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('#email').fill(EMAIL);
await page.locator('#password').fill(PASSWORD);
await page.locator('button[type="submit"]').click();
await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 60_000 });
console.log(`logged in as ${EMAIL}`);

await page.goto(`${BASE}/admin/routes`, { waitUntil: 'domcontentloaded' });
await page.locator('table tbody tr').first().waitFor({ timeout: 60_000 });

// Open the first route so the detail panel below the list has data.
await page.locator('table tbody tr').first().click();
await segmentsCard(page).locator('tbody tr').first().waitFor({ timeout: 60_000 });
await page.waitForTimeout(500);

await segmentsCard(page).scrollIntoViewIfNeeded();
await describeTable(page, 'default view');
await shoot(page, '01-default');
await segmentsCard(page).screenshot({ path: path.join(OUT, `${LABEL}-02-card.png`) });

// Collapse-all: the overview the owner asked for.
const collapseAll = segmentsCard(page).getByRole('button', { name: 'ยุบทั้งหมด' });
if (await collapseAll.isEnabled().catch(() => false)) {
  await collapseAll.click();
  await page.waitForTimeout(300);
  await describeTable(page, 'after collapse all');
  await segmentsCard(page).screenshot({ path: path.join(OUT, `${LABEL}-03-collapsed.png`) });

  // Searching while collapsed: a match must NOT stay hidden inside a collapsed
  // group, so the table expands temporarily and says so in the footer.
  const search = segmentsCard(page).locator('.admin-search input');
  await search.fill('หมอชิต');
  await page.waitForTimeout(400);
  await describeTable(page, 'search while collapsed');
  await segmentsCard(page).screenshot({ path: path.join(OUT, `${LABEL}-04-search.png`) });

  await search.fill('');
  await page.waitForTimeout(400);
  const stillCollapsed = await segmentsCard(page).locator('tbody tr:not(.group-row)').count();
  console.log(
    `\n[after clearing the keyword] data rows = ${stillCollapsed} → ` +
      (stillCollapsed === 0 ? 'collapse state RESTORED' : 'collapse state LOST')
  );

  await segmentsCard(page).getByRole('button', { name: 'คลี่ทั้งหมด' }).click();
  await page.waitForTimeout(300);
} else {
  console.log('\n[collapse all] button not present/enabled — nothing captured');
}

await browser.close();
console.log('\ndone');
