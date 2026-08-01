// OBRS-917: the AFTER census grew one element the BEFORE census did not have -
// `.p-button-danger` 0 -> 1 on `/`, with `.p-button` 1 -> 2 to match - and lost
// three `.p-component`.
//
// The first guess was the route map's error state, which is the only place in
// the app that writes `severity="danger"` on a `p-button`. That guess was WRONG:
// this probe reports `.route-error` = 0 while `.p-button-danger` = 1, so the
// class is arriving from somewhere else entirely. It now prints the element
// itself - tag, classes, ancestors, text - because a count cannot tell you which
// element it counted, and the whole point of the census is to be told.
//
// Usage: node e2e/probe-obrs-917-routemap-error.mjs <baseUrl>

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4251';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await ctx.newPage();

const bad = [];
page.on('response', (r) => {
  if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url()}`);
});
page.on('requestfailed', (r) => bad.push(`FAILED ${r.method()} ${r.url()} - ${r.failure()?.errorText}`));

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(6000);

const describe = (sel) =>
  page.evaluate((s) => {
    const chain = (el) => {
      const out = [];
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        out.push(n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : ''));
      }
      return out.slice(0, 5).join('  <  ');
    };
    return [...document.querySelectorAll(s)].map((el) => ({
      tag: el.tagName.toLowerCase(),
      cls: typeof el.className === 'string' ? el.className : String(el.className),
      text: (el.textContent || '').trim().slice(0, 60),
      ancestry: chain(el),
    }));
  }, sel);

console.log('.p-button        ->', JSON.stringify(await describe('.p-button'), null, 2));
console.log('.p-button-danger ->', JSON.stringify(await describe('.p-button-danger'), null, 2));
console.log('.route-error     ->', (await describe('.route-error')).length);
console.log('.p-component     ->', JSON.stringify((await describe('.p-component')).map((e) => e.tag + '|' + e.cls), null, 2));
console.log(`\nnon-2xx / failed requests (${bad.length}):`);
for (const b of bad) console.log('  ', b);

await browser.close();
