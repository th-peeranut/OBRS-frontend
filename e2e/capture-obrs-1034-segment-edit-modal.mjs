/**
 * OBRS-1034 visual evidence — the fare edit modal on /admin/routes.
 *
 * Runs against a dev server pointed at the SIT backend (`ng serve --configuration sit`),
 * because the card is about REAL fare data: the modal has to show both vehicle types of
 * one stop pair, and a mocked pair would not prove that.
 *
 *   npx ng serve --configuration sit --port 4200      # separate terminal
 *   SIT_PASSWORD=... node e2e/capture-obrs-1034-segment-edit-modal.mjs --label after
 *
 * READ-ONLY: it opens the modal and closes it. It never presses Save — the fare column
 * is money data on a shared environment (the save paths are proven by the unit specs).
 *
 * The same script runs against the BEFORE tree (one edit button per vehicle type, one
 * fare input) and the AFTER tree (one edit button per pair, one fare input per vehicle
 * type) — everything it asserts is counted and printed, not assumed.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const EMAIL = process.env.SIT_OWNER_EMAIL ?? 'owner@system.local';
const PASSWORD = process.env.SIT_PASSWORD;
const OUT = path.resolve('e2e/out/obrs-1034');

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
if (PASSWORD.length !== 8) {
  throw new Error(`SIT_PASSWORD is ${PASSWORD.length} characters; the SIT login password is 8.`);
}

/** Located by the fare-edit button it contains, not by its heading: the heading is
 *  translated, and this script runs the same page in th / en / zh. */
function segmentsCard(page) {
  return page.locator('article.admin-card', { has: page.locator('.edit-fare-btn') }).first();
}

/** The edit modal, located by the dialog that holds the duration control — the one
 *  control both trees have, under the same formControlName. */
function modal(page) {
  return page
    .locator('app-segment-edit-modal .admin-modal')
    .filter({ has: page.locator('[formControlName="estimatedDurationMinutes"]') })
    .first();
}

/** Every raw i18n key visible as text: UPPER.DOTTED.TOKENS that the translate pipe
 *  failed to resolve. `0` is the only passing answer. */
async function rawKeys(scope) {
  const text = await scope.innerText();
  return [...text.matchAll(/\b[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)+\b/g)].map((m) => m[0]);
}

async function describeModal(page, when) {
  const box = modal(page);
  const controls = await box.locator('input, select, textarea').evaluateAll((els) =>
    els.map((el) => ({
      name: el.getAttribute('formControlName') ?? '(none)',
      group: el.closest('[formGroupName]')?.getAttribute('formGroupName') ?? '',
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') ?? '',
      value: 'value' in el ? String(el.value) : '',
      label:
        el.closest('.admin-form-field, .field, label, div')?.querySelector('label')?.textContent?.trim() ??
        '',
    }))
  );

  const durationCount = await box.locator('[formControlName="estimatedDurationMinutes"]').count();
  // Everything numeric that is not the duration control IS a fare control. Counting by
  // `formControlName` misses them: the AFTER tree binds `[formControlName]` to a computed
  // name, and a property binding leaves no attribute in the DOM to read back.
  const fareInputs = controls.filter(
    (c) => c.type === 'number' && c.name !== 'estimatedDurationMinutes'
  );
  const keys = await rawKeys(box);

  console.log(`\n[modal — ${when}]`);
  for (const c of controls) {
    console.log(
      `  control   : ${c.group ? c.group + '.' : ''}${c.name} (${c.tag}${c.type ? '/' + c.type : ''})` +
        ` value="${c.value}" label="${c.label}"`
    );
  }
  console.log(`  fare inputs     : ${fareInputs.length}`);
  console.log(`  duration inputs : ${durationCount}  → ${durationCount === 1 ? 'ONE (AC5 ok)' : 'NOT ONE'}`);
  console.log(`  raw i18n keys   : ${keys.length}${keys.length ? ' → ' + keys.join(', ') : ' (none)'}`);
  return { controls, fareInputs, durationCount, keys };
}

async function describeRow(page) {
  const card = segmentsCard(page);
  const headers = (await card.locator('table thead th').allTextContents()).map((h) =>
    h.replace(/\s+/g, ' ').trim()
  );
  const row = card.locator('tbody tr:not(.group-row)').first();
  const cells = (await row.locator('td').allTextContents()).map((c) => c.replace(/\s+/g, ' ').trim());
  const editButtons = await row.locator('.edit-fare-btn').count();

  console.log(`\n[table]`);
  console.log(`  columns      : ${headers.join(' | ')}`);
  console.log(`  first row    : ${cells.join(' | ')}`);
  console.log(`  edit buttons : ${editButtons} on that row`);
  return { headers, cells, editButtons };
}

async function setTheme(page, mode) {
  await page.evaluate((m) => {
    localStorage.setItem('app_admin_theme', m);
    document.body.classList.toggle('is-dark', m === 'dark');
  }, mode);
  await page.waitForTimeout(400);
}

async function setLanguage(page, lang) {
  await page.evaluate((l) => localStorage.setItem('app_language', l), lang);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
// 1536x864 at 125% is the user's real desktop (verify-visuals-by-measurement).
const context = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await context.newPage();

console.log(`base=${BASE} label=${LABEL}`);

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('#email').fill(EMAIL);
await page.locator('#password').fill(PASSWORD);
await page.locator('button[type="submit"]').click();
await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 60_000 });
console.log(`logged in as ${EMAIL}`);

/** Open the route detail, open the first row's edit modal, and shoot it. */
async function openModal() {
  // Pick the first route that actually HAS priced segments. Not every route does
  // ("this route has no segments yet"), and which one sorts first is not stable, so
  // clicking row 1 blindly lands on an empty panel about half the time.
  await page.goto(`${BASE}/admin/routes`, { waitUntil: 'domcontentloaded' });
  // Scoped to the route-list component: `.admin-card table` also matches the stop-order
  // and segments cards, whose rows are not routes and are not clickable.
  // `:not(.admin-skeleton-row)` is the load-completion signal: the table renders five
  // skeleton rows while the fetch is in flight, and waiting on a bare `tr` is satisfied
  // by those — which is what made this script flaky, not the language.
  const routeRows = page.locator(
    'app-route-list-table table tbody tr:not(.admin-skeleton-row):not(.admin-empty-row)'
  );
  await routeRows.first().waitFor({ timeout: 45_000 });
  await page.waitForTimeout(800);

  const routeCount = await routeRows.count();
  let opened = false;
  for (let i = 0; i < routeCount; i++) {
    await routeRows.nth(i).click();
    await page.waitForTimeout(4000);
    if ((await segmentsCard(page).locator('.edit-fare-btn').count()) > 0) {
      console.log(`  route row ${i + 1}/${routeCount} has priced segments — using it`);
      opened = true;
      break;
    }
    console.log(`  route row ${i + 1}/${routeCount} has no segments — trying the next`);
  }
  if (!opened) {
    const rowTexts = await routeRows.allTextContents();
    console.log(`  route rows seen: ${rowTexts.map((t) => t.replace(/\s+/g, ' ').trim().slice(0, 60)).join(' || ')}`);
    console.log(`  cards on page  : ${await page.locator('article.admin-card').count()}`);
    console.log(`  edit buttons   : ${await page.locator('.edit-fare-btn').count()} anywhere on the page`);
    throw new Error(`none of the ${routeCount} routes has a priced segment to edit`);
  }
  await page.waitForTimeout(500);
  await segmentsCard(page).scrollIntoViewIfNeeded();

  const table = await describeRow(page);

  await segmentsCard(page).locator('tbody tr:not(.group-row)').first().locator('.edit-fare-btn').first().click();
  await modal(page).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
  return table;
}

const LANGS = (process.env.OBRS_LANGS ?? 'th,en,zh').split(',');

for (const lang of LANGS) {
  await setLanguage(page, lang);
  await page.reload({ waitUntil: 'domcontentloaded' });

  let table;
  try {
    table = await openModal();
  } catch (err) {
    const shot = path.join(OUT, `${LABEL}-${lang}-FAILED.png`);
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`\n[${lang}] FAILED to reach the modal — page shot: ${shot}\n  ${err.message.split('\n')[0]}`);
    continue;
  }
  console.log(`\n=== language: ${lang} ===`);

  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    const seen = await describeModal(page, `${lang}/${theme}`);
    const file = path.join(OUT, `${LABEL}-${lang}-${theme}.png`);
    await modal(page).screenshot({ path: file });
    console.log(`  shot: ${file}`);

    if (lang === 'th' && theme === 'light') {
      // AC1: the fares in the modal must be the fares the table shows for that pair.
      console.log(`  table cells were: ${table.cells.join(' | ')}`);
      console.log(`  modal fare values: ${seen.fareInputs.map((f) => f.value).join(' | ') || '(none)'}`);
    }
  }

  await setTheme(page, 'light');
  await page.keyboard.press('Escape').catch(() => {});
}

await browser.close();
console.log('\ndone');
