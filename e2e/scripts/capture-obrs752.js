// Standalone customer-palette contrast sweep for OBRS-752 (not part of the
// Playwright suite).
//
// The card is "48 sites below AA, and all 48 are driven by a $variable in
// styles/variables.scss". Fixing them means moving five palette values, which
// repaints every customer screen at once -- so a spot check on one button is not
// evidence. The measurement has to be:
//
//   * every element that renders its own text, on every page of the booking
//     flow, in BOTH themes;
//   * BEFORE and AFTER, on two servers running side by side, so a regression I
//     introduced is distinguishable from something that was already failing;
//   * plus the painted colour of the specific elements the card names, because
//     "the button got darker" is the thing a reviewer wants to see.
//
// Measuring every element rather than a selector list is the point: a selector
// list can only confirm what I already believed, and this card exists because a
// gate that could not see SCSS $variables reported a clean pass over 48 sites.
//
// NO BACKEND, same recipe as capture-obrs747.js: `AuthService.isAuthenticated()`
// is a pure localStorage check, so seeding auth_token/auth_roles clears
// AuthGuard, and ONE `page.route('**/api/**')` stubs every call. Nothing here
// writes to any environment.
//
// Usage:
//   npx ng serve --port 4400                                  # AFTER  (this worktree)
//   npx ng serve --port 4300                                  # BEFORE (origin/dev worktree)
//   node e2e/scripts/capture-obrs752.js probe                 # what does each page render/call?
//   CAPTURE_BASE=http://localhost:4300 node ... before
//   CAPTURE_BASE=http://localhost:4400 node ... after
//   node e2e/scripts/capture-obrs752.js diff
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const MODE = (process.argv[2] || 'after').toLowerCase();
const BASE = process.env.CAPTURE_BASE || 'http://localhost:4400';
const OUT_DIR =
  process.env.CAPTURE_OUT ||
  path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-752');
fs.mkdirSync(OUT_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// --- fixtures ---------------------------------------------------------------
// Matched against the request PATHNAME, first match wins, and only ever for
// requests already under `/api/`. Keying these on Playwright URL globs lets a
// fixture swallow the page's own document request (OBRS-747, four blank pages).

// RouteStop (shared/interfaces/route-map.interface.ts). Real coordinates so the
// map panel's distance maths has something sane to chew on; Maps itself is
// blocked, so only the stop LIST renders -- which is where the numbered
// .stop-order-badge lives, one of the 48.
const stop = (order, slug, name, lat, lng) => ({
  order,
  slug,
  name,
  address: 'ต.หนองชาก อ.บ้านบึง จ.ชลบุรี',
  approxTime: `${String(7 + order).padStart(2, '0')}:00`,
  distanceKmFromOrigin: order * 30,
  offsetMinutesFromOrigin: order * 40,
  latitude: lat,
  longitude: lng,
  primaryPhotoUrl: null,
  googleMapsUrl: null,
});

const PICKUP_STOPS = [
  stop(1, 'nong_chak', 'หนองชาก', 13.2836, 101.0654),
  stop(2, 'ban_bueng', 'บ้านบึง', 13.3121, 101.1149),
];
const DROPOFF_STOPS = [
  stop(3, 'bts_mochit', 'BTS หมอชิต', 13.8025, 100.5537),
  stop(4, 'bkr_mochit2', 'บขส. หมอชิต (หมอชิต 2)', 13.8117, 100.5487),
];

const ROUTE_META = {
  slug: 'chonburi_bangkok',
  titleLocalized: { en: 'Chonburi - Bangkok', th: 'ชลบุรี - กรุงเทพฯ', zh: '春武里 - 曼谷' },
  totalDistanceKm: 120,
  durationMinMinutes: 120,
  durationMaxMinutes: 150,
  originProvinceLabel: 'ชลบุรี',
  destinationProvinceLabel: 'กรุงเทพมหานคร',
};

const PICKUP_DROPOFF = ok({
  route: ROUTE_META,
  pickup: PICKUP_STOPS,
  dropoff: DROPOFF_STOPS,
});

const STOPS = ok([...PICKUP_STOPS, ...DROPOFF_STOPS]);

// RouteListItem[]
const ROUTES = ok([
  {
    id: 1,
    slug: 'chonburi_bangkok',
    status: 'active',
    translations: {
      th: { label: 'ชลบุรี - กรุงเทพฯ' },
      en: { label: 'Chonburi - Bangkok' },
    },
  },
]);

// Schedule (shared/interfaces/schedule.interface.ts). Two rows: one comfortable
// and one at 3 seats left, which is under LOW_SEAT_THRESHOLD and renders the
// scarcity styling.
const schedule = (id, time, seats) => ({
  id,
  vehicleType: 'minibus',
  departureDateTime: `2030-06-17T${time}:00+07:00`,
  arrivalDateTime: `2030-06-17T${String(Number(time.slice(0, 2)) + 2).padStart(2, '0')}:30:00+07:00`,
  pricePerSeat: 180,
  availableSeats: seats,
  availableSeatNumbers: Array.from({ length: seats }, (_, i) => `A${i + 1}`),
  routeSlug: 'chonburi_bangkok',
  seatingMode: 'ASSIGNED',
});

const SCHEDULES = [schedule(101, '08:00', 12), schedule(102, '13:00', 3)];
const SCHEDULE_SEARCH = ok({ departureSchedules: SCHEDULES, arrivalSchedules: null });

// PageResponse<MyBookingDto> (payment.interface.ts + my-booking.interface.ts).
//
// THREE statuses on purpose, because `statusClass()` maps them to three of the
// classes this card touches: confirmed -> .is-success, refunded -> .is-info
// (2.92:1, one of the 48), anything else -> .is-danger (4.24:1, the entry
// OBRS-741 deliberately left behind because it uses the shared $text-red).
// One booking would have photographed one badge and proved nothing about the
// other two.
const lookup = (id, code, th) => ({ id, code, display: { th: { label: th }, en: { label: code } } });

const myBooking = (id, number, status, amount) => ({
  id,
  bookingNumber: number,
  totalAmount: amount,
  status,
  bookingType: 'one_way',
  bookingChannel: 'online',
  createdAt: '2026-07-20T10:00:00+07:00',
  rescheduleCount: 0,
  seatChangeCount: 0,
  stopChangeCount: 0,
  contact: { fullName: 'สมชาย ใจดี', phoneNumber: '0812345678' },
  bookingSchedules: [
    {
      id: 100 + id,
      departureDateTime: '2030-06-17T08:00:00+07:00',
      arrivalDateTime: '2030-06-17T10:30:00+07:00',
      legType: 'outbound',
      fromStop: lookup(1, 'nong_chak', 'หนองชาก'),
      toStop: lookup(4, 'bkr_mochit2', 'บขส. หมอชิต (หมอชิต 2)'),
      routeSlug: 'chonburi_bangkok',
      seatingMode: 'ASSIGNED',
      tickets: [
        { id: 700 + id, ticketNumber: `T-${String(700 + id).padStart(6, '0')}`, seatNumber: 'A1', status },
      ],
    },
  ],
});

const pageOf = (content) => ({
  content,
  totalElements: content.length,
  totalPages: 1,
  size: 100,
  number: 0,
  numberOfElements: content.length,
});

const MY_BOOKINGS = ok(
  pageOf([
    myBooking(501, 'B-000501', 'confirmed', 360),
    myBooking(502, 'B-000502', 'refunded', 180),
    myBooking(503, 'B-000503', 'cancelled', 180),
  ])
);

const TICKETS = ok([
  {
    ticketId: 777,
    ticketNumber: 'T-000777',
    seatNumber: 'A1',
    passengerName: 'สมชาย ใจดี',
    fromStop: 'หนองจาก',
    toStop: 'บขส. หมอชิต (หมอชิต 2)',
    departureDateTime: '2030-06-17T08:00:00+07:00',
    routeName: 'ชลบุรี - กรุงเทพฯ',
    price: 180,
    status: 'confirmed',
    bookingNumber: 'B-000501',
  },
]);

// Without this every ticket renders the red OBRS-96 'qrUnavailable' placeholder
// and the shot reads as a cancelled ticket -- a pure mock artifact.
const boardingToken = (id) =>
  ok({
    ticketId: Number(id),
    ticketNumber: `T-${String(id).padStart(6, '0')}`,
    boardingToken: `valid-token-${id}`,
    expiresAt: '2030-06-17T09:00:00+07:00',
  });

const FIXTURES = [
  [/\/tickets\/(\d+)\/boarding-token$/, (m) => boardingToken(m[1])],
  [/\/schedules\/search/, () => SCHEDULE_SEARCH],
  [/\/routes\/[^/]+\/pickup-dropoff$/, () => PICKUP_DROPOFF],
  [/\/routes/, () => ROUTES],
  [/\/stops/, () => STOPS],
  [/\/bookings\/me/, () => MY_BOOKINGS],
  [/\/bookings\/\d+\/tickets/, () => TICKETS],
  [/\/tickets/, () => TICKETS],
];

// --- reaching the flow pages ------------------------------------------------
//
// /schedule-booking .. /e-ticket read their trip from NgRx, not from the URL, so
// a bare goto lands on a real page with an empty store -- the shell renders and
// every element the card is about (.select-btn, .btn-confirm, .btn-next,
// .payment-btn, .download-btn) is simply absent. Driving the whole funnel by
// hand (custom dropdowns + a p-calendar panel + two forms) is a lot of selector
// surface for a screenshot, and every step is a chance to capture the wrong
// state without noticing.
//
// So seed the store instead, with the app's OWN action creators' types. This is
// the real reducer, the real selectors and the real components -- only the input
// is injected, the same argument as capture-obrs747.js's window.ng trick, one
// layer down. `store` is `private` on the component, which is a compile-time
// idea; the field is there at runtime.
const STORE_SEED = {
  filter: {
    roundTrip: { id: 'one_way', name: 'เที่ยวเดียว' },
    passengerInfo: [{ type: 'adult', count: 1 }],
    startStationId: 'nong_chak',
    stopStationId: 'bkr_mochit2',
    departureDate: '2030-06-17',
    returnDate: null,
    adultCount: 1,
    kidsCount: 0,
  },
  list: { departureSchedules: SCHEDULES, arrivalSchedules: null },
  booking: { schedule: [SCHEDULES[0]] },
  passengers: [
    {
      isAdult: true,
      title: 1,
      firstName: 'สมชาย',
      middleName: '',
      lastName: 'ใจดี',
      phoneNumber: '0812345678',
      gender: 'male',
      isSelectSeat: true,
      passengerSeat: 'A1',
      useBookerInfo: true,
      email: 'customer@system.local',
      seatPreference: null,
      seatRequirement: null,
    },
  ],
  bookingResult: {
    id: 501,
    bookingNumber: 'B-000501',
    totalAmount: 180,
    status: 'pending',
  },
};

const seedStore = async (page) => {
  await page.evaluate((seed) => {
    if (!window.ng || !window.ng.getComponent) throw new Error('window.ng is absent (not a dev build?)');
    // Any component on the page will do -- they all inject the same root Store.
    let store = null;
    for (const el of document.querySelectorAll('*')) {
      const cmp = window.ng.getComponent(el);
      if (cmp && cmp.store && typeof cmp.store.dispatch === 'function') {
        store = cmp.store;
        break;
      }
    }
    if (!store) throw new Error('no component on the page exposes an NgRx Store');
    store.dispatch({ type: '[ScheduleFilter API] Set Schedule Filter Success', schedule_filter: seed.filter });
    store.dispatch({ type: '[ScheduleList API] Set Schedule List Success', schedule_list: seed.list });
    store.dispatch({ type: '[ScheduleBooking API] Set Schedule Booking Success', schedule_booking: seed.booking });
    store.dispatch({ type: '[PassengerInfo API] Set Passenger Info Success', passengerInfo: seed.passengers });
    store.dispatch({ type: '[Booking API] Set Booking Success', booking: seed.bookingResult });
  }, STORE_SEED);
  await page.waitForTimeout(1200);
};

// --- pages under test -------------------------------------------------------
const PAGES = [
  { key: 'home', url: '/' },
  { key: 'login', url: '/login' },
  { key: 'my-bookings', url: '/my-bookings' },
  { key: 'schedule-booking', url: '/schedule-booking', seed: true },
  { key: 'review-schedule-booking', url: '/review-schedule-booking', seed: true },
  { key: 'passenger-info', url: '/passenger-info', seed: true },
  { key: 'payment', url: '/payment', seed: true },
  { key: 'e-ticket', url: '/e-ticket', seed: true },
];

// --- browser-side measurement ----------------------------------------------
// Lifted verbatim in shape from capture-obrs747.js; the only change is that the
// root is `body` (the customer app has no `.admin-shell`).
const SWEEP = () => {
  const rgba = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return [0, 0, 0, 0];
    const p = m[1].split(',').map((v) => parseFloat(v.trim()));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const paintedBg = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    if (!layers.length) return [255, 255, 255];
    let bg = layers[layers.length - 1].slice(0, 3);
    for (let i = layers.length - 2; i >= 0; i--) {
      const [tr, tg, tb, ta] = layers[i];
      bg = [tr * ta + bg[0] * (1 - ta), tg * ta + bg[1] * (1 - ta), tb * ta + bg[2] * (1 - ta)];
    }
    return bg;
  };
  const lum = ([r, g, b]) => {
    const f = (c) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.body && parts.length < 5; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      const cls = (n.getAttribute('class') || '')
        .split(/\s+/)
        .filter((c) => c && !/^ng-|^_ng/.test(c))
        .slice(0, 3);
      if (cls.length) s += '.' + cls.join('.');
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  const ownsText = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim().length > 0) return true;
    }
    return false;
  };

  const elements = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!ownsText(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    const fg = rgba(cs.color).slice(0, 3);
    const bg = paintedBg(el);
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const floor = size >= 24 || (size >= 18.66 && weight >= 700) ? 3.0 : 4.5;
    elements.push({
      path: pathOf(el),
      text: el.textContent.trim().slice(0, 40),
      fg: hex(fg),
      bg: hex(bg),
      ratio: Number(ratio(fg, bg).toFixed(2)),
      floor,
      size,
      weight,
    });
  }
  // The elements the card names by hand, so the report can quote a MEASURED
  // ratio for them whether they pass or fail.
  const NAMED = [
    '.btn-search',
    '.login-btn',
    '.login-by-phone-no-btn',
    '.btn-signup',
    '.select-btn',
    '.btn-confirm',
    '.btn-next',
    '.payment-btn',
    '.btn-download',
    '.download-btn',
    '.ticket-nav-btn',
    '.promo-code-apply-btn',
    '.parcel-btn-primary',
    '.status-badge',
    '.passenget-badge',
    '.seat-passenger-chip',
    '.stop-order-badge',
  ];
  const named = [];
  for (const sel of NAMED) {
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      const fg = rgba(cs.color).slice(0, 3);
      const bg = paintedBg(el);
      named.push({ sel, fg: hex(fg), bg: hex(bg), ratio: Number(ratio(fg, bg).toFixed(2)) });
    }
  }
  return {
    elements,
    named,
    bodyIsDark: document.body.classList.contains('is-dark'),
    href: location.pathname,
  };
};

// --- page setup -------------------------------------------------------------

async function newSeededPage(browser, dark, requestLog) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await page.addInitScript(
    ([isDark]) => {
      localStorage.setItem('app_language', 'th');
      localStorage.setItem('auth_token', 'fake-token-for-capture');
      localStorage.setItem('auth_username', 'customer@system.local');
      localStorage.setItem('auth_roles', JSON.stringify(['user']));
      if (isDark) localStorage.setItem('app_admin_theme', 'dark');
      else localStorage.removeItem('app_admin_theme');
    },
    [dark]
  );
  await page.route('**/api/**', (route) => {
    const rel = route.request().url().replace(/^https?:\/\/[^/]+/, '');
    const pathname = rel.split('?')[0];
    let body = ok(null);
    for (const [re, make] of FIXTURES) {
      const m = re.exec(pathname);
      if (m) {
        body = make(m);
        if (requestLog) requestLog.push('FIXTURE ' + rel);
        return json(route, body);
      }
    }
    if (requestLog) requestLog.push(rel);
    return json(route, body);
  });
  // Google Maps never loads here (no key, no network): block it rather than let
  // the home page hang on its bootstrap.
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
  return page;
}

async function visit(page, url) {
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
}

// --- modes ------------------------------------------------------------------

const ONLY = (process.env.CAPTURE_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const SELECTED = ONLY.length ? PAGES.filter((p) => ONLY.includes(p.key)) : PAGES;

async function probe(browser) {
  for (const p of SELECTED) {
    const log = [];
    const consoleLog = [];
    const page = await newSeededPage(browser, false, log);
    page.on('pageerror', (e) => consoleLog.push(`pageerror: ${String(e.message).slice(0, 160)}`));
    try {
      await visit(page, p.url);
      if (p.seed) await seedStore(page);
      const info = await page.evaluate(() => ({
        href: location.pathname,
        swal: document.querySelectorAll('.swal2-popup').length,
        text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 260),
      }));
      console.log(`\n[${p.key}] ${p.url} -> ${info.href}  swal=${info.swal}`);
      console.log(`  text: ${info.text}`);
      for (const u of [...new Set(log)].slice(0, 12)) console.log(`  req  ${u}`);
      for (const c of consoleLog.slice(0, 4)) console.log(`  ${c}`);
    } catch (e) {
      console.log(`\n[${p.key}] FAILED: ${e.message.split('\n')[0]}`);
    }
    await page.close();
  }
}

async function capture(browser, phase) {
  const report = { phase, base: BASE, pages: {} };
  for (const p of SELECTED) {
    report.pages[p.key] = {};
    for (const dark of [false, true]) {
      const mode = dark ? 'dark' : 'light';
      const page = await newSeededPage(browser, dark, null);
      try {
        await visit(page, p.url);
        if (p.seed) await seedStore(page);
        const sweep = await page.evaluate(SWEEP);
        if (sweep.bodyIsDark !== dark) {
          throw new Error(`theme precondition failed: body.is-dark=${sweep.bodyIsDark}, expected ${dark}`);
        }
        const swal = await page.locator('.swal2-popup').count();
        if (swal > 0) throw new Error(`${swal} swal popup(s) over the page -- the shot would read as broken`);
        const file = path.join(OUT_DIR, `OBRS-752-${phase.toUpperCase()}-${p.key}-${mode}.png`);
        await page.screenshot({ path: file, fullPage: true });
        const fails = sweep.elements.filter((e) => e.ratio < e.floor);
        report.pages[p.key][mode] = {
          landed: sweep.href,
          measured: sweep.elements.length,
          fails,
          named: sweep.named,
          shot: path.basename(file),
        };
        console.log(
          `[${phase}] ${p.key} ${mode}: landed ${sweep.href}, measured ${sweep.elements.length}, below AA ${fails.length}`
        );
        for (const f of fails) console.log(`    ${f.ratio}:1 (floor ${f.floor}) ${f.fg} on ${f.bg}  ${f.path}  "${f.text}"`);
      } catch (e) {
        report.pages[p.key][mode] = { error: e.message };
        console.log(`[${phase}] ${p.key} ${mode}: ERROR ${e.message}`);
      }
      await page.close();
    }
  }
  const out = path.join(OUT_DIR, `sweep-${phase}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${out}`);
}

function diff() {
  const load = (p) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, `sweep-${p}.json`), 'utf8'));
  const before = load('before');
  const after = load('after');
  const key = (f) => `${f.path} :: ${f.text}`;
  let regressions = 0;
  let fixed = 0;
  for (const pageKey of Object.keys(after.pages)) {
    for (const mode of ['light', 'dark']) {
      const b = before.pages[pageKey]?.[mode];
      const a = after.pages[pageKey]?.[mode];
      if (!b || !a || b.error || a.error) {
        console.log(`[${pageKey} ${mode}] SKIPPED (${b?.error || a?.error || 'missing'})`);
        continue;
      }
      const bMap = new Map((b.fails || []).map((f) => [key(f), f]));
      const aMap = new Map((a.fails || []).map((f) => [key(f), f]));
      console.log(`\n[${pageKey} ${mode}] measured ${b.measured} -> ${a.measured}, below AA ${bMap.size} -> ${aMap.size}`);
      for (const [k, f] of aMap) {
        if (!bMap.has(k)) {
          regressions++;
          console.log(`  REGRESSION ${f.ratio}:1 (floor ${f.floor}) ${f.fg} on ${f.bg}  ${k}`);
        }
      }
      for (const [k, f] of bMap) {
        if (!aMap.has(k)) {
          fixed++;
          console.log(`  fixed      was ${f.ratio}:1  ${f.fg} on ${f.bg}  ${k}`);
        }
      }
    }
  }
  console.log(`\n=== ${fixed} fixed, ${regressions} regression(s) ===`);
  if (regressions > 0) process.exitCode = 1;
}

async function main() {
  if (MODE === 'diff') return diff();
  const browser = await chromium.launch();
  try {
    if (MODE === 'probe') await probe(browser);
    else await capture(browser, MODE);
  } finally {
    await browser.close();
  }
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
