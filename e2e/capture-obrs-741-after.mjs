// OBRS-741 AFTER evidence: the shipped brand-gradient treatment, measured on
// the real admin pages in both themes and in both rest and hover states.
//
// Hover is measured, not assumed, for one specific reason: the state this card
// replaced was `opacity: 0.9`, which composites the whole button against the
// card behind it. Source-reading gates cannot see that, and it dragged every
// candidate colour back under AA. A run that only photographs the rest state
// would have reported this fix as complete while the hover still failed.
//
// Usage: node e2e/capture-obrs-741-after.mjs <baseUrl> <outDir>

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// localhost, not 127.0.0.1 -- SIT's CORS reflects the former only.
const BASE = process.argv[2] || 'http://localhost:4291';
const OUT = process.argv[3] || '.';
mkdirSync(OUT, { recursive: true });

const luminance = ([r, g, b]) =>
  [r, g, b]
    .map((v) => v / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
    .reduce((a, c, i) => a + [0.2126, 0.7152, 0.0722][i] * c, 0);

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

function parseRgb(s) {
  const m = /rgba?\(([^)]+)\)/.exec(s || '');
  if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (p.length > 3 && p[3] < 1) return null;
  return [p[0], p[1], p[2]];
}

const TARGETS = [
  { slug: 'routes', url: '/admin/routes', sel: '.admin-btn-primary' },
  { slug: 'user-management', url: '/admin/user-management', sel: '.admin-btn-primary' },
  { slug: 'schedules', url: '/admin/schedules', sel: '.admin-btn-primary' },
  { slug: 'schedule-tab-count', url: '/admin/schedules', sel: '.schedule-tab.is-active .schedule-tab-count' },
  { slug: 'admin-avatar', url: '/admin/routes', sel: '.admin-avatar' },
];

const rows = [];

for (const mode of ['light', 'dark']) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
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
  await page.locator('input[type="email"]').waitFor({ timeout: 30000 });
  await page.locator('input[type="email"]').fill('admin@system.local');
  await page.locator('input[type="password"]').fill('P@ssw0rd');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45000 });

  for (const t of TARGETS) {
    await page.goto(`${BASE}${t.url}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1000);

    const el = page.locator(t.sel).first();
    if (!(await el.count())) {
      rows.push({ mode, target: t.slug, state: '-', note: `selector not present: ${t.sel}` });
      continue;
    }

    // ASSERT the theme precondition landed. ThemeService.init() reads the key at
    // bootstrap; if it had been the wrong key the page would render light and a
    // file called "dark" would be a light-mode screenshot with a confident name.
    const isDark = await page.evaluate(() => document.body.classList.contains('is-dark'));
    if (isDark !== (mode === 'dark')) {
      throw new Error(`theme precondition failed: wanted ${mode}, body.is-dark=${isDark}`);
    }

    for (const state of ['rest', 'hover']) {
      if (state === 'hover') await el.hover();
      else await page.mouse.move(0, 0);
      await page.waitForTimeout(220);

      const m = await el.evaluate((node) => {
        const cs = getComputedStyle(node);
        let surface = null;
        for (let n = node.parentElement; n; n = n.parentElement) {
          const bg = getComputedStyle(n).backgroundColor;
          if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) {
            surface = bg;
            break;
          }
        }
        return {
          color: cs.color,
          backgroundImage: cs.backgroundImage,
          backgroundColor: cs.backgroundColor,
          // The property that made the old hover unmeasurable from source.
          opacity: cs.opacity,
          surface,
        };
      });

      const stops = [...(m.backgroundImage || '').matchAll(/rgba?\([^)]+\)/g)]
        .map((x) => parseRgb(x[0]))
        .filter(Boolean);
      if (!stops.length && parseRgb(m.backgroundColor)) stops.push(parseRgb(m.backgroundColor));
      const fg = parseRgb(m.color);
      const worst = stops.length && fg ? Math.min(...stops.map((s) => ratio(fg, s))) : null;

      rows.push({
        mode,
        target: t.slug,
        state,
        opacity: m.opacity,
        text: m.color,
        stops: stops.map((s) => `rgb(${s.join(',')})`).join(' -> '),
        worst: worst === null ? null : +worst.toFixed(2),
        passesAA: worst === null ? null : worst >= 4.5,
      });

      const box = await el.boundingBox();
      if (box) {
        const pad = 26;
        await page.screenshot({
          path: join(OUT, `OBRS-741-AFTER-${mode}-${t.slug}-${state}.png`),
          clip: {
            x: Math.max(0, box.x - pad),
            y: Math.max(0, box.y - pad),
            width: box.width + pad * 2,
            height: box.height + pad * 2,
          },
        });
      }
    }
  }
  await browser.close();
}

writeFileSync(join(OUT, 'OBRS-741-after.json'), JSON.stringify(rows, null, 2));

let failures = 0;
console.log('mode   target              state  opac  text                stops                                          worst  AA');
for (const r of rows) {
  if (r.note) {
    console.log(`${r.mode.padEnd(6)} ${r.target.padEnd(19)} ${r.note}`);
    continue;
  }
  if (r.passesAA === false) failures++;
  console.log(
    `${r.mode.padEnd(6)} ${r.target.padEnd(19)} ${r.state.padEnd(6)} ${String(r.opacity).padEnd(5)} ${String(r.text).padEnd(19)} ${String(r.stops).padEnd(46)} ${String(r.worst).padEnd(6)} ${r.passesAA ? 'PASS' : 'FAIL'}`
  );
}
console.log(`\n${failures} channel(s) below AA out of ${rows.filter((r) => !r.note).length}`);
if (failures) process.exitCode = 1;
