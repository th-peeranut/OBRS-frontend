/**
 * OBRS-1601 evidence -- the booking CONTACT carries an optional honorific again, as a CODE.
 *
 * Run it TWICE against the same local database (obrs1601qa), once per BACKEND, so the two sets of
 * images differ only by the code under test:
 *
 *   # BEFORE -- origin/dev backend (no contact_title_snapshot on the wire at all)
 *   OBRS_VARIANT=BEFORE OBRS_OUT_DIR=e2e/out/obrs-1601/before node e2e/capture-obrs-1601-contact-title.mjs
 *   # AFTER -- this card's backend
 *   OBRS_VARIANT=AFTER  OBRS_OUT_DIR=e2e/out/obrs-1601/after  node e2e/capture-obrs-1601-contact-title.mjs
 *
 * The FRONTEND is this branch in both runs, and that is deliberate rather than a shortcut: the four
 * templates changed here pipe a field the BEFORE backend never sends, and `TitleLabelPipe` returns
 * the bare name for a null/undefined code -- so against the dev backend this frontend renders
 * byte-for-byte what the dev frontend renders. Booting a second `ng serve` would photograph the same
 * pixels for another ~1.3 GB. (The pipe's null behaviour is pinned by its own spec, so the claim is
 * checked by a test rather than asserted here.)
 *
 * Screens per language (th, en, zh):
 *   1-find-booking-<lang>.png   /find-booking, the CONTACT_NAME summary row
 *   2-counter-list-<lang>.png   /staff/cancel-booking, the contact cell of the result row
 *   3-counter-modal-<lang>.png  that row's cancel dialog, the CUSTOMER line
 *   4-admin-detail-<lang>.png   /admin/bookings detail panel, the CONTACT_NAME field
 *
 * Every screen also prints the text it actually read, so the log is evidence in its own right and a
 * silently-empty cell cannot pass as a pass.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const VARIANT = process.env.OBRS_VARIANT ?? 'AFTER';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve(`e2e/out/obrs-1601/${VARIANT.toLowerCase()}`);
const PASSWORD = process.env.OBRS_QA_PASSWORD ?? 'P@ssw0rd';
const BOOKING_NUMBER = process.env.OBRS_BOOKING_NUMBER;
const CONTACT_PHONE = process.env.OBRS_CONTACT_PHONE;
const CUSTOMER_EMAIL = process.env.OBRS_CUSTOMER_EMAIL ?? 'customer@system.local';
const STAFF_EMAIL = process.env.OBRS_STAFF_EMAIL ?? 'salesperson@system.local';
const ADMIN_EMAIL = process.env.OBRS_ADMIN_EMAIL ?? 'admin@system.local';
const LANGS = ['th', 'en', 'zh'];

if (!BOOKING_NUMBER || !CONTACT_PHONE) {
  console.error('OBRS_BOOKING_NUMBER and OBRS_CONTACT_PHONE are required -- they name the seeded '
    + 'booking whose contact carries the title. Nothing is guessed here on purpose.');
  process.exit(2);
}

const measured = {};

async function contextFor(browser, lang) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((l) => {
    // LanguageService reads this on boot and the auth interceptor forwards it as Accept-Language,
    // so this switches BOTH halves -- which is the point: the title code is resolved client-side,
    // and the e-mail path resolves it server-side off the same header.
    window.localStorage.setItem('app_language', l);
  }, lang);
  return ctx;
}

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 });
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

async function findBooking(browser, lang) {
  const ctx = await contextFor(browser, lang);
  const page = await ctx.newPage();
  await login(page, CUSTOMER_EMAIL);

  await page.goto(`${BASE}/find-booking`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="find-booking-number"]').fill(BOOKING_NUMBER);
  await page.locator('[data-testid="find-booking-phone"]').fill(CONTACT_PHONE);
  await page.locator('[data-testid="find-booking-submit"]').click();

  const row = page.locator('.find-booking-summary-row', { hasText: /.+/ }).nth(1);
  await row.waitFor({ timeout: 30000 });
  // The contact row is the one whose label matches the CONTACT_NAME key in any language, so it is
  // located by position within the summary rather than by a translated string.
  const rows = page.locator('.find-booking-summary-row');
  const texts = await rows.allInnerTexts();
  measured[`1-find-booking-${lang}`] = texts.map((t) => t.replace(/\s+/g, ' ').trim());
  await shot(page, `1-find-booking-${lang}`);
  console.log(`1-find-booking-${lang}.png  rows = ${JSON.stringify(measured[`1-find-booking-${lang}`])}`);

  await ctx.close();
}

async function counterCancel(browser, lang) {
  const ctx = await contextFor(browser, lang);
  const page = await ctx.newPage();
  await login(page, STAFF_EMAIL);

  await page.goto(`${BASE}/staff/cancel-booking`, { waitUntil: 'networkidle' });
  // Search by booking number: the second mode button, then the text field it reveals.
  await page.locator('.ccsf-mode-btn').nth(1).click();
  await page.locator('.ccsf-field input[type="text"]').fill(BOOKING_NUMBER);
  await page.locator('.ccsf-form button[type="submit"]').click();

  const row = page.locator('tr.ccrl-row').first();
  await row.waitFor({ timeout: 30000 });
  measured[`2-counter-list-${lang}`] = (await row.locator('td').nth(1).innerText()).trim();
  await shot(page, `2-counter-list-${lang}`);
  console.log(`2-counter-list-${lang}.png  contact cell = ${measured[`2-counter-list-${lang}`]}`);

  const cancelButton = row.locator('button.admin-btn-small').first();
  if (await cancelButton.count()) {
    await cancelButton.click();
    const summary = page.locator('.ccm-summary-row');
    await summary.first().waitFor({ timeout: 20000 });
    measured[`3-counter-modal-${lang}`] =
      (await summary.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    await shot(page, `3-counter-modal-${lang}`);
    console.log(`3-counter-modal-${lang}.png  summary = ${JSON.stringify(measured[`3-counter-modal-${lang}`])}`);
  } else {
    // Not cancellable => no dialog exists to photograph. Recorded, never silently skipped.
    measured[`3-counter-modal-${lang}`] = 'SKIPPED: row is not cancellable';
    console.log(`3-counter-modal-${lang}  SKIPPED: row is not cancellable`);
  }

  await ctx.close();
}

async function adminDetail(browser, lang) {
  const ctx = await contextFor(browser, lang);
  const page = await ctx.newPage();
  await login(page, ADMIN_EMAIL);

  await page.goto(`${BASE}/admin/bookings`, { waitUntil: 'networkidle' });
  const row = page.locator('tbody tr', { hasText: BOOKING_NUMBER }).first();
  await row.waitFor({ timeout: 30000 });
  await row.click();

  const detail = page.locator('.bk-detail-row').first();
  await detail.waitFor({ timeout: 20000 });
  measured[`4-admin-detail-${lang}`] =
    (await page.locator('.bk-detail-row').allInnerTexts()).slice(0, 4)
      .map((t) => t.replace(/\s+/g, ' ').trim());
  await shot(page, `4-admin-detail-${lang}`);
  console.log(`4-admin-detail-${lang}.png  rows = ${JSON.stringify(measured[`4-admin-detail-${lang}`])}`);

  await ctx.close();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const failures = [];

  for (const lang of LANGS) {
    for (const [label, fn] of [['find-booking', findBooking], ['counter-cancel', counterCancel],
      ['admin-detail', adminDetail]]) {
      try {
        await fn(browser, lang);
      } catch (err) {
        // One broken surface must not cost the other eleven screens, and it must not disappear
        // either -- it is printed here and repeated in the summary below.
        failures.push(`${label} ${lang}: ${err.message.split('\n')[0]}`);
        console.error(`!! ${label} ${lang} FAILED: ${err.message.split('\n')[0]}`);
      }
    }
  }

  await browser.close();

  await writeFile(path.join(OUT, `MEASURED-${VARIANT}.json`),
    JSON.stringify({ variant: VARIANT, bookingNumber: BOOKING_NUMBER, measured, failures }, null, 2),
    'utf8');

  console.log(`\nMEASURED (${VARIANT}):`);
  for (const [k, v] of Object.entries(measured)) console.log(`  ${k} = ${JSON.stringify(v)}`);
  if (failures.length) {
    console.log(`\nFAILED ${failures.length}:`);
    for (const f of failures) console.log(`  ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
