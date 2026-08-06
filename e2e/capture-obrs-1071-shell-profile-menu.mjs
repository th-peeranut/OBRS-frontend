/**
 * OBRS-1071 measured + visual evidence — the personal ("ตัวฉัน") links in the
 * staff and admin shells' top-right profile menu.
 *
 * The bug: /account, /my-bookings and /my-reports are declared `customerArea:
 * true, requireAuth: true` with no requiredRoles, and auth.guard.ts's
 * customerArea branch checks authentication only — so every signed-in role may
 * open them. But getHomeRoute() sends salesperson/driver to /staff and
 * owner/admin to /admin, and those shells carry their OWN profile menu, which
 * had exactly one role-gated shortcut plus Sign out. Missing wiring, not a
 * permission gap.
 *
 * Run against a dev server pointed at the SIT backend — the identities are real
 * accounts, not fixtures:
 *
 *   npm run start:sit -- --port 4315            # separate terminal; NOT npx ng serve
 *   OBRS_BASE_URL=http://localhost:4315 SIT_PASSWORD='…' \
 *     node e2e/capture-obrs-1071-shell-profile-menu.mjs --label before
 *
 * Every claim it prints is a COUNT taken from the rendered DOM, and each
 * expected-0 is paired with an expected-1 control on the same selector, so a
 * typo'd selector fails loudly instead of reading as "correctly absent".
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const PASSWORD = process.env.SIT_PASSWORD;
const OUT = path.resolve('e2e/out/obrs-1071');
const DESKTOP = { width: 1536, height: 864 };
const MOBILE = { width: 768, height: 1024 };

const PERSONAL = ['/account', '/my-bookings', '/my-reports'];

const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  if (i === -1 || !process.argv[i + 1]) {
    throw new Error('--label <before|after> is required — an unlabelled pair proves nothing');
  }
  return process.argv[i + 1];
})();

if (!PASSWORD) {
  throw new Error('SIT_PASSWORD is not set; refusing to guess (the account locks after 5 tries)');
}
if (PASSWORD.length !== 8) {
  throw new Error(
    `SIT_PASSWORD is ${PASSWORD.length} characters; the SIT login password is 8. ` +
      'This is almost certainly the DB password, which would burn a login attempt for nothing.'
  );
}

const failures = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`    ${ok ? '✔' : '✘'} ${name}: ${actual} (expected ${expected})`);
  if (!ok) failures.push(`${name}: got ${actual}, expected ${expected}`);
  return ok;
}

async function shoot(page, name) {
  const file = path.join(OUT, `${LABEL}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`    shot: ${file}`);
}

async function login(page, email) {
  await page.goto(`${BASE}/logout`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 60_000 });
  const landed = new URL(page.url()).pathname;
  console.log(`\n[${email}] landed on ${landed}`);
  return landed;
}

/** Open the shell's top-right profile menu and return every href it renders. */
async function openShellMenu(page) {
  const avatar = page.locator('.admin-profile .admin-avatar');
  await avatar.waitFor({ timeout: 30_000 });
  if ((await page.locator('.admin-profile-menu').count()) === 0) {
    await avatar.click();
  }
  await page.locator('.admin-profile-menu').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(200);
  const hrefs = await page.locator('.admin-profile-menu a').evaluateAll((els) =>
    els.map((e) => e.getAttribute('href'))
  );
  const text = (await page.locator('.admin-profile-menu').innerText()).replace(/\s+/g, ' ').trim();
  console.log(`    menu hrefs : ${JSON.stringify(hrefs)}`);
  console.log(`    menu text  : ${text}`);
  return hrefs;
}

const count = (hrefs, p) => hrefs.filter((h) => h === p).length;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: DESKTOP });
const page = await context.newPage();

// ── 1. staff shell as driver — AC1 / AC4, plus the two must-NOT counts ────────
await login(page, 'driver@system.local');
await page.goto(`${BASE}/staff`, { waitUntil: 'domcontentloaded' });
let hrefs = await openShellMenu(page);
console.log('  staff shell / driver:');
for (const p of PERSONAL) check(`  ${p} links`, count(hrefs, p), 1);
check('  /my-parcels links (flag off — must-NOT, AC3)', count(hrefs, '/my-parcels'), 0);
check('  /admin/dashboard links (driver — must-NOT, AC5)', count(hrefs, '/admin/dashboard'), 0);
await shoot(page, 'staff-shell-driver-menu-light');

// dark theme: the new items must follow the same rule as the existing ones
await page.locator('.admin-topbar-actions .admin-icon-btn').first().click();
await page.waitForTimeout(400);
await openShellMenu(page);
const darkColours = await page.locator('.admin-profile-menu a, .admin-profile-menu button').evaluateAll((els) =>
  els.map((e) => ({ label: e.innerText.replace(/\s+/g, ' ').trim(), color: getComputedStyle(e).color }))
);
console.log(`    dark item colours: ${JSON.stringify(darkColours)}`);
const distinctDark = [...new Set(darkColours.map((c) => c.color))];
check('  distinct text colours in dark menu (new items must match Sign out)', distinctDark.length, 1);
await shoot(page, 'staff-shell-driver-menu-dark');
await page.locator('.admin-topbar-actions .admin-icon-btn').first().click();
await page.waitForTimeout(300);

// AC6 — the link actually lands on the page, not a guard bounce.
// On `before` the link does not exist at all; record that as the finding rather
// than dying on a click, so the rest of the evidence still gets captured.
for (const p of PERSONAL) {
  await page.goto(`${BASE}/staff`, { waitUntil: 'domcontentloaded' });
  await openShellMenu(page);
  const link = page.locator(`.admin-profile-menu a[href="${p}"]`);
  if ((await link.count()) === 0) {
    check(`  driver clicks ${p} → landed pathname`, 'NO SUCH LINK IN MENU', p);
    continue;
  }
  await link.click();
  await page.waitForTimeout(1200);
  check(`  driver clicks ${p} → landed pathname`, new URL(page.url()).pathname, p);
}

// ── 2. staff shell as admin — control proving the 0 above is a gate ───────────
await login(page, 'admin@system.local');
await page.goto(`${BASE}/staff`, { waitUntil: 'domcontentloaded' });
hrefs = await openShellMenu(page);
console.log('  staff shell / admin (control):');
check('  /admin/dashboard links (admin — control for the driver 0)', count(hrefs, '/admin/dashboard'), 1);
for (const p of PERSONAL) check(`  ${p} links`, count(hrefs, p), 1);

// ── 3. admin shell as owner — AC2, and Staff Area still gated (AC5) ───────────
await login(page, 'owner@system.local');
await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
hrefs = await openShellMenu(page);
console.log('  admin shell / owner:');
for (const p of PERSONAL) check(`  ${p} links`, count(hrefs, p), 1);
check('  /my-parcels links (flag off — must-NOT, AC3)', count(hrefs, '/my-parcels'), 0);
check('  /staff links (owner holds the staff grant — unchanged)', count(hrefs, '/staff'), 1);
await shoot(page, 'admin-shell-owner-menu-light');

// ── 4. public navbar — control that the shared-model refactor changed nothing ─
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.locator('.navbar-avatar').click();
await page.waitForTimeout(300);
const navHrefs = await page.locator('.navbar-profile-menu a').evaluateAll((els) =>
  els.map((e) => e.getAttribute('href'))
);
console.log(`  public navbar desktop dropdown: ${JSON.stringify(navHrefs)}`);
for (const p of PERSONAL) check(`  navbar ${p} links`, navHrefs.filter((h) => h === p).length, 1);
check('  navbar /my-parcels links (flag off)', navHrefs.filter((h) => h === '/my-parcels').length, 0);

await page.setViewportSize(MOBILE);
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.locator('.navbar-hamburger').click();
await page.locator('#navbar-mobile-panel').waitFor({ timeout: 10_000 });
await page.waitForTimeout(300);
const mobileHrefs = await page.locator('#navbar-mobile-panel a').evaluateAll((els) =>
  els.map((e) => e.getAttribute('href'))
);
console.log(`  public navbar ≤992px panel: ${JSON.stringify(mobileHrefs)}`);
for (const p of PERSONAL) check(`  mobile ${p} links`, mobileHrefs.filter((h) => h === p).length, 1);
check('  mobile /my-parcels links (flag off)', mobileHrefs.filter((h) => h === '/my-parcels').length, 0);

await browser.close();

console.log(`\n[${LABEL}] ${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} CHECK(S) FAILED`}`);
for (const f of failures) console.log(`  ✘ ${f}`);
if (LABEL === 'after' && failures.length > 0) process.exit(1);
