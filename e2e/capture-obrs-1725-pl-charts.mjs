/**
 * OBRS-1725 — the AFTER evidence for the two pictures added to
 * `/admin/vehicle-pl-report`: the company cost-mix donut, the top-5 margin bars, and
 * the per-category cost sub-columns in the fleet table.
 *
 *   npx ng serve --configuration sit --port 4321
 *   node e2e/capture-obrs-1725-pl-charts.mjs
 *
 * WHY THE REPORT IS STUBBED
 * What is under test is a DERIVATION plus a rendering: which categories become slices,
 * which rows may be ranked, and which empty cell is a dash rather than a zero. A live
 * SIT database cannot make any of that more or less true, and it cannot be made to
 * contain the one case the card is most specific about — a vehicle with NO line in a
 * category that other vehicles do have (AC-3). So the response is built here, in
 * integer satang, with the same invariant the backend guarantees:
 * `totals.expenses` IS the sum of every row's `expensesByCategory[].amount`
 * (ReportService#rollUpExpenses builds the lines and the total from the same
 * projections), which is exactly what lets the donut divide up the number the KPI card
 * prints without inventing a new figure.
 *
 * WHY BOTH THEMES
 * AC-1 asks for a legend that is legible in light AND dark. The five series tokens are
 * the first categorical palette in the app (`--admin-series-1..5`, declared in
 * `styles/admin-theme.scss` with a dark override), so a light-only screenshot would
 * leave the half that the owner actually uses at night unproven.
 *
 * This is a capture script and nothing else (OBRS-1704): it takes photographs and
 * prints what it saw. It fails only when it has nothing to photograph, because a
 * picture of an empty card is not evidence of a chart.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4321';
const OUT = path.resolve(
  '..', 'obrs-agent-office', '.claude', 'agent-office', 'scripts', 'captures', 'obrs-1725'
);

const ok = (data) => ({ code: 200, message: 'OK', data });

// ── the fixture, in satang ────────────────────────────────────────────────────────────
// Everything below is integers until the last moment; the decimal strings the wire
// carries are produced once, at the end, by `money()`. Nothing here rounds twice.
const money = (satang) =>
  `${satang < 0 ? '-' : ''}${Math.floor(Math.abs(satang) / 100)}.${String(Math.abs(satang) % 100).padStart(2, '0')}`;

/** ADR-0115 §1: the amount is VAT-INCLUSIVE and this is the component already inside it. */
const vatInside = (satang) => Math.round((satang * 7) / 107);

const FLEET = [
  { plate: '16-8746', revenue: 4200000, costs: { FUEL: 1200000, REPAIR: 300000, TOLL: 180000, GPS: 30000 } },
  { plate: '16-8747', revenue: 3850000, costs: { FUEL: 1150000, REPAIR: 90000, TOLL: 170000, TIRE: 420000 } },
  { plate: '16-8748', revenue: 3100000, costs: { FUEL: 980000, TOLL: 150000, GPS: 30000, PARKING_FEE: 45000 } },
  { plate: '16-8749', revenue: 2650000, costs: { FUEL: 860000, REPAIR: 540000, TOLL: 120000, TIRE: 210000 } },
  { plate: '16-9012', revenue: 1980000, costs: { FUEL: 690000, REPAIR: 120000, TOLL: 90000 } },
  // The loss. Ranked below the five above, so it does NOT appear among the bars — the
  // ranking is a top 5, not a leaderboard of everything.
  { plate: '16-9013', revenue: 820000, costs: { FUEL: 410000, REPAIR: 980000, TOLL: 40000, TIRE: 210000, GPS: 30000 } },
];

const UNASSIGNED_REVENUE = 350000;
const CENTRAL_COST = 1500000;

const lines = (costs) =>
  Object.entries(costs).map(([category, satang]) => ({
    category,
    amount: money(satang),
    vatAmount: money(vatInside(satang)),
    entryCount: 1,
  }));

const sum = (costs) => Object.values(costs).reduce((a, b) => a + b, 0);
const vatOf = (costs) => Object.values(costs).reduce((a, b) => a + vatInside(b), 0);

const vehicleRows = FLEET.map((v, index) => {
  const expenses = sum(v.costs);
  return {
    kind: 'VEHICLE',
    vehicleId: index + 1,
    numberPlate: v.plate,
    header: v.plate,
    status: 'ACTIVE',
    inServiceFrom: null,
    inServiceTo: null,
    coverage: 'IN_SERVICE',
    revenue: money(v.revenue),
    historicalRevenue: '0.00',
    historicalRevenueConflictCount: 0,
    ranInPeriod: true,
    expensesByCategory: lines(v.costs),
    expenseTotal: money(expenses),
    vatTotal: money(vatOf(v.costs)),
    expenseEntryCount: Object.keys(v.costs).length,
    margin: money(v.revenue - expenses),
  };
});

const vehicleLess = [
  {
    kind: 'UNASSIGNED_REVENUE',
    vehicleId: null,
    numberPlate: null,
    header: null,
    status: null,
    inServiceFrom: null,
    inServiceTo: null,
    coverage: null,
    revenue: money(UNASSIGNED_REVENUE),
    historicalRevenue: '0.00',
    historicalRevenueConflictCount: 0,
    ranInPeriod: false,
    expensesByCategory: [],
    expenseTotal: '0.00',
    vatTotal: '0.00',
    expenseEntryCount: 0,
    margin: money(UNASSIGNED_REVENUE),
  },
  {
    kind: 'CENTRAL_EXPENSE',
    vehicleId: null,
    numberPlate: null,
    header: null,
    status: null,
    inServiceFrom: null,
    inServiceTo: null,
    coverage: null,
    revenue: '0.00',
    historicalRevenue: '0.00',
    historicalRevenueConflictCount: 0,
    ranInPeriod: false,
    expensesByCategory: lines({ CENTRAL: CENTRAL_COST }),
    expenseTotal: money(CENTRAL_COST),
    vatTotal: money(vatInside(CENTRAL_COST)),
    expenseEntryCount: 1,
    margin: money(-CENTRAL_COST),
  },
];

const ROWS = [...vehicleRows, ...vehicleLess];
const TOTAL_REVENUE = FLEET.reduce((a, v) => a + v.revenue, 0) + UNASSIGNED_REVENUE;
const TOTAL_EXPENSES = FLEET.reduce((a, v) => a + sum(v.costs), 0) + CENTRAL_COST;
const TOTAL_VAT = FLEET.reduce((a, v) => a + vatOf(v.costs), 0) + vatInside(CENTRAL_COST);

const REPORT = {
  from: '2026-08-01',
  to: '2026-08-31',
  vatIncludedInAmounts: true,
  rows: ROWS,
  totals: {
    revenue: money(TOTAL_REVENUE),
    expenses: money(TOTAL_EXPENSES),
    vat: money(TOTAL_VAT),
    margin: money(TOTAL_REVENUE - TOTAL_EXPENSES),
    currency: 'THB',
    // OBRS-1356 / AC-4: recorded, awaiting the owner's ruling, and deliberately outside
    // both `expenses` and `margin`. The card for it stays on the page.
    pendingExpenses: '2400.00',
  },
};

// ── the capture ───────────────────────────────────────────────────────────────────────
async function stub(page, theme) {
  await page.addInitScript(
    ([mode]) => {
      localStorage.setItem('app_language', 'th');
      localStorage.setItem('app_admin_theme', mode);
      // AuthGuard checks exactly two things: `!!getToken()` and the roles in
      // localStorage. No JWT is decoded, so no real credential is involved here.
      localStorage.setItem('auth_token', 'obrs-1725-capture-token');
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
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  // `ng serve` compiles the lazy admin chunk on first request; the default 30s
  // navigation timeout expires on a cold chunk long before anything is wrong.
  page.setDefaultNavigationTimeout(180000);
  await stub(page, theme);
  await page.goto(`${BASE}/admin/vehicle-pl-report`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.vehicle-pl-donut-slice', { state: 'visible', timeout: 120000 });
  await page.waitForTimeout(600);

  // What the picture is a picture OF, read back off the DOM so the two can be compared
  // without squinting at the image.
  seen[theme] = await page.evaluate(() => {
    const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return {
      slices: document.querySelectorAll('.vehicle-pl-donut-slice').length,
      legend: Array.from(document.querySelectorAll('.vehicle-pl-legend li')).map(text),
      donutCentre: text(document.querySelector('.vehicle-pl-donut-centre')),
      bars: Array.from(document.querySelectorAll('.vehicle-pl-bar-row')).map((row) => ({
        label: text(row.querySelector('.vehicle-pl-bar-label')),
        value: text(row.querySelector('.vehicle-pl-bar-value')),
        widthPercent: row.querySelector('.vehicle-pl-bar-fill')?.style.width ?? null,
      })),
      costHeaders: Array.from(document.querySelectorAll('thead th.vehicle-pl-subcost')).map(text),
      dashCells: document.querySelectorAll('tbody .vehicle-pl-no-entry').length,
      // The colours the tokens actually resolved to, which is the only proof that the
      // dark override reached the ring rather than the light palette surviving.
      sliceColours: Array.from(document.querySelectorAll('.vehicle-pl-donut-slice')).map(
        (el) => getComputedStyle(el).stroke
      ),
      // AC-4: the OBRS-1356 card the mockup left out is still there. Read by its
      // rendered Thai (`CARD.PENDING_EXPENSES`), which is what the owner sees — the
      // first run of this script looked for a wording the page has never used and
      // reported a missing card that was on screen the whole time.
      pendingCardOnScreen: /รายจ่ายรออนุมัติ/.test(document.body.textContent ?? ''),
    };
  });

  await page.screenshot({ path: path.join(OUT, `after-${theme}.png`), fullPage: true });
  // A second, tighter frame: the two charts alone, where the legend's legibility is the
  // thing being judged and a full page shrinks it to nothing.
  await page.locator('.vehicle-pl-chart-grid').screenshot({
    path: path.join(OUT, `after-charts-${theme}.png`),
  });
  await ctx.close();
}

await browser.close();

const expected = { from: REPORT.from, to: REPORT.to, totals: REPORT.totals };
await writeFile(path.join(OUT, 'result.json'), JSON.stringify({ expected, seen }, null, 2));
console.log(JSON.stringify(seen, null, 2));

const empty = Object.entries(seen).filter(
  ([, s]) => s.slices === 0 || s.bars.length === 0 || s.costHeaders.length === 0
);
if (empty.length > 0) {
  console.error(`FAIL: nothing to photograph in ${empty.map(([t]) => t).join(', ')}`);
  process.exit(2);
}
console.log(`OK: 4 image(s) in ${OUT}`);
