/**
 * OBRS-1037 group 1 evidence — the two CUSTOMER date fields OBRS-1023 did not reach.
 * One dev server (`ng serve`, default configuration), run twice with nothing changed
 * but the component files under test:
 *
 *   node e2e/capture-obrs-1037-calendar-format.mjs --label before   # sources at origin/dev
 *   node e2e/capture-obrs-1037-calendar-format.mjs --label after    # sources with the fix
 *
 * Both languages every run: half this defect is only visible in `en` (Thai field order
 * reads correctly to a Thai eye and wrongly to an English one), which is why AC#7 asks
 * for th AND en.
 *
 * WHY EVERY /api CALL IS STUBBED
 * Neither defect needs a backend to be true: one is a format string bound into PrimeNG,
 * the other is whether the input accepts typing at all. Stubbing makes both arms
 * deterministic, which is what a before/after pair needs.
 *
 * WHAT EACH SCREEN PROVES, AND WHY THEY DIFFER
 *  - parcel-booking: the DISPLAY defect. A date is picked from the calendar and the
 *    rendered input text is read back. `en` before = Thai field order, no day name.
 *  - my-bookings reschedule: the INPUT defect. Measured 2026-09-14: this dialog never
 *    shows a formatted date at all -- `selectedDate` is never assigned and `step` is
 *    never set back to 'date' (reschedule-dialog.component.ts), so the box is empty
 *    until a pick and a pick leaves the step. What the hardcoded `dd/mm/yy` really did
 *    here was accept TYPED text: an English reader typing 03/08/2026 for 8 March had it
 *    silently taken as 3 August, with no day name to contradict them. So this screen's
 *    evidence is what the box does with typed text, not what it displays.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4037';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e-evidence/obrs-1037');
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

const NOW = new Date();
/** Ten days out: comfortably inside the picker's window and past every reschedule cutoff. */
const DEPARTURE = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 10, 8, 0, 0);

const STATIONS = [
  { id: 1, slug: 'nong_chak', status: 'operational', stopType: 'station', createdAt: '', updatedAt: '' },
  { id: 4, slug: 'bkr_mochit2', status: 'operational', stopType: 'station', createdAt: '', updatedAt: '' },
];

/** One confirmed one-way booking that clears every gate in `computeRescheduleEligibility`. */
const BOOKING = {
  id: 501,
  bookingNumber: 'BK501',
  status: 'confirmed',
  bookingType: 'one_way',
  bookingChannel: 'online',
  totalAmount: 500,
  createdAt: iso(NOW),
  rescheduleCount: 0,
  rescheduleMaxCount: 0, // 0 = unlimited (OBRS-657)
  rescheduleWindowHours: 2,
  seatChangeCount: 0,
  stopChangeCount: 0,
  bookingSchedules: [
    {
      id: 9001,
      departureDateTime: `${iso(DEPARTURE)}T08:00:00+07:00`,
      arrivalDateTime: `${iso(DEPARTURE)}T11:00:00+07:00`,
      legType: 'outbound',
      passengerCount: 1,
      fromStop: { id: 1, slug: 'nong_chak' },
      toStop: { id: 4, slug: 'bkr_mochit2' },
      tickets: null,
    },
  ],
};

const PAGE = {
  content: [BOOKING],
  totalElements: 1,
  totalPages: 1,
  size: 20,
  number: 0,
  numberOfElements: 1,
};

async function stubApi(page) {
  await page.route('**/api/**', async (route) => {
    const p = new URL(route.request().url()).pathname;
    const send = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(data)) });
    if (/\/api\/stops$/.test(p)) return send(STATIONS);
    if (/\/private\/bookings\/me$/.test(p)) return send(PAGE);
    if (/\/private\/bookings\/\d+\/tickets$/.test(p)) return send([]);
    if (/\/private\/parcels\/schedules\/search$/.test(p)) return send([]);
    return send(null);
  });
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
  await page.route('**/accounts.google.com/**', (route) => route.abort());
}

async function newPage(browser, lang) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((language) => {
    window.localStorage.setItem('app_language', language);
    window.localStorage.setItem('auth_token', 'obrs-1037-capture-token');
    window.localStorage.setItem('auth_username', 'customer@system.local');
    window.localStorage.setItem('auth_roles', JSON.stringify(['user']));
  }, lang);
  const page = await ctx.newPage();
  await stubApi(page);
  return page;
}

/** Read what the field is actually running on, off the DatePicker instance and the DOM. */
async function readField(page, inputSelector) {
  const input = page.locator(inputSelector);
  return {
    displayed: await input.inputValue(),
    readOnly: await input.evaluate((el) => el.readOnly),
    disabled: await input.evaluate((el) => el.disabled),
    tabIndex: await input.evaluate((el) => el.tabIndex),
  };
}

/** The parcel form: pick a day from the real calendar, then read the rendered text. */
async function captureParcel(page, lang, out) {
  await page.goto(`${BASE}/parcel-booking`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('app-parcel-trip-form', { state: 'visible', timeout: 90000 });

  await page.locator('#parcelTripDate').click();
  await page.waitForSelector('.p-datepicker-panel', { state: 'visible', timeout: 15000 });
  // A day that exists in every month and is never "today", so the text is unambiguous.
  await page.locator('.p-datepicker-panel td:not(.p-datepicker-other-month) span', { hasText: /^15$/ }).first().click();
  await page.waitForTimeout(500);

  const state = await readField(page, '#parcelTripDate');
  await page.locator('app-parcel-trip-form').screenshot({ path: path.join(out, `parcel-${lang}.png`) });
  return state;
}

/**
 * The reschedule dialog: open it from the booking card's action menu, then TYPE into the
 * date box. Before the fix the text lands and is parsed; after it, the box refuses it.
 */
async function captureReschedule(page, lang, out) {
  await page.goto(`${BASE}/my-bookings`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.booking-card:not(.booking-card--skeleton)', { state: 'visible', timeout: 90000 });

  await page.locator('.actions-menu-btn').first().click();
  await page.waitForSelector('.p-menu .action-menu-item__label', { state: 'visible', timeout: 15000 });
  // The reschedule item, found by its own i18n text in whichever language is on.
  const label = lang === 'th' ? /เลื่อน/ : /Reschedule/i;
  await page.locator('.p-menu .action-menu-item__label', { hasText: label }).first().click();

  await page.waitForSelector('.reschedule-modal #reschedule-date-input', { state: 'visible', timeout: 20000 });
  const input = page.locator('.reschedule-modal #reschedule-date-input');

  // What a customer does when they distrust a calendar: type it.
  //
  // 11/12/2026 is deliberate. It is a valid FUTURE date under BOTH readings, so
  // `[minDate]` cannot quietly reject it and turn this into a test of the wrong thing --
  // and the two readings are different days: 11 December under the hardcoded dd/mm, 12
  // November to the English reader who typed it. Nothing on the screen said which one
  // the box took, which is the whole defect on this surface.
  await input.click();
  await input.pressSequentially('11/12/2026', { delay: 20 });
  // blur, NOT Escape: Escape closes the whole dialog. Blur is also what makes the
  // defect visible -- `updateInputfield()` runs in `onInputBlur`, so a value the parse
  // rejected is only wiped once focus leaves (OBRS-1036 recorded the same trap).
  await input.evaluate((el) => el.blur());
  await page.locator('.reschedule-modal__title').click();
  await page.waitForTimeout(500);

  const state = await readField(page, '.reschedule-modal #reschedule-date-input');
  await page.locator('.reschedule-modal').screenshot({ path: path.join(out, `reschedule-${lang}.png`) });
  return state;
}

const run = async () => {
  const out = path.join(OUT, LABEL);
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch();
  const measured = { label: LABEL, base: BASE, capturedAt: new Date().toISOString(), arms: {} };

  for (const lang of ['th', 'en']) {
    const page = await newPage(browser, lang);
    measured.arms[lang] = {
      parcel: await captureParcel(page, lang, out),
      reschedule: await captureReschedule(page, lang, out),
    };
    await page.context().close();
  }

  await writeFile(path.join(out, 'measured.json'), JSON.stringify(measured, null, 2));
  console.log(JSON.stringify(measured, null, 2));
  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
