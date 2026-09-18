// OBRS-1951 BEFORE/AFTER evidence — the open-seating banner above the search results.
//
// THE DATA IS STUBBED, DELIBERATELY AND ENTIRELY. Say so wherever these frames are shown.
// The whole card is a predicate over `seatingMode` across the WHOLE result set, and the
// three states it has to distinguish — every round OPEN, a mixed set, and a set with the
// field missing — are not three searches you can make against a live backend: SIT's rounds
// carry whatever mode their schedule was seeded with, and no stop pair produces a mixed set
// on demand. So the search RESPONSE is a fixture and `seatingMode` is set per round in it.
// Everything else on screen is this branch's real build: real router, real component, real
// template, real CSS, real i18n bundle.
//
// The catch-all `**/api/**` is registered FIRST and the specific routes after it, because a
// later route wins in Playwright. With only the search stubbed, every other call falls
// through to a backend that is not there, `error.interceptor.ts` raises a swal over the page,
// and a passing AC photographs as a broken screen — so nothing is left unstubbed, and the
// script asserts there is no popup on the frame before it saves one.
//
//   node e2e/scripts/capture-obrs1951.js AFTER   all-open 1280
//   node e2e/scripts/capture-obrs1951.js AFTER   mixed    390
//   node e2e/scripts/capture-obrs1951.js BEFORE  all-open 1280
//
// BEFORE is this same script run against a serve of `origin/dev`, so the two frames differ
// only in the `@if` this card adds.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const LABEL = (process.argv[2] || 'AFTER').toUpperCase();
const SCENARIO = (process.argv[3] || 'all-open').toLowerCase();
const WIDTH = Number(process.argv[4] || 1280);
// Dark mode is a separate frame, not a separate scenario: the banner carries a LIGHT fill and
// a dark-theme override repaints it (dark-theme.scss §14). Unphotographed, that override is
// the one part of this change nothing proves.
const DARK = process.env.CAPTURE_THEME === 'dark';
const PORT = process.env.CAPTURE_PORT || '4320';
const BASE = process.env.CAPTURE_BASE || 'http://localhost:' + PORT;

// Viewports are FIXED per width and identical across BEFORE and AFTER: the AFTER tree is one
// banner taller, so sizing either frame from its own content would make the pair differ by
// more than the thing being proved.
const VIEWPORT = WIDTH >= 1000 ? { width: 1280, height: 1150 } : { width: 390, height: 900 };

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1951');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

const FROM_ID = 101;
const TO_ID = 202;
const FROM_SLUG = 'nong_chak';
const TO_SLUG = 'mo_chit_2_bus_terminal';

/** today+n in the Asia/Bangkok calendar — the clock the page compares its rounds against. */
function bangkokDatePlus(days) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  now.setDate(now.getDate() + days);
  return now.toISOString().slice(0, 10);
}

const DEPARTURE_DATE = bangkokDatePlus(3);

function station(id, slug, th, en) {
  return {
    id,
    slug,
    status: 'active',
    stopType: 'bus_terminal',
    createdAt: DEPARTURE_DATE + 'T00:00:00+07:00',
    updatedAt: DEPARTURE_DATE + 'T00:00:00+07:00',
    translations: [
      { locale: 'th', label: th },
      { locale: 'en', label: en },
    ],
  };
}

const STATIONS = [
  station(FROM_ID, FROM_SLUG, 'หนองชาก', 'Nong Chak'),
  station(TO_ID, TO_SLUG, 'บขส. หมอชิต (หมอชิต 2)', 'Mo Chit 2 Bus Terminal'),
];

function routeStop(order, slug, name, km, minutes) {
  return {
    order,
    slug,
    name,
    address: name,
    approxTime: '',
    distanceKmFromOrigin: km,
    offsetMinutesFromOrigin: minutes,
    latitude: null,
    longitude: null,
    primaryPhotoUrl: null,
    googleMapsUrl: null,
  };
}

/** One outbound round. `seatingMode` is the only field this card reads. */
function round(id, hhmm, seatingMode) {
  const row = {
    id,
    vehicleType: 'van',
    departureDateTime: DEPARTURE_DATE + 'T' + hhmm + ':00+07:00',
    arrivalDateTime: DEPARTURE_DATE + 'T' + hhmm.replace(/^(\d\d)/, (h) => String(Number(h) + 2).padStart(2, '0')) + ':00+07:00',
    pricePerSeat: '200',
    availableSeats: 20,
    availableSeatNumbers: [],
    routeSlug: 'chonburi-bangkok',
  };
  if (seatingMode) row.seatingMode = seatingMode;
  return row;
}

// The three states the AC names. `missing` is the one that has no live equivalent at all:
// the field is optional on the wire and a row without it must read as "not proven open".
const SCENARIOS = {
  'all-open': ['OPEN', 'OPEN', 'OPEN'],
  mixed: ['OPEN', 'ASSIGNED', 'OPEN'],
  missing: ['OPEN', null, 'OPEN'],
  'all-assigned': ['ASSIGNED', 'ASSIGNED', 'ASSIGNED'],
};

function fixtureFor(scenario) {
  const modes = SCENARIOS[scenario];
  if (!modes) throw new Error('unknown scenario ' + scenario);
  const times = ['08:00', '11:00', '15:00'];
  return {
    code: 200,
    message: 'OK',
    data: {
      departureSchedules: modes.map((m, i) => round(301 + i, times[i], m)),
      arrivalSchedules: null,
      returnBoardingStop: null,
    },
  };
}

/**
 * Paints what was read out of the live DOM into the frame itself. A photograph of a blue box
 * proves nothing on its own — the reader has to be able to see which `seatingMode` each of
 * the rows underneath it actually carried, and that the banner count follows from that.
 */
async function stamp(page, heading, modes) {
  return page.evaluate(
    ([heading, modes]) => {
      const old = document.getElementById('obrs1951-stamp');
      if (old) old.remove();

      const banners = document.querySelectorAll('[data-testid^="open-seating-banner"]').length;
      const rows = document.querySelectorAll('.schedule-item').length;
      const text = Array.from(document.querySelectorAll('[data-testid^="open-seating-banner"]'))
        .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim())
        .join(' // ');

      const lines = [
        'seatingMode per round (STUBBED response) : ' + modes,
        '.schedule-item rows on page             : ' + rows,
        'open-seating banners on page            : ' + banners,
        'banner copy                             : ' + (text || '(none)'),
      ];

      const box = document.createElement('div');
      box.id = 'obrs1951-stamp';
      box.style.cssText = [
        'position:fixed',
        'left:0',
        'right:0',
        'top:0',
        'z-index:2147483647',
        'background:#101418',
        'color:#e8eaf0',
        'font:11px/1.5 Consolas,monospace',
        'padding:8px 12px',
        'white-space:pre-wrap',
        'border-bottom:3px solid #4da3ff',
      ].join(';');
      box.textContent = heading + '\n' + lines.join('\n');
      document.body.appendChild(box);
      return { banners: banners, rows: rows };
    },
    [heading, modes]
  );
}

async function main() {
  const fixture = fixtureFor(SCENARIO);
  const modes = fixture.data.departureSchedules
    .map((s) => s.seatingMode || '(missing)')
    .join(', ');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });

  const json = (route, body) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  // Catch-all FIRST — a later registration wins, so every specific stub below overrides it.
  await page.route('**/api/**', (route) => json(route, ok([])));
  await page.route('**/api/stops**', (route) => json(route, ok(STATIONS)));
  await page.route('**/api/provinces/stops**', (route) =>
    json(route, ok([{ id: 1, slug: 'chonburi', translations: [{ locale: 'th', label: 'ชลบุรี' }], stops: STATIONS }]))
  );
  await page.route('**/api/schedules/search**', (route) => json(route, fixture));
  // The route geometry behind OBRS-864's once-per-list stop lines. Stubbed rather than
  // 404'd: `.stop-detail--shared` RESERVES its height whether or not the lookup resolves
  // (component:213), so a refused lookup leaves a blank band above the list that is a
  // property of the stub, not of the page — and the banner would be photographed sitting
  // under it. These two stops are the pair the filter above already names.
  //
  // The body is the ENVELOPE type `RoutePickupDropoffResponse` ({status, message, data}), not
  // the bare `RoutePickupDropoffData` — a stub shaped as the element type is read as `data:
  // undefined` and draws nothing, with no error anywhere.
  await page.route('**/api/routes/*/pickup-dropoff**', (route) =>
    json(route, {
      status: 'success',
      message: 'OK',
      data: {
        route: { id: 1, slug: 'chonburi-bangkok', translations: { th: { label: 'ชลบุรี - กรุงเทพฯ' } } },
        pickup: [routeStop(1, FROM_SLUG, 'หนองชาก', 0, 0)],
        dropoff: [routeStop(2, TO_SLUG, 'บขส. หมอชิต (หมอชิต 2)', 132, 120)],
      },
    })
  );

  await page.addInitScript(
    (ctx) => {
      localStorage.setItem('lang', 'th');
      localStorage.setItem('app_language', 'th');
      localStorage.setItem('auth_token', 'fake-token-for-capture');
      localStorage.setItem('auth_username', 'customer@example.com');
      localStorage.setItem('auth_roles', JSON.stringify(['customer']));
      localStorage.setItem('obrs.booking_context', JSON.stringify(ctx.context));
      if (ctx.dark) localStorage.setItem('app_admin_theme', 'dark');
    },
    {
      dark: DARK,
      context: {
      version: 1,
      savedAt: Date.now(),
      value: {
        filter: {
          roundTrip: { id: 1, name: 'เที่ยวเดียว' },
          passengerInfo: [{ type: 'ADULT', count: 1 }],
          startStationId: FROM_ID,
          stopStationId: TO_ID,
          departureDate: DEPARTURE_DATE,
          returnDate: null,
          adultCount: 1,
          kidsCount: 0,
        },
        searchPayload: null,
        selection: null,
      },
      },
    }
  );

  await page.goto(BASE + '/schedule-booking', { waitUntil: 'networkidle' });
  // Press the page's own Search button rather than trusting the restored filter to
  // auto-search: on a COLD Playwright profile the station roster is still in flight when the
  // restored filter emits, so the id->slug mapping is not ready and the auto-search is
  // skipped (the same reason capture-obrs1574.js and capture-obrs1343.js click).
  await page.waitForTimeout(2500);
  await page.locator('button.btn-search').click();
  await page.waitForSelector('.schedule-item', { timeout: 30000 });
  await page.waitForTimeout(1200);

  // The loading swal is a real transient state, so this is a check AFTER settling, not a
  // race against it. Throw rather than save: a frame with a popup over it is not evidence of
  // the banner, it is evidence of a broken stub.
  const swals = await page.locator('.swal2-popup').count();
  const toasts = await page.locator('.p-toast-message-error, .toast-error').count();
  if (swals !== 0 || toasts !== 0) {
    throw new Error('refusing to save: ' + swals + ' swal popup(s), ' + toasts + ' error toast(s) on screen');
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  const seen = await stamp(
    page,
    'OBRS-1951 ' + LABEL + ' — ' + SCENARIO + ' — ' + VIEWPORT.width + 'x' + VIEWPORT.height +
      ' — search response STUBBED',
    modes
  );

  // Refuse to photograph a state that is not the one being claimed.
  if (seen.rows !== 3) throw new Error('expected 3 rounds on screen, got ' + seen.rows);
  const expectBanner = LABEL === 'AFTER' && SCENARIO === 'all-open';
  if (expectBanner && seen.banners !== 1) {
    throw new Error('expected exactly 1 banner, got ' + seen.banners);
  }
  if (!expectBanner && seen.banners !== 0) {
    throw new Error('expected no banner, got ' + seen.banners);
  }

  const name =
    'OBRS-1951-' + LABEL + '-' + SCENARIO + '-' + (VIEWPORT.width >= 1000 ? 'desktop' : '390') +
    (DARK ? '-dark' : '') + '.png';
  await page.screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log(
    'saved ' + name + ' — seatingMode=[' + modes + '] rows=' + seen.rows + ' banners=' + seen.banners
  );

  await browser.close();
}

main().catch((err) => {
  console.error('CAPTURE FAILED: ' + err.message);
  process.exit(1);
});
