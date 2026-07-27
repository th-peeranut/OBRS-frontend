// OBRS-286 BEFORE evidence.
//
// There is no stored "old" screenshot of this screen because the screen never
// existed — that IS the before state (card gap 2: the pending-refunds endpoint
// had service methods and zero component callers). So the before is captured
// against SIT, which is built from the `sit` branch and does not carry this card:
// a real deployed build without the feature, not a mock of one.
//
// Usage: node e2e/capture-obrs-286-before.mjs <outDir>

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://sit-obrs-frontend.netlify.app';
const OUT = process.argv[2] || '.';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type="email"]').waitFor({ timeout: 60000 });
await page.locator('input[type="email"]').fill('owner@system.local');
await page.locator('input[type="password"]').fill('P@ssw0rd');
await page.locator('button[type="submit"]').click();
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 });

await page.goto(`${BASE}/admin/manual-refunds`, { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(2500);

const landed = new URL(page.url()).pathname;
const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
const navHit = hrefs.filter((h) => h && h.includes('manual-refund'));

console.log(`SIT landed on: ${landed}`);
console.log(`SIT nav links containing "manual-refund": ${navHit.length ? navHit.join(', ') : 'none'}`);

// Screenshot the admin shell, not the redirect target: this is the frame the
// AFTER shot uses, so the missing nav entry is visible in the same place.
await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(2000);
await page.screenshot({ path: join(OUT, 'OBRS-286-BEFORE-no-worklist-screen.png'), fullPage: true });
await browser.close();

if (landed.includes('/admin/manual-refunds') || navHit.length) {
  console.log('WARNING: SIT appears to already have this feature - this is not a valid BEFORE.');
  process.exitCode = 1;
}
