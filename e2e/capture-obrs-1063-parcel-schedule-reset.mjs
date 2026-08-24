/**
 * OBRS-1063 visual evidence — `/parcel-booking` phase Trip, on ONE dev server
 * (`ng serve`, the default configuration: `environment.ts`, which is the only
 * committed config that opens `features.onlineParcelBooking`), run twice with
 * nothing changed but the component files under test:
 *
 *   node e2e/capture-obrs-1063-parcel-schedule-reset.mjs --label before   # sources at origin/dev
 *   node e2e/capture-obrs-1063-parcel-schedule-reset.mjs --label after    # sources with the fix
 *
 * WHY EVERY /api CALL IS STUBBED
 * The defect is entirely in the frontend's own form state: the dropdown drops
 * back to its placeholder while the FormControl keeps the id from the previous
 * route/date, so `form.valid` stays true and ถัดไป stays enabled. A real
 * backend cannot make that more true, and a stub makes the two schedule lists
 * (one per date, one per route) deterministic, which is what a before/after
 * pair needs. `POST /api/private/parcels/schedules/search` is answered from the
 * request body, so changing the date really does return a different list.
 *
 * WHAT IT ASSERTS, AND WHAT IT DELIBERATELY DOES NOT
 * ⛔ NOT "the dropdown shows its placeholder" — that was already true before
 * the fix (`dropdown-group-obrs.resolveSelectedValue()` cannot find the old id
 * among the new options and falls back on its own), and believing it is how the
 * bug survived. Each state instead records the FormControl value (read off the
 * live component through Angular's dev-mode `window.ng`) NEXT TO the real
 * `<button disabled>` state of ถัดไป — the two that used to disagree.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4363';
const OUT = path.resolve(
  '..', 'obrs-agent-office', '.claude', 'agent-office', 'scripts', 'captures', 'obrs-1063'
);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 || !process.argv[i + 1] ? fallback : process.argv[i + 1];
};
const LABEL = arg('--label', null);
if (!LABEL) {
  throw new Error('--label <before|after> is required — an unlabelled pair proves nothing');
}

const ok = (data) => ({ code: 200, message: 'OK', data });
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const TODAY = new Date();
const TOMORROW = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + 1);
const D1 = iso(TODAY);
const D2 = iso(TOMORROW);

// Minimal StationApi rows. No `display`/`translations` on purpose: the dropdown's
// getValue() falls through to `option.slug`, so what the option reads is the slug
// itself — unambiguous to click and unambiguous in a screenshot as stub data.
const STATIONS = [
  { id: 1, slug: 'nong_chak', status: 'operational', stopType: 'station', createdAt: '', updatedAt: '' },
  { id: 2, slug: 'ban_bueng', status: 'operational', stopType: 'station', createdAt: '', updatedAt: '' },
  { id: 4, slug: 'bkr_mochit2', status: 'operational', stopType: 'station', createdAt: '', updatedAt: '' },
];

const schedule = (id, dateIso, hh) => ({
  id,
  departureDateTime: `${dateIso}T${hh}:00:00+07:00`,
  arrivalDateTime: `${dateIso}T${String(Number(hh) + 2).padStart(2, '0')}:30:00+07:00`,
  vehicleType: 'ตู้',
  availableSeats: 0,
});

/** Keyed on the REQUEST BODY, so a date change genuinely returns another list. */
function schedulesFor(body) {
  const { fromStop, toStop, departureDate } = body ?? {};
  if (fromStop === 'ban_bueng') return [];                 // the no-schedules route
  if (fromStop !== 'nong_chak' || toStop !== 'bkr_mochit2') return [];
  if (departureDate === D1) return [schedule(9001, D1, '08'), schedule(9002, D1, '14')];
  if (departureDate === D2) return [schedule(9101, D2, '10')];
  return [];
}

const browser = await chromium.launch();
const results = { label: LABEL, base: BASE, dates: { D1, D2 }, arms: {} };
await mkdir(OUT, { recursive: true });

async function openTripPhase(page) {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'obrs-1063-capture-token');
    localStorage.setItem('auth_username', 'customer@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['user']));
  });

  const searchBodies = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const pathname = req.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    if (/\/api\/stops$/.test(pathname)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(STATIONS)) });
    }
    if (/\/api\/private\/parcels\/schedules\/search$/.test(pathname)) {
      let body = null;
      try { body = JSON.parse(req.postData() ?? 'null'); } catch { body = null; }
      searchBodies.push(body);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(schedulesFor(body))) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) });
  });
  await page.route('**/accounts.google.com/**', (route) => route.abort());
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());

  await page.goto(BASE + '/parcel-booking', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('app-parcel-trip-form', { state: 'visible', timeout: 60000 });
  return searchBodies;
}

/** nth station dropdown: 0 = from, 1 = to. Both are `[searchable]` inputs. */
async function pickStation(page, nth, slug) {
  const trigger = page.locator('app-parcel-trip-form .dropdown-btn').nth(nth);
  await trigger.click();
  await page.locator('app-parcel-trip-form app-dropdown-group-obrs')
    .nth(nth)
    .locator('a.dropdown-option', { hasText: slug })
    .first()
    .click();
  await page.waitForTimeout(400);
}

/** The schedule dropdown is the LAST one on the form, and only exists when a list came back. */
async function pickSchedule(page, labelPart) {
  const group = page.locator('app-parcel-trip-form app-dropdown-group-obrs').last();
  await group.locator('.dropdown-btn').click();
  await group.locator('a.dropdown-option', { hasText: labelPart }).first().click();
  await page.waitForTimeout(400);
}

/**
 * The real PrimeNG date picker, driven as a user does: open the panel, click the
 * day cell. Navigates one month forward when tomorrow crosses the boundary.
 */
async function pickTomorrow(page) {
  await page.locator('#parcelTripDate').click();
  await page.waitForSelector('.p-datepicker-panel', { state: 'visible', timeout: 10000 });
  if (TOMORROW.getMonth() !== TODAY.getMonth()) {
    await page.locator('.p-datepicker-panel [data-pc-section="pcnextbutton"], .p-datepicker-next-button').first().click();
    await page.waitForTimeout(300);
  }
  const day = String(TOMORROW.getDate());
  await page
    .locator('.p-datepicker-panel td:not(.p-datepicker-other-month) span')
    .filter({ hasText: new RegExp(`^${day}$`) })
    .first()
    .click();
  await page.waitForTimeout(600);
}

/**
 * One state, measured. `scheduleIdInForm` comes off the live component instance
 * through Angular's dev-mode global — not off the screen, because the screen was
 * never the half that lied.
 */
const readState = (page, note) =>
  page.evaluate((n) => {
    const host = document.querySelector('app-parcel-trip-form');
    const cmp = window.ng?.getComponent?.(host) ?? null;
    const form = cmp?.form ?? null;
    const next = document.querySelector('.parcel-btn-primary');
    const groups = Array.from(document.querySelectorAll('app-parcel-trip-form app-dropdown-group-obrs'));
    const scheduleGroup = groups.length >= 3 ? groups[groups.length - 1] : null;
    return {
      note: n,
      scheduleIdInForm: form ? form.get('scheduleId').value : 'NG_DEBUG_UNAVAILABLE',
      dateInForm: form ? String(form.get('date').value) : 'NG_DEBUG_UNAVAILABLE',
      formValid: form ? form.valid : null,
      nextDisabled: next ? next.disabled : null,
      nextLabel: next ? (next.textContent || '').trim() : null,
      scheduleDropdownRendered: !!scheduleGroup,
      scheduleTriggerText: scheduleGroup
        ? (scheduleGroup.querySelector('.value-text')?.textContent || '').trim()
        : null,
      scheduleShowsPlaceholder: scheduleGroup
        ? !!scheduleGroup.querySelector('.value-text.is-placeholder')
        : null,
      noSchedulesText:
        (document.querySelector('.parcel-trip-form__empty')?.textContent || '').trim() || null,
    };
  }, note);

const shot = (page, name, selector = 'app-parcel-trip-form') =>
  page.locator(selector).screenshot({ path: path.join(OUT, `${LABEL}-${name}.png`) });

// ── ARM 1: change the DATE — the case the backend cannot catch ───────────────
// `ParcelOnlineReqDto` carries no date, so a stale scheduleId from another day
// is a fully valid payload: nothing downstream would have refused it.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  const searchBodies = await openTripPhase(page);

  await pickStation(page, 0, 'nong_chak');
  await pickStation(page, 1, 'bkr_mochit2');
  await pickSchedule(page, '08:00');
  const picked = await readState(page, 'schedule picked for D1');
  await shot(page, '1-schedule-picked');

  await pickTomorrow(page);
  const afterDate = await readState(page, 'date moved to D2, list refetched');
  await shot(page, '2-after-date-change');

  // What a user who ignores the placeholder does next: press ถัดไป.
  let submitted = null;
  const nextBtn = page.locator('.parcel-btn-primary');
  if (!(await nextBtn.isDisabled())) {
    await nextBtn.click();
    await page.waitForTimeout(800);
    submitted = await page.evaluate(() => ({
      leftTripPhase: !document.querySelector('app-parcel-trip-form'),
      detailsPhaseMounted: !!document.querySelector('app-parcel-details-form'),
    }));
    // The wizard CARD, not the trip form: on the old code this press leaves the
    // trip phase entirely, so `app-parcel-trip-form` is gone by now.
    await shot(page, '3-pressed-next-anyway', '.parcel-booking-card');
  }

  results.arms.dateChange = {
    picked,
    afterDate,
    pressedNext: submitted,
    searchRequestDates: searchBodies.map((b) => b && b.departureDate),
    // The whole bug in one line: the id the form still holds belongs to the list
    // the previous date returned.
    staleIdSurvived: afterDate.scheduleIdInForm === picked.scheduleIdInForm,
  };
  await context.close();
}

// ── ARM 2: change a STATION (and then swap) ──────────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  await openTripPhase(page);

  await pickStation(page, 0, 'nong_chak');
  await pickStation(page, 1, 'bkr_mochit2');
  await pickSchedule(page, '08:00');
  const picked = await readState(page, 'schedule picked');

  await pickStation(page, 0, 'ban_bueng');   // a route with no rounds at all
  await page.waitForTimeout(600);
  const afterStation = await readState(page, 'origin changed to a route with no rounds');
  await shot(page, '4-after-station-change-no-schedules');

  results.arms.stationChange = {
    picked,
    afterStation,
    staleIdSurvived: afterStation.scheduleIdInForm === picked.scheduleIdInForm,
    // AC#3: "ไม่พบรอบรถ" and a pressable ถัดไป must never be on screen together.
    noSchedulesAndNextPressable:
      !!afterStation.noSchedulesText && afterStation.nextDisabled === false,
  };
  await context.close();
}

// ── ARM 3: the OBRS-1035 swap button, which patches with emitEvent:false ─────
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  await openTripPhase(page);

  await pickStation(page, 0, 'nong_chak');
  await pickStation(page, 1, 'bkr_mochit2');
  await pickSchedule(page, '08:00');
  const picked = await readState(page, 'schedule picked');

  await page.locator('app-station-swap-button button').click();
  await page.waitForTimeout(800);
  const afterSwap = await readState(page, 'origin/destination swapped');
  await shot(page, '5-after-swap');

  results.arms.swap = {
    picked,
    afterSwap,
    staleIdSurvived: afterSwap.scheduleIdInForm === picked.scheduleIdInForm,
  };
  await context.close();
}

await browser.close();
await writeFile(path.join(OUT, `${LABEL}.json`), JSON.stringify(results, null, 2), 'utf8');
console.log(JSON.stringify(results, null, 2));
