/**
 * OBRS-1964 - BEFORE/AFTER evidence that removing the dead .sales-* media declarations
 * changes nothing a user can see.
 *
 * The card's whole claim is "these declarations never won the cascade", so the proof has to be
 * the computed value the browser actually used, not a photograph: a 1px step is exactly the size
 * of difference an eye invents. Every frame is stamped with the computed font-size read out of
 * the live DOM, and the numbers are also written to a JSON next to it so BEFORE and AFTER are
 * compared by diffing, not by squinting.
 *
 * No backend runs. The footer sits on the public home route, so nothing here needs auth - the
 * catch-all /api/** stub is registered FIRST only so error.interceptor.ts cannot throw a swal
 * over the page, which photographs a passing AC as a broken screen.
 *
 * Run (plain `ng serve`, no backend needed):
 *   node e2e/scripts/capture-obrs1964.js http://localhost:4302 BEFORE
 *   node e2e/scripts/capture-obrs1964.js http://localhost:4302 AFTER
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const BASE = process.argv[2] || 'http://localhost:4302';
const TAG = (process.argv[3] || 'AFTER').toUpperCase();
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1964');
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { key: 'desktop-1440', width: 1440, height: 900 },
  { key: 'tablet-768', width: 768, height: 1024 },
  { key: 'mobile-375', width: 375, height: 812 },
];

/** The three classes the card touches, plus the one it deliberately leaves alone. */
const TARGETS = {
  '.sales-title': '.sales-container .sales-title',
  '.sales-name': '.sales-container .sales-item .sales-name',
  '.sales-sub': '.sales-container .sales-item .sales-sub',
};

(async () => {
  const browser = await chromium.launch();
  const results = {};

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.route('**/api/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'OK', data: [] }),
      })
    );

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('app-footer .sales-container', { timeout: 30000 });
    await page.locator('app-footer').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    const measured = await page.evaluate((targets) => {
      const out = {};
      for (const [label, selector] of Object.entries(targets)) {
        const el = document.querySelector(`app-footer ${selector}`);
        out[label] = el ? getComputedStyle(el).fontSize : 'NOT FOUND';
      }
      const footer = document.querySelector('app-footer .footer-container');
      out['footer-height'] = footer ? `${Math.round(footer.getBoundingClientRect().height)}px` : 'NOT FOUND';
      const sales = document.querySelector('app-footer .sales-container');
      out['sales-container-height'] = sales ? `${Math.round(sales.getBoundingClientRect().height)}px` : 'NOT FOUND';
      return out;
    }, TARGETS);

    results[vp.key] = measured;
    console.log(`${TAG} ${vp.key}`, JSON.stringify(measured));

    await page.locator('app-footer .sales-container').screenshot({
      path: path.join(OUT, `${TAG.toLowerCase()}-${vp.key}-sales.png`),
    });
    await page.locator('app-footer').screenshot({
      path: path.join(OUT, `${TAG.toLowerCase()}-${vp.key}-footer.png`),
    });

    await context.close();
  }

  fs.writeFileSync(path.join(OUT, `${TAG.toLowerCase()}-measured.json`), JSON.stringify(results, null, 2));
  await browser.close();
})();
