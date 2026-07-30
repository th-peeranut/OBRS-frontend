// OBRS-900 follow-up probe: is the highlighted match actually VISIBLE?
//
// The first verification pass asserted textContent — the DOM held the words, so
// it passed. The screenshot then showed the description rendering as one
// non-wrapping line that overflows the sidebar, with the highlighted
// "ค่าโดยสาร" clipped off-screen. Asserting the text exists is a proxy; the
// card's whole point is that the user SEES the word they typed. This measures
// containment: every highlight box must lie inside the nav link, which must lie
// inside the sidebar panel.
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4256';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1536, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type="email"]').waitFor({ timeout: 60000 });
await page.locator('input[type="email"]').fill('admin@system.local');
await page.locator('input[type="password"]').fill('P@ssw0rd');
await page.locator('button[type="submit"]').click();
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 });
await page.goto(`${BASE}/admin/routes`, { waitUntil: 'networkidle' }).catch(() => {});
await page.locator('.admin-nav-search-input').waitFor({ timeout: 30000 });
await page.locator('.admin-nav-search-input').fill('ค่าโดยสาร');
await page.waitForTimeout(400);

const m = await page.evaluate(() => {
  const r = (n) => {
    const b = n.getBoundingClientRect();
    return { left: +b.left.toFixed(1), right: +b.right.toFixed(1), width: +b.width.toFixed(1), height: +b.height.toFixed(1) };
  };
  const panel = document.querySelector('.admin-sidebar-panel');
  const link = document.querySelector('.admin-nav .admin-nav-link');
  const desc = document.querySelector('.admin-nav-link-description');
  const hls = [...document.querySelectorAll('.admin-nav-search-highlight')];
  const cs = desc ? getComputedStyle(desc) : null;
  return {
    panel: r(panel),
    link: r(link),
    desc: desc ? r(desc) : null,
    descScrollWidth: desc ? desc.scrollWidth : null,
    descClientWidth: desc ? desc.clientWidth : null,
    descWhiteSpace: cs ? cs.whiteSpace : null,
    descOverflow: cs ? cs.overflow : null,
    descTextOverflow: cs ? cs.textOverflow : null,
    highlights: hls.map((h) => ({ text: h.textContent, ...r(h) })),
  };
});

console.log(JSON.stringify(m, null, 2));
const worst = m.highlights.map((h) => +(h.right - m.panel.right).toFixed(1));
console.log('\nhighlight.right - panel.right (positive = clipped off the sidebar):', worst.join(', '));
console.log('description overflows its own box by', m.descScrollWidth - m.descClientWidth, 'px');
await browser.close();
