// OBRS-915 evidence: PrimeNG 17 -> 19 must not change how the app LOOKS.
//
// PrimeNG 18 deleted the CSS-file theming system outright (no more
// `primeng/resources/themes/*.css`) and renamed most of the component CSS
// layer with it. So the risk this card carries is not "does it compile" but
// "did every one of the ~230 `.p-*` overrides in our 12 SCSS files quietly
// stop matching". A stylesheet that no longer matches is silent: the build is
// green, the tests are green, and the button is the wrong colour.
//
// Eyeballing cannot settle that ([[verify-visuals-by-measurement-not-eye]]),
// so this reads getComputedStyle() on the elements whose colour our own SCSS
// sets, in BOTH themes, and writes the numbers next to the screenshot.
//
// The selector map below lists the v17 name AND the v19 name for each visual
// role, and records WHICH one matched. That is what makes the same script
// valid on both sides of the upgrade: "before" matches the v17 column,
// "after" must match the v19 column and produce the same RGB. A role that
// matches NOTHING is reported as a miss rather than skipped, because an
// absent selector is exactly the failure this script exists to catch.
//
// Usage: node e2e/capture-obrs-915-primeng.mjs <baseUrl> <outDir>

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// localhost, not 127.0.0.1 — SIT's CORS reflects the former only.
const BASE = process.argv[2] || 'http://localhost:4241';
const OUT = process.argv[3] || 'e2e/out/obrs-915-before';
mkdirSync(OUT, { recursive: true });

// Visual role -> the selectors that express it in v17 and in v19.
// `props` are the computed properties our SCSS actually sets for that role.
const ROLES = [
  // Scoped out of SelectButton on BOTH sides. `.p-button` alone is not a stable
  // role across this upgrade: in v17 the SelectButton options were themselves
  // `.p-button`, so `querySelector('.p-button')` on the home page returned an
  // option, while in v19 they are `.p-togglebutton` and the same query returns
  // the real search button. Measured: 0 `.p-selectbutton .p-button` and exactly
  // 1 `.p-button` (the info button) after the upgrade. Comparing those two
  // elements produced a 3-property "regression" that was only ever two
  // different buttons.
  {
    role: 'button',
    v17: '.p-button:not(.p-selectbutton *)',
    v19: '.p-button:not(.p-selectbutton *)',
    props: ['backgroundColor', 'color', 'borderColor'],
  },
  {
    role: 'selectbutton-selected',
    v17: '.p-selectbutton .p-button.p-highlight',
    v19: '.p-selectbutton .p-togglebutton-checked, .p-selectbutton .p-button.p-highlight',
    props: ['backgroundColor', 'color'],
  },
  {
    role: 'selectbutton-idle',
    v17: '.p-selectbutton .p-button:not(.p-highlight)',
    v19: '.p-selectbutton .p-togglebutton:not(.p-togglebutton-checked), .p-selectbutton .p-button:not(.p-highlight)',
    props: ['backgroundColor', 'color'],
  },
  {
    role: 'tab-active',
    v17: '.p-tabview-nav .p-highlight .p-tabview-nav-link',
    v19: '.p-tablist .p-tab-active, .p-tabview-nav .p-highlight .p-tabview-nav-link',
    props: ['color', 'backgroundColor', 'borderColor'],
  },
  {
    role: 'tab-idle',
    v17: '.p-tabview-nav li:not(.p-highlight) .p-tabview-nav-link',
    v19: '.p-tablist .p-tab:not(.p-tab-active), .p-tabview-nav li:not(.p-highlight) .p-tabview-nav-link',
    props: ['color', 'backgroundColor'],
  },
  {
    role: 'switch-checked',
    v17: '.p-inputswitch.p-inputswitch-checked .p-inputswitch-slider',
    v19: '.p-toggleswitch.p-toggleswitch-checked .p-toggleswitch-slider',
    props: ['backgroundColor'],
  },
  {
    role: 'switch-idle',
    v17: '.p-inputswitch:not(.p-inputswitch-checked) .p-inputswitch-slider',
    v19: '.p-toggleswitch:not(.p-toggleswitch-checked) .p-toggleswitch-slider',
    props: ['backgroundColor'],
  },
  { role: 'datepicker-input', v17: '.p-calendar input', v19: '.p-datepicker input, .p-calendar input', props: ['backgroundColor', 'color', 'borderColor'] },
  { role: 'badge', v17: '.p-badge', v19: '.p-badge', props: ['backgroundColor', 'color'] },
  { role: 'card', v17: '.p-card', v19: '.p-card', props: ['backgroundColor', 'color'] },
];

// The surfaces that between them host the PrimeNG components whose colour our
// own SCSS sets.
//
// The admin/staff shell is deliberately NOT in this list. `/admin/dashboard`,
// `/admin/jump-seat-config`, `/admin/expenses` and `/staff/sell` all block the
// renderer permanently in headless Chromium on this tree - each one burns its
// full goto + screenshot + measurement timeouts and yields nothing, while `/`
// and `/account/**` render in under 4 seconds with the same seeded session. So
// the shell is the discriminator, not the route, and the working hypothesis is
// the admin-only STOMP client (ADR-0043) spinning. That is an unrelated defect
// and it must not be smuggled in as "PrimeNG evidence"; what it costs this card
// is coverage, which is stated in the output rather than quietly dropped.
const SURFACES = [
  { name: 'home-routemap', path: '/', wait: '.p-tabview, p-tabs, .p-selectbutton' },
  { name: 'account-notification-prefs', path: '/account/notification-preferences', wait: 'p-inputswitch, p-toggleswitch' },
  { name: 'my-bookings', path: '/my-bookings', wait: '.p-button, p-menu' },
];

// Log in over the API and seed the tokens, rather than driving the login form.
//
// Not a shortcut for speed: submitting the form lands on /admin/dashboard, and
// on this tree that route BLOCKS THE RENDERER PERMANENTLY - measured 150s with
// no recovery, no console output, and page.screenshot() itself timing out,
// which is the signature of a blocked main thread rather than a slow network.
// Every authenticated surface then fails identically, because the tab is dead
// before the test navigates anywhere. Seeding auth skips the dashboard entirely
// so this card's evidence does not depend on an unrelated defect being fixed
// first. See docs for OBRS-915; the dashboard hang is reported separately.
const API = 'https://sit-obrs-backend.koyeb.app';
const loginRes = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@system.local', password: 'P@ssw0rd' }),
});
const loginJson = await loginRes.json();
if (loginJson?.code !== 200 || !loginJson?.data?.accessToken) {
  console.error(`API login failed: code=${loginJson?.code} message=${loginJson?.message} dataKeys=${Object.keys(loginJson?.data ?? {})}`);
  process.exit(1);
}
// No `auth_refresh_token` key: this response carries no refreshToken, and
// AuthService is write-or-remove on that key precisely because presenting a
// stale one makes the backend treat it as replay and revoke every live token
// the user holds (OBRS-855). Seeding an empty string would be worse than
// seeding nothing.
const AUTH = {
  auth_token: loginJson.data.accessToken,
  auth_username: loginJson.data.user?.email ?? 'admin@system.local',
  auth_roles: JSON.stringify((loginJson.data.user?.roles ?? []).map((r) => String(r).trim().toLowerCase())),
};

const results = [];
const misses = [];

// Progress is printed per step, unbuffered. A run of this shape has ~20 slow
// awaits in it; without a per-step line a stall is indistinguishable from a
// long network wait, and the first attempt at this script burned 17 minutes
// proving exactly that.
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
  step(`${mode}: auth seeded`);

  // A file named "dark" that is actually a light screenshot is worse than no
  // file, so assert the precondition instead of assuming the init script won.
  //
  // This runs INSIDE the surface loop rather than straight after login, and it
  // is a locator wait rather than a bare `page.evaluate`. `page.evaluate` has
  // no default timeout and waits for the main-frame execution context forever;
  // right after login the app is still redirecting, so the context keeps being
  // torn down and the call never returns. That hung two runs to 17 minutes
  // with no output, which is why every await here now carries a deadline.
  let themeAsserted = false;

  for (const s of SURFACES) {
    step(`${mode}/${s.name}: goto ${s.path}`);
    // `domcontentloaded`, not `networkidle`: the shell polls (notification bell)
    // and holds a STOMP socket, so networkidle can never fire and every surface
    // would pay the full 30s navigation timeout before continuing.
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

    const shot = join(OUT, `${s.name}-${mode}.png`);
    // Not fullPage: an admin table with a virtual scroller makes fullPage a
    // multi-megabyte stitch that can outlast its own timeout.
    await page.screenshot({ path: shot, timeout: 30000 }).catch((e) => misses.push(`${mode}/${s.name}: screenshot - ${e.message.split('\n')[0]}`));
    step(`${mode}/${s.name}: shot written`);

    // `page.evaluate` has no default timeout and waits for the main-frame
    // execution context indefinitely, so a surface that keeps navigating
    // (the shell redirects, the map re-mounts) stalls the whole run with no
    // output. Every measurement is raced against a deadline instead.
    const withDeadline = (p, ms, label) =>
      Promise.race([p, new Promise((res) => setTimeout(() => res({ __timeout: label }), ms))]);

    for (const r of ROLES) {
      const measured = await withDeadline(
        page.evaluate(
        ([v17, v19, props]) => {
          const pick = (sel) => {
            try {
              return document.querySelector(sel);
            } catch {
              return null;
            }
          };
          const el17 = pick(v17);
          const el19 = el17 ? null : pick(v19);
          const el = el17 || el19;
          if (!el) return null;
          const cs = getComputedStyle(el);
          const out = {};
          for (const p of props) out[p] = cs[p];
          return { matched: el17 ? 'v17' : 'v19', selector: el17 ? v17 : v19, props: out };
        },
          [r.v17, r.v19, r.props]
        ).catch((e) => ({ __error: e.message.split('\n')[0] })),
        10000,
        `${mode}/${s.name}/${r.role}`
      );
      if (measured?.__timeout) {
        misses.push(`${mode}/${s.name}: role '${r.role}' measurement timed out`);
      } else if (measured?.__error) {
        misses.push(`${mode}/${s.name}: role '${r.role}' errored - ${measured.__error}`);
      } else if (measured) {
        results.push({ mode, surface: s.name, role: r.role, ...measured });
      }
    }
    step(`${mode}/${s.name}: measured`);
  }

  await browser.close();
}

// Roles that matched on NO surface in a theme are the interesting absence.
for (const mode of ['light', 'dark']) {
  for (const r of ROLES) {
    if (!results.some((x) => x.mode === mode && x.role === r.role)) {
      misses.push(`${mode}: role '${r.role}' matched nothing on any surface`);
    }
  }
}

writeFileSync(join(OUT, 'measurements.json'), JSON.stringify({ base: BASE, results, misses }, null, 2));

const w = (s, n) => String(s).padEnd(n);
const lines = [`base=${BASE}`, ''];
for (const mode of ['light', 'dark']) {
  lines.push(`== ${mode} ==`);
  for (const r of results.filter((x) => x.mode === mode)) {
    lines.push(
      `${w(r.surface, 28)} ${w(r.role, 22)} ${w(r.matched, 4)} ${Object.entries(r.props)
        .map(([k, v]) => `${k}=${v}`)
        .join('  ')}`
    );
  }
  lines.push('');
}
if (misses.length) {
  lines.push('== MISSES ==', ...misses);
}
const txt = lines.join('\n');
writeFileSync(join(OUT, 'measurements.txt'), txt);
console.log(txt);
console.log(`\n${results.length} measurements, ${misses.length} misses -> ${OUT}`);
