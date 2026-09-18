/**
 * OBRS-1955 evidence — a refused booking names the field and takes the customer to it.
 *
 *   npx ng serve --port 4321                                      # the fix
 *   node e2e/capture-obrs-1955-validation-points-at-field.mjs
 *
 *   npx ng serve --port 4322                                      # detached worktree at origin/dev
 *   OBRS_BASE_URL=http://localhost:4322 OBRS_OUT_DIR=<...>/before \
 *     node e2e/capture-obrs-1955-validation-points-at-field.mjs
 *
 * Two endings, because the card has two halves and they fail differently:
 *
 *   A. client — the page is scrolled to the bottom and a REQUIRED field near the top is empty.
 *      origin/dev: "ถัดไป" is DISABLED, so the click never reaches `onSubmitPassengerInfo()` at
 *      all — the customer meets a grey button and no reason, which is why `nextDisabled` is
 *      recorded on every frame. With the fix the button is live (only `isSubmitting` disables it)
 *      and the click answers: the list names the field and the page comes back to it, focused.
 *   B. server — every client rule passes but the backend refuses `contact.lastName` with the real
 *      `GlobalExceptionHandler` 400 body. origin/dev: the bare "ข้อมูลไม่ผ่านการตรวจสอบ" modal,
 *      which is the 2026-09-17 report. With the fix: the reason is listed against the named field
 *      and the field is focused, with no modal on top of it.
 *
 * NO BACKEND, NO DATABASE — `/api/**` is answered here and the booking context is seeded into
 * localStorage, as in `capture-obrs-1666-consent.mjs`. Every frame is accompanied by what was read
 * off the page (`measured.json`): which element has focus, whether it is inside the viewport, the
 * text of the list, and how many booking POSTs were made.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4321';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e-evidence/obrs-1955/after');
const LANGS = ['th', 'en'];

const SCHEDULE_ID = 9001;

const SCHEDULE = {
  id: SCHEDULE_ID,
  vehicleType: 'van',
  departureDateTime: '2033-06-10T01:00:00Z',
  arrivalDateTime: '2033-06-10T09:00:00Z',
  pricePerSeat: '200.00',
  availableSeats: 10,
  availableSeatNumbers: [],
  routeSlug: 'chonburi_bangkok',
  seatingMode: 'OPEN',
};

const FILTER = {
  roundTrip: { name: 'One way', code: 'one_way' },
  passengerInfo: [{ type: 'ADULT', count: 1 }],
  startStationId: 101,
  stopStationId: 102,
  departureDate: '2033-06-10',
  returnDate: null,
  adultCount: 1,
  kidsCount: 0,
};

const SEARCH_PAYLOAD = {
  bookingType: 'one_way',
  numberOfPassengers: 1,
  fromStop: 'nong_chak',
  toStop: 'mo_chit',
  departureDate: '2033-06-10',
};

const ok = (data) => ({ code: 200, message: 'OK', data });

/** The body `GlobalExceptionHandler.handleMethodArgumentNotValid` really returns. */
const VALIDATION_400 = (lang) => ({
  timestamp: '2026-09-17T04:00:00Z',
  status: 400,
  message: lang === 'th' ? 'ข้อมูลไม่ผ่านการตรวจสอบ' : 'Validation Failed',
  errorCode: 'VALIDATION_FAILED',
  errors: [
    {
      field: 'contact.lastName',
      rejectedValue: 'T',
      reason:
        lang === 'th'
          ? 'ต้องมีความยาวระหว่าง 2 ถึง 50 ตัวอักษร'
          : 'must be between 2 and 50 characters',
    },
    {
      field: 'departureSchedule.passengers[0].lastName',
      rejectedValue: 'T',
      reason:
        lang === 'th'
          ? 'ต้องมีความยาวระหว่าง 2 ถึง 50 ตัวอักษร'
          : 'must be between 2 and 50 characters',
    },
  ],
});

const measured = {};

async function contextFor(browser, lang) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript(
    ([language, envelope]) => {
      window.localStorage.setItem('app_language', language);
      window.localStorage.setItem('obrs.booking_context', envelope);
    },
    [
      lang,
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        value: { filter: FILTER, searchPayload: SEARCH_PAYLOAD, selection: [SCHEDULE] },
      }),
    ]
  );
  return ctx;
}

async function mockApi(page, lang, counters) {
  await page.route('**/api/**', async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (/\/bookings$/.test(p) && route.request().method() === 'POST') {
      counters.bookingPostCount += 1;
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify(VALIDATION_400(lang)),
      });
    }
    if (/\/schedules\/\d+\/(blocked-seats|seats)$/.test(p)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok([])) });
    }
    if (/\/schedules\/search$/.test(p)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({ schedules: [SCHEDULE], departureSchedules: [SCHEDULE] })),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) });
  });
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
  await page.route('**/accounts.google.com/**', (route) => route.abort());
}

/**
 * Focus and visibility are read from the live DOM rather than judged by eye: a field can be
 * on screen in the frame and still not be the one holding focus, and the reverse.
 */
async function readState(page, counters) {
  return page.evaluate((bookingPostCount) => {
    const active = document.activeElement;
    const activeId = active instanceof HTMLElement ? active.id || null : null;
    const rect = active instanceof HTMLElement ? active.getBoundingClientRect() : null;
    const next = document.querySelector('.btn-next');
    const panel = document.querySelector('.server-field-errors');
    const modal = document.querySelector('.swal2-popup');
    return {
      activeElementId: activeId,
      activeElementInViewport: rect
        ? rect.top >= 0 && rect.bottom <= window.innerHeight
        : null,
      scrollY: Math.round(window.scrollY),
      serverFieldErrorsPanel: panel ? panel.innerText.trim().split('\n') : null,
      nextDisabled: next ? next.disabled : null,
      modalVisible: !!modal,
      modalText: modal ? modal.innerText.trim().slice(0, 200) : null,
      bookingPostCount,
    };
  }, counters.bookingPostCount);
}

async function fillEverythingExceptBookerLastName(page) {
  await page.fill('#booker-firstName', 'Test');
  await page.fill('#booker-phoneNumber', '0812345678');
  await page.fill('#firstName-0', 'Test');
  await page.fill('#lastName-0', 'Jaidee');
}

async function captureLang(browser, lang) {
  const counters = { bookingPostCount: 0 };
  const ctx = await contextFor(browser, lang);
  const page = await ctx.newPage();
  await mockApi(page, lang, counters);

  await page.goto(`${BASE}/passenger-info`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#booker-lastName', { state: 'visible', timeout: 60000 });

  // A. the client's own refusal, met from the bottom of the page where the button lives.
  await fillEverythingExceptBookerLastName(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await page.locator('.btn-next').first().click({ force: true });
  await page.waitForTimeout(1200);
  const clientRefusal = await readState(page, counters);
  await page.screenshot({ path: path.join(OUT, `client-refusal-${lang}.png`) });

  // B. the server's refusal: every client rule satisfied, the backend still says no.
  await page.fill('#booker-lastName', 'T');
  await page.fill('#lastName-0', 'T');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await page.locator('.btn-next').first().click({ force: true });
  await page.waitForTimeout(1800);
  const serverRefusal = await readState(page, counters);
  await page.screenshot({ path: path.join(OUT, `server-refusal-${lang}.png`) });

  measured[lang] = { clientRefusal, serverRefusal };
  await ctx.close();
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
for (const lang of LANGS) {
  await captureLang(browser, lang);
}
await browser.close();

await writeFile(path.join(OUT, 'measured.json'), JSON.stringify({ base: BASE, measured }, null, 2));
console.log(JSON.stringify(measured, null, 2));
console.log(`images + measured.json in ${OUT}`);
