/**
 * OBRS-642 AC5 census — which public customer routes throw the BLOCKING loading
 * overlay while their initial page data loads?
 *
 * AC5 asks us to check the rest of the customer path, not just the home page. Reading
 * 100 http call sites to work out which ones carry SKIP_GLOBAL_LOADING_ALERT is a guess
 * dressed as an audit; visiting each route with a deliberately slow backend and asking
 * the DOM is a measurement. Every /api/ response here is fulfilled by Playwright after
 * DELAY_MS, so no backend is involved and the result is the same on any machine.
 *
 * Reported per route: whether `.swal2-container` was ever observed during page load,
 * and the title it carried. AC4's wording is the pass condition — after the route has
 * settled there must be no `.swal2-container` on the page.
 *
 * Usage: BASE_URL=http://127.0.0.1:4282 LABEL=BEFORE node e2e/probe-obrs-642-ac5-census.mjs
 */
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4282';
const OUT = process.env.OUT_DIR || path.resolve('obrs-642-evidence');
const LABEL = process.env.LABEL || 'BEFORE';
const DELAY_MS = Number(process.env.DELAY_MS || 2500);
const WATCH_MS = Number(process.env.WATCH_MS || 9000);

// Public customer-path routes — reachable with no session, which is what a first-time
// customer has. Authenticated routes (payment, e-ticket, my-bookings) share the same
// interceptor, so fixing the mechanism covers them; they are listed on the card, not
// walked here, because logging in would put this census on the shared SIT backend.
const ROUTES = [
  '/',
  '/schedule-booking',
  '/find-booking',
  '/track-parcel',
  '/business-policy',
  '/refund-policy',
  '/privacy-policy',
  '/how-to-book',
  '/login',
  '/register',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

const overlayNow = (page) =>
  page.evaluate(() => {
    const c = document.querySelectorAll('.swal2-container');
    return {
      n: c.length,
      title: document.querySelector('.swal2-title')?.textContent?.trim() ?? null,
    };
  });

async function run() {
  const browser = await chromium.launch();
  const rows = [];

  for (const route of ROUTES) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    let apiCalls = 0;
    await page.route('**/api/**', async (route_) => {
      apiCalls++;
      await sleep(DELAY_MS);
      await route_.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', message: 'ok', data: [] }),
      });
    });

    const samples = [];
    const poll = (async () => {
      const until = Date.now.call(null) + WATCH_MS;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          samples.push(await overlayNow(page));
        } catch {
          /* navigating */
        }
        if (samples.length * 120 > WATCH_MS) break;
        await sleep(120);
      }
    })();

    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await poll;

    const seen = samples.filter((s) => s.n > 0);
    rows.push({
      route,
      apiCalls,
      blockingOverlayDuringLoad: seen.length > 0,
      approxVisibleMs: seen.length * 120,
      title: seen[0]?.title ?? null,
      containersAtEnd: samples.at(-1)?.n ?? null, // AC4: must be 0
    });
    await ctx.close();
  }

  await browser.close();

  const outPath = path.join(OUT, `obrs-642-ac5-census-${LABEL.toLowerCase()}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ label: LABEL, base: BASE, delayMs: DELAY_MS, rows }, null, 2));

  const w = (s, n) => String(s).padEnd(n);
  console.log(`\nAC5 census (${LABEL}) — /api/ delayed ${DELAY_MS} ms\n`);
  console.log(w('route', 24) + w('api', 5) + w('blocking overlay', 19) + w('visible ms', 12) + 'at end');
  console.log('-'.repeat(72));
  for (const r of rows) {
    console.log(
      w(r.route, 24) +
        w(r.apiCalls, 5) +
        w(r.blockingOverlayDuringLoad ? 'YES' : 'no', 19) +
        w(r.blockingOverlayDuringLoad ? r.approxVisibleMs : '-', 12) +
        r.containersAtEnd
    );
  }
  const bad = rows.filter((r) => r.blockingOverlayDuringLoad);
  console.log(`\n${bad.length}/${rows.length} public customer routes block on page load.`);
  console.log('wrote ' + outPath);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
