/**
 * OBRS-1598 visual evidence — `/staff/parcels/consign`, on ONE dev server
 * (`ng serve`, default configuration), run twice with nothing changed but the
 * two component files under test:
 *
 *   node e2e/capture-obrs-1598-consign-schedule-reset.mjs --label before   # sources at origin/dev
 *   node e2e/capture-obrs-1598-consign-schedule-reset.mjs --label after    # sources with the fix
 *
 * WHY EVERY /api CALL IS STUBBED
 * The defect is entirely in the frontend's own form state: the page refetches
 * `scheduleOptions` for the new date, `app-admin-dropdown` cannot find the old
 * id among them and falls back to its placeholder, while `scheduleId` in the
 * FormControl keeps the previous day's round — so `form.valid` stays true and
 * the submit button stays pressable. A real backend cannot make that more true,
 * and `GET /api/private/schedules/walk-in?date=` is answered from the query
 * string, so changing the date really does return a different list.
 *
 * WHAT IT ASSERTS, AND WHAT IT DELIBERATELY DOES NOT
 * ⛔ NOT "the dropdown shows its placeholder" — that is true on the BROKEN
 * build too (measured: `AdminDropdownComponent.selectedLabel` returns
 * `this.placeholder` whenever no option matches the held value), and believing
 * it is how the bug survives. Each state records the FormControl value read off
 * the live component through Angular's dev-mode `window.ng`, NEXT TO the real
 * `<button disabled>` state of the submit button — the two that disagree. The
 * consigned arm goes one step further and records the POST body actually sent.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4363';
const OUT = path.resolve(
  '..', 'obrs-agent-office', '.claude', 'agent-office', 'scripts', 'captures', 'obrs-1598'
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

const trip = (scheduleId, dateIso, hh) => ({
  scheduleId,
  vehicleType: 'bus',
  licensePlate: 'AB-1234',
  driverName: 'Somchai',
  departureDateTime: `${dateIso}T${hh}:00:00`,
  arrivalDateTime: `${dateIso}T${String(Number(hh) + 3).padStart(2, '0')}:00:00`,
  pricePerSeat: '300',
  capacity: 21,
  availableCount: 10,
  reservedUnpaidCount: 0,
  soldPaidCount: 0,
  seatingMode: 'ASSIGNED',
  availableSeatNumbers: ['A1', 'A2'],
});

/** Keyed on the `date` QUERY PARAM, so a date change genuinely returns another list. */
function schedulesFor(date) {
  if (date === D1) return [{ routeSlug: 'bkk-cnx', routeLabel: 'Bangkok - Chiang Mai', trips: [trip(9001, D1, '08')] }];
  if (date === D2) return [{ routeSlug: 'bkk-cnx', routeLabel: 'Bangkok - Chiang Mai', trips: [trip(9101, D2, '07')] }];
  return [];
}

const SEGMENTS = {
  route: { slug: 'bkk-cnx', name: 'Bangkok - Chiang Mai' },
  stopPairs: [
    {
      segmentId: 1,
      fromStop: { slug: 'bkk', name: 'Bangkok' },
      toStop: { slug: 'cnx', name: 'Chiang Mai' },
      vehicleType: { slug: 'bus', name: 'Bus' },
      fare: '300',
      estimatedDurationMinutes: 600,
    },
  ],
  popularPickupStops: [],
  popularDropoffStops: [],
};

const STOPS = {
  stops: [
    { stopOrder: 1, offsetMinutesFromOrigin: 0, stop: { code: 'bkk', id: 1 } },
    { stopOrder: 2, offsetMinutesFromOrigin: 600, stop: { code: 'cnx', id: 2 } },
  ],
};

const POLICY = {
  maxWeightKg: 100,
  carryOnFreeSizeMaxInch: 28,
  carryOnFreeAisleMaxPerTrip: 10,
  prohibitedCategories: ['flammable', 'explosive', 'weapon', 'narcotic', 'corpse'],
};

const browser = await chromium.launch();
const results = { label: LABEL, base: BASE, dates: { D1, D2 }, arms: {} };
await mkdir(OUT, { recursive: true });

async function openConsignPage(page) {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'obrs-1598-capture-token');
    localStorage.setItem('auth_username', 'salesperson@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['salesperson']));
  });

  const scheduleQueryDates = [];
  const postedParcels = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;
    if (/\/api\/private\/schedules\/walk-in$/.test(pathname)) {
      const date = url.searchParams.get('date');
      scheduleQueryDates.push(date);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(schedulesFor(date))) });
    }
    if (/\/api\/private\/segments\//.test(pathname)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(SEGMENTS)) });
    }
    if (/\/api\/private\/route-stops\//.test(pathname)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(STOPS)) });
    }
    if (/\/api\/parcel-policy$/.test(pathname)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(POLICY)) });
    }
    if (/\/api\/private\/parcels\/share-config$/.test(pathname)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({ driverPct: 30, salespersonPct: 10, configured: true })),
      });
    }
    if (/\/api\/private\/parcels\/quote$/.test(pathname)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({ amount: 120, farePerUnit: 120, unitCount: 1, weightTierMultiplier: 1 })),
      });
    }
    if (/\/api\/private\/parcels\/walk-in$/.test(pathname) && req.method() === 'POST') {
      let body = null;
      try { body = JSON.parse(req.postData() ?? 'null'); } catch { body = null; }
      postedParcels.push(body);
      // Answer with an error the page renders inline: the point of this arm is
      // the REQUEST that left, not a success panel replacing the form.
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ code: 409, message: 'stubbed', errorCode: 'PARCEL_CAPACITY_FULL' }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) });
  });
  await page.route('**/accounts.google.com/**', (route) => route.abort());
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());

  await page.goto(BASE + '/staff/parcels/consign', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('app-parcel-consign-form', { state: 'visible', timeout: 60000 });
  await page.waitForTimeout(600);
  return { scheduleQueryDates, postedParcels };
}

/** Picks an option out of one of the form's `app-admin-dropdown`s by control name. */
async function pickDropdown(page, controlName, labelPart) {
  const dd = page.locator(`app-admin-dropdown[formcontrolname="${controlName}"]`);
  await dd.locator('.admin-dropdown-trigger').click();
  await dd.locator('.admin-dropdown-option', { hasText: labelPart }).first().click();
  await page.waitForTimeout(500);
}

/** The real PrimeNG date picker, driven as a user does: open the panel, click the day cell. */
async function pickTomorrow(page) {
  await page.locator('p-datepicker input').first().click();
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
  await page.waitForTimeout(900);
}

/** Everything the bug does not depend on, written straight onto the live FormGroup. */
const fillNonTripFields = (page, mode) =>
  page.evaluate((m) => {
    const cmp = window.ng?.getComponent?.(document.querySelector('app-parcel-consign-form'));
    if (!cmp) return false;
    cmp.form.patchValue({
      senderName: 'สมชาย ผู้ส่ง',
      senderPhone: '0812345678',
      recipientName: 'สมหญิง ผู้รับ',
      recipientPhone: '0898765432',
      weightKg: 5,
      description: 'กล่องเอกสาร',
      prohibitedAcknowledged: true,
      // carry-on needs all three; ≤ 28in keeps it free-aisle so no seat count is required
      dimensions: m === 'carry_on_seat' ? { lengthCm: 20, widthCm: 20, heightCm: 20 } : { lengthCm: null, widthCm: null, heightCm: null },
    });
    return true;
  }, mode);

/**
 * One state, measured. `scheduleIdInForm` comes off the live component instance
 * through Angular's dev-mode global — not off the screen, because the screen was
 * never the half that lied.
 */
const readState = (page, note) =>
  page.evaluate((n) => {
    const host = document.querySelector('app-parcel-consign-form');
    const cmp = window.ng?.getComponent?.(host) ?? null;
    const form = cmp?.form ?? null;
    const submit = document.querySelector('app-parcel-consign-form button[type="submit"]');
    const scheduleDd = document.querySelector('app-admin-dropdown[formcontrolname="scheduleId"]');
    return {
      note: n,
      scheduleIdInForm: form ? form.get('scheduleId').value : 'NG_DEBUG_UNAVAILABLE',
      pickupStopIdInForm: form ? form.get('pickupStopId').value : 'NG_DEBUG_UNAVAILABLE',
      dropoffStopIdInForm: form ? form.get('dropoffStopId').value : 'NG_DEBUG_UNAVAILABLE',
      formValid: form ? form.valid : null,
      submitDisabled: submit ? submit.disabled : null,
      submitLabel: submit ? (submit.textContent || '').trim() : null,
      scheduleTriggerText: scheduleDd
        ? (scheduleDd.querySelector('.admin-dropdown-trigger')?.textContent || '').replace(/\s+/g, ' ').trim()
        : null,
      scheduleOptionCount: cmp ? cmp.scheduleOptions.length : null,
      pickupOptionCount: cmp ? cmp.pickupOptions.length : null,
    };
  }, note);

const shot = (page, name, selector = 'app-parcel-consign-page') =>
  page.locator(selector).screenshot({ path: path.join(OUT, `${LABEL}-${name}.png`) });

// ── ARM 1: consigned — change the DATE, then press submit anyway ─────────────
// `ParcelConsignedReqDto` carries no date, so a stale scheduleId from another
// day is a fully valid payload: nothing downstream would have refused it.
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
  const page = await context.newPage();
  const { scheduleQueryDates, postedParcels } = await openConsignPage(page);

  await pickDropdown(page, 'scheduleId', '08:00');
  await pickDropdown(page, 'pickupStopId', 'Bangkok');
  await pickDropdown(page, 'dropoffStopId', 'Chiang Mai');
  await fillNonTripFields(page, 'consigned');
  await page.waitForTimeout(700);
  const picked = await readState(page, 'round of D1 picked, form complete');
  await shot(page, '1-consigned-round-picked');

  await pickTomorrow(page);
  const afterDate = await readState(page, 'date moved to D2, options refetched');
  await shot(page, '2-consigned-after-date-change');

  // What a salesperson who trusts the placeholder does next: press submit.
  const submitBtn = page.locator('app-parcel-consign-form button[type="submit"]');
  let pressed = null;
  if (!(await submitBtn.isDisabled())) {
    await submitBtn.click();
    await page.waitForTimeout(900);
    pressed = { sentScheduleId: postedParcels.at(-1)?.scheduleId ?? null };
    await shot(page, '3-consigned-pressed-submit-anyway');
  }

  results.arms.consigned = {
    picked,
    afterDate,
    pressedSubmit: pressed,
    scheduleQueryDates: [...scheduleQueryDates],
    postedParcelCount: postedParcels.length,
    // The whole bug in one line: the id the form still holds belongs to the
    // list the PREVIOUS date returned.
    staleIdSurvived: afterDate.scheduleIdInForm === picked.scheduleIdInForm,
  };
  await context.close();
}

// ── ARM 2: carry-on mode — the same date change on the other branch (AC#2) ───
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
  const page = await context.newPage();
  await openConsignPage(page);

  await page.locator('[data-testid="parcel-consign-mode-carry-on"]').click();
  await page.waitForTimeout(500);
  await pickDropdown(page, 'scheduleId', '08:00');
  await pickDropdown(page, 'pickupStopId', 'Bangkok');
  await pickDropdown(page, 'dropoffStopId', 'Chiang Mai');
  await fillNonTripFields(page, 'carry_on_seat');
  await page.waitForTimeout(700);
  const picked = await readState(page, 'carry-on: round of D1 picked, form complete');
  await shot(page, '4-carryon-round-picked');

  await pickTomorrow(page);
  const afterDate = await readState(page, 'carry-on: date moved to D2');
  await shot(page, '5-carryon-after-date-change');

  results.arms.carryOn = {
    picked,
    afterDate,
    staleIdSurvived: afterDate.scheduleIdInForm === picked.scheduleIdInForm,
  };
  await context.close();
}

await browser.close();
await writeFile(path.join(OUT, `${LABEL}.json`), JSON.stringify(results, null, 2), 'utf8');
console.log(JSON.stringify(results, null, 2));
