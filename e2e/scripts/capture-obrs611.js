// Standalone capture script for OBRS-611 visual evidence (not a Playwright test, not committed to the suite).
//
// The card's whole claim is "the screen follows parcel.carry_on.free_size_max_inch
// instead of a compiled-in 28". Proving that needs the SAME item photographed against
// TWO different served values, which no seeded environment can give you in one run --
// so every /api call is stubbed (the recipe in jira-card-visual-evidence-policy) and
// GET /api/parcel-policy is the ONE response that differs between shots. That is not a
// weakened proof here, it is the experiment: the item, the branch and the build are
// held constant and only the served config moves.
//
// The item is fixed at 71.12cm on its longest side -- exactly 28in, the boundary the
// backend compares against -- so:
//   shot 1  served 28in  -> free-aisle (at the boundary, "less-or-equal" side)
//   shot 2  served 20in  -> on-seat, seat-count field appears. SAME item, no rebuild.
//   shot 3  policy read 500 -> cannot classify; explicit message + retry (OBRS-611 new)
//   shot 4  consigned mode under that SAME 500 -> still sells (the failure is scoped)
//
// Run AFTER (this branch) and BEFORE (an origin/dev worktree) against the same mocks:
// on BEFORE, shot 2 looks identical to shot 1, because 28 is in the bundle.
//
// usage: node capture-obrs611.js <baseUrl> <before|after>
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2];
const MODE = process.argv[3];
if (!BASE || !['before', 'after'].includes(MODE)) {
  console.error('usage: node capture-obrs611.js <baseUrl> <before|after>');
  process.exit(1);
}

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-611');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

// 28in is the seeded default (V14 migration); 20in is an operator moving it. Nothing
// else about the response changes between the two.
const policy = (freeSizeMaxInch) =>
  ok({
    maxWeightKg: 100,
    carryOnFreeSizeMaxInch: freeSizeMaxInch,
    carryOnFreeAisleMaxPerTrip: 10,
    prohibitedCategories: ['flammable', 'explosive', 'weapon', 'narcotic', 'corpse'],
  });

const SCHEDULES = ok([
  { scheduleId: 42, routeName: 'กรุงเทพฯ - เชียงใหม่', departureDateTime: '2026-09-12T08:00:00+07:00' },
]);
const STOPS = ok([
  { stopId: 5, name: 'หมอชิต 2' },
  { stopId: 9, name: 'สถานีเชียงใหม่' },
]);

function fail(message) {
  throw new Error(MODE + ': ' + message);
}

// ngx-translate prints a missing key as the key itself. A raw STAFF.PARCEL_CONSIGN.
// on screen means a string here has no translation, in any locale.
function assertNoRawKeys(text) {
  const raw = text.split('\n').filter((l) => l.includes('STAFF.PARCEL_CONSIGN.') || l.includes('PARCEL.PROHIBITED.'));
  if (raw.length) fail('raw i18n keys on screen: ' + raw.join(' | '));
}

// The recipe's own warning: a global HTTP-error swal photographs a passing AC as broken.
async function assertNoSwal(page) {
  if (await page.locator('.swal2-container').count()) fail('a global error dialog is covering the screen');
}

async function openCarryOn(page, policyResponse) {
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    if (url.includes('/parcel-policy')) {
      return policyResponse === 'error'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 500, message: 'boom' }) })
        : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(policyResponse) });
    }
    if (url.includes('/schedules')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCHEDULES) });
    if (url.includes('/stops')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPS) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) });
  });

  await page.goto(BASE + '/staff/parcels/consign', { waitUntil: 'networkidle' });
  await page.locator('[data-testid=parcel-consign-mode-tabs]').waitFor({ timeout: 60000 });
  await page.locator('[data-testid=parcel-consign-mode-carry-on]').click();
  await page.waitForTimeout(400);
}

// 71.12cm = exactly 28in, the boundary itself: free-aisle at 28, on-seat at 20.
async function fillBoundaryItem(page) {
  await page.locator('input[formcontrolname=senderName]').fill('สมชาย ใจดี');
  await page.locator('input[formcontrolname=senderPhone]').fill('0891234567');
  await page.locator('input[formcontrolname=weightKg]').fill('8');
  await page.locator('textarea[formcontrolname=description]').fill('กระเป๋าเดินทาง');
  await page.locator('input[formcontrolname=lengthCm]').fill('71.12');
  await page.locator('input[formcontrolname=widthCm]').fill('40');
  await page.locator('input[formcontrolname=heightCm]').fill('30');
  await page.waitForTimeout(500);
}

async function shoot(page, name) {
  await assertNoSwal(page);
  assertNoRawKeys(await page.locator('form').first().innerText());
  await page.screenshot({ path: path.join(ASSETS_DIR, MODE + '-' + name + '.png'), fullPage: true });
  console.log('saved', MODE + '-' + name + '.png');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1500 } });

  // AuthService.isAuthenticated() is a pure localStorage check; the route wants
  // 'salesperson'. No backend is involved in getting through the guard.
  await context.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'fake-salesperson-token-for-capture');
    localStorage.setItem('auth_username', 'sales@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['salesperson']));
  });

  try {
    // ---- 1: served 28in, the seeded default ----
    let page = await context.newPage();
    await openCarryOn(page, policy(28));
    await fillBoundaryItem(page);
    const at28 = await page.locator('.parcel-consign-indicator').allInnerTexts();
    if (!at28.join(' ').includes('ฟรี')) fail('expected the free-aisle hint at 28in, saw: ' + at28.join(' | '));
    await shoot(page, '1-config-28in-free');
    await page.close();

    // ---- 2: served 20in. Same item, same build. ----
    page = await context.newPage();
    await openCarryOn(page, policy(20));
    await fillBoundaryItem(page);
    const at20 = await page.locator('.parcel-consign-indicator').allInnerTexts();
    const movedWithConfig = at20.join(' ').includes('ที่นั่ง');
    if (MODE === 'after' && !movedWithConfig) fail('threshold did not follow the served 20in config');
    if (MODE === 'before' && movedWithConfig) fail('origin/dev was expected to IGNORE the served config');
    await shoot(page, '2-config-20in-onseat');
    await page.close();

    // ---- 3 + 4: the policy read fails ----
    page = await context.newPage();
    await openCarryOn(page, 'error');
    await fillBoundaryItem(page);
    await shoot(page, '3-policy-unavailable');

    await page.locator('[data-testid=parcel-consign-mode-consigned]').click();
    await page.waitForTimeout(400);
    await shoot(page, '4-consigned-still-sells');
    await page.close();
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
