/**
 * OBRS-1950 - before/after evidence for the schedule-booking scan key.
 *
 * WHAT IT PROVES
 *   1. The computed type scale of `.schedule-item .left .time` and
 *      `.schedule-item .right .price` - read off the RENDERED page, not the
 *      SCSS source, so a token that fails to compile cannot pass as applied.
 *   2. HOW MANY TRIPS FIT ON ONE SCREEN at <=576px, counted before and after.
 *      That count is the card's own AC, and it exists because the known cost of
 *      raising `.time` is a taller row: if it drops by more than 1 the change is
 *      reported, not shipped.
 *
 * WHY THE API IS STUBBED
 *   SIT was returning Koyeb's `404: No active service` on 2026-09-17, and the
 *   local seed has zero trips anywhere in the bookable window (probed today..+60d
 *   across all 756 stop pairs). Stubbing is this repo's own convention for that
 *   situation - `e2e/capture-obrs-1955-validation-points-at-field.mjs` does the
 *   same with the same `page.route('**\/api/**')` shape, and the schedule object
 *   follows `e2e/fixtures/schedules.json`. Only the JSON source is a fixture:
 *   the Angular component, its template and the SCSS under test all render for
 *   real, which is the entire surface this card changes. It also makes the two
 *   runs byte-identical in input, which a live backend could not guarantee.
 *   `/api/stops` is NOT invented - it is the real local-backend payload, saved
 *   to e2e/fixtures/obrs-1950-stops.json.
 *
 * WHY "fully visible at scroll 0" is the count
 *   A half-row is not a trip the user can compare, and "looks about the same" is
 *   not a measurement. Every `.schedule-item` whose rect sits entirely inside the
 *   viewport is counted; the partial count and the row height sit next to it so a
 *   delta can be explained rather than just observed.
 *
 * RUN
 *   node e2e/capture-obrs-1950-scan-key.mjs <baseUrl> <before|after> [outDir]
 */
import pwNs from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const chromium = pwNs.chromium ?? pwNs.default?.chromium;

const BASE = process.argv[2] || 'http://localhost:4350';
const LABEL = process.argv[3] || 'before';
const OUT = process.argv[4] || join(process.cwd(), 'e2e', 'out', `obrs-1950-${LABEL}`);

const STOPS = JSON.parse(
  readFileSync(join(process.cwd(), 'e2e', 'fixtures', 'obrs-1950-stops.json'), 'utf8')
);

// Real ids from the saved /api/stops payload. `nong_chak` (id 1) is deliberately
// NOT used: it is the one stop of 28 whose Thai label is stored mangled in the
// local seed (`???????`), and an evidence image should not make the owner chase
// a data artifact that this card did not cause.
const FROM_ID = 10; // ban_bueng_wisitchai_market
const TO_ID = 25; // mo_chit_2_bus_terminal

/** Inside the 60-day booking window the API enforces, so nothing client-side
 *  rejects the filter before the list renders. */
const DATE = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

/** Eight trips, varied departure times and prices - a single-row list could not
 *  show a per-screen count at all, and equal prices would hide how wide the
 *  price column really gets. */
const SCHEDULES = [
  ['06:00', '11:30', '250.00', 9],
  ['07:30', '13:00', '320.00', 4],
  ['09:15', '14:45', '180.00', 12],
  ['11:00', '16:30', '450.00', 2],
  ['13:20', '18:50', '275.00', 7],
  ['15:45', '21:15', '640.00', 15],
  ['18:00', '23:30', '199.00', 3],
  ['20:30', '02:00', '515.00', 6],
].map(([dep, arr, price, seats], i) => ({
  id: 9100 + i,
  // Only `van` and `minibus` have an icon under public/icons/ - the template
  // builds the src as `icons/schedule-booking-<vehicleType>.svg`, so any other
  // value renders a broken image that is the FIXTURE's fault, not the app's.
  vehicleType: i % 2 ? 'van' : 'minibus',
  departureDateTime: `${DATE}T${dep}:00`,
  arrivalDateTime: `${DATE}T${arr}:00`,
  pricePerSeat: price,
  availableSeats: seats,
  availableSeatNumbers: [],
  routeSlug: 'nong_chak_mo_chit',
  seatingMode: 'OPEN',
}));

const FILTER = {
  roundTrip: 1,
  passengerInfo: [
    { type: 'ADULT', count: 1 },
    { type: 'KIDS', count: 0 },
  ],
  startStationId: FROM_ID,
  stopStationId: TO_ID,
  departureDate: DATE,
  returnDate: null,
  adultCount: 1,
  kidsCount: 0,
};

const DEVICES = [
  { name: 'mobile-576x800', width: 576, height: 800, dsf: 2, mobile: true },
  { name: 'iphone12-390x844', width: 390, height: 844, dsf: 3, mobile: true },
  { name: 'android-360x740', width: 360, height: 740, dsf: 3, mobile: true },
  { name: 'desktop-1536x864', width: 1536, height: 864, dsf: 1.25, mobile: false },
];

const UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/125.0.0.0 Mobile Safari/537.36';

mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);
const ok = (data) => ({ code: 200, message: 'OK', data });

/* -------------------------------------------------------------- measurement */

function collect(topBoundary) {
  const px = (v) => Math.round(parseFloat(v) * 10) / 10;
  const typeOf = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      fontSize: px(cs.fontSize),
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      h: px(r.height),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    };
  };

  const items = [...document.querySelectorAll('.schedule-item')];
  const vh = window.innerHeight;
  // A row hidden UNDER the sticky header is not a row anyone can read, so the
  // usable band starts at the header's bottom edge, not at y=0.
  const top0 = topBoundary || 0;
  const rows = items.map((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: px(r.top),
      bottom: px(r.bottom),
      h: px(r.height),
      fullyVisible: r.top >= top0 - 0.5 && r.bottom <= vh + 0.5,
      partlyVisible: r.bottom > top0 && r.top < vh,
    };
  });

  // A fixed/sticky header eats the top of the viewport equally on both runs, so
  // it is RECORDED rather than subtracted - the delta stays honest either way.
  let headerH = 0;
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    const r = el.getBoundingClientRect();
    if (r.top <= 1 && r.height > headerH && r.width > window.innerWidth * 0.6) {
      headerH = Math.round(r.height);
    }
  }

  const heights = rows.map((r) => r.h);
  return {
    innerWidth: window.innerWidth,
    innerHeight: vh,
    scrollY: Math.round(window.scrollY),
    time: typeOf(document.querySelector('.schedule-item .left .time')),
    price: typeOf(document.querySelector('.schedule-item .right .price')),
    itemCountInDom: items.length,
    tripsFullyVisible: rows.filter((r) => r.fullyVisible).length,
    tripsPartlyVisible: rows.filter((r) => r.partlyVisible).length,
    firstRowHeight: heights[0] ?? null,
    medianRowHeight: heights.length
      ? [...heights].sort((a, b) => a - b)[Math.floor(heights.length / 2)]
      : null,
    stickyHeaderHeight: headerH,
    rows,
  };
}

/* -------------------------------------------------------------------- flow */

async function mockApi(page) {
  await page.route('**/api/**', async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (/\/stops$/.test(p)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(STOPS),
      });
    }
    if (/\/schedules\/search$/.test(p)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          ok({ schedules: SCHEDULES, departureSchedules: SCHEDULES, arrivalSchedules: null })
        ),
      });
    }
    if (/\/schedules\/\d+\/(blocked-seats|seats)$/.test(p)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok([])) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) });
  });
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
  await page.route('**/accounts.google.com/**', (route) => route.abort());
}

async function dismissConsentBanner(page) {
  const btn = page.locator('.consent-banner__btn--accept');
  if (await btn.isVisible().catch(() => false)) {
    await btn.click({ force: true });
    await page.waitForTimeout(500);
    return true;
  }
  return false;
}

async function run(device) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.dsf,
    isMobile: device.mobile,
    hasTouch: device.mobile,
    ...(device.mobile ? { userAgent: UA } : {}),
  });
  await ctx.addInitScript(
    ([envelope]) => {
      window.localStorage.setItem('app_language', 'th');
      window.localStorage.setItem('obrs.booking_context', envelope);
    },
    [
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        value: { filter: FILTER, searchPayload: null, selection: null },
      }),
    ]
  );

  const page = await ctx.newPage();
  try {
    await mockApi(page);
    await page.goto(`${BASE}/schedule-booking`, { waitUntil: 'domcontentloaded' });
    await page.locator('.btn-search').waitFor({ state: 'visible', timeout: 180000 });

    let searched = false;
    for (let attempt = 0; attempt < 8 && !searched; attempt++) {
      // dispatchEvent, not click(): the consent banner is a fixed overlay and a
      // coordinate click - even forced - is swallowed by whatever sits on top.
      await page.locator('.btn-search').dispatchEvent('click');
      searched = await page
        .locator('.schedule-item')
        .first()
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!searched) throw new Error(`${device.name}: no .schedule-item after 8 searches`);

    // Dismissed BEFORE the count: a fixed overlay would hide rows and make the
    // two runs count different things.
    await dismissConsentBanner(page);

    // Counting at scroll 0 would measure the SEARCH FILTER panel, which fills
    // the first screen - it answered "how tall is the form", not "how many trips
    // can I compare". The list is scrolled so its first row sits directly under
    // the sticky header, which is the position a user scanning the list is
    // actually in, and is reproduced identically on both runs.
    const headerH = await page.evaluate(() => {
      let h = 0;
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
        const r = el.getBoundingClientRect();
        if (r.top <= 1 && r.height > h && r.width > window.innerWidth * 0.6) h = Math.round(r.height);
      }
      return h;
    });
    await page.evaluate((hh) => {
      const first = document.querySelector('.schedule-item');
      if (!first) return;
      const y = first.getBoundingClientRect().top + window.scrollY - hh;
      window.scrollTo(0, Math.max(0, Math.round(y)));
    }, headerH);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    );
    await page.waitForTimeout(400);

    const m = await page.evaluate(collect, headerH);
    m.device = device.name;
    m.label = LABEL;

    await page.screenshot({ path: join(OUT, `${device.name}.png`), fullPage: false });

    log(
      `  [${device.name}] time=${m.time?.fontSize}px/${m.time?.fontWeight} ` +
        `price=${m.price?.fontSize}px/${m.price?.fontWeight} ` +
        `| trips fully visible=${m.tripsFullyVisible} (partly ${m.tripsPartlyVisible}, ` +
        `${m.itemCountInDom} in DOM) | row h first=${m.firstRowHeight} median=${m.medianRowHeight} ` +
        `| sticky header=${m.stickyHeaderHeight}px`
    );
    return m;
  } finally {
    await browser.close();
  }
}

/* -------------------------------------------------------------------- main */

const results = [];
for (const d of DEVICES) {
  results.push(await run(d));
}
writeFileSync(
  join(OUT, 'measurements.json'),
  JSON.stringify({ label: LABEL, base: BASE, departureDate: DATE, results }, null, 2)
);
log(`\nwrote ${join(OUT, 'measurements.json')}`);
