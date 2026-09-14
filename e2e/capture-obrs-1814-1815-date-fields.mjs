/**
 * OBRS-1814 + OBRS-1815 visual evidence — the date controls, before and after.
 *
 * The two cards were run as one group because they edit the same elements:
 * 1814 changes the BOX (the dead `schedule-calendar-filter` class and the three
 * native `<input type="date">` controls become the canonical `app-date-field`
 * `p-datePicker`), 1815 changes the TEXT inside it (one format per language,
 * month names instead of ambiguous numbers). So one capture serves both, and
 * the pair is only meaningful as a controlled comparison:
 *
 *   OBRS_BASE_URL=http://localhost:4238 node e2e/capture-obrs-1814-1815-date-fields.mjs --label before
 *   OBRS_BASE_URL=http://localhost:4237 node e2e/capture-obrs-1814-1815-date-fields.mjs --label after
 *
 * where 4238 serves `origin/dev` and 4237 serves the branch. Nothing else
 * differs between the two runs.
 *
 * Credentials are read from the environment and never appear in this file:
 *   OBRS_ADMIN_EMAIL / OBRS_ADMIN_PASSWORD
 *
 * Every screen PRINTS the rendered input value as well as shooting it. The
 * subject of 1815 is a string, and a string read out of the DOM is evidence a
 * reviewer can check without trusting anyone's eyes on a PNG.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4237';
const EMAIL = process.env.OBRS_ADMIN_EMAIL;
const PASSWORD = process.env.OBRS_ADMIN_PASSWORD;
const OUT = path.resolve('e2e/out/obrs-1814-1815');
const VIEWPORT = { width: 1440, height: 900 };

const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  if (i === -1 || !process.argv[i + 1]) {
    throw new Error('--label <before|after> is required — an unlabelled pair proves nothing');
  }
  return process.argv[i + 1];
})();

if (!EMAIL || !PASSWORD) {
  throw new Error('OBRS_ADMIN_EMAIL and OBRS_ADMIN_PASSWORD must be set — the admin screens need a session');
}

const LANGS = ['th', 'en', 'zh'];
const readings = [];
const problems = [];

/** A context with the language and theme decided BEFORE the app boots, so the
 *  shot is of a settled page rather than of a switch in progress. */
async function makeContext(browser, { lang, dark = false, signedIn = false }) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    ...(signedIn ? { storageState: adminState } : {}),
  });
  await ctx.addInitScript(
    ([l, d]) => {
      localStorage.setItem('app_language', l);
      localStorage.setItem('app_admin_theme', d ? 'dark' : 'light');
    },
    [lang, dark]
  );
  return ctx;
}

/** SweetAlert intercepts every click when a backend call fails, and it comes
 *  back after a language switch (which re-fetches server-localized data). */
async function dismissAlerts(page) {
  for (let i = 0; i < 4; i++) {
    const confirm = page.locator('.swal2-confirm');
    if (!(await confirm.isVisible().catch(() => false))) return;
    await confirm.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(250);
  }
}

/**
 * Sign in ONCE and keep the resulting storage state for every admin screen.
 *
 * The first pass of this script logged in per screen and the second and every
 * later attempt timed out on `waitForURL` while the first had succeeded —
 * repeated sign-ins against a shared SIT are throttled, and a capture run is
 * not the place to find out how many it allows. One login, reused, is also
 * closer to what a reviewer is looking at: one person, one session, four pages.
 */
async function signInOnce(browser) {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();

  // SIT runs on a free Koyeb instance that cold-starts, and the app answers a
  // slow call with a SweetAlert ("ตอนนี้ใช้เวลานานกว่าปกติ...") that sits on
  // top of the page while the request is still in flight. That notice is not a
  // rejection and the navigation still lands behind it, so the wait dismisses
  // and retries rather than reading the first slow response as a failure.
  let landed = false;
  for (let attempt = 1; attempt <= 3 && !landed; attempt++) {
    await dismissAlerts(page);
    landed = await page
      .waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    if (!landed) {
      console.log(`  sign-in still on /login after attempt ${attempt} — backend is cold, waiting`);
    }
  }
  if (!landed) {
    const alert = await page
      .locator('.swal2-html-container, .invalid-feedback, .admin-error')
      .first()
      .textContent()
      .catch(() => null);
    throw new Error(`sign-in did not leave /login${alert ? ` — page said: ${alert.trim()}` : ''}`);
  }
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

/** Read every rendered date input on the page, so the evidence names what it
 *  found rather than assuming a single field. */
async function dateInputValues(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('p-datepicker input, input[type="date"]'))
      .map((el) => el.value)
      .filter((v) => v !== '')
  );
}

async function shoot(locator, name) {
  await locator.screenshot({ path: path.join(OUT, `${LABEL}-${name}.png`) });
  console.log(`  shot ${LABEL}-${name}.png`);
}

/** Each screen is independent: a selector that rots on one must not cost the
 *  other three, because the whole set has to be captured while one server is up. */
async function screen(name, fn) {
  try {
    console.log(`\n[${name}]`);
    await fn();
  } catch (error) {
    const message = `${name}: ${error.message.split('\n')[0]}`;
    problems.push(message);
    console.log(`  FAILED — ${message}`);
  }
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const adminState = await signInOnce(browser);
console.log('signed in once; reusing the session for every admin screen');

// --- 1. customer: the home departure-date field, one shot per language -------
for (const lang of LANGS) {
  await screen(`customer-${lang}`, async () => {
    const ctx = await makeContext(browser, { lang });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await dismissAlerts(page);

    const input = page.locator('#home-departure-date');
    await input.waitFor({ state: 'visible', timeout: 20_000 });
    await input.click();

    const panel = page.locator('.p-datepicker-panel');
    await panel.waitFor({ state: 'visible', timeout: 10_000 });
    const target = new Date();
    target.setDate(target.getDate() + 7);
    await panel
      .locator('td:not(.p-datepicker-other-month) > span', {
        hasText: new RegExp(`^${target.getDate()}$`),
      })
      .first()
      .click();
    await panel.waitFor({ state: 'hidden', timeout: 10_000 });

    const shown = await input.inputValue();
    readings.push({ screen: `customer-${lang}`, values: [shown] });
    console.log(`  value: "${shown}"`);

    await shoot(
      input.locator('xpath=ancestor::div[contains(@class,"form-group-obrs")][1]'),
      `customer-${lang}-field`
    );
    await shoot(page.locator('body'), `customer-${lang}-page`);
    await ctx.close();
  });
}

// --- 2. admin schedules: the two controls 1814 converted from native inputs --
for (const lang of LANGS) {
  await screen(`admin-schedules-${lang}`, async () => {
    const ctx = await makeContext(browser, { lang, signedIn: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/schedules`, { waitUntil: 'networkidle' });
    await dismissAlerts(page);

    // The page's own Add button, by its icon-free text in whichever language
    // this pass is running in — resolved from the live DOM rather than from a
    // table of translations that would have to be kept in step with the file.
    const addButton = page.locator('button', { hasText: /\+|เพิ่ม|Add|添加|新增/ }).first();
    await addButton.click({ timeout: 15_000 });

    const modal = page.locator('.admin-modal').first();
    await modal.waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(500);

    const values = await dateInputValues(page);
    readings.push({ screen: `admin-schedules-${lang}`, values });
    console.log(`  values: ${JSON.stringify(values)}`);

    await shoot(modal, `admin-schedules-${lang}-modal`);
    await ctx.close();
  });
}

// --- 3 and 4. the two dark-mode admin dialogs OBRS-1814 AC-6 names -----------
await screen('admin-maintenance-dark', async () => {
  const ctx = await makeContext(browser, { lang: 'th', dark: true, signedIn: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/vehicles`, { waitUntil: 'networkidle' });
  await dismissAlerts(page);

  await page.getByRole('button', { name: 'จัดการการซ่อมบำรุง' }).first().click({ timeout: 20_000 });
  await page.waitForSelector('app-vehicle-maintenance-panel', { timeout: 20_000 });
  await page.getByRole('button', { name: 'เพิ่มรายการซ่อมบำรุง' }).first().click({ timeout: 15_000 });

  const modal = page.locator('.admin-modal').first();
  await modal.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(500);

  const values = await dateInputValues(page);
  readings.push({ screen: 'admin-maintenance-dark', values });
  console.log(`  values: ${JSON.stringify(values)}`);

  await shoot(modal, 'admin-maintenance-dark-modal');
  await ctx.close();
});

await screen('admin-expenses-dark', async () => {
  const ctx = await makeContext(browser, { lang: 'th', dark: true, signedIn: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/expenses`, { waitUntil: 'networkidle' });
  await dismissAlerts(page);

  await page.getByRole('button', { name: 'เพิ่มค่าใช้จ่าย' }).first().click({ timeout: 20_000 });

  const modal = page.locator('.admin-modal').first();
  await modal.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(500);

  const values = await dateInputValues(page);
  readings.push({ screen: 'admin-expenses-dark', values });
  console.log(`  values: ${JSON.stringify(values)}`);

  await shoot(modal, 'admin-expenses-dark-modal');
  await ctx.close();
});

await browser.close();

console.log(`\n=== OBRS-1814/1815 ${LABEL.toUpperCase()} — ${BASE} ===`);
for (const { screen: name, values } of readings) {
  console.log(`  ${name.padEnd(26)} ${JSON.stringify(values)}`);
}
if (problems.length > 0) {
  console.log(`\n${problems.length} screen(s) did NOT capture:`);
  for (const problem of problems) console.log(`  - ${problem}`);
}
console.log(`\nshots: ${OUT}`);
process.exit(problems.length > 0 ? 1 : 0);
