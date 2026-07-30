// OBRS-900 BEFORE evidence — run against the SAME serve with the three changed
// source files temporarily reverted to origin/dev, so the before/after pair
// differs only by this card's diff (same browser, same viewport, same data).
//
// It measures the two things the card claims are wrong today:
//   1. a query that matched via the DESCRIPTION renders no description and no
//      highlight — the user sees a result with none of their words in it;
//   2. the clear (×) button is painted outside the input's own border box.
//
// Usage: node e2e/capture-obrs-900-before.mjs <baseUrl> <outDir>

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:4256';
const OUT = process.argv[3] || '.';
mkdirSync(OUT, { recursive: true });

const QUERY = 'ค่าโดยสาร';
const out = {};

for (const mode of ['light', 'dark']) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(
    ([k, v]) => {
      try {
        window.localStorage.setItem(k, v);
      } catch {}
    },
    ['app_admin_theme', mode]
  );
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').waitFor({ timeout: 60000 });
  await page.locator('input[type="email"]').fill('admin@system.local');
  await page.locator('input[type="password"]').fill('P@ssw0rd');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 });

  await page.goto(`${BASE}/admin/routes`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.locator('.admin-nav-search-input').waitFor({ timeout: 30000 });

  const isDark = await page.evaluate(() => document.body.classList.contains('is-dark'));
  if (isDark !== (mode === 'dark')) throw new Error(`theme precondition failed for ${mode}`);

  await page.screenshot({
    path: join(OUT, `OBRS-900-BEFORE-${mode}-1-sidebar-empty-query.png`),
    clip: { x: 0, y: 0, width: 320, height: 900 },
  });

  await page.locator('.admin-nav-search-input').fill(QUERY);
  await page.waitForTimeout(350);

  const m = await page.evaluate(() => {
    const r = (n) => {
      if (!n) return null;
      const b = n.getBoundingClientRect();
      return { left: +b.left.toFixed(2), right: +b.right.toFixed(2), top: +b.top.toFixed(2), bottom: +b.bottom.toFixed(2) };
    };
    const wrapper = document.querySelector('.admin-nav-search');
    const input = document.querySelector('.admin-nav-search-input');
    const clear = document.querySelector('.admin-nav-search-clear');
    const inputCs = input ? getComputedStyle(input) : null;
    return {
      wrapper: r(wrapper),
      input: r(input),
      clear: r(clear),
      inputBorderRight: inputCs ? inputCs.borderRightWidth + ' ' + inputCs.borderRightColor : null,
      results: [...document.querySelectorAll('.admin-nav .admin-nav-link')].map((n) => n.textContent.trim()),
      descriptions: document.querySelectorAll('.admin-nav-link-description').length,
      highlights: document.querySelectorAll('.admin-nav-search-highlight').length,
    };
  });

  const overflow = m.clear && m.input ? +(m.clear.right - m.input.right).toFixed(2) : null;
  out[mode] = { ...m, clearOverflowsInputByPx: overflow };
  console.log(
    `${mode}: input.right=${m.input && m.input.right} clear.right=${m.clear && m.clear.right} clear.left=${m.clear && m.clear.left} ` +
      `=> × spills ${overflow}px past the input border | descriptions=${m.descriptions} highlights=${m.highlights} | results=${JSON.stringify(m.results)}`
  );

  await page.screenshot({
    path: join(OUT, `OBRS-900-BEFORE-${mode}-2-query-fare.png`),
    clip: { x: 0, y: 0, width: 320, height: 900 },
  });
  if (m.input) {
    await page.screenshot({
      path: join(OUT, `OBRS-900-BEFORE-${mode}-3-search-field-closeup.png`),
      clip: { x: Math.max(0, m.input.left - 14), y: Math.max(0, m.input.top - 14), width: (m.input.right - m.input.left) + 40, height: (m.input.bottom - m.input.top) + 28 },
    });
  }

  await browser.close();
}

writeFileSync(join(OUT, 'OBRS-900-measurements-BEFORE.json'), JSON.stringify(out, null, 2), 'utf8');
