// Standalone capture for OBRS-1753 (one filter pattern on /admin/settlements) and OBRS-1758
// (dismissing a half-picked range puts the applied range back in the box).
//
// usage: node e2e/scripts/capture-obrs1753.js <afterBaseUrl> <beforeBaseUrl>
//
// NO BACKEND — auth is seeded into localStorage and every /api call is stubbed, so the filters
// render against fixtures. See capture-obrs1680.js for the same lane's reasoning.
//
// Both claims are read from the DOM before anything is saved, because neither is safe to judge by
// eye: two date fields and one date field can look similar at a glance, and an input box showing
// a half-picked date is one string away from the right one.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const AFTER_BASE = process.argv[2] || 'http://localhost:4310';
const BEFORE_BASE = process.argv[3] || 'http://localhost:4315';

const ASSETS_DIR = path.resolve(__dirname, '..', '..', '..', 'obrs-agent-office',
  '.claude', 'agent-office', 'scripts', 'captures', 'obrs-1753');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

const SETTLEMENTS = ok({
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
  size: 20,
});

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 2 });

  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'fake-token-for-capture');
    localStorage.setItem('auth_username', 'admin@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['admin']));
  });

  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) }));
  await page.route('**/private/settlements**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SETTLEMENTS) }));
  await page.route('**/private/driver-cash**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SETTLEMENTS) }));

  return page;
}

/** How many date CONTROLS each filter section renders. OBRS-1753 turns 2 + 1 into 1 + 1. */
async function measureFilters(page) {
  return page.evaluate(() => {
    const count = (root) => root ? root.querySelectorAll('input.p-datepicker-input, .p-datepicker input').length : -1;
    const sections = Array.from(document.querySelectorAll('.admin-page-filters'));
    const sub = document.querySelector('[data-testid="driver-cash-days-filter"]');
    return {
      mainInputs: count(sections[0]),
      subFilterInputs: count(sub),
      subFilterUsesSharedPicker: !!(sub && sub.querySelector('app-admin-date-range-picker')),
    };
  });
}

async function openSettlements(page, base) {
  await page.goto(base + '/admin/settlements', { waitUntil: 'networkidle' });
  await page.locator('[data-testid="driver-cash-days-filter"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = {};
  try {
    for (const [label, base] of [['BEFORE', BEFORE_BASE], ['AFTER', AFTER_BASE]]) {
      const page = await newPage(browser);
      await openSettlements(page, base);
      report[`${label}-filters`] = await measureFilters(page);

      // The union of both filter sections — the claim is about the two of them side by side, so a
      // frame of either one alone would not carry it.
      const first = await page.locator('.admin-page-filters').first().boundingBox();
      const sub = await page.locator('[data-testid="driver-cash-days-filter"]').boundingBox();
      await page.screenshot({
        path: path.join(ASSETS_DIR, `OBRS-1753-${label}-settlements-filters.png`),
        clip: {
          x: Math.min(first.x, sub.x) - 8,
          y: first.y - 8,
          width: Math.max(first.x + first.width, sub.x + sub.width) - Math.min(first.x, sub.x) + 16,
          height: sub.y + sub.height - first.y + 16,
        },
      });

      // OBRS-1758 is NOT captured here on purpose. Its claim is what the input box shows after a
      // popup is dismissed mid-pick, and driving PrimeNG's overlay headlessly proved unreliable
      // (the day cells resolve in the DOM but never report visible), which would make the frame a
      // picture of a timeout rather than of the fix. The unit test
      // 'puts the APPLIED range back in the box when the popup closes mid-pick' asserts it
      // directly, on the value the control is actually handed.

      await page.close();
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(ASSETS_DIR, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})();
