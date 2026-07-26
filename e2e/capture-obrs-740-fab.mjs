// OBRS-740 evidence capture: the floating usability-report FAB, light + dark.
//
// This does two things that a screenshot alone cannot:
//
//   1. It ASSERTS the precondition landed before measuring through it. Dark
//      mode here is localStorage['app_admin_theme'] = 'dark' applied by
//      ThemeService.init() at bootstrap; if that key were wrong the page would
//      render LIGHT and a "dark mode" screenshot would be a light-mode
//      screenshot with a confident filename. So the run fails if
//      document.body does not actually carry `is-dark`.
//
//   2. It MEASURES the rendered pixels rather than trusting the stylesheet --
//      getComputedStyle on the real element, composited, then the WCAG 2.1
//      contrast ratio. The bug being fixed shipped precisely because a
//      `var(--accent, ...)` reference LOOKED themed while rendering its
//      fallback literal, so reading the source is not proof of what painted.
//
// Usage: node e2e/capture-obrs-740-fab.mjs <baseUrl> <outDir> <label>
//   label is BEFORE or AFTER and only affects the filenames.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:4200';
const OUT = process.argv[3] || '.';
const LABEL = (process.argv[4] || 'AFTER').toUpperCase();

mkdirSync(OUT, { recursive: true });

function luminance([r, g, b]) {
  const ch = [r, g, b]
    .map((v) => v / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function parseRgb(s) {
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  // An alpha < 1 means the reported colour is NOT what the eye sees; refuse to
  // score it rather than quietly compositing against a guess.
  if (parts.length > 3 && parts[3] < 1) return null;
  return [parts[0], parts[1], parts[2]];
}

const results = [];

for (const mode of ['light', 'dark']) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* ignore */
      }
    },
    ['app_admin_theme', mode]
  );
  const page = await ctx.newPage();

  // Stub every API call BEFORE the first navigation. Without this the page
  // raises a backend-down SweetAlert whose full-screen `.swal2-container`
  // both covers the FAB in the screenshot and intercepts the hover, so the
  // hover measurement times out. The evidence would be contaminated rather
  // than merely incomplete -- the overlay is what the reviewer would see.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Belt and braces: if anything still managed to raise a dialog, take it out
  // and say so, rather than photographing it.
  const swal = await page.evaluate(() => {
    const n = document.querySelectorAll('.swal2-container').length;
    document.querySelectorAll('.swal2-container').forEach((el) => el.remove());
    return n;
  });
  if (swal) console.log(`  (removed ${swal} stray swal2 overlay(s) in ${mode} mode before measuring)`);

  // --- precondition assertion, before anything is measured or captured ---
  const isDark = await page.evaluate(() => document.body.classList.contains('is-dark'));
  if (isDark !== (mode === 'dark')) {
    throw new Error(
      `precondition FAILED: asked for ${mode} mode but document.body.is-dark === ${isDark}. ` +
        `Every measurement below would have been taken on the wrong theme.`
    );
  }

  const fab = page.locator('.report-fab');
  await fab.waitFor({ state: 'visible', timeout: 15000 });

  const measure = async () => {
    const raw = await fab.evaluate((el) => {
      const cs = getComputedStyle(el);
      const pageBg = getComputedStyle(document.body).backgroundColor;
      return { bg: cs.backgroundColor, fg: cs.color, size: cs.fontSize, weight: cs.fontWeight, pageBg };
    });
    const bg = parseRgb(raw.bg);
    const fg = parseRgb(raw.fg);
    const pageBg = parseRgb(raw.pageBg);
    return {
      ...raw,
      textRatio: bg && fg ? +ratio(bg, fg).toFixed(2) : null,
      surfaceVsPage: bg && pageBg ? +ratio(bg, pageBg).toFixed(2) : null,
    };
  };

  const rest = await measure();
  await page.screenshot({ path: join(OUT, `OBRS-740-${LABEL}-fab-${mode}-page.png`), fullPage: false });
  await fab.screenshot({ path: join(OUT, `OBRS-740-${LABEL}-fab-${mode}-closeup.png`) });

  await fab.hover();
  await page.waitForTimeout(400); // the 0.2s background-color transition
  const hover = await measure();
  await fab.screenshot({ path: join(OUT, `OBRS-740-${LABEL}-fab-${mode}-hover.png`) });

  results.push({ mode, rest, hover });
  await browser.close();
}

console.log(`\nOBRS-740 FAB measurement (${LABEL}) -- ${BASE}`);
console.log('mode   state  text on fill        ratio  AA(4.5)  fill vs page  1.4.11(3.0)');
let failures = 0;
for (const r of results) {
  for (const state of ['rest', 'hover']) {
    const m = r[state];
    const textOk = m.textRatio !== null && m.textRatio >= 4.5;
    const surfOk = m.surfaceVsPage === null || m.surfaceVsPage >= 3.0;
    if (!textOk || !surfOk) failures++;
    console.log(
      `${r.mode.padEnd(6)} ${state.padEnd(6)} ${String(m.fg).padEnd(20)} ${String(m.textRatio).padStart(5)}  ` +
        `${(textOk ? 'PASS' : 'FAIL').padEnd(7)}  ${String(m.surfaceVsPage).padStart(6)}       ${surfOk ? 'PASS' : 'FAIL'}`
    );
    console.log(`       fill=${m.bg}  font=${m.size}/${m.weight}`);
  }
}
console.log(`\nfailures: ${failures}`);
console.log(`screenshots written to ${OUT}`);
process.exit(0);
