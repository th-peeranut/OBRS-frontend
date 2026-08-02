// OBRS-917 evidence: PrimeNG 19 -> 20 must not change how the app LOOKS.
//
// The v20 release notes announce no breaking change. That is exactly why this
// card needs measurement rather than a changelog reading: the failure mode named
// on the card is SILENT. Several v20 components dropped an inner wrapper element
// and moved its CSS class onto the host, so a rule written as
// `.p-toggleswitch .p-toggleswitch-slider` still parses, still ships, and simply
// stops matching. Build green, 4530 specs green, wrong colour on screen.
//
// So this script answers two different questions, and the second one is the new
// part relative to OBRS-915's script:
//
//   1. ROLES  - getComputedStyle() on the elements whose colour our own SCSS
//               sets, in both themes. before/after must produce identical RGB.
//   2. CLASSES - a live census. Every `.p-*` class that appears anywhere in our
//               own SCSS is counted with querySelectorAll on every surface. A
//               class whose count goes N -> 0 across the upgrade is precisely
//               the silent breakage above, and nothing else in the pipeline can
//               see it. A class that is 0 on BOTH sides is already-dead CSS and
//               is reported as such rather than hidden, because "0 after" only
//               means something if you know what it was before.
//
// The class list is DERIVED from src/**/*.scss at run time, not hardcoded. A
// hand-copied list silently shrinks to whatever I typed, and a census that
// enumerates the wrong population is a vacuous pass ([[a-derived-population-can-empty-into-a-green-pass]]).
//
// Credential: process.env.SIT_ADMIN_PASSWORD. Not inlined - OBRS-915's script
// carries the literal and that is a leak this file does not need to repeat.
//
// Usage:
//   $env:SIT_ADMIN_PASSWORD=...; node e2e/capture-obrs-917-primeng.mjs <baseUrl> <outDir>

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:4251';
const OUT = process.argv[3] || 'e2e/out/obrs-917-before';
mkdirSync(OUT, { recursive: true });

const PASSWORD = process.env.SIT_ADMIN_PASSWORD;
if (!PASSWORD) {
  console.error('SIT_ADMIN_PASSWORD is not set. Refusing to run: an unauthenticated run would');
  console.error('silently produce login-page screenshots for every authenticated surface.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Derive the class population from our own stylesheets.
// ---------------------------------------------------------------------------
function scssFiles(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) scssFiles(p, acc);
    else if (e.name.endsWith('.scss') || e.name.endsWith('.css')) acc.push(p);
  }
  return acc;
}
const CLASS_SITES = new Map(); // class -> Set(file)
for (const f of scssFiles('src')) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/\.(p-[a-zA-Z0-9_-]+)/g)) {
    if (!CLASS_SITES.has(m[1])) CLASS_SITES.set(m[1], new Set());
    CLASS_SITES.get(m[1]).add(f.replace(/\\/g, '/'));
  }
}
const CLASSES = [...CLASS_SITES.keys()].sort();
console.log(`derived ${CLASSES.length} distinct .p-* classes from ${scssFiles('src').length} stylesheet(s)`);

// ---------------------------------------------------------------------------
// Visual roles. Both spellings are kept so the SAME script runs on either side
// of the upgrade and records WHICH one matched; a role that flips its matched
// column across the upgrade is a rename we have to follow.
// ---------------------------------------------------------------------------
const ROLES = [
  { role: 'button', v19: '.p-button:not(.p-selectbutton *)', v20: '.p-button:not(.p-selectbutton *)', props: ['backgroundColor', 'color', 'borderColor'] },
  { role: 'selectbutton-selected', v19: '.p-selectbutton .p-togglebutton-checked', v20: '.p-selectbutton .p-togglebutton-checked', props: ['backgroundColor', 'color'] },
  { role: 'selectbutton-idle', v19: '.p-selectbutton .p-togglebutton:not(.p-togglebutton-checked)', v20: '.p-selectbutton .p-togglebutton:not(.p-togglebutton-checked)', props: ['backgroundColor', 'color'] },
  { role: 'tab-active', v19: '.p-tablist .p-tab-active', v20: '.p-tablist .p-tab-active', props: ['color', 'backgroundColor', 'borderColor'] },
  { role: 'tab-idle', v19: '.p-tablist .p-tab:not(.p-tab-active)', v20: '.p-tablist .p-tab:not(.p-tab-active)', props: ['color', 'backgroundColor'] },
  // The two entries the card's own warning is about: a rule that reaches THROUGH
  // the host to an inner element. If v20 hoisted the slider class onto the host,
  // the descendant selector stops matching and the fallback (host only) is what
  // answers - which the `matched` column will show.
  { role: 'switch-checked', v19: '.p-toggleswitch.p-toggleswitch-checked .p-toggleswitch-slider', v20: '.p-toggleswitch.p-toggleswitch-checked', props: ['backgroundColor'] },
  { role: 'switch-idle', v19: '.p-toggleswitch:not(.p-toggleswitch-checked) .p-toggleswitch-slider', v20: '.p-toggleswitch:not(.p-toggleswitch-checked)', props: ['backgroundColor'] },
  { role: 'datepicker-input', v19: '.p-datepicker input', v20: '.p-datepicker input', props: ['backgroundColor', 'color', 'borderColor'] },
  { role: 'datepicker-wrapper', v19: 'span.p-datepicker', v20: 'span.p-datepicker, p-datepicker', props: ['backgroundColor', 'borderColor'] },
  { role: 'badge', v19: '.p-badge', v20: '.p-badge', props: ['backgroundColor', 'color'] },
  { role: 'card', v19: '.p-card', v20: '.p-card', props: ['backgroundColor', 'color'] },
  { role: 'menu-item', v19: '.p-menu .p-menu-item-content', v20: '.p-menu .p-menu-item-content, .p-menu .p-menu-item', props: ['backgroundColor', 'color'] },
];

// `open` runs before the measurement and is how a POPUP gets measured at all.
// my-bookings hangs its row actions on a `<p-menu [popup]="true">` whose body is
// an `<ng-template pTemplate="item">`. Nothing renders until the trigger is
// clicked, so without this the menu is absent from the DOM, `.p-menu-item*`
// censuses as 0 on both sides of the upgrade, and one of only six pTemplate
// render paths in the whole app goes unverified - the exact hazard this card
// names. Measured, not assumed: the first BEFORE run waited on `.p-button,
// p-menu` here and both themes timed out at 20s, because in v19 those chips are
// `p-togglebutton` and the menu did not exist yet.
const SURFACES = [
  { name: 'home-routemap', path: '/', wait: 'p-tabs, .p-selectbutton' },
  { name: 'account-notification-prefs', path: '/account/notification-preferences', wait: 'p-toggleswitch' },
  {
    name: 'my-bookings',
    path: '/my-bookings',
    wait: 'p-selectbutton, .p-selectbutton',
    open: async (page, note) => {
      // `.actions-menu-btn` by name, NOT a generic `button[aria-haspopup]`: the
      // topbar language switcher is also a popup trigger and sits earlier in the
      // DOM, so `.first()` on the generic form clicks THAT and measures the
      // language menu while the file says my-bookings. A control arm that
      // silently becomes a second test arm is the failure this names away.
      const trigger = page.locator('.actions-menu-btn').first();
      const clicked = await trigger
        .click({ timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (!clicked) return note('my-bookings: action-menu trigger not clickable - menu roles unmeasured');
      const shown = await page
        .locator('.p-menu')
        .first()
        .waitFor({ timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (!shown) note('my-bookings: menu never rendered after click (pTemplate="item" path)');
      await page.waitForTimeout(300);
    },
  },
  { name: 'admin-expenses', path: '/admin/expenses', wait: 'p-datepicker, .p-datepicker' },
  { name: 'admin-jump-seat-config', path: '/admin/jump-seat-config', wait: 'p-toggleswitch' },
];

const API = 'https://sit-obrs-backend.koyeb.app';
const loginRes = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@system.local', password: PASSWORD }),
});
const loginJson = await loginRes.json();
if (loginJson?.code !== 200 || !loginJson?.data?.accessToken) {
  console.error(`API login failed: code=${loginJson?.code} message=${loginJson?.message}`);
  process.exit(1);
}
// No auth_refresh_token key on purpose - this response carries none, and seeding
// a stale one makes the backend treat it as replay and revoke every live token
// the user holds (OBRS-855).
const AUTH = {
  auth_token: loginJson.data.accessToken,
  auth_username: loginJson.data.user?.email ?? 'admin@system.local',
  auth_roles: JSON.stringify((loginJson.data.user?.roles ?? []).map((r) => String(r).trim().toLowerCase())),
};

const results = [];
const census = []; // {mode, surface, class, count}
const consoleErrors = [];
const misses = [];

const t0 = Date.now();
const step = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

for (const mode of ['light', 'dark']) {
  step(`=== mode ${mode}: launching`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
  await ctx.addInitScript((seed) => {
    try {
      for (const [k, v] of Object.entries(seed)) window.localStorage.setItem(k, v);
    } catch {}
  }, { ...AUTH, app_admin_theme: mode });
  const page = await ctx.newPage();

  // AC: "zone.js still works, no new ExpressionChangedAfterItHasBeenChecked".
  // That error is dev-mode console output and nothing else in the pipeline reads
  // it, so it is collected here where a real browser is already rendering the app.
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      const t = m.text();
      if (/ExpressionChanged|NG0[0-9]{3}|zone/i.test(t)) consoleErrors.push(`${mode}: ${t.slice(0, 300)}`);
    }
  });
  page.on('pageerror', (e) => consoleErrors.push(`${mode}: pageerror ${String(e.message).slice(0, 300)}`));

  step(`${mode}: auth seeded`);
  let themeAsserted = false;

  for (const s of SURFACES) {
    step(`${mode}/${s.name}: goto ${s.path}`);
    await page.goto(`${BASE}${s.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => {
      misses.push(`${mode}/${s.name}: goto failed - ${e.message.split('\n')[0]}`);
    });
    await page
      .locator(s.wait)
      .first()
      .waitFor({ timeout: 20000 })
      .catch(() => misses.push(`${mode}/${s.name}: wait selector never appeared (${s.wait})`));
    await page.waitForTimeout(800);

    if (!themeAsserted) {
      const wantDark = mode === 'dark';
      const ok = await page
        .locator(wantDark ? 'body.is-dark' : 'body:not(.is-dark)')
        .waitFor({ timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      if (!ok) misses.push(`${mode}: theme precondition FAILED on ${s.name}`);
      themeAsserted = true;
      step(`${mode}: theme precondition ${ok ? 'ok' : 'FAILED'}`);
    }

    if (s.open) {
      await s.open(page, (m) => misses.push(`${mode}/${m}`));
      step(`${mode}/${s.name}: opened`);
    }

    await page
      .screenshot({ path: join(OUT, `${s.name}-${mode}.png`), timeout: 30000 })
      .catch((e) => misses.push(`${mode}/${s.name}: screenshot - ${e.message.split('\n')[0]}`));

    // page.evaluate has no default timeout and waits for the main-frame execution
    // context forever, so a surface that keeps navigating stalls the whole run.
    const withDeadline = (p, ms, label) =>
      Promise.race([p, new Promise((res) => setTimeout(() => res({ __timeout: label }), ms))]);

    for (const r of ROLES) {
      const measured = await withDeadline(
        page
          .evaluate(
            ([a, b, props]) => {
              const pick = (sel) => {
                try {
                  return document.querySelector(sel);
                } catch {
                  return null;
                }
              };
              const elA = pick(a);
              const elB = elA ? null : pick(b);
              const el = elA || elB;
              if (!el) return null;
              const cs = getComputedStyle(el);
              const out = {};
              for (const p of props) out[p] = cs[p];
              return { matched: elA ? 'primary' : 'fallback', selector: elA ? a : b, props: out };
            },
            [r.v19, r.v20, r.props]
          )
          .catch((e) => ({ __error: e.message.split('\n')[0] })),
        10000,
        `${mode}/${s.name}/${r.role}`
      );
      if (measured?.__timeout) misses.push(`${mode}/${s.name}: role '${r.role}' measurement timed out`);
      else if (measured?.__error) misses.push(`${mode}/${s.name}: role '${r.role}' errored - ${measured.__error}`);
      else if (measured) results.push({ mode, surface: s.name, role: r.role, ...measured });
    }

    const counts = await withDeadline(
      page
        .evaluate((classes) => {
          const out = {};
          for (const c of classes) {
            try {
              out[c] = document.querySelectorAll(`.${c}`).length;
            } catch {
              out[c] = -1;
            }
          }
          return out;
        }, CLASSES)
        .catch((e) => ({ __error: e.message.split('\n')[0] })),
      20000,
      `${mode}/${s.name}/census`
    );
    if (counts?.__timeout || counts?.__error) {
      misses.push(`${mode}/${s.name}: class census failed`);
    } else {
      for (const [c, n] of Object.entries(counts)) census.push({ mode, surface: s.name, class: c, count: n });
    }
    step(`${mode}/${s.name}: measured + censused`);
  }

  await browser.close();
}

for (const mode of ['light', 'dark']) {
  for (const r of ROLES) {
    if (!results.some((x) => x.mode === mode && x.role === r.role)) {
      misses.push(`${mode}: role '${r.role}' matched nothing on any surface`);
    }
  }
}

// Collapse the census to one row per class: the max count seen anywhere. A class
// is "live" if any surface rendered it at least once.
const totals = new Map();
for (const c of CLASSES) totals.set(c, 0);
for (const row of census) totals.set(row.class, Math.max(totals.get(row.class) ?? 0, row.count));

writeFileSync(
  join(OUT, 'measurements.json'),
  JSON.stringify(
    {
      base: BASE,
      results,
      census,
      classTotals: Object.fromEntries(totals),
      classSites: Object.fromEntries([...CLASS_SITES].map(([k, v]) => [k, [...v]])),
      consoleErrors,
      misses,
    },
    null,
    2
  )
);

const w = (s, n) => String(s).padEnd(n);
const lines = [`base=${BASE}`, ''];
for (const mode of ['light', 'dark']) {
  lines.push(`== ${mode} ==`);
  for (const r of results.filter((x) => x.mode === mode)) {
    lines.push(
      `${w(r.surface, 28)} ${w(r.role, 22)} ${w(r.matched, 9)} ${Object.entries(r.props)
        .map(([k, v]) => `${k}=${v}`)
        .join('  ')}`
    );
  }
  lines.push('');
}
const live = [...totals].filter(([, n]) => n > 0);
const dead = [...totals].filter(([, n]) => n === 0);
lines.push(`== CLASS CENSUS: ${live.length} live / ${dead.length} rendering-nowhere, of ${CLASSES.length} styled ==`);
for (const [c, n] of [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  lines.push(`${w(c, 34)} ${String(n).padStart(4)}`);
}
lines.push('');
if (consoleErrors.length) lines.push(`== CONSOLE (${consoleErrors.length}) ==`, ...consoleErrors, '');
if (misses.length) lines.push('== MISSES ==', ...misses);

const txt = lines.join('\n');
writeFileSync(join(OUT, 'measurements.txt'), txt);
console.log(txt);
console.log(`\n${results.length} role measurements, ${census.length} census rows, ${misses.length} misses -> ${OUT}`);
