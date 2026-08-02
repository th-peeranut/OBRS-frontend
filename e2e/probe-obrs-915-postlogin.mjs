// Why does every authenticated surface go unresponsive?
//
// The before-capture logged in fine and then failed IDENTICALLY on all five
// routes: goto timed out, no selector appeared, and page.screenshot() itself
// timed out. A screenshot timing out is the tell — that is the renderer's main
// thread being blocked, not a slow network. This probe watches console output,
// page errors and requests around the login so the blocking thing can be named
// instead of guessed at.
//
// Usage: node e2e/probe-obrs-915-postlogin.mjs [baseUrl]

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4241';
const t0 = Date.now();
const at = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const consoleLines = [];
page.on('console', (m) => {
  const line = `${at()} console.${m.type()}: ${m.text().slice(0, 200)}`;
  consoleLines.push(line);
  if (consoleLines.length <= 60) console.log(line);
});
page.on('pageerror', (e) => console.log(`${at()} PAGEERROR: ${String(e).slice(0, 300)}`));
page.on('requestfailed', (r) => console.log(`${at()} REQFAIL ${r.method()} ${r.url().slice(0, 120)} :: ${r.failure()?.errorText}`));

console.log(`${at()} goto /login`);
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type="email"]').waitFor({ timeout: 60000 });
console.log(`${at()} login form up`);

await page.locator('input[type="email"]').fill('admin@system.local');
await page.locator('input[type="password"]').fill('P@ssw0rd');
await page.locator('button[type="submit"]').click();
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 });
console.log(`${at()} logged in, url=${page.url()}`);

// Is the renderer alive at all? A bare evaluate would wait forever, so race it.
// Keep polling rather than breaking on the first BLOCKED: "blocked at t=1s" and
// "blocked forever" are different verdicts, and only the second is a hang.
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(10000);
  const alive = await Promise.race([
    page.evaluate(() => ({ url: location.href, body: document.body.className, kids: document.body.childElementCount })).catch((e) => ({ err: e.message.split('\n')[0] })),
    new Promise((r) => setTimeout(() => r('BLOCKED'), 5000)),
  ]);
  console.log(`${at()} poll ${i + 1} -> ${JSON.stringify(alive)}`);
  if (alive !== 'BLOCKED') break;
}

console.log(`${at()} total console messages: ${consoleLines.length}`);
// A runaway loop usually announces itself by repeating one message thousands of
// times, so print the histogram rather than the tail.
const hist = {};
for (const l of consoleLines) {
  const key = l.replace(/^\[[\d.]+s\] /, '').slice(0, 90);
  hist[key] = (hist[key] || 0) + 1;
}
for (const [k, v] of Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${String(v).padStart(6)}x  ${k}`);
}

await browser.close();
