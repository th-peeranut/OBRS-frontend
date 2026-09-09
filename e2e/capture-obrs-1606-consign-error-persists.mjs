/**
 * OBRS-1606 visual evidence — `/staff/parcels/consign`, on ONE dev server
 * (`ng serve`, default configuration), run twice with nothing changed but the
 * one component file under test:
 *
 *   node e2e/capture-obrs-1606-consign-error-persists.mjs --label before   # sources at origin/dev
 *   node e2e/capture-obrs-1606-consign-error-persists.mjs --label after    # sources with the fix
 *
 * WHY EVERY /api CALL IS STUBBED — same reason as OBRS-1598's capture next to
 * it: the behaviour under test is the page's own field `serverErrorKey`, which
 * a real backend cannot make more or less true. The POST is answered 409
 * `PARCEL_CARGO_CAPACITY_EXCEEDED` on purpose: that is a ROUND-bound error, the
 * class the owner's decision is about.
 *
 * WHAT IT ASSERTS, AND WHAT IT DELIBERATELY DOES NOT
 * ⛔ NOT "the banner is gone" alone — an empty read is also what a renamed
 * selector, a failed login stub or a submit that never fired produces, and each
 * of those reads as "fixed" on the after arm (OBRS-1598 paid for exactly that:
 * a capture with no precondition cannot fail). So every arm first asserts the
 * banner IS on screen and `serverErrorKey` IS set, and only then performs the
 * date / round change. Both halves are read: the page component's own field via
 * Angular's dev-mode `window.ng`, AND the rendered `div.admin-error` text (the
 * field errors on this form are `small.admin-error`; the submit banner is the
 * only `div`).
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4363';
const OUT = path.resolve(
  '..', 'obrs-agent-office', '.claude', 'agent-office', 'scripts', 'captures', 'obrs-1606'
);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 || !process.argv[i + 1] ? fallback : process.argv[i + 1];
};
const LABEL = arg('--label', null);
if (!LABEL) {
  throw new Error('--label <before|after> is required - an unlabelled pair proves nothing');
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

/** D1 carries TWO rounds so the round-change arm has somewhere to go without
 *  touching the date; D2 carries one. Keyed on the `date` query param. */
function schedulesFor(date) {
  if (date === D1) {
    return [
      {
        routeSlug: 'bkk-cnx',
        routeLabel: 'Bangkok - Chiang Mai',
        trips: [trip(9001, D1, '08'), trip(9002, D1, '14')],
      },
    ];
  }
  if (date === D2) {
    return [{ routeSlug: 'bkk-cnx', routeLabel: 'Bangkok - Chiang Mai', trips: [trip(9101, D2, '07')] }];
  }
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
    localStorage.setItem('auth_token', 'obrs-1606-capture-token');
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
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(schedulesFor(date))),
      });
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
      try {
        body = JSON.parse(req.postData() ?? 'null');
      } catch {
        body = null;
      }
      postedParcels.push(body);
      // A ROUND-bound refusal on purpose - the class of message the owner's
      // decision is about ("this round has no cargo room left").
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ code: 409, message: 'stubbed', errorCode: 'PARCEL_CARGO_CAPACITY_EXCEEDED' }),
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

/** Everything the behaviour under test does not depend on, written straight onto the live FormGroup. */
const fillNonTripFields = (page) =>
  page.evaluate(() => {
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
      dimensions: { lengthCm: null, widthCm: null, heightCm: null },
    });
    return true;
  });

/**
 * One state, measured on BOTH halves: the page component's own `serverErrorKey`
 * through Angular's dev-mode global, and the text actually painted on screen.
 * The submit banner is the only `div.admin-error` on this form - every field
 * error is a `small`.
 */
const readState = (page, note) =>
  page.evaluate((n) => {
    const pageCmp = window.ng?.getComponent?.(document.querySelector('app-parcel-consign-page')) ?? null;
    const formCmp = window.ng?.getComponent?.(document.querySelector('app-parcel-consign-form')) ?? null;
    const banner = document.querySelector('app-parcel-consign-form div.admin-error');
    return {
      note: n,
      serverErrorKey: pageCmp ? pageCmp.serverErrorKey : 'NG_DEBUG_UNAVAILABLE',
      bannerText: banner ? (banner.textContent || '').replace(/\s+/g, ' ').trim() : null,
      bannerPresent: !!banner,
      scheduleIdInForm: formCmp ? formCmp.form.get('scheduleId').value : 'NG_DEBUG_UNAVAILABLE',
    };
  }, note);

const shot = (page, name, selector = 'app-parcel-consign-page') =>
  page.locator(selector).screenshot({ path: path.join(OUT, `${LABEL}-${name}.png`) });

/**
 * Without this the run cannot fail. A missing `window.ng`, a login stub that
 * bounced to /login, or a submit that never left would all leave the banner
 * absent - and "no banner" is exactly what the AFTER arm is supposed to show.
 * So the error state is proven present BEFORE the change that should clear it.
 */
function assertErrorRaised(state, arm) {
  const fail = (why) => {
    throw new Error(`${arm}: premise not established - ${why}. Got ${JSON.stringify(state)}`);
  };
  if (state.serverErrorKey !== 'STAFF.PARCEL_CONSIGN.ERROR.CARGO_CAPACITY_EXCEEDED') {
    fail('the submit did not leave the round-bound error on the page');
  }
  if (!state.bannerPresent || !state.bannerText) fail('the error banner was never painted');
}

async function submitUntilError(page) {
  await pickDropdown(page, 'scheduleId', '08:00');
  await pickDropdown(page, 'pickupStopId', 'Bangkok');
  await pickDropdown(page, 'dropoffStopId', 'Chiang Mai');
  await fillNonTripFields(page);
  await page.waitForTimeout(700);
  const submitBtn = page.locator('app-parcel-consign-form button[type="submit"]');
  if (await submitBtn.isDisabled()) {
    throw new Error('submit was not pressable - the form never reached a valid state');
  }
  await submitBtn.click();
  await page.waitForTimeout(900);
}

// ── ARM 1: the DATE changes after a failed submit ────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
  const page = await context.newPage();
  const { scheduleQueryDates, postedParcels } = await openConsignPage(page);

  await submitUntilError(page);
  const raised = await readState(page, 'submit refused for the D1 round - error on screen');
  assertErrorRaised(raised, 'date-change');
  await shot(page, '1-error-raised-on-d1-round');

  await pickTomorrow(page);
  const afterDate = await readState(page, 'date moved to D2, round cleared by OBRS-1598');
  if (scheduleQueryDates.at(-1) !== D2) {
    throw new Error(`date-change: the picker never moved the query to ${D2} - saw ${JSON.stringify(scheduleQueryDates)}`);
  }
  await shot(page, '2-after-date-change');

  results.arms.dateChange = {
    raised,
    afterDate,
    postedParcelCount: postedParcels.length,
    // The whole card in one line: does the previous round's refusal outlive it?
    errorSurvived: afterDate.serverErrorKey === raised.serverErrorKey,
  };
  await context.close();
}

// ── ARM 2: the ROUND changes after a failed submit (same day) ────────────────
// `onScheduleChange()` is the single funnel for both, so the round arm is not a
// bonus - it is the other half of what one clear there does.
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
  const page = await context.newPage();
  await openConsignPage(page);

  await submitUntilError(page);
  const raised = await readState(page, 'submit refused for the 08:00 round - error on screen');
  assertErrorRaised(raised, 'round-change');
  await shot(page, '3-error-raised-before-round-change');

  await pickDropdown(page, 'scheduleId', '14:00');
  await page.waitForTimeout(700);
  const afterRound = await readState(page, 'round moved to 14:00 on the SAME day');
  if (afterRound.scheduleIdInForm !== '9002') {
    throw new Error(`round-change: the round never moved to 9002 - saw ${JSON.stringify(afterRound)}`);
  }
  await shot(page, '4-after-round-change');

  results.arms.roundChange = {
    raised,
    afterRound,
    errorSurvived: afterRound.serverErrorKey === raised.serverErrorKey,
  };
  await context.close();
}

await writeFile(path.join(OUT, `${LABEL}-result.json`), JSON.stringify(results, null, 2), 'utf8');
console.log(JSON.stringify(results, null, 2));
await browser.close();
