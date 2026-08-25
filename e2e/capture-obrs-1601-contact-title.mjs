/**
 * OBRS-1601 evidence -- the booking CONTACT carries an optional honorific again, as a CODE.
 *
 * Run it TWICE against the same stack and the same local database (obrs1601qa), with one SQL
 * statement between the runs:
 *
 *   # BEFORE -- the seeded booking with contact_title_snapshot still NULL
 *   OBRS_VARIANT=BEFORE OBRS_OUT_DIR=e2e/out/obrs-1601/before node e2e/capture-obrs-1601-contact-title.mjs
 *   psql -d obrs1601qa -c "UPDATE bookings SET contact_title_snapshot='MISS' WHERE booking_number='<n>'"
 *   # AFTER
 *   OBRS_VARIANT=AFTER  OBRS_OUT_DIR=e2e/out/obrs-1601/after  node e2e/capture-obrs-1601-contact-title.mjs
 *
 * ONE backend and ONE frontend for both runs, and each half of that is a deliberate claim, not a
 * shortcut:
 *
 *  - **NULL is byte-identical to the dev backend's absent field.** `TitleLabelPipe.transform` does
 *    `code ?? ''`, so `null` and a missing key take the same branch and print the bare name. The
 *    BEFORE images are therefore what `origin/dev` renders, and the pipe's null behaviour is pinned
 *    by its own spec rather than asserted here. Booting a second backend and a second `ng serve`
 *    would photograph the same pixels for another ~1.3 GB.
 *  - **Setting the column with SQL is not the same as proving the write path**, and this script does
 *    not claim to. What fills that column from `contactRequest.getTitle()` is proven by
 *    `BookingServiceTest.createBooking_contactTitleSnapshot_*`; what these images prove is what the
 *    four screens DO with the value once it is there, which is the half a test cannot photograph.
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
  // `openDetail` seeds the panel OPTIMISTICALLY from the list row and only then fetches
  // /private/bookings/<id>. Waiting on `.bk-detail-row` alone photographs that placeholder: the
  // first (cold) language came out with the contact name as `-` while the two after it, running
  // against a warm backend, read the real name. So wait for the fetch that fills it.
  await Promise.all([
    page.waitForResponse((r) => /\/private\/bookings\/\d+(\?|$)/.test(r.url())
      && r.request().method() === 'GET', { timeout: 30000 }),
    row.click(),
  ]);
  // The response reaching the browser is still one change-detection pass short of the real name
  // being painted. `isDetailFetching` is cleared in the SAME subscribe callback that assigns
  // `detailBooking` (bookings-page.component.ts:338, and :349 on error), and the template shows
  // `.bk-inline-updating` exactly while it is true (bookings-page.component.html:244) - so waiting
  // for that span to detach is the paint, not a guessed number of milliseconds. The payments fetch
  // renders a second span with the same class (:316, cleared at :361/:368), which only makes this
  // wait broader; both clear on error too, so a failed fetch cannot hang it.
  await page.locator('.bk-inline-updating').first().waitFor({ state: 'detached', timeout: 20000 });

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
