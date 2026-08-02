// OBRS-917: the customer contrast gate reports two DARK-MODE findings on the
// route-map tabs that were not there on dev:
//
//   dark|span.tab-header-label|#9aa3b8-on-#ffffff              2.53:1 (needs 4.5)
//   dark|p-badge...p-badge-danger|#e8eaf0-on-#e4eaf8           1.00:1 (needs 4.5)
//
// Both foregrounds are the CORRECT dark-mode values - #9aa3b8 is exactly what
// the capture measured for `tab-idle` colour in dark, before and after. What is
// wrong is the surface underneath: white, in dark mode. #e4eaf8 is the badge's
// own rgba(75,194,247,0.22) wash composited over that same white.
//
// So this is one defect, not two, and the capture script could never have seen
// it: it reads `backgroundColor` ON the element, and the tab's own background is
// `transparent` in both v19 and v20. Whatever is painting white is an ANCESTOR.
// This walks up and prints every one of them with its computed background, so
// the answer is an element rather than a theory.
//
// Usage: node e2e/probe-obrs-917-tab-backdrop.mjs <baseUrl>

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4251';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
await ctx.addInitScript(() => {
  try {
    window.localStorage.setItem('app_admin_theme', 'dark');
  } catch {}
});
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.locator('p-tabs').first().waitFor({ timeout: 20000 });
await page.waitForTimeout(1200);

const dark = await page.locator('body.is-dark').count();
console.log(`body.is-dark present: ${dark === 1 ? 'yes' : 'NO - every number below is a light-mode reading'}`);

const chain = await page.evaluate(() => {
  const leaf = document.querySelector('.tab-header-label');
  if (!leaf) return null;
  const rows = [];
  for (let n = leaf; n; n = n.parentElement) {
    const cs = getComputedStyle(n);
    rows.push({
      el: n.tagName.toLowerCase() + (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).filter((c) => !c.startsWith('ng-')).join('.') : ''),
      bg: cs.backgroundColor,
      color: cs.color,
    });
    if (n.tagName === 'BODY') break;
  }
  return rows;
});

if (!chain) {
  console.error('.tab-header-label not found - the tabs did not render, so nothing below would mean anything.');
  process.exit(1);
}

console.log('\nancestor chain from .tab-header-label upward (first non-transparent bg is the backdrop):');
let backdrop = null;
for (const r of chain) {
  const opaque = r.bg !== 'rgba(0, 0, 0, 0)' && r.bg !== 'transparent';
  if (opaque && !backdrop) backdrop = r;
  console.log(`  ${opaque ? '>>' : '  '} ${r.el.padEnd(62)} bg=${r.bg}`);
}
console.log(`\nfirst opaque backdrop: ${backdrop ? backdrop.el + '  bg=' + backdrop.bg : '(none - the page paints nothing)'}`);

await browser.close();
