/**
 * OBRS-1096 visual evidence — the customer trip-track panel under an in-app
 * language switch, on ONE dev server (`ng serve --configuration sit`), run twice
 * with nothing changed but the two component files under test:
 *
 *   node e2e/capture-obrs-1096-trip-track-i18n.mjs --label before   # components at dev HEAD
 *   node e2e/capture-obrs-1096-trip-track-i18n.mjs --label after    # components with the fix
 *
 * Two arms, because the card is two defects on one screen:
 *
 *   ERROR arm  — `/vehicle-position` answers 403, which is the ONLY path that
 *                sets `errorText`, and it calls `stopPolling()` (BR-18). So no
 *                later tick can repair the string: what the switch leaves on
 *                screen is what the customer keeps reading. Screenshotted.
 *   MARKER arm — `/vehicle-position` answers LIVE with coordinates, so both
 *                `L.divIcon` markers exist. Their names are NOT visible in a
 *                screenshot by construction (that is the defect: the strings
 *                were handed to Leaflet's `alt` option, which it only copies
 *                onto an `IMG`), so this arm reads `aria-label` off the real
 *                marker elements and writes it into the JSON beside the PNG.
 *
 * ⚠️ The switch is fired by invoking the switcher element's own click handler, not by
 * a pointer: `probe-obrs-1096-reachability.mjs` measured that this modal's backdrop
 * (z-index 1050) covers the only language switcher (navbar, z-index 50), so a human
 * cannot reach it while the panel is mounted. See switchLanguage() below. Every /api call
 * is stubbed — this screen needs a paid ticket inside its tracking window, and
 * the defect lives entirely in how the FRONTEND re-renders strings it already
 * has, so a fixture cannot hide it.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4360';
const OUT = path.resolve(
  '..', 'obrs-agent-office', '.claude', 'agent-office', 'scripts', 'captures', 'obrs-1096'
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

// Nong Chak -> Mo Chit 2, the pair every other customer fixture in this repo
// uses. The stop coordinates are load-bearing: they are what makes the boarding
// marker exist at all (BR-8 omits it rather than drawing (0, 0)).
const BOOKING = {
  id: 501,
  bookingNumber: 'B-000501',
  totalAmount: 360,
  status: 'confirmed',
  bookingType: 'one_way',
  bookingChannel: 'online',
  createdAt: '2026-07-20T10:00:00+07:00',
  rescheduleCount: 0,
  seatChangeCount: 0,
  stopChangeCount: 0,
  contact: { fullName: 'Somchai Jaidee', phoneNumber: '0812345678' },
  bookingSchedules: [
    {
      id: 601,
      departureDateTime: '2030-06-17T08:00:00+07:00',
      arrivalDateTime: '2030-06-17T10:30:00+07:00',
      legType: 'outbound',
      fromStop: { id: 1, slug: 'nong_chak', label: 'Nong Chak' },
      toStop: { id: 4, slug: 'bkr_mochit2', label: 'Mo Chit 2 Terminal' },
      routeSlug: 'chonburi_bangkok',
      seatingMode: 'ASSIGNED',
      tickets: [{ id: 777, ticketNumber: 'T-000777', seatNumber: 'A1', status: 'confirmed' }],
    },
  ],
};

const BOOKING_TICKETS = {
  bookingId: 501,
  bookingNumber: 'B-000501',
  totalAmount: '360.00',
  contactPhoneNumber: '0812345678',
  journeys: [
    {
      legType: { code: 'outbound', label: 'Outbound' },
      fromStop: {
        code: 'nong_chak',
        label: 'Nong Chak',
        latitude: 13.3611,
        longitude: 100.9847,
        distanceKmFromOrigin: 0,
        offsetMinutesFromOrigin: 0,
      },
      toStop: {
        code: 'bkr_mochit2',
        label: 'Mo Chit 2 Terminal',
        latitude: 13.8129,
        longitude: 100.5486,
        distanceKmFromOrigin: 95,
        offsetMinutesFromOrigin: 150,
      },
      departureDateTime: '2030-06-17T08:00:00+07:00',
      arrivalDateTime: '2030-06-17T10:30:00+07:00',
      vehicle: { vehicleType: { code: 'van', label: 'Van' }, numberPlate: '1234', vehicleNumber: '12' },
      tickets: [
        { id: 777, ticketNumber: 'T-000777', seatNumber: 'A1', passengerName: 'Somchai Jaidee', status: { code: 'confirmed', label: 'Confirmed' } },
      ],
    },
  ],
};

// Between the boarding stop and the destination, so both markers are on screen.
const LIVE_POSITION = ok({
  state: 'LIVE',
  lat: 13.55,
  lon: 100.78,
  recordedAt: new Date().toISOString(),
  stale: false,
  windowOpensAt: null,
});

const browser = await chromium.launch();
const results = { label: LABEL, base: BASE, arms: {} };
await mkdir(OUT, { recursive: true });

async function openPanel(page, positionHandler) {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
    localStorage.setItem('auth_token', 'obrs-1096-capture-token');
    localStorage.setItem('auth_username', 'customer@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['user']));
  });

  await page.route('**/api/**', async (route) => {
    const pathname = route.request().url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    if (/\/tickets\/\d+\/vehicle-position$/.test(pathname)) {
      return positionHandler(route);
    }
    if (/\/tickets\/\d+\/boarding-token$/.test(pathname)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({ ticketId: 777, ticketNumber: 'T-000777', boardingToken: 'valid-token-777', expiresAt: '2030-06-17T09:00:00+07:00' })),
      });
    }
    if (/\/bookings\/\d+\/tickets$/.test(pathname)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(BOOKING_TICKETS)) });
    }
    if (/\/bookings\/me$/.test(pathname)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({ content: [BOOKING], totalElements: 1, totalPages: 1, size: 100, number: 0, numberOfElements: 1 })),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) });
  });
  await page.route('**/accounts.google.com/**', (route) => route.abort());
  await page.route('**/ssl.gstatic.com/**', (route) => route.abort());

  await page.goto(BASE + '/my-bookings', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.booking-card', { state: 'visible', timeout: 60000 });
  await page.locator('.actions-menu-btn').first().click();
  await page.locator('.my-bookings-action-menu .action-menu-item__label').first().click();
  await page.waitForSelector('app-trip-track-panel', { state: 'visible', timeout: 30000 });
}

/**
 * The switcher's own click handlers, invoked on the elements themselves.
 *
 * NOT a shortcut: `probe-obrs-1096-reachability.mjs` measured that with this
 * modal open `document.elementFromPoint()` at the trigger's centre returns
 * `div.ticket-modal-backdrop` (z-index 1050 vs the navbar's 50) at 1440px, and
 * that the desktop trigger is not rendered at all at 900px. A real pointer
 * therefore cannot reach it, so Playwright's actionability-checked `.click()`
 * cannot either. `HTMLElement.click()` runs the SAME Angular handler on the
 * SAME live component instance — which is all the defect needs, and all AC-5
 * asks for: no re-construction, no second ngOnInit.
 */
async function switchLanguage(page, endonym) {
  await page.evaluate(() => document.querySelector('.navbar-lang-trigger')?.click());
  await page.waitForTimeout(300);
  const clicked = await page.evaluate((label) => {
    const item = Array.from(document.querySelectorAll('.navbar-lang-item'))
      .find((el) => (el.textContent || '').includes(label));
    if (!item) return false;
    item.click();
    return true;
  }, endonym);
  if (!clicked) {
    throw new Error(`language item '${endonym}' was not in the opened menu`);
  }
  await page.waitForTimeout(1500);
}

/** The panel's error copy as the CUSTOMER reads it — DOM text, never the field. */
const readError = (page) =>
  page.evaluate(() => ({
    errorText: (document.querySelector('.trip-track-panel__error p')?.textContent || '').trim(),
    lang: localStorage.getItem('app_language'),
  }));

/** The marker names as the SCREEN READER reads them — off the real elements. */
const readMarkers = (page) =>
  page.evaluate(() => ({
    vehicle: document.querySelector('.trip-track-marker')?.getAttribute('aria-label') ?? null,
    boarding: document.querySelector('.trip-track-boarding-marker')?.getAttribute('aria-label') ?? null,
    markerCount: document.querySelectorAll('.trip-track-marker, .trip-track-boarding-marker').length,
    lang: localStorage.getItem('app_language'),
  }));

// ── ERROR arm ────────────────────────────────────────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  let positionCalls = 0;
  await openPanel(page, (route) => {
    positionCalls += 1;
    return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 403, message: 'Forbidden', data: null }) });
  });

  const en = await readError(page);
  await page.locator('.trip-track-panel__error').screenshot({ path: path.join(OUT, `${LABEL}-error-en.png`) });

  const callsBeforeSwitch = positionCalls;
  await switchLanguage(page, 'ไทย');
  const th = await readError(page);
  await page.locator('.trip-track-panel__error').screenshot({ path: path.join(OUT, `${LABEL}-error-th.png`) });

  results.arms.error = {
    en,
    th,
    switchedLanguage: en.lang !== th.lang,
    retranslated: en.errorText !== th.errorText,
    positionCallsBeforeSwitch: callsBeforeSwitch,
    positionCallsAfterSwitch: positionCalls,
    extraRequestsCausedBySwitch: positionCalls - callsBeforeSwitch,
  };
  await context.close();
}

// ── MARKER arm ───────────────────────────────────────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  let positionCalls = 0;
  await openPanel(page, (route) => {
    positionCalls += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIVE_POSITION) });
  });
  await page.waitForSelector('.trip-track-marker', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(2500); // let the tiles paint before the screenshot

  const en = await readMarkers(page);
  await page.locator('app-trip-track-panel').screenshot({ path: path.join(OUT, `${LABEL}-map-en.png`) });

  const callsBeforeSwitch = positionCalls;
  await switchLanguage(page, 'ไทย');
  const th = await readMarkers(page);
  await page.locator('app-trip-track-panel').screenshot({ path: path.join(OUT, `${LABEL}-map-th.png`) });

  results.arms.marker = {
    en,
    th,
    namesReachTheDom: !!en.vehicle && !!en.boarding,
    retranslated: en.vehicle !== th.vehicle && en.boarding !== th.boarding,
    positionCallsBeforeSwitch: callsBeforeSwitch,
    positionCallsAfterSwitch: positionCalls,
    extraRequestsCausedBySwitch: positionCalls - callsBeforeSwitch,
  };
  await context.close();
}

await browser.close();
await writeFile(path.join(OUT, `${LABEL}.json`), JSON.stringify(results, null, 2), 'utf8');
console.log(JSON.stringify(results, null, 2));
