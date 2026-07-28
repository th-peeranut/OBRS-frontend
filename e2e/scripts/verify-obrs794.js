// OBRS-794 live verification: the admin sidebar menu search must restore the
// FULL menu tree on every path that empties the query.
//
// Runs against a real SIT login (no API stubbing) so the sidebar is built from
// the real role grants, exactly as the reporter saw it. Point CAPTURE_BASE at
// the local worktree server for AFTER, or at the deployed SIT frontend for
// BEFORE (which still carries the old code).
//
// Usage:
//   CAPTURE_BASE=http://localhost:4280 node e2e/scripts/verify-obrs794.js after
//   CAPTURE_BASE=https://sit-obrs-frontend.netlify.app node e2e/scripts/verify-obrs794.js before
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.CAPTURE_BASE || 'http://localhost:4280';
const TAG = (process.argv[2] || 'after').toUpperCase();
const OUT_DIR = process.env.CAPTURE_OUT || path.resolve(__dirname, '..', '..', '..', 'obrs-agent-office', '.claude', 'agent-office', 'scripts', 'captures', 'obrs-794');
fs.mkdirSync(OUT_DIR, { recursive: true });

const LINK_SEL = '.admin-nav-link:not(.admin-nav-btn)';
const TITLE_SEL = '.admin-nav-section-title';
const INPUT_SEL = '.admin-nav-search-input';
const CLEAR_SEL = '.admin-nav-search-clear';

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

// What the user can actually SEE in the sidebar. Counting the rendered anchors
// and section headers, never a component field — the whole defect was a field
// that agreed while the DOM did not.
async function measure(page) {
  return page.evaluate(
    ({ linkSel, titleSel }) => ({
      links: document.querySelectorAll(linkSel).length,
      titles: document.querySelectorAll(titleSel).length,
      labels: Array.from(document.querySelectorAll(titleSel)).map((el) => el.textContent.trim()),
    }),
    { linkSel: LINK_SEL, titleSel: TITLE_SEL }
  );
}

async function typeQuery(page, text) {
  await page.locator(INPUT_SEL).click();
  await page.locator(INPUT_SEL).press('Control+a');
  await page.locator(INPUT_SEL).press('Delete');
  await page.locator(INPUT_SEL).type(text, { delay: 40 });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
  await page.addInitScript(() => localStorage.setItem('app_language', 'th'));

  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('input[type="email"]').fill('admin@system.local');
  await page.locator('input[type="password"]').fill('P@ssw0rd');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90_000 });

  await page.goto(`${BASE}/admin/dashboard`);
  await page.locator(INPUT_SEL).waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(500);

  const baseline = await measure(page);
  console.log(`baseline: ${baseline.links} links / ${baseline.titles} sections [${baseline.labels.join(' | ')}]`);
  await page.screenshot({ path: path.join(OUT_DIR, `${TAG}-1-baseline.png`), clip: { x: 0, y: 0, width: 300, height: 864 } });

  // ── Case 1: the reported repro — type, then BACKSPACE to empty ─────────────
  await typeQuery(page, 'lookup');
  const narrowed = await measure(page);
  await page.screenshot({ path: path.join(OUT_DIR, `${TAG}-2-typed.png`), clip: { x: 0, y: 0, width: 300, height: 864 } });
  for (let i = 0; i < 'lookup'.length; i++) {
    await page.locator(INPUT_SEL).press('Backspace');
    await page.waitForTimeout(60);
  }
  const afterBackspace = await measure(page);
  await page.screenshot({ path: path.join(OUT_DIR, `${TAG}-3-backspaced-to-empty.png`), clip: { x: 0, y: 0, width: 300, height: 864 } });
  record(
    'backspacing the query to empty restores every menu',
    afterBackspace.links === baseline.links && afterBackspace.titles === baseline.titles,
    `narrowed=${narrowed.links}/${narrowed.titles} -> cleared=${afterBackspace.links}/${afterBackspace.titles} (baseline ${baseline.links}/${baseline.titles})`
  );
  record(
    'the search actually narrowed first (so the case above is not vacuous)',
    narrowed.links > 0 && narrowed.links < baseline.links,
    `${narrowed.links} of ${baseline.links} links matched "lookup"`
  );

  // ── Case 2: the × clear button ─────────────────────────────────────────────
  await typeQuery(page, 'lookup');
  await page.locator(CLEAR_SEL).click();
  await page.waitForTimeout(150);
  const afterClearBtn = await measure(page);
  record(
    'the x clear button restores every menu',
    afterClearBtn.links === baseline.links && afterClearBtn.titles === baseline.titles,
    `${afterClearBtn.links}/${afterClearBtn.titles} vs baseline ${baseline.links}/${baseline.titles}`
  );

  // ── Case 3: Escape ─────────────────────────────────────────────────────────
  await typeQuery(page, 'lookup');
  await page.locator(INPUT_SEL).press('Escape');
  await page.waitForTimeout(150);
  const afterEscape = await measure(page);
  record(
    'Escape restores every menu',
    afterEscape.links === baseline.links && afterEscape.titles === baseline.titles,
    `${afterEscape.links}/${afterEscape.titles} vs baseline ${baseline.links}/${baseline.titles}`
  );

  // ── Case 4: clicking a result — sidebar restored AND navigation still works.
  // The fix makes clearNavSearch() rebuild the section list, which recreates the
  // very <a> being clicked. Asserting only the sidebar would miss a broken
  // routerLink, so assert the URL actually moved.
  await typeQuery(page, 'lookup');
  await page.waitForTimeout(150);
  const urlBefore = new URL(page.url()).pathname;
  await page.locator(LINK_SEL).first().click();
  await page.waitForTimeout(1500);
  const urlAfter = new URL(page.url()).pathname;
  const afterClick = await measure(page);
  record(
    'clicking a search result still NAVIGATES (routerLink survives the rebuild)',
    urlAfter !== urlBefore && urlAfter.includes('lookup'),
    `${urlBefore} -> ${urlAfter}`
  );
  record(
    'clicking a search result restores every menu',
    afterClick.links === baseline.links && afterClick.titles === baseline.titles,
    `${afterClick.links}/${afterClick.titles} vs baseline ${baseline.links}/${baseline.titles}`
  );
  await page.screenshot({ path: path.join(OUT_DIR, `${TAG}-4-after-result-click.png`), clip: { x: 0, y: 0, width: 300, height: 864 } });

  // ── Control: a query that matches nothing must still show the empty hint ───
  await typeQuery(page, 'zzzznosuchmenu');
  await page.waitForTimeout(200);
  const emptyHint = await page.locator('.admin-nav-empty').count();
  const emptyMeasure = await measure(page);
  record(
    'CONTROL: a non-matching query still shows the no-results hint and no links',
    emptyHint === 1 && emptyMeasure.links === 0,
    `hint=${emptyHint} links=${emptyMeasure.links}`
  );

  // ── Control: dark mode — the same restore path with the theme toggled ──────
  await page.locator(INPUT_SEL).press('Escape');
  await page.waitForTimeout(150);
  const darkToggle = page.locator('.admin-topbar-actions button.admin-icon-btn[aria-pressed]').first();
  if (await darkToggle.count()) {
    await darkToggle.click();
    await page.waitForTimeout(400);
    await typeQuery(page, 'lookup');
    for (let i = 0; i < 'lookup'.length; i++) {
      await page.locator(INPUT_SEL).press('Backspace');
      await page.waitForTimeout(50);
    }
    const dark = await measure(page);
    await page.screenshot({ path: path.join(OUT_DIR, `${TAG}-5-dark-cleared.png`), clip: { x: 0, y: 0, width: 300, height: 864 } });
    record(
      'CONTROL: dark mode behaves identically',
      dark.links === baseline.links && dark.titles === baseline.titles,
      `${dark.links}/${dark.titles} vs baseline ${baseline.links}/${baseline.titles}`
    );
  } else {
    record('CONTROL: dark mode behaves identically', false, 'theme toggle not found - NOT VERIFIED');
  }

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== ${TAG}: ${results.length - failed.length}/${results.length} passed ===`);
  fs.writeFileSync(path.join(OUT_DIR, `${TAG}-results.json`), JSON.stringify({ baseline, results }, null, 2));
  process.exit(failed.length ? 1 : 0);
})();
