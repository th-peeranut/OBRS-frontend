// Standalone dark-mode surface sweep for OBRS-747 (not part of the Playwright suite).
//
// The card is "8 staff pages sit on a raw Bootstrap `.card` that never themes".
// Painting that surface dark is not a one-element change: every raw-Bootstrap
// companion INSIDE those cards (`.table`, `thead.table-light`, `.text-muted`,
// `.badge.bg-*`, `.bg-light`, `.nav-tabs`, `.form-control`) keeps a light
// background of its own, and a foreground that was correct on white is not
// correct on #1d2226. So the evidence has to be a sweep, not a spot check:
//
//   * measure EVERY element that renders its own text under `.admin-shell`,
//     both modes, and list everything below the WCAG AA floor for its size;
//   * do it BEFORE and AFTER the SCSS change, so a regression I introduced is
//     distinguishable from a pre-existing failure somewhere else on the page;
//   * record the painted background of each page's `.card` itself, which is the
//     one thing AC1 is actually about.
//
// Measuring every element (rather than a hand-written selector list) is
// deliberate: the point of a sweep is to find the companion surface nobody
// predicted. A selector list can only confirm what I already believed.
//
// NO BACKEND, same recipe as capture-obrs726.js: `AuthService.isAuthenticated()`
// is a pure localStorage check, so seeding auth_token/auth_roles clears the
// guards and `page.route('**/api/**')` stubs every call. Nothing here writes to
// any environment.
//
// Usage:
//   npx ng serve --port 4347
//   node e2e/scripts/capture-obrs747.js probe            # what does each page call?
//   node e2e/scripts/capture-obrs747.js before           # on unmodified SCSS
//   node e2e/scripts/capture-obrs747.js after            # after the fix
//   node e2e/scripts/capture-obrs747.js diff             # before vs after verdict
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const MODE = (process.argv[2] || 'after').toLowerCase();
const BASE = process.env.CAPTURE_BASE || 'http://localhost:4347';
const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-747');
const OUT_DIR = process.env.CAPTURE_OUT || ASSETS_DIR;
fs.mkdirSync(OUT_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// --- fixtures ---------------------------------------------------------------
// Keyed by URL glob. The catch-all `ok(null)` is registered first and these
// override it (in Playwright the LAST matching route wins). Shapes come from the
// DTOs in src/app/shared/interfaces, and from capture-obrs726.js where a page
// overlaps. Rows exist so `td`, `.badge` and `.text-muted` are actually RENDERED
// and therefore actually measured -- an empty table proves nothing about them.

// AdminScheduleDto (services/admin/admin-api.service.ts): `id`, nested
// route/vehicle/driver, `status` as a code-or-object. Two rows with DIFFERENT
// statuses on purpose -- the status pill is a `.badge.bg-*` on some of these
// pages, and one colour is not a sample.
const schedule = (id, statusCode, plate, driver) => ({
  id,
  departureDateTime: '2026-07-27T09:00:00+07:00',
  status: { code: statusCode, name: statusCode },
  route: { id: 7, slug: 'nongjak-banbueng', code: 'NJ-BB' },
  vehicle: { id: 3, numberPlate: plate, vehicleNumber: String(id), vehicleType: { id: 1, slug: 'minibus', totalSeats: 21 } },
  vehicleType: { id: 1, slug: 'minibus', totalSeats: 21 },
  driver: { id: 9, fullName: driver, phoneNumber: '0812345678' },
  seatingCapacity: 21,
  confirmedBookingCount: 12,
  cargoCapacityKg: 300,
  assignedToMe: true,
  deletable: false,
});

const SCHEDULE_ROWS = ok([
  schedule(42, 'scheduled', '30-1234 ชลบุรี', 'สมชาย ใจดี'),
  schedule(43, 'departed', '30-5678 ชลบุรี', 'สมหญิง รักดี'),
]);

const SINGLE_SCHEDULE = ok(schedule(42, 'scheduled', '30-1234 ชลบุรี', 'สมชาย ใจดี'));

// BoardingListItemDto[] (services/staff/staff-api.service.ts). One boarded row
// and one not, plus a `child` fare row -- the manifest renders a different chip
// for each, and the chips are the elements most likely to break on a dark card.
const BOARDING_ROWS = ok([
  {
    ticketId: 777,
    ticketNumber: 'T-000777',
    seatNumber: 'A1',
    passengerName: 'สมชาย ใจดี',
    fromStop: 'หนองจาก',
    toStop: 'บ้านบึง',
    status: { code: 'confirmed', label: 'Confirmed' },
  },
  {
    ticketId: 778,
    ticketNumber: 'T-000778',
    seatNumber: 'A2',
    passengerName: 'สมศรี มีสุข',
    fromStop: 'หนองจาก',
    toStop: 'บ้านบึง',
    status: { code: 'confirmed', label: 'Confirmed' },
    boardedAt: '2026-07-27T08:55:00+07:00',
    boardedBy: 5,
    boardedByName: 'พนักงานขาย',
    fareCategory: 'child',
  },
]);

const PENDING_VERIFICATION = ok([
  {
    parcelId: 1,
    trackingNumber: 'PCL-000001',
    senderName: 'สมชาย ใจดี',
    senderPhone: '0812345678',
    recipientName: 'สมศรี มีสุข',
    recipientPhone: '0898765432',
    pickupStop: { name: 'หนองจาก' },
    dropoffStop: { name: 'บ้านบึง' },
    weightKg: 5,
    lengthCm: 30,
    widthCm: 20,
    heightCm: 15,
    amount: 350,
    deliveryStatus: 'created',
    bookingStatus: 'confirmed',
  },
]);

// ParcelDeliveryListItemDto[] (shared/interfaces/parcel.interface.ts).
// `recipientName: null` on the second row is a real wire case (OBRS-548) and
// renders the '-' fallback, which is also a text node worth measuring.
const DELIVERY_ROWS = ok([
  {
    parcelId: 2,
    trackingNumber: 'PCL-000002',
    senderName: 'สมชาย ใจดี',
    senderPhone: '0812345678',
    recipientName: 'สมศรี มีสุข',
    recipientPhone: '0898765432',
    pickupStop: { name: 'หนองจาก' },
    dropoffStop: { name: 'บ้านบึง' },
    weightKg: 5,
    lengthCm: 30,
    widthCm: 20,
    heightCm: 15,
    amount: 350,
    deliveryStatus: 'accepted',
    bookingStatus: 'confirmed',
  },
  {
    parcelId: 3,
    trackingNumber: 'PCL-000003',
    senderName: 'สมหญิง รักดี',
    senderPhone: '0823456789',
    recipientName: null,
    recipientPhone: '0876543210',
    pickupStop: { name: 'หนองจาก' },
    dropoffStop: { name: 'บ้านบึง' },
    weightKg: 12,
    lengthCm: 40,
    widthCm: 30,
    heightCm: 25,
    amount: 500,
    deliveryStatus: 'loaded',
    bookingStatus: 'pending',
  },
]);

const WAYBILL = ok({
  parcelId: 1,
  trackingNumber: 'PCL-000001',
  collectionCode: 'ABC123',
  senderName: 'สมชาย ใจดี',
  senderPhone: '0812345678',
  recipientName: 'สมศรี มีสุข',
  recipientPhone: '0898765432',
  pickupStopName: 'หนองจาก',
  dropoffStopName: 'บ้านบึง',
  routeName: 'หนองจาก - บ้านบึง',
  departureDateTime: '2026-07-27T09:00:00+07:00',
  weightKg: 5,
  lengthCm: 30,
  widthCm: 20,
  heightCm: 15,
  amount: 350,
  qrPayload: 'PCL-000001|ABC123',
});

// Matched against the request PATHNAME, first match wins, and only ever for
// requests already under `/api/`. An earlier version keyed these on Playwright
// URL globs (`**/schedules**`) and every one of them also matched the page's own
// document request -- four pages "failed to render" because the navigation
// itself was fulfilled with JSON and the browser displayed it as text. Scoping
// to /api/ inside one handler makes that class of collision impossible.
const FIXTURES = [
  [/\/schedules\/\d+\/parcels\/pending-verification$/, PENDING_VERIFICATION],
  [/\/schedules\/\d+\/parcels\/consigned$/, DELIVERY_ROWS],
  [/\/schedules\/\d+\/boarding-list$/, BOARDING_ROWS],
  [/\/schedules\/\d+$/, SINGLE_SCHEDULE],
  [/\/parcels\/\d+\/waybill$/, WAYBILL],
  [/\/schedules/, SCHEDULE_ROWS],
];

// --- pages under test -------------------------------------------------------
// The 8 pages the card names, plus the shared `boarding-list` component (which
// also owns an exact `card` class and its own OBRS-100 dark override -- the
// card's population count of 9 templates missed it; the real count is 10).

// The headline defect (the intake result panel's `dd` values at 1.18:1) is only
// reachable AFTER a successful consign POST. Rather than drive the whole form
// (date + schedule + stops + sender/recipient + dimensions, all against stubs),
// set the page component's `result` directly through Angular's dev-mode global
// debug API -- `window.ng.getComponent()` returns the REAL component instance on
// the REAL page, so the markup, the wrapper chain and the cascade are all
// production's. Dev-mode only, which is exactly where this script runs.
const CONSIGN_RESULT = {
  parcelId: 1,
  trackingNumber: 'PCL-000001',
  bookingId: 10,
  bookingNumber: 'B-000010',
  amount: 350,
  deliveryStatus: 'accepted',
  collectionCode: 'ABC123',
  waybillUrl: '/staff/parcels/1/waybill',
};

const PREPARE = {
  async consignResult(page) {
    await page.evaluate((result) => {
      const host = document.querySelector('app-parcel-consign-page');
      if (!host) throw new Error('app-parcel-consign-page not in the DOM');
      if (!window.ng || !window.ng.getComponent) throw new Error('window.ng is absent (not a dev build?)');
      const cmp = window.ng.getComponent(host);
      cmp.result = result;
      window.ng.applyChanges(cmp);
    }, CONSIGN_RESULT);
    await page.locator('.parcel-intake-result').waitFor({ state: 'visible', timeout: 10000 });
  },
};

const PAGES = [
  { key: 'parcel-consign', url: '/staff/parcels/consign' },
  { key: 'parcel-consign-result', url: '/staff/parcels/consign', prepare: 'consignResult' },
  { key: 'staff-schedules', url: '/staff/schedules' },
  { key: 'driver-schedules', url: '/staff/driver' },
  { key: 'boarding-entry', url: '/staff/boarding' },
  { key: 'boarding-list', url: '/staff/boarding/42' },
  { key: 'parcel-schedule-entry', url: '/staff/parcels/schedule' },
  { key: 'parcel-verify-list', url: '/staff/parcels/verify/42' },
  { key: 'parcel-delivery-list', url: '/staff/parcels/deliveries/42' },
  { key: 'parcel-waybill', url: '/staff/parcels/1/waybill' },
  // The 10th `card` template. It already themes its own surface (OBRS-128) and
  // OBRS-747 DELETES that per-page rule in favour of the central one, so this
  // page is here to prove the deletion changed nothing rather than to find a bug.
  { key: 'sell', url: '/staff/sell' },
  // Not a `card` page at all: the third and only non-staff user of the Bootstrap
  // `.nav-tabs` strip, which OBRS-747 themes at SHELL scope. Here to bound the
  // blast radius of that one decision with a measurement instead of an argument.
  { key: 'admin-system-settings', url: '/admin/settings' },
];

// --- browser-side measurement ----------------------------------------------

/**
 * Measure every element under `.admin-shell` that renders its own text.
 * Returns { cards, elements } where `elements` carries one entry per measured
 * element with its computed foreground, its PAINTED background (composited up
 * the ancestor chain, so a translucent overlay cannot flatter the number) and
 * the WCAG floor that applies at its size.
 */
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

  const shell = document.querySelector('.admin-shell');
  if (!shell) return { error: 'no .admin-shell on the page' };

  const cards = [...document.querySelectorAll('.card')].map((c) => ({
    path: pathOf(c),
    ownBg: hex(rgba(getComputedStyle(c).backgroundColor).slice(0, 3)),
    ownBgAlpha: rgba(getComputedStyle(c).backgroundColor)[3],
    paintedBg: hex(paintedBg(c)),
    borderColor: hex(rgba(getComputedStyle(c).borderTopColor).slice(0, 3)),
    color: hex(rgba(getComputedStyle(c).color).slice(0, 3)),
  }));

  const elements = [];
  for (const el of shell.querySelectorAll('*')) {
    if (!ownsText(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    const fg = rgba(cs.color).slice(0, 3);
    const bg = paintedBg(el);
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    // WCAG large text: >=24px, or >=18.66px when bold.
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
      inCard: !!el.closest('.card'),
    });
  }
  return { cards, elements, bodyIsDark: document.body.classList.contains('is-dark') };
};

// --- page setup -------------------------------------------------------------

async function newSeededPage(browser, dark, requestLog) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });
  await page.addInitScript(
    ([isDark]) => {
      localStorage.setItem('app_language', 'th');
      localStorage.setItem('auth_token', 'fake-token-for-capture');
      localStorage.setItem('auth_username', 'salesperson@system.local');
      localStorage.setItem('auth_roles', JSON.stringify(['admin', 'owner', 'salesperson', 'driver', 'user']));
      // ThemeService's ONLY key (APP_ADMIN_THEME_KEY) -- it drives body.is-dark,
      // which is what the admin/staff shell reads.
      if (isDark) localStorage.setItem('app_admin_theme', 'dark');
      else localStorage.removeItem('app_admin_theme');
    },
    [dark]
  );
  // ONE route, scoped to /api/ -- see the FIXTURES note above for why this is not
  // a list of URL globs.
  await page.route('**/api/**', (route) => {
    const rel = route.request().url().replace(/^https?:\/\/[^/]+/, '');
    const pathname = rel.split('?')[0];
    const hit = FIXTURES.find(([re]) => re.test(pathname));
    if (requestLog) requestLog.push((hit ? 'FIXTURE ' : '') + rel);
    return json(route, hit ? hit[1] : ok(null));
  });
  return page;
}

async function visit(page, url) {
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  // The shell renders immediately; the content area needs the stubbed calls to settle.
  await page.locator('.admin-shell').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(900);
}

// --- modes ------------------------------------------------------------------

// CAPTURE_ONLY=key,key narrows a run to a few pages while iterating on fixtures.
const ONLY = (process.env.CAPTURE_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const SELECTED = ONLY.length ? PAGES.filter((p) => ONLY.includes(p.key)) : PAGES;

async function probe(browser) {
  for (const p of SELECTED) {
    const log = [];
    const consoleLog = [];
    const page = await newSeededPage(browser, true, log);
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') consoleLog.push(`${m.type()}: ${m.text().slice(0, 200)}`);
    });
    page.on('pageerror', (e) => consoleLog.push(`pageerror: ${String(e.message).slice(0, 200)}`));
    try {
      await visit(page, p.url);
      if (p.prepare) await PREPARE[p.prepare](page);
      const info = await page.evaluate(() => ({
        url: location.pathname,
        cards: document.querySelectorAll('.card').length,
        tables: document.querySelectorAll('table').length,
        rows: document.querySelectorAll('tbody tr').length,
        badges: document.querySelectorAll('.badge').length,
        muted: document.querySelectorAll('.text-muted').length,
        text: (document.querySelector('.admin-content, .admin-shell') || document.body).innerText
          .replace(/\s+/g, ' ')
          .slice(0, 220),
      }));
      console.log(`\n[${p.key}] ${p.url} -> ${info.url}`);
      console.log(
        `  cards=${info.cards} tables=${info.tables} tbodyRows=${info.rows} badges=${info.badges} textMuted=${info.muted}`
      );
      console.log(`  text: ${info.text}`);
      const uniq = [...new Set(log)];
      for (const u of uniq) console.log(`  req  ${u}`);
    } catch (e) {
      console.log(`\n[${p.key}] ${p.url} FAILED: ${e.message.split('\n')[0]}`);
      const where = await page.evaluate(() => ({
        href: location.href,
        body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200),
      }));
      console.log(`  landed: ${where.href}`);
      console.log(`  body:   ${where.body}`);
      for (const c of consoleLog.slice(0, 6)) console.log(`  console ${c}`);
      const uniq = [...new Set(log)];
      for (const u of uniq) console.log(`  req  ${u}`);
    }
    await page.close();
  }
}

async function capture(browser, phase) {
  const report = { phase, pages: {} };
  for (const p of SELECTED) {
    report.pages[p.key] = {};
    for (const dark of [true, false]) {
      const mode = dark ? 'dark' : 'light';
      const page = await newSeededPage(browser, dark, null);
      try {
        await visit(page, p.url);
      if (p.prepare) await PREPARE[p.prepare](page);
        const sweep = await page.evaluate(SWEEP);
        if (sweep.error) throw new Error(sweep.error);
        // Assert the PRECONDITION instead of trusting that a dark shot is dark
        // (a wrong theme key once let a "dark" capture pass on a light page).
        if (sweep.bodyIsDark !== dark) {
          throw new Error(`theme precondition failed: body.is-dark=${sweep.bodyIsDark}, expected ${dark}`);
        }
        const file = path.join(OUT_DIR, `OBRS-747-${phase}-${p.key}-${mode}.png`);
        await page.screenshot({ path: file, fullPage: true });
        const fails = sweep.elements.filter((e) => e.ratio < e.floor);
        report.pages[p.key][mode] = { cards: sweep.cards, measured: sweep.elements.length, fails, shot: path.basename(file) };
        console.log(
          `[${phase}] ${p.key} ${mode}: card bg ${sweep.cards.map((c) => c.paintedBg).join(',') || 'NO CARD'} | ` +
            `measured ${sweep.elements.length}, below AA ${fails.length}`
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

/**
 * Print the measured ratio of named selectors on one page, both modes.
 *
 * `capture` only records elements that FAIL, which is right for a regression
 * diff and wrong for reporting the numbers a card asks for — quoting a passing
 * ratio means measuring it, not computing it from the declared token values.
 *
 *   node e2e/scripts/capture-obrs747.js watch parcel-consign-result \
 *     ".parcel-intake-result-list dd" ".parcel-intake-result-icon"
 */
async function watch(browser, pageKey, selectors) {
  const p = PAGES.find((x) => x.key === pageKey);
  if (!p) throw new Error(`unknown page key '${pageKey}'. Known: ${PAGES.map((x) => x.key).join(', ')}`);
  for (const dark of [true, false]) {
    const page = await newSeededPage(browser, dark, null);
    await visit(page, p.url);
    if (p.prepare) await PREPARE[p.prepare](page);
    const rows = await page.evaluate(
      ([sels, sweepSrc]) => {
        const sweep = new Function('return (' + sweepSrc + ')()')();
        if (sweep.error) return { error: sweep.error };
        const out = [];
        for (const sel of sels) {
          const hits = [...document.querySelectorAll(sel)];
          if (!hits.length) {
            out.push({ sel, error: 'NOT FOUND' });
            continue;
          }
          for (const el of hits) {
            // Re-find this element in the sweep by identity rather than by
            // re-implementing the maths a second time.
            const measured = sweep.elements.find((e) => e.text === el.textContent.trim().slice(0, 40));
            out.push(measured ? { sel, ...measured } : { sel, error: 'not measured (renders no own text?)' });
          }
        }
        return { rows: out, bodyIsDark: document.body.classList.contains('is-dark') };
      },
      [selectors, SWEEP.toString()]
    );
    if (rows.error) throw new Error(rows.error);
    if (rows.bodyIsDark !== dark) throw new Error(`theme precondition failed: expected dark=${dark}`);
    console.log(`\n[${pageKey}] ${dark ? 'DARK' : 'LIGHT'}`);
    for (const r of rows.rows) {
      if (r.error) console.log(`  ${r.sel}: ${r.error}`);
      else
        console.log(
          `  ${r.ratio}:1 (floor ${r.floor})  ${r.fg} on ${r.bg}  ${r.size}px/${r.weight}  ${r.sel}  "${r.text}"`
        );
    }
    await page.close();
  }
}

function diff() {
  const load = (p) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, `sweep-${p}.json`), 'utf8'));
  const before = load('before');
  const after = load('after');
  const key = (f) => `${f.path} :: ${f.text}`;
  let regressions = 0;
  let fixed = 0;
  for (const pageKey of Object.keys(after.pages)) {
    for (const mode of ['dark', 'light']) {
      const b = before.pages[pageKey]?.[mode];
      const a = after.pages[pageKey]?.[mode];
      if (!b || !a || b.error || a.error) {
        console.log(`[${pageKey} ${mode}] SKIPPED (${b?.error || a?.error || 'missing'})`);
        continue;
      }
      const bMap = new Map((b.fails || []).map((f) => [key(f), f]));
      const aMap = new Map((a.fails || []).map((f) => [key(f), f]));
      const bCard = (b.cards || []).map((c) => c.paintedBg).join(',');
      const aCard = (a.cards || []).map((c) => c.paintedBg).join(',');
      console.log(`\n[${pageKey} ${mode}] card painted bg: ${bCard || 'none'}  ->  ${aCard || 'none'}`);
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
    else if (MODE === 'watch') await watch(browser, process.argv[3], process.argv.slice(4));
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
