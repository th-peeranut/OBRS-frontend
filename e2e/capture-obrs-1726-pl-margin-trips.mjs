/**
 * OBRS-1726 QA evidence -- net margin %, trips that ran, and the named comparison window
 * on the per-vehicle P&L.
 *
 * Verified against a LOCAL backend (this branch is not on SIT, and SIT itself is down --
 * OBRS-1750). UI language is Thai, this office's default, so the selectors below use the
 * Thai strings from public/i18n/th.json.
 *
 *   OBRS_BASE_URL=http://localhost:4200 node e2e/capture-obrs-1726-pl-margin-trips.mjs
 *
 * Screens captured (all under e2e/out/obrs-1726):
 *   0-pl-after-th-light.png   whole page: KPI deltas, margin %, and the two new columns
 *   1-kpi-cards.png           the KPI row alone, where the three deltas live
 *   2-table-columns.png       the fleet table alone, showing the trips and margin % columns
 *
 * It also prints the measured values it read out of the DOM, because a screenshot proves the
 * pixels and not the rule: an undefined percentage MUST render as an em dash, and a zero there
 * would look almost identical at a glance while meaning something the data does not say.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e/out/obrs-1726');
const PASSWORD = process.env.OBRS_QA_PASSWORD ?? 'P@ssw0rd';

const TH = {
  netMargin: 'อัตรากำไรสุทธิ',
  trips: 'เที่ยววิ่ง',
  marginPct: 'อัตรากำไร %',
};

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45000 });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1560, height: 1000 } });
  const page = await ctx.newPage();
  const measured = {};

  // The response itself, captured on the way past: the screenshot shows what the page did
  // with the payload, this shows what the payload was.
  page.on('response', async (res) => {
    if (res.url().includes('/reports/pl-per-vehicle') && res.status() === 200) {
      try {
        const body = await res.json();
        const data = body?.data ?? body;
        measured.apiTotals = data?.totals;
        measured.apiPrevious = data?.previous;
        measured.apiFirstRow = (data?.rows ?? [])[0];
      } catch {
        /* a non-JSON body is not evidence; leave the field absent rather than guess */
      }
    }
  });

  await login(page, 'owner@system.local');
  await page.goto(`${BASE}/admin/vehicle-pl-report`, { waitUntil: 'networkidle' });
  await page.waitForSelector('table.admin-table tbody tr', { timeout: 30000 });
  await page.waitForTimeout(600);

  await page.screenshot({ path: path.join(OUT, '0-pl-after-th-light.png'), fullPage: true });
  console.log('captured 0-pl-after-th-light.png');

  const kpis = page.locator('section.admin-grid--4').first();
  await kpis.screenshot({ path: path.join(OUT, '1-kpi-cards.png') });
  console.log('captured 1-kpi-cards.png');

  const table = page.locator('.admin-table-wrap').first();
  await table.screenshot({ path: path.join(OUT, '2-table-columns.png') });
  console.log('captured 2-table-columns.png');

  // ---- what the DOM actually says ----
  measured.headers = await page.locator('table.admin-table thead th').allInnerTexts();
  measured.hasTripsColumn = measured.headers.some((h) => h.trim() === TH.trips);
  measured.hasMarginPctColumn = measured.headers.some((h) => h.trim() === TH.marginPct);

  measured.marginPctCard = (await page.locator('[data-testid="pl-margin-pct"]').innerText()).trim();
  measured.deltaRevenue = (await page.locator('[data-testid="pl-delta-revenue"]').innerText()).trim();
  measured.deltaExpenses = (await page.locator('[data-testid="pl-delta-expenses"]').innerText()).trim();
  measured.deltaMargin = (await page.locator('[data-testid="pl-delta-margin"]').innerText()).trim();

  measured.rowTrips = await page.locator('[data-testid="pl-row-trips"]').allInnerTexts();
  measured.rowMarginPct = await page.locator('[data-testid="pl-row-margin-pct"]').allInnerTexts();

  // The rule a picture cannot prove: null must be an em dash, never 0.00%.
  measured.undefinedPctRenderedAsDash = measured.rowMarginPct
    .map((t) => t.trim())
    .filter((t) => t === '—').length;
  measured.anyZeroPctRendered = measured.rowMarginPct
    .map((t) => t.trim())
    .filter((t) => t === '0.00%').length;

  // The rule a CLASS NAME cannot prove either. The first cut of this card returned
  // `is-good`/`is-bad` from the component and defined neither anywhere in any stylesheet:
  // right strings, no colour, and a unit test asserting the return value stayed green.
  // Read the colour the browser actually computed, with the real theme loaded.
  measured.deltaColours = await page.evaluate(() => {
    const read = (testid) => {
      const span = document.querySelector(`[data-testid="${testid}"] span`);
      if (!span) return null;
      return {
        className: span.className,
        color: getComputedStyle(span).color,
        mutedParentColor: getComputedStyle(span.parentElement).color,
      };
    };
    return {
      revenue: read('pl-delta-revenue'),
      expenses: read('pl-delta-expenses'),
      margin: read('pl-delta-margin'),
    };
  });
  // A toned delta must NOT be painted the same as the muted line it sits in; if it is,
  // the class reached the DOM and the stylesheet did nothing with it.
  measured.deltaToneIsActuallyPainted = Object.values(measured.deltaColours)
    .filter((d) => d && d.className)
    .every((d) => d.color !== d.mutedParentColor);

  await writeFile(path.join(OUT, 'measured.json'), JSON.stringify(measured, null, 2), 'utf8');
  console.log(JSON.stringify(measured, null, 2));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
