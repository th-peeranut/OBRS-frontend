// Standalone capture + measurement for OBRS-1948 (not part of the Playwright suite).
//
// The card is about SIZES, so the evidence has to be numbers first and pictures
// second: a screenshot cannot tell a reviewer that `.card-footer` went from
// 18px to 24px, only that it "looks bigger". Every run therefore writes a JSON
// of computed `font-size`/`color` for the total, its own line items, the CTA and
// the duration/distance pair, at BOTH breakpoints, and the images illustrate it.
//
// NO BACKEND, same recipe as capture-obrs752.js: `AuthService.isAuthenticated()`
// is a pure localStorage check, so seeding auth_token/auth_roles clears
// AuthGuard, and ONE `page.route('**/api/**')` catch-all -- registered FIRST,
// because Playwright's last-registered route wins -- answers every call with a
// contract-shaped `{code,message,data}` envelope. Nothing here writes anywhere.
//
// `/review-schedule-booking` and `/passenger-info` read their trip from NgRx,
// not from the URL, so a bare goto renders an empty shell. The store is seeded
// with the app's OWN action types through `window.ng`, which is why this must be
// served with `--configuration gate` (flags open, `optimization: false`, so
// `window.ng` exists) and NOT `sit` (its flags redirect /passenger-info to home
// and its optimized build has no `window.ng` to seed through).
//
// Usage (one server at a time, never two):
//   npx ng serve --configuration gate --port 4350          # AFTER  (this worktree)
//   CAPTURE_BASE=http://localhost:4350 node e2e/scripts/capture-obrs1948.js after
//   npx ng serve --configuration gate --port 4351          # BEFORE (origin/dev worktree)
//   CAPTURE_BASE=http://localhost:4351 node e2e/scripts/capture-obrs1948.js before
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const MODE = (process.argv[2] || 'after').toLowerCase();
const BASE = process.env.CAPTURE_BASE || 'http://localhost:4350';
const OUT_DIR =
  process.env.CAPTURE_OUT ||
  path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1948');
fs.mkdirSync(OUT_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const json = (route, body) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

// --- fixtures ---------------------------------------------------------------
// `RouteStop`: `distanceKmFromOrigin` on BOTH sides is what makes the distance
// estimate exist at all -- `tripEstimateFromStops` returns null for the figure
// if either side is missing, and then AC2's span never renders. 144 - 12 = 132km.
const stop = (order, slug, name, km, mins) => ({
  order,
  slug,
  name,
  address: 'ต.หนองชาก อ.บ้านบึง จ.ชลบุรี',
  approxTime: `${String(7 + order).padStart(2, '0')}:00`,
  distanceKmFromOrigin: km,
  offsetMinutesFromOrigin: mins,
  latitude: 13.2836 + order / 10,
  longitude: 101.0654 - order / 10,
  primaryPhotoUrl: null,
  googleMapsUrl: null,
});

const PICKUP_STOPS = [stop(1, 'nong_chak', 'หนองชาก', 12, 10), stop(2, 'ban_bueng', 'บ้านบึง', 30, 25)];
const DROPOFF_STOPS = [
  stop(3, 'bts_mochit', 'BTS หมอชิต', 138, 140),
  stop(4, 'bkr_mochit2', 'บขส. หมอชิต (หมอชิต 2)', 144, 155),
];

const PICKUP_DROPOFF = ok({
  route: {
    slug: 'chonburi_bangkok',
    titleLocalized: { en: 'Chonburi - Bangkok', th: 'ชลบุรี - กรุงเทพฯ', zh: '春武里 - 曼谷' },
    totalDistanceKm: 144,
    durationMinMinutes: 120,
    durationMaxMinutes: 150,
    originProvinceLabel: 'ชลบุรี',
    destinationProvinceLabel: 'กรุงเทพมหานคร',
  },
  pickup: PICKUP_STOPS,
  dropoff: DROPOFF_STOPS,
});

const RETURN_PICKUP_DROPOFF = ok({
  route: {
    slug: 'bangkok_chonburi',
    titleLocalized: { en: 'Bangkok - Chonburi', th: 'กรุงเทพฯ - ชลบุรี', zh: '曼谷 - 春武里' },
    totalDistanceKm: 144,
    durationMinMinutes: 120,
    durationMaxMinutes: 150,
    originProvinceLabel: 'กรุงเทพมหานคร',
    destinationProvinceLabel: 'ชลบุรี',
  },
  pickup: [stop(1, 'bkr_mochit2', 'บขส. หมอชิต (หมอชิต 2)', 0, 0), stop(2, 'bts_mochit', 'BTS หมอชิต', 6, 15)],
  dropoff: [stop(3, 'ban_bueng', 'บ้านบึง', 114, 130), stop(4, 'nong_chak', 'หนองชาก', 132, 145)],
});

// `StationApi`. `findStationById` matches with `===` on a NUMBER and
// `getStationSlugById` matches `Number(id)`, so the ids here and the
// `startStationId`/`stopStationId` in the seed must be numbers, and each slug
// must equal the RouteStop slug above or the distance estimate resolves to null.
const station = (id, slug, th, en) => ({
  id,
  slug,
  status: 'active',
  stopType: { code: 'station', display: { th: { label: 'สถานี' }, en: { label: 'Station' } } },
  createdAt: '2026-01-01T00:00:00+07:00',
  updatedAt: '2026-01-01T00:00:00+07:00',
  display: { th: { label: th }, en: { label: en } },
});

const STATIONS = [
  station(1, 'nong_chak', 'วิทยาลัยเทคนิคชลบุรี', 'Chonburi Technical College'),
  station(4, 'bkr_mochit2', 'บขส. หมอชิต (หมอชิต 2)', 'Mo Chit 2 Bus Terminal'),
];

const schedule = (id, routeSlug, dep, arr) => ({
  id,
  vehicleType: 'minibus',
  departureDateTime: dep,
  arrivalDateTime: arr,
  pricePerSeat: 200,
  availableSeats: 12,
  availableSeatNumbers: Array.from({ length: 12 }, (_, i) => `A${i + 1}`),
  routeSlug,
  seatingMode: 'ASSIGNED',
});

const OUTBOUND = schedule(101, 'chonburi_bangkok', '2030-06-17T11:05:00+07:00', '2030-06-17T13:30:00+07:00');
const RETURN = schedule(202, 'bangkok_chonburi', '2030-06-20T15:00:00+07:00', '2030-06-20T17:25:00+07:00');

const FIXTURES = [
  [/\/routes\/bangkok_chonburi\/pickup-dropoff$/, () => RETURN_PICKUP_DROPOFF],
  [/\/routes\/[^/]+\/pickup-dropoff$/, () => PICKUP_DROPOFF],
  [/\/stations/, () => ok(STATIONS)],
  [/\/stops/, () => ok([...PICKUP_STOPS, ...DROPOFF_STOPS])],
  [/\/schedules\/search/, () => ok({ departureSchedules: [OUTBOUND], arrivalSchedules: null })],
];

// --- store seed -------------------------------------------------------------
const passenger = (first, last, seat, adult) => ({
  isAdult: adult,
  title: 1,
  firstName: first,
  middleName: '',
  lastName: last,
  phoneNumber: '0812345678',
  gender: 'male',
  isSelectSeat: true,
  passengerSeat: seat,
  useBookerInfo: adult,
  email: 'customer@system.local',
  seatPreference: null,
  seatRequirement: null,
});

const PASSENGERS = [passenger('สมชาย', 'ใจดี', 'A1', true), passenger('สมหญิง', 'ใจดี', 'A2', false)];

const seedFor = (roundTrip) => ({
  filter: {
    roundTrip: roundTrip ? { id: 2, name: 'ไป-กลับ' } : { id: 1, name: 'เที่ยวเดียว' },
    passengerInfo: [
      { type: 'adult', count: 1 },
      { type: 'kids', count: 1 },
    ],
    startStationId: 1,
    stopStationId: 4,
    departureDate: '2030-06-17',
    returnDate: roundTrip ? '2030-06-20' : null,
    adultCount: 1,
    kidsCount: 1,
  },
  list: {
    departureSchedules: [OUTBOUND],
    arrivalSchedules: roundTrip ? [RETURN] : null,
  },
  booking: { schedule: roundTrip ? [OUTBOUND, RETURN] : [OUTBOUND] },
  passengers: PASSENGERS,
  stations: STATIONS,
});

const seedStore = async (page, seed) => {
  await page.evaluate((s) => {
    if (!window.ng || !window.ng.getComponent) {
      throw new Error('window.ng is absent -- served without --configuration gate?');
    }
    let store = null;
    for (const el of document.querySelectorAll('*')) {
      const cmp = window.ng.getComponent(el);
      if (cmp && cmp.store && typeof cmp.store.dispatch === 'function') {
        store = cmp.store;
        break;
      }
    }
    if (!store) throw new Error('no component on the page exposes an NgRx Store');
    store.dispatch({ type: '[Province With Station API] Fetch API Success', stations: s.stations });
    store.dispatch({ type: '[ScheduleFilter API] Set Schedule Filter Success', schedule_filter: s.filter });
    store.dispatch({ type: '[ScheduleList API] Set Schedule List Success', schedule_list: s.list });
    store.dispatch({ type: '[ScheduleBooking API] Set Schedule Booking Success', schedule_booking: s.booking });
    store.dispatch({ type: '[PassengerInfo API] Set Passenger Info Success', passengerInfo: s.passengers });
  }, seed);
  await page.waitForTimeout(1500);
};

// --- browser-side measurement ----------------------------------------------
// Runs in the page: `getComputedStyle` is the only thing that answers "what did
// this element actually end up at", which is the whole point of AC1 -- the SCSS
// says `$font-size-xl` but only the browser knows whether a media query took it
// back off again.
const MEASURE = () => {
  const px = (v) => (v ? Math.round(parseFloat(v) * 100) / 100 : null);
  const read = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      fontSize: px(cs.fontSize),
      fontWeight: cs.fontWeight,
      color: cs.color,
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    };
  };
  const one = (sel) => read(document.querySelector(sel));
  const all = (sel) => Array.from(document.querySelectorAll(sel)).map(read);

  const out = {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    documentHeight: document.documentElement.scrollHeight,
    // AC1 -- the total vs its own line items vs the CTA, on whichever of the two
    // screens is on display.
    // AC1 forbids buying the gap by shrinking this label, so it is measured too.
    priceLabel: one('app-review-schedule-booking-total .card-header'),
    cardHeader: one('.card-header'),
    cardBody: one('app-review-schedule-booking-total .card-body'),
    cardBodySummary: one('app-passenger-info-summary .card-body-summary'),
    cardFooters: all('.card-footer'),
    cardFooterValue: read(document.querySelector('.card-footer span:last-child')),
    cardFooterLabel: read(document.querySelector('.card-footer span:first-child')),
    cta: one('.btn-confirm, .btn-next'),
    // AC2 -- the duration/distance pair, both legs.
    durations: all('.body-subheader-text'),
    estimates: all('.body-estimate-text'),
    // Is the distance INSIDE the duration line (AFTER) or its own block (BEFORE)?
    estimateParents: Array.from(document.querySelectorAll('.body-estimate-text')).map((el) => ({
      tag: el.tagName.toLowerCase(),
      parentClass: el.parentElement ? el.parentElement.className : null,
    })),
    // AC2's warning -- the rail is a fixed 18x151 SVG with no CSS height, so a
    // shorter detail column can leave it overshooting the station dots.
    rails: Array.from(document.querySelectorAll('.card-body > img')).map((img, i) => {
      const body = img.parentElement;
      const detail = body ? body.querySelector('.card-body-detail') : null;
      const stations = detail ? Array.from(detail.querySelectorAll('.card-body-detail-station')) : [];
      const rr = img.getBoundingClientRect();
      const dr = detail ? detail.getBoundingClientRect() : null;
      const firstR = stations.length ? stations[0].getBoundingClientRect() : null;
      const lastR = stations.length ? stations[stations.length - 1].getBoundingClientRect() : null;
      return {
        leg: i,
        rail: { top: Math.round(rr.top), bottom: Math.round(rr.bottom), h: Math.round(rr.height) },
        detail: dr ? { top: Math.round(dr.top), bottom: Math.round(dr.bottom), h: Math.round(dr.height) } : null,
        firstStation: firstR ? { top: Math.round(firstR.top), bottom: Math.round(firstR.bottom) } : null,
        lastStation: lastR ? { top: Math.round(lastR.top), bottom: Math.round(lastR.bottom) } : null,
        overshootTopPx: dr ? Math.round(dr.top - rr.top) : null,
        overshootBottomPx: dr ? Math.round(rr.bottom - dr.bottom) : null,
      };
    }),
    strayPopups: {
      swal: document.querySelectorAll('.swal2-popup').length,
      toastError: document.querySelectorAll('.p-toast-message-error, .swal2-icon-error').length,
    },
  };

  // The promo Subtotal/Promo-discount rows (`.card-footer--subtle`) only exist
  // once a promo code has been applied, which no store seed can reach. Cloning a
  // real footer keeps Angular's `_ngcontent-*` attribute, so the component's own
  // encapsulated rules still apply and the modifier can be measured honestly.
  const host = document.querySelector('app-passenger-info-summary .card-footer');
  if (host) {
    const clone = host.cloneNode(true);
    clone.classList.add('card-footer--subtle');
    clone.setAttribute('data-obrs1948-probe', '1');
    host.parentElement.appendChild(clone);
    out.cardFooterSubtleProbe = read(clone);
    clone.remove();
  }
  return out;
};

// --- scenarios --------------------------------------------------------------
// `shot` is an ELEMENT, not the viewport: /passenger-info is ~6,300px tall on a
// phone and its summary card starts around y=4,100, so a viewport screenshot
// photographs the form and never the card this card is about.
const SCENARIOS = [
  { key: 'review-schedule-booking', url: '/review-schedule-booking', roundTrip: false, shot: '.content-container' },
  { key: 'review-roundtrip', url: '/review-schedule-booking', roundTrip: true, shot: '.content-container' },
  { key: 'passenger-info', url: '/passenger-info', roundTrip: false, shot: '.summary-container' },
];

// Fixed heights, not content-derived: BEFORE and AFTER must share the exact same
// viewport or the two images are not comparable, and AFTER is deliberately ~42px
// shorter than BEFORE on the review page.
// Heights are generous on purpose: they must clear the TALLEST of the two runs
// (BEFORE's review card is ~42px per leg taller than AFTER's) so neither run has
// to grow its viewport and the two images stay strictly comparable.
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1900 },
  { name: 'mobile', width: 390, height: 2900 },
];

async function newPage(browser, vp) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'fake-token-for-capture');
    localStorage.setItem('auth_username', 'customer@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['user']));
    localStorage.removeItem('app_admin_theme');
    // The PDPA consent bar is `position: fixed` over the page bottom; answering
    // it keeps it out of every shot without touching the cards themselves.
    localStorage.setItem('analytics_consent', JSON.stringify({ analytics: true, decidedAt: '2026-01-01T00:00:00+07:00' }));
  });
  // Catch-all FIRST: last registration wins in Playwright, so the specific
  // fixtures below would be silently overridden the other way round.
  await page.route('**/api/**', (route) => {
    const rel = route.request().url().replace(/^https?:\/\/[^/]+/, '');
    const pathname = rel.split('?')[0];
    for (const [re, make] of FIXTURES) {
      const m = re.exec(pathname);
      if (m) return json(route, make(m));
    }
    return json(route, ok(null));
  });
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
  return page;
}

async function run(browser, scenario, vp) {
  const page = await newPage(browser, vp);
  const tag = `${MODE.toUpperCase()}-${scenario.key}-${vp.name}`;
  try {
    await page.goto(BASE + scenario.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await seedStore(page, seedFor(scenario.roundTrip));
    // The loading swal is a real transient state -- wait it out before judging.
    await page.waitForTimeout(1500);

    const m = await page.evaluate(MEASURE);
    if (m.strayPopups.swal > 0 || m.strayPopups.toastError > 0) {
      throw new Error(
        `${tag}: refusing to save -- swal=${m.strayPopups.swal} errorToast=${m.strayPopups.toastError}`
      );
    }
    if (!m.cardFooters.length) {
      throw new Error(`${tag}: refusing to save -- no .card-footer rendered (store seed did not take)`);
    }

    fs.writeFileSync(path.join(OUT_DIR, `measure-${tag}.json`), JSON.stringify(m, null, 2));

    // Playwright scrolls an element into view for a screenshot but does NOT
    // stitch one taller than the viewport, so grow the viewport off the live
    // box when it does not fit -- and say so, because that run's image is then
    // not the same viewport as its counterpart.
    const target = page.locator(scenario.shot).first();
    await target.waitFor({ state: 'visible', timeout: 15000 });
    const box = await target.boundingBox();
    if (box && box.height > vp.height) {
      console.log(`  [grown] ${tag}: element is ${Math.round(box.height)}px tall > viewport ${vp.height}px`);
      await page.setViewportSize({ width: vp.width, height: Math.ceil(box.height) + 80 });
      await page.waitForTimeout(500);
    }
    await target.screenshot({ path: path.join(OUT_DIR, `OBRS-1948-${tag}.png`) });

    const f = m.cardFooters.map((x) => `${x.fontSize}px/${x.fontWeight}`).join(' ');
    const est = m.estimates.map((x) => `${x.fontSize}px ${x.color}`).join(' | ') || '(none)';
    const dur = m.durations.map((x) => `${x.fontSize}px ${x.color}`).join(' | ') || '(none)';
    console.log(
      `[OBRS-1948] ${tag}\n` +
        `  priceLabel=${m.priceLabel ? m.priceLabel.fontSize : '-'}  ` +
        `lineItems=${(m.cardBody || m.cardBodySummary || {}).fontSize ?? '-'}  ` +
        `footer=[${f}]  cta=${m.cta ? m.cta.fontSize : '-'}  ` +
        `subtleProbe=${m.cardFooterSubtleProbe ? m.cardFooterSubtleProbe.fontSize : '-'}\n` +
        `  duration=${dur}\n  estimate=${est}  parents=${JSON.stringify(m.estimateParents)}\n` +
        `  rails=${JSON.stringify(m.rails)}`
    );
    return m;
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await chromium.launch();
  const summary = {};
  try {
    for (const scenario of SCENARIOS) {
      for (const vp of VIEWPORTS) {
        summary[`${scenario.key}-${vp.name}`] = await run(browser, scenario, vp);
      }
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT_DIR, `summary-${MODE}.json`), JSON.stringify(summary, null, 2));
  console.log('DONE', MODE, '->', OUT_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
