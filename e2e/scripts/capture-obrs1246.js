// OBRS-1246 — BEFORE/AFTER capture for /e-ticket when the station roster fails.
//
// The scenario the card is about, reproduced exactly:
//
//   * `GET /api/stops` FAILS (500). OBRS-1222 made that failure silent for this
//     effect (`skipErrorAlert: true`) and put an inline surface on two OTHER
//     pages, so before this card /e-ticket showed a ticket with `-` where the
//     origin and destination belong and said nothing at all.
//   * the localStorage roster cache is EMPTY (`obrs.stations.v1` removed), i.e.
//     a first-time visitor — a returning one still books fine from the cache,
//     which is why the surface must not fire for them.
//   * the visitor is a GUEST (no auth_token seeded). That is the half of the
//     card that decides everything: `loadTicketFromApi` returns early without a
//     token (OBRS-858), so the tickets API never supplies the station names the
//     roster could not, and the blank ticket is the one the customer keeps.
//
// NO BACKEND, same recipe as capture-obrs752.js: every `/api/**` call is served
// from `page.route` fixtures, so nothing here touches SIT, prod or any DB. The
// booking itself is seeded through `obrs.booking_context` (the OBRS-903 TTL
// envelope both booking stores rehydrate from at initialState), so the ticket
// renders a real trip with real times — which is what makes the two empty
// station fields stand out instead of blending into an empty page.
//
// Assertions are MEASURED, not eyeballed: the origin/destination text, the
// presence of the surface and its painted colour are read out of the DOM and
// written next to the screenshots as JSON.
//
// Usage:
//   npx ng serve --port <port>                        # the tree under test
//   CAPTURE_BASE=http://localhost:<port> node e2e/scripts/capture-obrs1246.js before
//   CAPTURE_BASE=http://localhost:<port> node e2e/scripts/capture-obrs1246.js after
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const MODE = (process.argv[2] || 'after').toLowerCase();
const BASE = process.env.CAPTURE_BASE || 'http://localhost:4400';
const OUT_DIR = process.env.CAPTURE_OUT || path.resolve(__dirname, '..', '..', 'captures-obrs1246');
fs.mkdirSync(OUT_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// --- the seeded trip ---------------------------------------------------------
// `Schedule` rows exactly as `POST /api/schedules/search` returns them. Station
// IDs 11 and 22 are the two the ticket must resolve to names — and cannot,
// because the roster fetch below fails and the cache is empty.
const OUTBOUND = {
  id: 9001,
  vehicleType: 'van',
  departureDateTime: '2026-12-20 08:00:00',
  arrivalDateTime: '2026-12-20 09:48:00',
  pricePerSeat: '250',
  availableSeats: 9,
  availableSeatNumbers: ['1', '2', '3'],
  routeSlug: 'nong-chak-bangkok',
  seatingMode: 'ASSIGNED',
};

const BOOKING_CONTEXT = {
  version: 1,
  savedAt: Date.now(),
  value: {
    filter: {
      roundTrip: { name: 'One way', code: 'one_way' },
      passengerInfo: [{ type: 'adult', count: 1 }],
      startStationId: 11,
      stopStationId: 22,
      departureDate: '2026-12-20',
      returnDate: null,
      adultCount: 1,
      kidsCount: 0,
    },
    searchPayload: {
      bookingType: 'one_way',
      numberOfPassengers: 1,
      fromStop: 'nong-chak',
      toStop: 'bts-mo-chit',
      departureDate: '2026-12-20',
      returnDate: null,
    },
    selection: [OUTBOUND],
  },
};

async function installFixtures(page) {
  // ⚠️ ORDER MATTERS AND IT IS BACKWARDS FROM READING ORDER. Playwright runs the
  // LAST-registered matching handler first, so the broad catch-all is installed
  // FIRST and the specific one after it. Registered the other way round (the
  // intuitive way) the catch-all swallows `/api/stops` and answers it 200 — the
  // roster then "loads" as an empty list, the failure never happens, and the
  // capture quietly measures the wrong scenario. Measured: it did exactly that.

  // Everything under /api/ answers benignly so no OTHER failure can be mistaken
  // for the one being measured.
  await page.route('**/api/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.includes('/schedules/search')) {
      return json(route, ok({ departureSchedules: [OUTBOUND], arrivalSchedules: null }));
    }
    return json(route, ok(null));
  });

  // The roster fetch — the whole point. 500, not abort(): a transport-level
  // abort and an HTTP error take the same catchError branch in station.effect,
  // but a 500 is what an actual outage looks like in the network panel of the
  // evidence.
  await page.route('**/api/stops**', (route) =>
    json(route, { code: 500, message: 'Internal Server Error', data: null }, 500)
  );

  // Google Maps / tiles / fonts — blocked, they are not part of this evidence.
  await page.route('**://*.googleapis.com/**', (route) => route.abort());
  await page.route('**://*.gstatic.com/**', (route) => route.abort());
}

async function seed(page, theme) {
  await page.addInitScript(
    ({ context, theme }) => {
      // A first-time visitor: no cached roster. This is the half of the
      // condition that makes the surface fire at all.
      localStorage.removeItem('obrs.stations.v1');
      // NO auth_token / auth_roles on purpose - a guest, so the tickets API is
      // never called and cannot paper over the missing names (OBRS-858).
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_roles');
      localStorage.setItem('obrs.booking_context', JSON.stringify(context));
      localStorage.setItem('app_admin_theme', theme);
      localStorage.setItem('language', 'th');
      // The analytics consent banner is an overlay in the middle of the page and
      // covers the very rows this evidence is about. Answering it up front is
      // what a returning customer's browser already has; leaving it up would
      // hide the origin/destination fields behind an unrelated dialog.
      localStorage.setItem('obrs_analytics_consent_v1', 'denied');
    },
    { context: BOOKING_CONTEXT, theme }
  );
}

/** Reads the page's own words back out of the DOM. */
async function measure(page) {
  return page.evaluate(() => {
    const fieldValue = (labelText) => {
      const items = [...document.querySelectorAll('.ticket-item')];
      const hit = items.find((el) =>
        (el.querySelector('.label')?.textContent || '').trim().includes(labelText)
      );
      return (hit?.querySelector('.value')?.textContent || '').trim();
    };
    const surface = document.querySelector('[data-testid="station-load-error"]');
    const retry = document.querySelector('[data-testid="station-load-error-retry"]');
    const styles = surface ? getComputedStyle(surface) : null;
    return {
      url: location.pathname,
      isDark: document.body.classList.contains('is-dark'),
      origin: fieldValue('ต้นทาง'),
      destination: fieldValue('ปลายทาง'),
      route: fieldValue('เส้นทาง'),
      travelTime: fieldValue('เวลา'),
      surfacePresent: !!surface,
      surfaceText: (surface?.textContent || '').replace(/\s+/g, ' ').trim(),
      retryPresent: !!retry,
      surfaceColor: styles?.color ?? null,
      surfaceBackground: styles?.backgroundColor ?? null,
    };
  });
}

// The three pages loaded directly. Each lazy module registers `ProvinceEffect`
// itself, so the roster fetch really is attempted — and really does fail — on
// each one.
const DIRECT_PAGES = ['/review-schedule-booking', '/passenger-info', '/payment'];

(async () => {
  const browser = await chromium.launch();
  const results = {};

  for (const theme of ['light', 'dark']) {
    for (const route of DIRECT_PAGES) {
      const context = await browser.newContext({ viewport: { width: 900, height: 1200 } });
      const page = await context.newPage();
      await installFixtures(page);
      await seed(page, theme);

      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      const name = route.replace('/', '');
      const file = path.join(OUT_DIR, `OBRS-1246-${MODE.toUpperCase()}-${theme}-${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      results[`${theme}:${route}`] = { ...(await measure(page)), screenshot: path.basename(file) };
      await context.close();
    }

    // /e-ticket is reached the way a customer reaches it: from /payment, WITHOUT
    // a document reload. That matters and is not a shortcut — `e-ticket.module`
    // registers neither `ProvinceEffect` nor the `provinceWithStationList`
    // slice (the only one of the six dispatchers that registers neither), so on
    // a hard load straight to /e-ticket the roster is never fetched and the
    // whole ticket renders from class defaults. The booking flow's own path
    // keeps the payment module's registrations alive in the same store, which is
    // the state this card is about. `pushState` + `popstate` is how the Angular
    // router is driven across that hop without a reload, since the stepper's
    // step 4 goes to /payment and nothing else links forward to the ticket.
    const context = await browser.newContext({ viewport: { width: 480, height: 1100 } });
    const page = await context.newPage();
    await installFixtures(page);
    await seed(page, theme);

    await page.goto(`${BASE}/payment`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      history.pushState({}, '', '/e-ticket');
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    });
    await page.waitForTimeout(2500);

    const file = path.join(OUT_DIR, `OBRS-1246-${MODE.toUpperCase()}-${theme}-e-ticket.png`);
    await page.screenshot({ path: file, fullPage: true });
    results[`${theme}:/e-ticket`] = { ...(await measure(page)), screenshot: path.basename(file) };
    await context.close();
  }

  await browser.close();

  const outFile = path.join(OUT_DIR, `OBRS-1246-${MODE}-result.json`);
  fs.writeFileSync(outFile, JSON.stringify({ mode: MODE, base: BASE, results }, null, 2));
  console.log(JSON.stringify({ mode: MODE, base: BASE, results }, null, 2));
})();
