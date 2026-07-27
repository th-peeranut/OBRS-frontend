// OBRS-741 option board: three candidate treatments for the brand-gradient
// family, rendered on the REAL admin pages rather than described in prose.
//
// Why a board and not a proposal: on OBRS-740 the "obviously right" option was
// picked from a description, shipped, and the owner immediately said the result
// read as foreign on the page. Three rendered options settled it in one look.
//
// Each option is injected as a stylesheet override on the live page, so what is
// photographed is the real cascade over the real surfaces -- not a swatch on a
// white card, which cannot show whether a fill still reads as "the primary
// button" next to its neighbours.
//
// Every shot is accompanied by measured getComputedStyle numbers: a picture
// that looks fine and fails AA is exactly the trap this card exists to close.
//
// Usage: node e2e/capture-obrs-741-options.mjs <baseUrl> <outDir>

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// NOTE the default host is `localhost`, not `127.0.0.1`. SIT's CORS filter
// reflects origins matching `localhost`, and 127.0.0.1 is not that string --
// the login POST dies as net::ERR_FAILED with no status, which reads exactly
// like "the backend is down" while /actuator/health returns 200.
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

// The three candidates. Each is a full stylesheet, so nothing is left implicit.
const OPTIONS = {
  BASELINE: '',

  // A -- keep white text and the ramp, darken only the BRIGHT end until white
  // clears AA on it. Smallest visual delta; the button stays a brand gradient.
  A: `
    .admin-shell { --accent-fill: #107eaf; }
    .admin-shell.theme-admin { --accent-fill: #d93e00; }
    .admin-shell.theme-staff { --accent-fill: #1b8477; --accent-strong: #0a6a5f; }
    .admin-btn-primary, .admin-btn-primary:not(:disabled):hover,
    .admin-avatar, .user-editor-save {
      background: linear-gradient(135deg, var(--accent-strong) 0%, var(--accent-fill, #107eaf) 100%) !important;
      color: #ffffff !important;
    }
    .navbar-avatar, .schedule-tab.is-active .schedule-tab-count {
      background: linear-gradient(135deg, #006687, #107eaf) !important;
      color: #ffffff !important;
    }
  `,

  // B -- drop the ramp entirely: one solid --accent-strong fill, white text.
  // The flattest, most conventional primary button.
  B: `
    .admin-shell.theme-staff { --accent-strong: #0a6a5f; }
    .admin-btn-primary, .admin-btn-primary:not(:disabled):hover,
    .admin-avatar, .user-editor-save {
      background: var(--accent-strong) !important;
      color: #ffffff !important;
    }
    .navbar-avatar, .schedule-tab.is-active .schedule-tab-count {
      background: #006687 !important;
      color: #ffffff !important;
    }
  `,

  // C -- the OBRS-740 FAB treatment applied here: keep the BRIGHT brand colour
  // as the fill and send the text dark instead.
  C: `
    .admin-btn-primary, .admin-btn-primary:not(:disabled):hover,
    .admin-avatar, .user-editor-save {
      background: linear-gradient(135deg, #4dbeef 0%, #2aa8d8 100%) !important;
      color: #093f57 !important;
    }
    .admin-shell.theme-admin .admin-btn-primary,
    .admin-shell.theme-admin .admin-avatar,
    .admin-shell.theme-admin .user-editor-save {
      background: linear-gradient(135deg, #ff7a45 0%, #f2691f 100%) !important;
      color: #4a1500 !important;
    }
    .admin-shell.theme-staff .admin-btn-primary,
    .admin-shell.theme-staff .admin-avatar,
    .admin-shell.theme-staff .user-editor-save {
      background: linear-gradient(135deg, #2dd4bf 0%, #16b9a4 100%) !important;
      color: #0c3f39 !important;
    }
    .navbar-avatar, .schedule-tab.is-active .schedule-tab-count {
      background: linear-gradient(135deg, #4dbeef, #2aa8d8) !important;
      color: #093f57 !important;
    }
  `,
};

const PAGES = [
  { slug: 'routes', url: '/admin/routes' },
  { slug: 'user-management', url: '/admin/user-management' },
  { slug: 'schedules', url: '/admin/schedules' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2, // the crops below are judged by eye; 1x is too soft for that
});
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
// Wait for the input to exist before filling: filling a not-yet-bound control
// leaves the reactive form invalid, the click is swallowed, and the run looks
// like an auth failure instead of a race.
await page.locator('input[type="email"]').waitFor({ timeout: 30000 });
await page.locator('input[type="email"]').fill('admin@system.local');
await page.locator('input[type="password"]').fill('P@ssw0rd');
await page.locator('button[type="submit"]').click();
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45000 });

const rows = [];

for (const p of PAGES) {
  await page.goto(`${BASE}${p.url}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1200);

  const hasBtn = await page.locator('.admin-btn-primary').first().count();
  if (!hasBtn) {
    rows.push({ page: p.slug, option: '-', note: 'no .admin-btn-primary rendered on this page' });
    continue;
  }

  for (const [name, css] of Object.entries(OPTIONS)) {
    // Replace, never stack: leaving option A's sheet in place while shooting B
    // would photograph a blend of the two and label it B.
    await page.evaluate((sheet) => {
      document.getElementById('obrs741-option')?.remove();
      if (!sheet) return;
      const el = document.createElement('style');
      el.id = 'obrs741-option';
      el.textContent = sheet;
      document.head.appendChild(el);
    }, css);
    await page.waitForTimeout(250);

    const measured = await page.evaluate(() => {
      const el = document.querySelector('.admin-btn-primary');
      if (!el) return null;
      const cs = getComputedStyle(el);
      const shell = document.querySelector('.admin-shell');
      // The surface the button actually sits on -- climb until something opaque
      // is found, because a themed foreground over an unthemed ancestor is how
      // a "fixed" contrast reading turns out to be measured against the wrong
      // background entirely.
      let surface = null;
      for (let n = el.parentElement; n; n = n.parentElement) {
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
        surface,
        shellClass: shell ? shell.className : '(no .admin-shell)',
        accent: shell ? getComputedStyle(shell).getPropertyValue('--accent').trim() : '',
        accentStrong: shell ? getComputedStyle(shell).getPropertyValue('--accent-strong').trim() : '',
      };
    });

    // Pull every colour stop out of the rendered gradient and score the text
    // against ALL of them: the whole defect being fixed is a ramp that passes at
    // one end and fails at the other.
    const stops = [...(measured.backgroundImage || '').matchAll(/rgba?\([^)]+\)/g)]
      .map((m) => parseRgb(m[0]))
      .filter(Boolean);
    if (!stops.length && parseRgb(measured.backgroundColor)) stops.push(parseRgb(measured.backgroundColor));
    const fg = parseRgb(measured.color);
    const worst = stops.length && fg ? Math.min(...stops.map((s) => ratio(fg, s))) : null;

    rows.push({
      page: p.slug,
      option: name,
      shell: measured.shellClass,
      accent: measured.accent,
      text: measured.color,
      stops: stops.map((s) => `rgb(${s.join(',')})`).join(' -> '),
      worstTextRatio: worst === null ? null : +worst.toFixed(2),
      passesAA: worst === null ? null : worst >= 4.5,
    });

    await page.screenshot({
      path: join(OUT, `OBRS-741-${p.slug}-${name}.png`),
      fullPage: false,
    });

    // A 1440x900 page shot renders the primary button about 60px tall, which is
    // too small to choose between three shades of the same hue -- the first run
    // of this board produced four pictures a human could not tell apart. Crop to
    // the button with padding so the decision is made on something visible.
    const box = await page.locator('.admin-btn-primary').first().boundingBox();
    if (box) {
      const pad = 26;
      await page.screenshot({
        path: join(OUT, `OBRS-741-${p.slug}-${name}-crop.png`),
        clip: {
          x: Math.max(0, box.x - pad),
          y: Math.max(0, box.y - pad),
          width: box.width + pad * 2,
          height: box.height + pad * 2,
        },
        scale: 'device',
      });
    }
  }
}

await browser.close();

writeFileSync(join(OUT, 'OBRS-741-options.json'), JSON.stringify(rows, null, 2));

console.log('page             option   accent     text                stops                                        worst  AA');
for (const r of rows) {
  if (r.note) {
    console.log(`${r.page.padEnd(16)} ${r.note}`);
    continue;
  }
  console.log(
    `${r.page.padEnd(16)} ${String(r.option).padEnd(8)} ${String(r.accent).padEnd(10)} ${String(r.text).padEnd(19)} ${String(r.stops).padEnd(44)} ${String(r.worstTextRatio).padEnd(6)} ${r.passesAA ? 'PASS' : 'FAIL'}`
  );
}
