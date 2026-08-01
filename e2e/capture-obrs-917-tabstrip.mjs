// OBRS-917: an ELEMENT screenshot of the route-map tab strip in dark mode.
//
// The five surface captures are viewport-only and the route map sits below the
// fold on `/`, so `home-routemap-*.png` is byte-identical before and after --
// truthfully so, since the visible region really did not change, but it means
// those files do not show the defect this card fixed or the fix. A card whose
// AFTER image cannot contain the repair is not evidence, it is decoration.
//
// This frames the `<p-tabs>` element itself and also prints the measured
// backdrop, so the image and the number are produced by the same run and cannot
// drift apart. Run it once with the `.p-tablist` rule in dark-theme.scss
// commented out (the broken state, which nothing else in this branch records)
// and once with it restored.
//
// Usage: node e2e/capture-obrs-917-tabstrip.mjs <baseUrl> <outFile>

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:4251';
const OUT = process.argv[3] || 'e2e/out/obrs-917-after/routemap-tabstrip-dark.png';
mkdirSync(dirname(OUT), { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
await ctx.addInitScript(() => {
  try {
    window.localStorage.setItem('app_admin_theme', 'dark');
  } catch {}
});
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });

const tabs = page.locator('p-tabs').first();
await tabs.waitFor({ timeout: 20000 });
if ((await page.locator('body.is-dark').count()) !== 1) {
  console.error('body.is-dark absent - this would be a light-mode file under a dark-mode name.');
  process.exit(1);
}
await tabs.scrollIntoViewIfNeeded();
await page.waitForTimeout(1000);

const m = await page.evaluate(() => {
  const label = document.querySelector('.tab-header-label');
  const list = document.querySelector('p-tablist');
  const badge = document.querySelector('.p-badge-danger, .p-badge');
  const bg = (el) => (el ? getComputedStyle(el).backgroundColor : 'n/a');
  return {
    tablistBg: bg(list),
    labelColor: label ? getComputedStyle(label).color : 'n/a',
    badgeColor: badge ? getComputedStyle(badge).color : 'n/a',
    badgeBg: bg(badge),
  };
});
console.log(JSON.stringify(m, null, 2));

await tabs.screenshot({ path: OUT, timeout: 20000 });
console.log(`wrote ${OUT}`);
await browser.close();
