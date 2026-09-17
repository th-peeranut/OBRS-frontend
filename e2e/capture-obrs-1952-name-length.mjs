/**
 * OBRS-1952 evidence — a one-character surname is refused in the browser instead of being refused
 * by the server as an unexplained "ข้อมูลไม่ผ่านการตรวจสอบ".
 *
 *   npx ng serve --port 4319                      # the fix
 *   node e2e/capture-obrs-1952-name-length.mjs
 *
 *   npx ng serve --port 4320                      # a detached worktree at origin/dev
 *   OBRS_BASE_URL=http://localhost:4320 OBRS_OUT_DIR=e2e-evidence/obrs-1952/before \
 *     node e2e/capture-obrs-1952-name-length.mjs
 *
 * ONE script for both frames, deliberately: the BEFORE is not a different walk, it is the SAME
 * walk meeting a form that lets the value through. Anything the script has to branch on would be
 * a difference the images cannot show.
 *
 * NO BACKEND, NO DATABASE — `/api/**` is answered here and the booking context is seeded into
 * localStorage, both copied from `capture-obrs-1666-consent.mjs` for the reason it gives.
 *
 * The booking POST is stubbed with the REAL 400 body `GlobalExceptionHandler
 * .handleMethodArgumentNotValid` produces (`errorCode: VALIDATION_FAILED`, the localized
 * `error.validation.failed` message, and the `errors[]` entry `ContactReqDto`'s
 * `@Size(min = 2, max = 50)` generates). On origin/dev that stub is REACHED and the modal in the
 * owner's 2026-09-17 screenshot appears; with the fix the request is never made, which is the
 * whole card. `bookingPostCount` is recorded on both runs so the difference is a number, not an
 * impression of one.
 *
 * OPEN seating, matching the trip in that screenshot, so no seat has to be picked for the form to
 * be otherwise complete — the only thing wrong with it is the surname.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4319';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e-evidence/obrs-1952/after');
const LANGS = ['th', 'en'];

const SCHEDULE_ID = 9001;
const FROM_STOP_ID = 101;
const TO_STOP_ID = 102;

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
  startStationId: FROM_STOP_ID,
  stopStationId: TO_STOP_ID,
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

/** What the backend really answers a 1-character surname with — see the file header. */
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
  ],
});

const measured = {};

async function contextFor(browser, lang) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 2400 },
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
    const url = new URL(route.request().url());
    const p = url.pathname;

    if (/\/bookings$/.test(p) && route.request().method() === 'POST') {
      counters.bookingPostCount += 1;
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify(VALIDATION_400(lang)),
      });
    }
    if (/\/schedules\/\d+\/blocked-seats$/.test(p)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok([])) });
    }
    if (/\/schedules\/\d+\/seats$/.test(p)) {
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

/** Every inline error text currently under a given input, in DOM order. */
async function errorsUnder(page, inputId) {
  return page.evaluate((id) => {
    const input = document.getElementById(id);
    if (!input) {
      return null;
    }
    const cell = input.closest('div');
    return Array.from(cell?.querySelectorAll('.text-error') ?? []).map((el) =>
      el.textContent.trim()
    );
  }, inputId);
}

async function readState(page, counters) {
  const next = page.locator('.btn-next').first();
  return {
    bookerLastNameErrors: await errorsUnder(page, 'booker-lastName'),
    passengerLastNameErrors: await errorsUnder(page, 'lastName-0'),
    bookerLastNameValue: await page.locator('#booker-lastName').inputValue(),
    nextDisabled: await next.isDisabled(),
    bookingPostCount: counters.bookingPostCount,
    validationModalVisible: (await page.locator('.swal2-popup').count()) > 0,
    validationModalText: (await page.locator('.swal2-popup').count())
      ? (await page.locator('.swal2-popup').innerText()).trim().slice(0, 300)
      : null,
  };
}

/**
 * The booker card down to passenger 1's surname — every surface this card changes.
 *
 * The context viewport is already taller than that region (see `contextFor`): Playwright does not
 * stitch a clip taller than the viewport, it returns the off-screen part unpainted white and passes
 * (OBRS-702). `window.scrollY === 0` is asserted for the same reason — the clip is in page
 * coordinates, and a scrolled page silently shifts it — and the returned height is checked against
 * the region it was asked for, so a truncated frame throws instead of being saved.
 */
async function shootForms(page, file) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  const box = await page.evaluate(() => {
    if (window.scrollY !== 0) {
      throw new Error(`page is scrolled to ${window.scrollY}; the clip would be wrong`);
    }
    const first = document.getElementById('booker-title').closest('.card-container');
    const cell = document.getElementById('lastName-0').closest('div');
    const a = first.getBoundingClientRect();
    const b = cell.getBoundingClientRect();
    const wanted = b.bottom - a.y + 24;
    const y = Math.max(0, a.y - 8);
    const height = Math.min(window.innerHeight - y, wanted);
    if (height < wanted) {
      throw new Error(
        `viewport ${window.innerHeight}px cannot hold the ${Math.ceil(wanted)}px region ` +
          `(passenger 1 surname bottom is at ${Math.ceil(b.bottom)}px) - grow it`
      );
    }
    return { x: Math.max(0, a.x - 8), y, width: a.width + 16, height };
  });
  await page.screenshot({ path: file, clip: box });
}

async function captureLang(browser, lang) {
  const counters = { bookingPostCount: 0 };
  const ctx = await contextFor(browser, lang);
  const page = await ctx.newPage();
  await mockApi(page, lang, counters);

  await page.goto(`${BASE}/passenger-info`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#booker-lastName', { state: 'visible', timeout: 60000 });

  // The form the owner's screenshot shows: everything filled, and a surname of one letter.
  await page.fill('#booker-firstName', 'Test');
  await page.fill('#booker-lastName', 'T');
  await page.fill('#booker-phoneNumber', '0812345678');
  await page.fill('#firstName-0', 'Test');
  await page.fill('#lastName-0', 'T');
  await page.locator('#booker-firstName').click();
  await page.waitForTimeout(600);

  const typed = await readState(page, counters);
  await shootForms(page, path.join(OUT, `typed-${lang}.png`));

  // Press Next. On origin/dev it is live and the stubbed 400 answers it; with the fix it is
  // disabled, so the click is forced to prove the submit handler still refuses.
  await page.locator('.btn-next').first().click({ force: true });
  await page.waitForTimeout(1500);

  const submitted = await readState(page, counters);
  if (submitted.validationModalVisible) {
    await page.locator('.swal2-popup').screenshot({ path: path.join(OUT, `modal-${lang}.png`) });
  } else {
    await shootForms(page, path.join(OUT, `submitted-${lang}.png`));
  }

  measured[lang] = { typed, submitted };
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
