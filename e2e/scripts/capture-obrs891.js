// Standalone capture script for OBRS-891 visual evidence (not a Playwright test,
// not part of the suite).
//
// Approach: NO local backend, NO mocks — the Routes page reads plain SIT data and
// SIT CORS reflects any localhost origin, so AFTER (this branch) and BEFORE
// (origin/dev) can be served in PARALLEL with `ng serve --configuration sit` on
// two ports and captured in one pass.
//
//   node e2e/scripts/capture-obrs891.js --port 4300 --tag AFTER
//   node e2e/scripts/capture-obrs891.js --port 4400 --tag BEFORE --no-video
//
// The subject is an INTERACTION, so a still can only prove it by pairing: shot 01
// is the page at rest (the page auto-selects filteredRoutes[0], see
// routes-page.component.ts applyRouteListFromCache), shot 02 is the same page
// after clicking a NON-interactive cell of a different row. On AFTER the two
// detail panels must have changed; on BEFORE they must NOT have.
//
// Nothing is composed or force-styled here — every state is reached by driving
// the real UI, and the script REFUSES to save a shot whose DOM measurements
// disagree with the claim the image will be read as making.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const PORT = arg('port', '4300');
const TAG = arg('tag', 'AFTER');
const WANT_VIDEO = !argv.includes('--no-video');

const BASE = `http://localhost:${PORT}`;
const EMAIL = 'admin@system.local';
const PASSWORD = process.env.SIT_PASSWORD || 'P@ssw0rd';
// Never row 0 — that is the one applyRouteListFromCache already auto-selected, so
// clicking it would prove nothing on either branch. SIT currently seeds 2 routes,
// hence the default of 1; `--row N` if the env has more.
const ROW_TO_CLICK = Number(arg('row', '1'));

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-891');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

// Every data row of the route list, on BOTH branches: `.route-row` only exists on
// AFTER, so the shared selector must not mention it.
const LIST_ROWS = 'app-route-list-table tbody tr:not(.admin-skeleton-row):not(.admin-empty-row)';
const DETAIL = 'app-route-detail-panel';

async function measure(page) {
  return page.evaluate(
    ({ LIST_ROWS, DETAIL }) => {
      const rows = Array.from(document.querySelectorAll(LIST_ROWS));
      const panel = document.querySelector(DETAIL);
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      return {
        rowCount: rows.length,
        rowSlugs: rows.map((r) => norm(r.querySelector('td code')?.textContent)),
        selectedIndex: rows.findIndex((r) => r.classList.contains('is-selected')),
        // The panels never print the slug, so the stop list IS the identity of
        // what is displayed. Same for the fare table's row count.
        stopsText: norm(panel?.querySelector('.admin-timeline')?.textContent),
        stopCount: panel?.querySelectorAll('.admin-timeline li').length ?? 0,
        segmentRows:
          panel?.querySelectorAll('table.admin-table tbody tr:not(.admin-empty-row)').length ?? 0,
        panelBottom: panel ? Math.round(panel.getBoundingClientRect().bottom + window.scrollY) : 0,
        swalCount: document.querySelectorAll('.swal2-popup').length,
      };
    },
    { LIST_ROWS, DETAIL },
  );
}

// A shot is only allowed out if the DOM agrees with what the picture claims.
async function shoot(page, file, expectations) {
  const m = await measure(page);
  const fail = [];
  if (m.swalCount !== 0) fail.push(`swal overlay present (${m.swalCount})`);
  if (m.rowCount < ROW_TO_CLICK + 1) fail.push(`only ${m.rowCount} route rows`);
  if (m.stopCount === 0) fail.push('stop-sequence panel is empty');
  for (const [key, want] of Object.entries(expectations)) {
    if (m[key] !== want) fail.push(`${key}=${JSON.stringify(m[key])} expected ${JSON.stringify(want)}`);
  }
  if (fail.length) {
    throw new Error(`REFUSING to save ${file}:\n  - ${fail.join('\n  - ')}`);
  }
  const out = path.join(ASSETS_DIR, file);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`  saved ${file}  (selectedIndex=${m.selectedIndex}, stops=${m.stopCount}, fares=${m.segmentRows})`);
  return m;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    ...(WANT_VIDEO
      ? { recordVideo: { dir: path.join(ASSETS_DIR, '_video'), size: { width: 1600, height: 1000 } } }
      : {}),
  });
  const page = await context.newPage();

  console.log(`[${TAG}] ${BASE} — logging in as ${EMAIL}`);
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[formcontrolname="email"]', EMAIL);
  await page.fill('input[formcontrolname="password"]', PASSWORD);
  await page.click('.login-btn');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45_000 });

  await page.goto(`${BASE}/admin/routes`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(LIST_ROWS, { timeout: 45_000 });
  await page.waitForSelector(`${DETAIL} .admin-timeline li`, { timeout: 45_000 });
  await page.waitForTimeout(1200); // let the fare table settle too

  // ── 01: at rest. The page auto-selected the FIRST route. ──────────────────
  const atRest = await shoot(page, `OBRS-891-${TAG}-01-at-rest-first-route.png`, {
    selectedIndex: 0,
  });

  // ── click a non-interactive cell of row 3 (the route-name cell) ───────────
  const targetSlug = atRest.rowSlugs[ROW_TO_CLICK];
  console.log(`  clicking the name cell of row ${ROW_TO_CLICK + 1} ("${targetSlug}")`);
  const cell = page.locator(LIST_ROWS).nth(ROW_TO_CLICK).locator('td').nth(1);
  await cell.hover();
  await page.waitForTimeout(400); // let the hover affordance paint for the video
  await cell.click();
  await page.waitForTimeout(2500); // route-stops + segments are two real SIT calls

  // ── 02: the claim each branch's image makes, asserted before saving ───────
  const expectations =
    TAG === 'BEFORE'
      ? // must-NOT: the click is inert, so nothing moved.
        { selectedIndex: 0, stopsText: atRest.stopsText, segmentRows: atRest.segmentRows }
      : // must-catch: selection moved to the clicked row AND the panels reloaded.
        { selectedIndex: ROW_TO_CLICK };
  const after = await shoot(page, `OBRS-891-${TAG}-02-after-clicking-row-${ROW_TO_CLICK + 1}.png`, expectations);

  // ── 03: a MATCHED clip for side-by-side review ────────────────────────────
  // The two full-page shots differ in HEIGHT because the two routes have 8 vs 25
  // stops, and a reviewer laying them side by side would read that as a layout
  // change. This third frame uses one geometry-derived clip on both branches:
  // the KPI strip (which prints the selected route's stop count), the route list
  // (which prints the selection), and the top of both detail panels.
  const clip = await page.evaluate(
    ({ DETAIL }) => {
      const kpi = document.querySelector('.admin-kpi-grid, .admin-grid');
      const list = document.querySelector('app-route-list-table section');
      const panel = document.querySelector(DETAIL);
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, left: r.left, right: r.right };
      };
      const parts = [kpi, list, panel].filter(Boolean).map(box);
      const top = Math.min(...parts.map((p) => p.top)) - 16;
      const left = Math.min(...parts.map((p) => p.left)) - 16;
      const right = Math.max(...parts.map((p) => p.right)) + 16;
      const p = box(panel);
      // 560px into the panels is enough for both headings and the first rows.
      const bottom = Math.min(p.top + 560, p.bottom) + 16;
      return { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top), panelTop: Math.round(p.top) };
    },
    { DETAIL },
  );
  if (clip.y + clip.height < clip.panelTop + 300) {
    throw new Error(`clip stops before the detail panels are visible: ${JSON.stringify(clip)}`);
  }
  await page.screenshot({
    path: path.join(ASSETS_DIR, `OBRS-891-${TAG}-03-matched-clip.png`),
    clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height },
  });
  console.log(`  saved OBRS-891-${TAG}-03-matched-clip.png  (clip ${clip.width}x${clip.height})`);

  if (TAG !== 'BEFORE' && after.stopsText === atRest.stopsText) {
    throw new Error(
      'selection moved but the stop-sequence panel is unchanged — the panels did not reload',
    );
  }
  console.log(
    `[${TAG}] stop sequence ${after.stopsText === atRest.stopsText ? 'UNCHANGED' : 'CHANGED'}; ` +
      `fare rows ${atRest.segmentRows} -> ${after.segmentRows}`,
  );

  await context.close();
  await browser.close();

  if (WANT_VIDEO) {
    const dir = path.join(ASSETS_DIR, '_video');
    const src = fs.readdirSync(dir).find((f) => f.endsWith('.webm'));
    const dest = path.join(ASSETS_DIR, `OBRS-891-${TAG}-row-click.webm`);
    fs.renameSync(path.join(dir, src), dest);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`  saved ${path.basename(dest)}`);
  }
  console.log(`[${TAG}] done -> ${ASSETS_DIR}`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
