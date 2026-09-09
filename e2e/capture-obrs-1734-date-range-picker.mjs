/**
 * OBRS-1734 — the AFTER evidence for `app-admin-date-range-picker` on
 * `/admin/vehicle-pl-report`: one trigger, one popup, both months at once —
 * replacing the page's previous two separate `p-datePicker` fields.
 *
 *   npx ng serve --configuration sit --port 4321
 *   node e2e/capture-obrs-1734-date-range-picker.mjs
 *
 * The report itself is not what this card changed — OBRS-1725 already has
 * its own capture for the charts — so the fixture here is the minimum that
 * makes the page render without error, not a re-derivation of that one.
 *
 * This is a capture script and nothing else (OBRS-1704): it takes
 * photographs and prints what it saw. It fails only when it has nothing to
 * photograph.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4321';
const OUT = path.resolve(
  '..', 'obrs-agent-office', '.claude', 'agent-office', 'scripts', 'captures', 'obrs-1734'
);

const ok = (data) => ({ code: 200, message: 'OK', data });

const vehicleRow = (plate, revenue, expenseTotal) => ({
  kind: 'VEHICLE',
  vehicleId: 1,
  numberPlate: plate,
  header: plate,
  status: 'ACTIVE',
  inServiceFrom: null,
  inServiceTo: null,
  coverage: 'IN_SERVICE',
  revenue,
  historicalRevenue: '0.00',
  historicalRevenueConflictCount: 0,
  ranInPeriod: true,
  expensesByCategory: [{ category: 'FUEL', amount: expenseTotal, vatAmount: '0.00', entryCount: 1 }],
  expenseTotal,
  vatTotal: '0.00',
  expenseEntryCount: 1,
  margin: (Number(revenue) - Number(expenseTotal)).toFixed(2),
});

const REPORT = {
  from: '2026-08-01',
  to: '2026-08-31',
  vatIncludedInAmounts: true,
  rows: [vehicleRow('16-8746', '42000.00', '17100.00')],
  totals: {
    revenue: '42000.00',
    expenses: '17100.00',
    vat: '0.00',
    margin: '24900.00',
    currency: 'THB',
    pendingExpenses: '0.00',
  },
};

async function stub(page, theme) {
  await page.addInitScript(
    ([mode]) => {
      localStorage.setItem('app_language', 'th');
      localStorage.setItem('app_admin_theme', mode);
      localStorage.setItem('auth_token', 'obrs-1734-capture-token');
      localStorage.setItem('auth_username', 'owner@capture.local');
      localStorage.setItem('auth_roles', JSON.stringify(['owner', 'admin']));
    },
    [theme]
  );
  await page.route('**/api/**', (route) => {
    const p = new URL(route.request().url()).pathname;
    const send = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(data)) });
    if (/\/reports\/pl-per-vehicle$/.test(p)) return send(REPORT);
    return send(null);
  });
  await page.route('**/accounts.google.com/**', (route) => route.abort());
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const seen = {};

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(180000);
  await stub(page, theme);
  await page.goto(`${BASE}/admin/vehicle-pl-report`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('app-admin-date-range-picker .p-inputtext', {
    state: 'visible',
    timeout: 120000,
  });
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(OUT, `after-closed-${theme}.png`), fullPage: true });

  await page.click('app-admin-date-range-picker .p-inputtext');
  await page.waitForSelector('.app-date-field-panel--range', { state: 'visible', timeout: 15000 });
  await page.waitForTimeout(300);

  seen[theme] = await page.evaluate(() => {
    const panel = document.querySelector('.app-date-field-panel--range');
    return {
      placeholder: document
        .querySelector('app-admin-date-range-picker .p-inputtext')
        ?.getAttribute('placeholder'),
      panelOpen: !!panel,
      panelWidth: panel ? getComputedStyle(panel).width : null,
      monthsShown: document.querySelectorAll('.app-date-field-panel--range .p-datepicker-calendar').length,
    };
  });

  await page.screenshot({ path: path.join(OUT, `after-open-${theme}.png`), fullPage: true });
  await ctx.close();
}

await browser.close();

await writeFile(path.join(OUT, 'result.json'), JSON.stringify({ seen }, null, 2));
console.log(JSON.stringify(seen, null, 2));

const broken = Object.entries(seen).filter(([, s]) => !s.panelOpen || s.monthsShown < 2);
if (broken.length > 0) {
  console.error(`FAIL: range popup did not show two months in ${broken.map(([t]) => t).join(', ')}`);
  process.exit(2);
}
console.log(`OK: 4 image(s) in ${OUT}`);
