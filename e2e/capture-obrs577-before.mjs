// OBRS-577 BEFORE evidence, captured from origin/dev (68be1ee0): /my-bookings
// ends silently — no count line, no Load-more button, and the request asks for
// size=100. Same account, same viewport as the AFTER shots.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2];
const OUT = process.argv[3] || 'tmp/out-577';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 2 })).newPage();
const reqs = [];
page.on('request', (r) => { if (r.url().includes('/bookings/me')) reqs.push(r.url().split('/me')[1]); });

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type="email"]').waitFor({ timeout: 120000 });
await page.locator('input[type="email"]').fill('customer@system.local');
await page.locator('input[type="password"]').fill('P@ssw0rd');
await page.locator('button[type="submit"]').click();
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 120000 });
await page.goto(`${BASE}/my-bookings`, { waitUntil: 'domcontentloaded' });
const CARD = '.booking-card:not(.booking-card--skeleton)';
await page.locator(CARD).first().waitFor({ timeout: 120000 });
await page.waitForTimeout(2500);

console.log('rows          =', await page.locator(CARD).count());
console.log('count line    =', await page.locator('.my-bookings__count').count(), '(expect 0 — does not exist yet)');
console.log('load-more     =', await page.locator('.my-bookings__load-more').count(), '(expect 0 — does not exist yet)');
console.log('list requests =', JSON.stringify(reqs), '(expect size=100)');

// top of the list
await page.screenshot({ path: join(OUT, 'BEFORE-01-first-page-no-count-line.png') });
// bottom of the list — the silent end this card is about
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(900);
await page.screenshot({ path: join(OUT, 'BEFORE-02-list-ends-silently.png') });

await browser.close();
