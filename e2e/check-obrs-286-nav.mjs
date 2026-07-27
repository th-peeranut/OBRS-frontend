// OBRS-286: a page reachable only by typing its URL has not shipped. Assert the
// worklist has a real nav entry for OWNER, and that SALESPERSON does not get one.
// Usage: node e2e/check-obrs-286-nav.mjs <baseUrl> <outDir>

import { chromium } from 'playwright';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:4200';
const OUT = process.argv[3] || '.';

async function navFor(email, shot) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').waitFor({ timeout: 45000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill('P@ssw0rd');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45000 });
  await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1200);
  const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  const hit = hrefs.filter((h) => h && h.includes('manual-refund'));
  if (shot) await page.screenshot({ path: join(OUT, shot), fullPage: true });
  await browser.close();
  return hit;
}

const owner = await navFor('owner@system.local', 'OBRS-286-AFTER-nav-owner.png');
const sales = await navFor('salesperson@system.local', null);

let bad = 0;
if (owner.length) console.log(`pass  OWNER nav entry :: ${owner.join(', ')}`);
else { console.log('FAIL  OWNER nav entry :: no link containing "manual-refund"'); bad++; }
if (!sales.length) console.log('pass  SALESPERSON has no nav entry :: none found');
else { console.log(`FAIL  SALESPERSON has no nav entry :: ${sales.join(', ')}`); bad++; }
if (bad) process.exitCode = 1;
