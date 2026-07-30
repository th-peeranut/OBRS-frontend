// OBRS-900 evidence: the admin sidebar menu search must (a) show WHY a menu
// matched — the translated description with the query highlighted — and (b) keep
// the clear (×) button inside the input's box.
//
// Both are measured, not eyeballed. The × bug was originally found by
// pixel-scanning the user's screenshot (input right border x=248, × glyph
// painted at x=249-258); a screenshot alone cannot prove the fix, so this reads
// getBoundingClientRect() for the box and the button in four states: the two
// themes, crossed with the sidebar having a scrollbar (empty query, full menu)
// and not having one (filtered to a couple of results).
//
// Usage: node e2e/capture-obrs-900.mjs <baseUrl> <outDir>

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// localhost, not 127.0.0.1 — SIT's CORS reflects the former only.
const BASE = process.argv[2] || 'http://localhost:4256';
const OUT = process.argv[3] || '.';
mkdirSync(OUT, { recursive: true });

const QUERY = 'ค่าโดยสาร';
const rows = [];
const failures = [];

function check(name, ok, detail) {
  rows.push({ name, ok, detail });
  if (!ok) failures.push(`${name} :: ${detail}`);
}

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

  // Assert the theme precondition actually landed — otherwise a file named
  // "dark" is a light screenshot with a confident name.
  const isDark = await page.evaluate(() => document.body.classList.contains('is-dark'));
  check(`${mode}: theme precondition`, isDark === (mode === 'dark'), `body.is-dark=${isDark}`);

  // ── State 1: empty query — full menu, sidebar likely scrolls ───────────────
  const emptyState = await page.evaluate(() => {
    const panel = document.querySelector('.admin-sidebar-panel');
    return {
      // `.admin-nav .admin-nav-link` and NOT a bare `.admin-nav-link`: the
      // sidebar footer's Support / Sign-out buttons carry the same class, so a
      // bare selector counts 23 where the nav holds 21 and every restore check
      // reads as a failure that never happened.
      links: document.querySelectorAll('.admin-nav .admin-nav-link').length,
      sections: document.querySelectorAll('.admin-nav-section-title').length,
      descriptions: document.querySelectorAll('.admin-nav-link-description').length,
      highlights: document.querySelectorAll('.admin-nav-search-highlight').length,
      scrolls: panel ? panel.scrollHeight > panel.clientHeight : null,
      clearButton: document.querySelectorAll('.admin-nav-search-clear').length,
    };
  });
  check(
    `${mode}: empty query renders no description line (AC1)`,
    emptyState.descriptions === 0 && emptyState.highlights === 0,
    JSON.stringify(emptyState)
  );
  const fullMenuLinks = emptyState.links;
  const fullMenuSections = emptyState.sections;

  await page.screenshot({
    path: join(OUT, `OBRS-900-AFTER-${mode}-1-sidebar-empty-query.png`),
    clip: { x: 0, y: 0, width: 320, height: 900 },
  });

  // ── State 2: the real query the user typed ────────────────────────────────
  await page.locator('.admin-nav-search-input').fill(QUERY);
  await page.waitForTimeout(350);

  const queryState = await page.evaluate((q) => {
    const wrapper = document.querySelector('.admin-nav-search');
    const input = document.querySelector('.admin-nav-search-input');
    const clear = document.querySelector('.admin-nav-search-clear');
    const panel = document.querySelector('.admin-sidebar-panel');
    const hl = [...document.querySelectorAll('.admin-nav-search-highlight')].map((n) => n.textContent);
    const desc = [...document.querySelectorAll('.admin-nav-link-description')].map((n) =>
      n.textContent.trim()
    );
    const labels = [...document.querySelectorAll('.admin-nav .admin-nav-link')].map((n) => n.textContent.trim());
    const r = (n) => {
      if (!n) return null;
      const b = n.getBoundingClientRect();
      return { left: +b.left.toFixed(2), right: +b.right.toFixed(2), top: +b.top.toFixed(2), bottom: +b.bottom.toFixed(2), width: +b.width.toFixed(2) };
    };
    const cs = wrapper ? getComputedStyle(wrapper) : null;
    const inputCs = input ? getComputedStyle(input) : null;
    return {
      wrapper: r(wrapper),
      input: r(input),
      clear: r(clear),
      boxBorder: cs ? cs.borderRightWidth + ' ' + cs.borderColor : null,
      inputBorder: inputCs ? inputCs.borderRightWidth : null,
      inputPaddingRight: inputCs ? inputCs.paddingRight : null,
      wrapperBg: cs ? cs.backgroundColor : null,
      highlights: hl,
      descriptions: desc,
      labels,
      scrolls: panel ? panel.scrollHeight > panel.clientHeight : null,
      results: document.querySelectorAll('.admin-nav .admin-nav-link').length,
      matchesQuery: hl.every((t) => t && t.toLowerCase() === q.toLowerCase()),
    };
  }, QUERY);

  // AC2 — the searched words must be visible, highlighted, in the description.
  check(
    `${mode}: query "${QUERY}" highlights the matched substring (AC2)`,
    queryState.highlights.length > 0 && queryState.matchesQuery,
    JSON.stringify(queryState.highlights)
  );
  check(
    `${mode}: the matched menu shows its description (AC1/AC2)`,
    queryState.descriptions.length > 0 && queryState.descriptions.some((d) => d.includes(QUERY)),
    JSON.stringify(queryState.descriptions)
  );

  // AC2 (the part that matters) — the highlight must be VISIBLE, not merely
  // present in the DOM. The first pass of this harness asserted textContent and
  // passed while the description rendered as one `white-space: nowrap` line that
  // ran 36px past the sidebar's right edge, carrying the highlighted match
  // off-screen. Existence is a proxy; containment is the effect the card promises.
  const geometry = await page.evaluate(() => {
    const r = (n) => {
      if (!n) return null;
      const b = n.getBoundingClientRect();
      return { left: +b.left.toFixed(1), right: +b.right.toFixed(1) };
    };
    const panel = document.querySelector('.admin-sidebar-panel');
    const link = document.querySelector('.admin-nav .admin-nav-link');
    const desc = document.querySelector('.admin-nav-link-description');
    return {
      panel: r(panel),
      link: r(link),
      desc: r(desc),
      descScrollWidth: desc ? desc.scrollWidth : null,
      descClientWidth: desc ? desc.clientWidth : null,
      descWhiteSpace: desc ? getComputedStyle(desc).whiteSpace : null,
      highlights: [...document.querySelectorAll('.admin-nav-search-highlight')].map((n) => ({
        text: n.textContent,
        ...r(n),
      })),
    };
  });
  check(
    `${mode}: every highlight is inside its nav link, on screen (AC2 — visible, not just present)`,
    geometry.highlights.length > 0 &&
      geometry.link &&
      geometry.highlights.every((h) => h.left >= geometry.link.left - 1 && h.right <= geometry.link.right + 1),
    JSON.stringify({ link: geometry.link, highlights: geometry.highlights })
  );
  check(
    `${mode}: the description does not overflow its own box (must wrap, not clip)`,
    geometry.descScrollWidth !== null && geometry.descScrollWidth <= geometry.descClientWidth + 1,
    `scrollWidth=${geometry.descScrollWidth} clientWidth=${geometry.descClientWidth} white-space=${geometry.descWhiteSpace}`
  );

  // AC5 — the × button must sit INSIDE the box that draws the border.
  // The box is whichever element carries the visible border after the fix.
  const box = queryState.wrapper;
  const btn = queryState.clear;
  check(
    `${mode}: × button inside the search box, no scrollbar (AC5)`,
    btn && box && btn.right <= box.right && btn.left >= box.left,
    `box.right=${box && box.right} btn.right=${btn && btn.right} btn.left=${btn && btn.left} box.left=${box && box.left} sidebarScrolls=${queryState.scrolls}`
  );
  // AC6 — typed text must not slide under the button.
  check(
    `${mode}: input's text area stops before the × button (AC6)`,
    queryState.input && btn && queryState.input.right <= btn.left + 1,
    `input.right=${queryState.input && queryState.input.right} btn.left=${btn && btn.left}`
  );

  await page.screenshot({
    path: join(OUT, `OBRS-900-AFTER-${mode}-2-query-fare.png`),
    clip: { x: 0, y: 0, width: 320, height: 900 },
  });
  // A tight crop of the search field itself — this is the × evidence.
  if (box) {
    await page.screenshot({
      path: join(OUT, `OBRS-900-AFTER-${mode}-3-search-field-closeup.png`),
      clip: { x: Math.max(0, box.left - 14), y: Math.max(0, box.top - 14), width: box.width + 28, height: (box.bottom - box.top) + 28 },
    });
  }

  // ── State 3: focus ring must land on the box that now draws the border ────
  await page.locator('.admin-nav-search-input').focus();
  await page.waitForTimeout(250);
  const focused = await page.evaluate(() => {
    const w = document.querySelector('.admin-nav-search');
    const cs = getComputedStyle(w);
    return { borderColor: cs.borderColor, boxShadow: cs.boxShadow };
  });
  check(
    `${mode}: focus ring renders on the search box (:focus-within)`,
    focused.boxShadow && focused.boxShadow !== 'none',
    JSON.stringify(focused)
  );

  // ── State 4: a full-menu query state WITH a scrollbar present ─────────────
  // A one-character query that matches nearly everything keeps the list long.
  await page.locator('.admin-nav-search-input').fill('า');
  await page.waitForTimeout(350);
  const scrollState = await page.evaluate(() => {
    const panel = document.querySelector('.admin-sidebar-panel');
    const w = document.querySelector('.admin-nav-search');
    const c = document.querySelector('.admin-nav-search-clear');
    const r = (n) => (n ? { left: +n.getBoundingClientRect().left.toFixed(2), right: +n.getBoundingClientRect().right.toFixed(2) } : null);
    return {
      scrolls: panel ? panel.scrollHeight > panel.clientHeight : null,
      results: document.querySelectorAll('.admin-nav .admin-nav-link').length,
      box: r(w),
      clear: r(c),
    };
  });
  check(
    `${mode}: × button inside the box WITH a sidebar scrollbar (AC5)`,
    scrollState.clear && scrollState.box && scrollState.clear.right <= scrollState.box.right && scrollState.clear.left >= scrollState.box.left,
    JSON.stringify(scrollState)
  );

  // ── State 5: OBRS-794 — every clear path restores the full menu ───────────
  // (a) the × button
  await page.locator('.admin-nav-search-clear').click();
  await page.waitForTimeout(300);
  let restored = await page.evaluate(() => ({
    links: document.querySelectorAll('.admin-nav .admin-nav-link').length,
    sections: document.querySelectorAll('.admin-nav-section-title').length,
    descriptions: document.querySelectorAll('.admin-nav-link-description').length,
    highlights: document.querySelectorAll('.admin-nav-search-highlight').length,
  }));
  check(
    `${mode}: × button restores the full menu and clears segments (AC7)`,
    restored.links === fullMenuLinks && restored.sections === fullMenuSections && restored.descriptions === 0 && restored.highlights === 0,
    `${JSON.stringify(restored)} vs full={links:${fullMenuLinks},sections:${fullMenuSections}}`
  );

  // (b) Escape
  await page.locator('.admin-nav-search-input').fill(QUERY);
  await page.waitForTimeout(250);
  await page.locator('.admin-nav-search-input').press('Escape');
  await page.waitForTimeout(300);
  restored = await page.evaluate(() => ({
    links: document.querySelectorAll('.admin-nav .admin-nav-link').length,
    sections: document.querySelectorAll('.admin-nav-section-title').length,
    descriptions: document.querySelectorAll('.admin-nav-link-description').length,
    value: document.querySelector('.admin-nav-search-input').value,
  }));
  check(
    `${mode}: Escape restores the full menu (AC7)`,
    restored.links === fullMenuLinks && restored.sections === fullMenuSections && restored.descriptions === 0 && restored.value === '',
    JSON.stringify(restored)
  );

  // (c) backspacing to blank
  await page.locator('.admin-nav-search-input').fill('เส้น');
  await page.waitForTimeout(250);
  for (let i = 0; i < 8; i++) await page.locator('.admin-nav-search-input').press('Backspace');
  await page.waitForTimeout(300);
  restored = await page.evaluate(() => ({
    links: document.querySelectorAll('.admin-nav .admin-nav-link').length,
    sections: document.querySelectorAll('.admin-nav-section-title').length,
    descriptions: document.querySelectorAll('.admin-nav-link-description').length,
    value: document.querySelector('.admin-nav-search-input').value,
  }));
  check(
    `${mode}: backspace-to-blank restores the full menu (AC7)`,
    restored.links === fullMenuLinks && restored.sections === fullMenuSections && restored.descriptions === 0 && restored.value === '',
    JSON.stringify(restored)
  );

  // ── State 6: XSS / regex-shaped query must not execute or crash (AC3) ─────
  let alerted = false;
  page.on('dialog', async (d) => {
    alerted = true;
    await d.dismiss();
  });
  for (const nasty of ['<img src=x onerror=alert(1)>', 'a)|(b', '.*', '\\']) {
    await page.locator('.admin-nav-search-input').fill(nasty);
    await page.waitForTimeout(250);
  }
  const afterNasty = await page.evaluate(() => ({
    injected: document.querySelectorAll('.admin-nav img, .admin-nav script').length,
    alive: !!document.querySelector('.admin-nav-search-input'),
  }));
  check(
    `${mode}: injection/regex-shaped queries are inert (AC3)`,
    !alerted && afterNasty.injected === 0 && afterNasty.alive,
    `alerted=${alerted} ${JSON.stringify(afterNasty)}`
  );

  // ── State 7: collapsed 76px icon rail must stay icons-only ────────────────
  await page.locator('.admin-nav-search-input').fill('');
  await page.waitForTimeout(200);
  await page.locator('.admin-sidebar-pin').click();
  await page.waitForTimeout(600);
  const rail = await page.evaluate(() => {
    const panel = document.querySelector('.admin-sidebar-panel');
    const label = document.querySelector('.admin-nav-link-label, .admin-nav-link > span:not(.material-symbols-outlined):not(.admin-nav-badge)');
    const search = document.querySelector('.admin-nav-search');
    return {
      panelWidth: panel ? +panel.getBoundingClientRect().width.toFixed(2) : null,
      labelWidth: label ? +label.getBoundingClientRect().width.toFixed(2) : null,
      labelOpacity: label ? getComputedStyle(label).opacity : null,
      searchDisplay: search ? getComputedStyle(search).display : null,
    };
  });
  check(
    `${mode}: collapsed rail hides labels and the search box`,
    rail.searchDisplay === 'none' && (rail.labelOpacity === '0' || rail.labelWidth === 0),
    JSON.stringify(rail)
  );
  await page.screenshot({
    path: join(OUT, `OBRS-900-AFTER-${mode}-4-collapsed-rail.png`),
    clip: { x: 0, y: 0, width: 200, height: 900 },
  });

  writeFileSync(join(OUT, `OBRS-900-measurements-${mode}.json`), JSON.stringify({ emptyState, queryState, scrollState, focused, rail }, null, 2), 'utf8');

  await browser.close();
}

writeFileSync(join(OUT, 'OBRS-900-checks.json'), JSON.stringify(rows, null, 2), 'utf8');

console.log('\n=== OBRS-900 verification ===');
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}\n        ${r.detail}`);
console.log(`\n${rows.filter((r) => r.ok).length}/${rows.length} checks passed`);
if (failures.length) {
  console.log('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
