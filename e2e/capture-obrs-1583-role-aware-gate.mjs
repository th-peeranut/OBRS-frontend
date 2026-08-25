/**
 * OBRS-1583 evidence — the online-booking gate answering differently per role
 * while `features.onlineTicketBooking` stays FALSE.
 *
 * Run against a frontend served with the `sit` configuration, which inherits
 * `onlineTicketBooking: false` from environment.base.ts — i.e. the same closed
 * state prod is in. SIT CORS is pinned to http://localhost:4200, so serve there:
 *
 *   npx ng serve --configuration sit --port 4200
 *   OBRS_SEED_PASSWORD=... node e2e/capture-obrs-1583-role-aware-gate.mjs
 *
 * Four shots, matching AC-11:
 *   a-staff-list      signed in as a staff role → "เลือก" button, no notice
 *   b-staff-review    that button actually reaches /review-schedule-booking
 *                     (the shot that proves the guard was wired, not just the
 *                      helper — a half-open build bounces here)
 *   c-guest-list      signed out → "ทักเพจเพื่อจอง" + the notice strip
 *   d-guest-payment   signed out deep link to /payment → back on '/'
 *
 * The staff identity is `driver@system.local` on purpose: driver is the role the
 * owner's decision added, and the one a preview list written `['salesperson']`
 * would silently drop.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e/out/obrs-1583');
const PASSWORD = process.env.OBRS_SEED_PASSWORD;
const STAFF_EMAIL = process.env.OBRS_STAFF_EMAIL ?? 'driver@system.local';
const API = process.env.OBRS_API_URL ?? 'https://sit-obrs-backend.koyeb.app';

/**
 * The one route on SIT that carries scheduled rounds, end to end. Picked by
 * SLUG and translated to the label the Thai UI actually renders, because
 * position is not stable: the trip list's own filter offers the whole 28-stop
 * roster in id order while the home form offers only the stops reachable from
 * the chosen origin, so "the first option" means two different stops on the two
 * forms — and the near ones carry no rounds, which yields an empty list that
 * proves nothing about a gate.
 */
const FROM_SLUG = process.env.OBRS_FROM_STOP ?? 'nong_chak';
const TO_SLUG = process.env.OBRS_TO_STOP ?? 'mo_chit_2_bus_terminal';

async function thaiStopLabels() {
  const res = await fetch(`${API}/api/stops`);
  const stops = (await res.json()).data ?? [];
  const label = (slug) => {
    const hit = stops.find((s) => s.slug === slug);
    if (!hit?.translations?.th?.label) {
      throw new Error(`stop '${slug}' is not in ${API}/api/stops — re-derive the route`);
    }
    return hit.translations.th.label.trim();
  };
  return { from: label(FROM_SLUG), to: label(TO_SLUG) };
}

if (!PASSWORD) {
  throw new Error('set OBRS_SEED_PASSWORD to the SIT seed password');
}

const shots = [];

async function shoot(page, name) {
  // Top of the page, always. The notice strip renders ABOVE the router outlet,
  // so a shot taken wherever the router left the scroll position proves nothing
  // about whether the strip is there — and "no strip" is half of what the staff
  // shots have to show.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  shots.push({ name, file, url: page.url() });
  return file;
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(STAFF_EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45000 });
}

/**
 * Fills the trip list's OWN filter and searches from there, rather than walking
 * the home form and following the redirect.
 *
 * Measured 2026-08-23: the home route fires the search, lands on
 * /schedule-booking, and the list page's filter then fires a SECOND search of
 * its own with the roster's first stop as origin — `talat_nueang_chamnong`
 * instead of the `nong_chak` that was picked — which comes back with zero
 * rounds and wipes the list that had just rendered seven. It is a race, so it
 * reproduced on some runs and not others. Searching from the page that owns the
 * list removes the second search entirely.
 *
 * Both forms are the same components (`app-trip-type-toggle`, the two
 * `app-dropdown-group-obrs` in `.station-group`, `.btn-search`); only the date
 * field's inputId differs.
 */
async function searchTrips(page) {
  await page.goto(`${BASE}/schedule-booking`, { waitUntil: 'domcontentloaded' });
  await page.locator('.btn-search').waitFor({ timeout: 30000 });

  // One-way: the form defaults to a round trip (OBRS-1185), which drags a
  // return date into a search that has nothing to do with this card.
  await page.locator('.trip-type-toggle__btn').first().click();

  // One adult. Reached cold, this form starts at ZERO passengers — the home
  // form starts at one — and a zero-passenger search never leaves the browser,
  // so the list stays empty with no request to explain it.
  await page.locator('#dropdownObrsPassenger').click();
  await page.locator('.passenger-icon.passenger-add').first().click();
  await page.locator('#dropdownObrsPassenger').click();

  // Tomorrow, not today: SIT's last round of the day has usually departed by
  // the time this runs, and an empty result list proves nothing about a gate.
  const tomorrow = new Date(Date.now() + 86400000);
  await page.locator('#filter-departure-date').click();
  await page
    .locator('.app-date-field-panel td:not(.p-datepicker-other-month) span')
    .filter({ hasText: new RegExp(`^${tomorrow.getDate()}$`) })
    .first()
    .click();

  const labels = await thaiStopLabels();
  const groups = page.locator('.station-group app-dropdown-group-obrs');
  await groups.first().locator('.dropdown-btn').click();
  await groups
    .first()
    .locator('.dropdown-menu.show .dropdown-option')
    .filter({ hasText: labels.from })
    .first()
    .click();

  // The destination list is rebuilt from the chosen origin — without this pause
  // the click lands on the PREVIOUS list.
  await page.waitForTimeout(1000);
  await groups.nth(1).locator('.dropdown-btn').click();
  await page.waitForTimeout(500);
  await groups
    .nth(1)
    .locator('.dropdown-menu.show .dropdown-option')
    .filter({ hasText: labels.to })
    .first()
    .click();

  await page.locator('.btn-search').click();
  await page.waitForFunction(
    () => document.querySelectorAll('.schedule-item').length > 0,
    null,
    { timeout: 30000 }
  );
  await page.waitForTimeout(2000);
}

async function gateState(page) {
  return page.evaluate(() => ({
    bookingButtons: document.querySelectorAll('button.select-btn').length,
    facebookFallbacks: document.querySelectorAll('a.select-btn--closed').length,
    noticeVisible: !!document.querySelector('.booking-closed'),
    roles: localStorage.getItem('auth_roles'),
  }));
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const result = { base: BASE, staff: STAFF_EMAIL, checks: {} };

  // ---- signed out -------------------------------------------------------
  const guest = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const guestPage = await guest.newPage();

  await searchTrips(guestPage);
  result.checks.guestList = await gateState(guestPage);
  await shoot(guestPage, 'c-guest-list');

  await guestPage.goto(`${BASE}/payment`, { waitUntil: 'domcontentloaded' });
  await guestPage.waitForTimeout(2000);
  result.checks.guestPaymentLandedOn = new URL(guestPage.url()).pathname;
  await shoot(guestPage, 'd-guest-payment');
  await guest.close();

  // ---- signed in as staff ----------------------------------------------
  const staff = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const staffPage = await staff.newPage();

  await login(staffPage);
  await searchTrips(staffPage);
  result.checks.staffList = await gateState(staffPage);
  await shoot(staffPage, 'a-staff-list');

  await staffPage.locator('button.select-btn').first().click();
  // OBRS-1336: the home form defaults to a round trip, so an outbound pick with
  // no return leg raises the one-way confirm instead of navigating.
  const confirm = staffPage.locator('.nrc-modal .btn-primary');
  if (await confirm.isVisible({ timeout: 4000 }).catch(() => false)) {
    await confirm.click();
  }
  await staffPage.waitForURL('**/review-schedule-booking', { timeout: 30000 });
  await staffPage.waitForTimeout(2000);
  result.checks.staffReachedReview = new URL(staffPage.url()).pathname;
  await shoot(staffPage, 'b-staff-review');
  await staff.close();

  await browser.close();
  result.shots = shots;
  await writeFile(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
