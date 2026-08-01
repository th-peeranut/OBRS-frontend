// OBRS-917: closes the hole in the main census.
//
// capture-obrs-917-primeng.mjs proved that 0 of our styled classes went from
// rendering to not rendering across the upgrade. That result only covers the 29
// classes that render on the five captured surfaces AT REST. 17 do not, and 11
// of those 17 are datepicker PANEL internals - they exist only while the
// calendar popup is open, which the capture never opens.
//
// That gap is the worst one available, because the datepicker is the component
// v20 demonstrably restructured: `span.p-datepicker` is gone and the class moved
// onto the `p-datepicker` host (the capture caught it as `datepicker-wrapper`
// flipping from its primary selector to its fallback). Leaving eleven panel
// classes unmeasured while knowing that would be reporting the easy half.
//
// This probe opens the panel and counts them. It is deliberately ONE-SIDED -
// there is no v19 baseline here, and it does not need one. The hazard is "our
// rule stops matching after the upgrade"; a class that matches under v20 has
// answered that, whatever it did before. What a one-sided run cannot tell you is
// whether a class that is 0 here was 0 before too, so those are reported as
// unresolved rather than as passes.
//
// Usage: node e2e/probe-obrs-917-unrendered-classes.mjs <baseUrl>
//   env: SIT_ADMIN_PASSWORD

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4251';
const PASSWORD = process.env.SIT_ADMIN_PASSWORD;
if (!PASSWORD) {
  console.error('SIT_ADMIN_PASSWORD is not set; /admin/expenses would render the login page instead.');
  process.exit(1);
}

// The 17 that never rendered at rest, plus the two datepicker classes that did,
// as a positive control: if the whole evaluate() were broken these would read 0
// too, and a run where everything is 0 must not be mistaken for a clean sweep.
const TARGET = [
  'p-datepicker-panel', 'p-datepicker-header', 'p-datepicker-title', 'p-datepicker-today',
  'p-datepicker-day-selected', 'p-datepicker-prev-button', 'p-datepicker-next-button',
  'p-datepicker-select-month', 'p-datepicker-select-year', 'p-datepicker-buttonbar',
  'p-button-secondary', 'p-icon-wrapper', 'p-input-icon-left', 'p-input-icon-right',
  'p-popover', 'p-popover-flipped', 'p-progressspinner-circle',
];
const CONTROL = ['p-datepicker', 'p-inputtext'];

const API = 'https://sit-obrs-backend.koyeb.app';
const res = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@system.local', password: PASSWORD }),
});
const json = await res.json();
if (json?.code !== 200 || !json?.data?.accessToken) {
  console.error(`API login failed: code=${json?.code} message=${json?.message}`);
  process.exit(1);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
await ctx.addInitScript((seed) => {
  try {
    for (const [k, v] of Object.entries(seed)) window.localStorage.setItem(k, v);
  } catch {}
}, {
  auth_token: json.data.accessToken,
  auth_username: json.data.user?.email ?? 'admin@system.local',
  auth_roles: JSON.stringify((json.data.user?.roles ?? []).map((r) => String(r).trim().toLowerCase())),
  app_admin_theme: 'dark',
});
const page = await ctx.newPage();

await page.goto(`${BASE}/admin/expenses`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.locator('p-datepicker, .p-datepicker').first().waitFor({ timeout: 20000 });
await page.waitForTimeout(600);

const input = page.locator('.p-datepicker input, p-datepicker input').first();
const opened = await input.click({ timeout: 8000 }).then(() => true).catch(() => false);
if (!opened) {
  console.error('could not click the date input - the counts below would all be a lie about a closed panel.');
  process.exit(1);
}
await page.waitForTimeout(1200);

const counts = await page.evaluate((classes) => {
  const out = {};
  for (const c of classes) out[c] = document.querySelectorAll(`.${c}`).length;
  return out;
}, [...CONTROL, ...TARGET]);

await page.screenshot({ path: 'e2e/out/obrs-917-after/admin-expenses-datepicker-open-dark.png', timeout: 30000 }).catch(() => {});

const control = CONTROL.filter((c) => counts[c] > 0);
console.log(`positive control: ${control.length}/${CONTROL.length} matched (${CONTROL.map((c) => `${c}=${counts[c]}`).join(', ')})`);
if (!control.length) {
  console.error('POSITIVE CONTROL FAILED - every count below is meaningless.');
  process.exit(1);
}
const now = TARGET.filter((c) => counts[c] > 0);
const still = TARGET.filter((c) => !counts[c]);
console.log(`\nrendered once the panel is open (${now.length}/${TARGET.length}):`);
for (const c of now) console.log(`   ${c.padEnd(30)} ${counts[c]}`);
console.log(`\nstill rendering nowhere - UNRESOLVED, not a pass (${still.length}):`);
for (const c of still) console.log(`   ${c}`);

await browser.close();
