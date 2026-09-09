// Standalone capture script for OBRS-1732 visual evidence (not a Playwright test, not part of the
// suite -- same lane as capture-obrs677.js/capture-obrs1690.js: the script is the reproducible
// part, the PNGs are not committed).
//
// usage: node e2e/scripts/capture-obrs1732.js <baseUrl>
//
// NO backend. AuthService.isAuthenticated() is a pure localStorage check and 'admin' clears the
// AdminGuard, so seeding auth_token/auth_username/auth_roles gets us onto /admin/vehicle-pl-report;
// every /api/** call is stubbed.
//
// BEFORE and AFTER come off ONE dev server, and that is legitimate here for the same reason it was
// on OBRS-1690: this card changes NO component and NO style on this page. The panel resolves its
// category names dynamically (`categoryLabel()` -> ADMIN.EXPENSES.CATEGORIES.<code>), so the only
// thing that differs between the two frames is the DATA the server would send - which is exactly
// what the migration changes. Serving the two payloads is therefore a faithful reproduction of
// before-migration and after-migration, not a composed frame.
//
// ⚠️ NOTHING HERE IS INVENTED. Both payloads are generated from the same import payload that
// produced prod (`expenses-batches.json` + `revenue-batches.json`, filtered to 2025):
//   obrs1732-pl-before.json  what prod holds today - one OTHER bar of 616,037.94 over 186 rows
//   obrs1732-pl-after.json   what V136+V137 produced when run against those rows on a throwaway
//                            Postgres: OTHER 313,744.00 over 105 rows, plus the five new codes
// The central total is 676,831.94 on BOTH sides: the money only moves between bars, and a frame
// where it did not would mean the migration lost or duplicated something.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:4310';
const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1732');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const BEFORE = require('./obrs1732-pl-before.json');
const AFTER = require('./obrs1732-pl-after.json');

const ok = (data) => ({ code: 200, message: 'OK', data });

// What each frame has to prove, asserted before it is allowed to be saved - a screenshot has no
// failure mode of its own. Digits only, no currency symbol: formatMoney's prefix is locale-driven
// and is not what this card is about.
const EXPECT = {
  before: { chips: 7, present: ['616,037'], absent: ['313,744'] },
  after: {
    chips: 12,
    present: ['313,744', '165,595', '56,978', '44,730', '27,500', '7,490'],
    absent: ['616,037'],
  },
};

async function shoot(browser, { lang, after, tag }) {
  const state = after ? 'after' : 'before';
  // Tall on purpose: the "รายงานปัญหา" button is position:fixed to the viewport's bottom-right, so
  // in a short viewport it lands INSIDE the panel's clip box and covers a category chip.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1800 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.addInitScript(
    ([language]) => {
      localStorage.setItem('app_language', language);
      localStorage.setItem('auth_token', 'fake-admin-token-for-capture');
      localStorage.setItem('auth_username', 'admin@system.local');
      localStorage.setItem('auth_roles', JSON.stringify(['admin']));
    },
    [lang]
  );

  // Catch-all FIRST, specifics after: Playwright runs the LAST-registered matching handler.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) })
  );
  await page.route('**/reports/pl-per-vehicle**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok(after ? AFTER : BEFORE)),
    })
  );

  await page.goto(`${BASE}/admin/vehicle-pl-report`, { waitUntil: 'networkidle' });

  // DISCLOSED ALTERATION, and the only one: the global "รายงานปัญหา" FAB is position:fixed to the
  // viewport's bottom-right, and this panel is the last card on the page, so the FAB lands inside
  // the panel's clip box and covers a category chip in the AFTER frame - the one frame whose chips
  // are the point. Growing the viewport does not move it (it is pinned to the viewport, not the
  // page). Nothing this card touches is hidden; the FAB is unrelated furniture.
  await page.addStyleTag({ content: 'app-report-usability-fab { display: none !important; }' });

  // Drive the range through the two p-datePicker inputs rather than writing store state: the
  // payload describes calendar 2025 and the pickers must say so, or the frame contradicts itself.
  const dateInputs = page.locator('p-datepicker input');
  await dateInputs.first().waitFor({ state: 'visible', timeout: 30000 });
  await dateInputs.nth(0).fill('01/01/2025');
  await dateInputs.nth(0).press('Enter');
  await dateInputs.nth(1).fill('31/12/2025');
  await dateInputs.nth(1).press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForLoadState('networkidle');

  const panel = page
    .locator('article.vehicle-pl-aside')
    .filter({ has: page.locator('.vehicle-pl-chip-list') });
  await panel.waitFor({ state: 'visible', timeout: 30000 });

  const chips = panel.locator('.vehicle-pl-chip');
  const want = EXPECT[state];
  const chipCount = await chips.count();
  if (chipCount !== want.chips) {
    throw new Error(`[${tag}] expected ${want.chips} category chips, found ${chipCount}`);
  }

  const panelText = await panel.innerText();
  if (panelText.includes('ADMIN.EXPENSES.CATEGORIES')) {
    throw new Error(`[${tag}] a category rendered as its raw i18n key:\n${panelText}`);
  }
  for (const needle of want.present) {
    if (!panelText.includes(needle)) {
      throw new Error(`[${tag}] panel is missing ${needle}\n${panelText}`);
    }
  }
  for (const needle of want.absent) {
    if (panelText.includes(needle)) {
      throw new Error(`[${tag}] panel still shows ${needle}, which this frame must not\n${panelText}`);
    }
  }

  // The loading swal is a real transient state, so wait before concluding there is no error swal.
  await page.waitForTimeout(500);
  const swals = await page.locator('.swal2-popup').count();
  if (swals > 0) {
    throw new Error(`[${tag}] ${swals} swal popup(s) over the page - the frame would photograph as broken`);
  }

  await page.screenshot({ path: path.join(ASSETS_DIR, `${tag}-full.png`), fullPage: true });
  await panel.screenshot({ path: path.join(ASSETS_DIR, `${tag}-panel.png`) });
  console.log(JSON.stringify({ tag, lang, state, chips: chipCount }));
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await shoot(browser, { lang: 'th', after: false, tag: 'BEFORE-th' });
    await shoot(browser, { lang: 'th', after: true, tag: 'AFTER-th' });
    await shoot(browser, { lang: 'en', after: false, tag: 'BEFORE-en' });
    await shoot(browser, { lang: 'en', after: true, tag: 'AFTER-en' });
    console.log('saved to ' + ASSETS_DIR);
  } finally {
    await browser.close();
  }
})();
