// Standalone capture script for OBRS-726 visual evidence (not part of the Playwright suite).
//
// Two surfaces changed, and both are text-colour-only changes that ONLY differ
// in dark mode, so the evidence has to be dark-mode captures of the exact
// elements -- plus the light pair to show light is unchanged.
//
//   1. `.pv-mismatch-hint`  -- staff parcel-verify dialog (--admin-danger-fg)
//   2. `.trip-track-panel__refresh-failed` -- customer trip tracker
//                                             (--admin-warning-fg, declared
//                                              locally because the customer
//                                              shell has no .admin-shell)
//
// NO BACKEND. `AuthService.isAuthenticated()` is a pure localStorage check, so
// seeding auth_token/auth_roles clears the guards, and `page.route('**/api/**')`
// stubs every call -- which is the only way to get these two states
// deterministically: the hint needs a measured weight that differs from the
// declared one, and the strip needs a poll that SUCCEEDS and then FAILS.
//
// The strip is reached without waiting 60s for the next poll tick: the component
// has a `document:visibilitychange` handler that calls load() immediately, so we
// flip the stub to 500 and dispatch that event (BR-17/BR-20 in the component).
//
// This script also MEASURES each shot (computed colour + painted background +
// WCAG ratio) and prints it, because a screenshot of a colour is not evidence
// that the colour is legible -- see verify-visuals-by-measurement-not-eye.
//
// Usage:
//   npx ng serve --port 4310          # AFTER: this branch
//   node e2e/scripts/capture-obrs726.js after
//   git checkout origin/dev -- <the 2 SCSS files>   # hot-reloads
//   node e2e/scripts/capture-obrs726.js before
//   git checkout HEAD -- <the 2 SCSS files>
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const PHASE = (process.argv[2] || 'after').toUpperCase();
const BASE = process.env.CAPTURE_BASE || 'http://localhost:4310';
const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-726');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// --- fixtures ---------------------------------------------------------------

// deliveryStatus 'created' is what the pending-verification endpoint returns.
// weightKg 5 is the DECLARED value; the capture types 20, which is past
// WEIGHT_TOLERANCE_KG, so `.pv-mismatch-hint` renders.
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

const MY_BOOKINGS = ok({
  content: [
    {
      id: 4242,
      bookingNumber: 'B-004242',
      totalAmount: '350.00',
      // MyBookingView.paid === (status === CANCELLABLE_BOOKING_STATUS), i.e.
      // 'confirmed' -- and `paid` is what gates the View-e-ticket menu item.
      status: 'confirmed',
      bookingType: 'one_way',
      bookingChannel: 'online',
      createdAt: '2026-07-26T08:00:00+07:00',
      rescheduleCount: 0,
      seatChangeCount: 0,
      stopChangeCount: 0,
    },
  ],
  totalElements: 1,
  totalPages: 1,
  number: 0,
  size: 100,
});

const BOOKING_TICKETS = ok({
  bookingId: 4242,
  bookingNumber: 'B-004242',
  paymentDate: '2026-07-26T08:05:00+07:00',
  totalAmount: '350.00',
  booker: { name: 'สมชาย ใจดี', phone: '0812345678' },
  journeys: [
    {
      direction: 'outbound',
      routeName: 'หนองจาก - บ้านบึง',
      departureDateTime: '2026-07-26T09:00:00+07:00',
      fromStop: { label: 'หนองจาก', latitude: 13.0, longitude: 101.0 },
      toStop: { label: 'บ้านบึง', latitude: 13.3, longitude: 101.1 },
      tickets: [
        {
          id: 777,
          ticketNumber: 'T-000777',
          passengerName: 'สมชาย ใจดี',
          seatNumber: 'A1',
          fareCategory: null,
          status: { code: 'confirmed', name: 'Confirmed' },
        },
      ],
    },
  ],
});

// A LIVE position so the tracker renders its normal body first -- the strip is
// explicitly a "keep the last render, add a strip" state (BR-20), so it can only
// be captured on top of a successful render.
const LIVE_POSITION = ok({
  state: 'LIVE',
  lat: 13.12,
  lon: 101.02,
  recordedAt: '2026-07-26T09:10:00+07:00',
  stale: false,
  windowOpensAt: null,
});

// --- helpers ----------------------------------------------------------------

async function newSeededPage(browser, dark) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1800 } });
  await page.addInitScript(
    ([isDark]) => {
      localStorage.setItem('app_language', 'th');
      localStorage.setItem('auth_token', 'fake-token-for-capture');
      localStorage.setItem('auth_username', 'salesperson@system.local');
      localStorage.setItem('auth_roles', JSON.stringify(['admin', 'owner', 'salesperson', 'user']));
      // ThemeService's ONLY key (APP_ADMIN_THEME_KEY) -- it drives body.is-dark,
      // which is what BOTH the admin/staff shell and the customer shell read.
      if (isDark) localStorage.setItem('app_admin_theme', 'dark');
      else localStorage.removeItem('app_admin_theme');
    },
    [dark]
  );
  // Catch-all FIRST: in Playwright the LAST registered route wins.
  await page.route('**/api/**', (route) => json(route, ok(null)));
  return page;
}

/** Measure, in the browser, what actually shipped -- never trust the eye. */
async function measure(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { error: 'NOT FOUND: ' + sel };
    const rgba = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1].split(',').map((v) => parseFloat(v.trim()));
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    let bg = layers.length ? layers[layers.length - 1].slice(0, 3) : [255, 255, 255];
    for (let i = layers.length - 2; i >= 0; i--) {
      const [tr, tg, tb, ta] = layers[i];
      bg = [tr * ta + bg[0] * (1 - ta), tg * ta + bg[1] * (1 - ta), tb * ta + bg[2] * (1 - ta)];
    }
    const fg = rgba(getComputedStyle(el).color).slice(0, 3);
    const lum = ([r, g, b]) => {
      const f = (c) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    const a = lum(fg);
    const b = lum(bg);
    return {
      fg: hex(fg),
      bg: hex(bg),
      ratio: Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2)),
      bodyIsDark: document.body.classList.contains('is-dark'),
    };
  }, selector);
}

const results = [];
async function shot(page, locatorSelector, measureSelector, name, expectDark) {
  const m = await measure(page, measureSelector);
  if (m.error) throw new Error(m.error);
  // Assert the PRECONDITION rather than trusting that a dark shot is dark.
  if (m.bodyIsDark !== expectDark) {
    throw new Error(`theme precondition failed for ${name}: body.is-dark=${m.bodyIsDark}, expected ${expectDark}`);
  }
  const file = path.join(ASSETS_DIR, name);
  // `.first()`: the verify dialog repeats `.pv-compare` once per measured field.
  await page.locator(locatorSelector).first().screenshot({ path: file });
  results.push(`${name}  ${measureSelector}  ${m.fg} on ${m.bg} = ${m.ratio}:1`);
  console.log(`captured ${name} -- ${m.fg} on ${m.bg} = ${m.ratio}:1`);
}

// --- surface 1: staff parcel-verify dialog ----------------------------------

async function captureMismatchHint(browser, dark) {
  const page = await newSeededPage(browser, dark);
  await page.route('**/parcels/pending-verification', (route) => json(route, PENDING_VERIFICATION));
  await page.goto(`${BASE}/staff/parcels/verify/42`, { waitUntil: 'networkidle' });

  const openBtn = page.locator('table .admin-btn').first();
  await openBtn.waitFor({ state: 'visible', timeout: 30000 });
  await openBtn.click();
  await page.locator('.admin-modal').waitFor({ state: 'visible', timeout: 15000 });

  // Declared 5 kg, measured 20 kg -> past WEIGHT_TOLERANCE_KG -> hint renders.
  await page.locator('input[formcontrolname="actualWeightKg"]').fill('20');
  await page.locator('.pv-mismatch-hint').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(300);

  const mode = dark ? 'dark' : 'light';
  await shot(page, '.pv-compare', '.pv-mismatch-hint', `OBRS-726-${PHASE}-mismatch-hint-${mode}.png`, dark);
  await shot(page, '.admin-modal', '.pv-mismatch-hint', `OBRS-726-${PHASE}-mismatch-hint-${mode}-full.png`, dark);
  await page.close();
}

// --- surface 2: customer trip tracker ---------------------------------------

async function captureRefreshFailed(browser, dark) {
  const page = await newSeededPage(browser, dark);
  await page.route('**/api/private/bookings/me**', (route) => json(route, MY_BOOKINGS));
  await page.route('**/api/private/bookings/*/tickets', (route) => json(route, BOOKING_TICKETS));

  let failPosition = false;
  await page.route('**/vehicle-position', (route) =>
    failPosition
      ? json(route, { code: 500, message: 'boom' }, 500)
      : json(route, LIVE_POSITION)
  );

  await page.goto(`${BASE}/my-bookings`, { waitUntil: 'networkidle' });
  const actionsTrigger = page.locator('.booking-card button').last();
  await actionsTrigger.waitFor({ state: 'visible', timeout: 30000 });
  await actionsTrigger.click();
  // The e-ticket entry is an overflow-menu item, present only when the booking
  // is `confirmed` (MyBookingView.paid) -- see the fixture note above.
  const ticketItem = page
    .locator('.p-menuitem-link, [role=menuitem]')
    .filter({ hasText: /ตั๋ว|ticket/i })
    .first();
  await ticketItem.waitFor({ state: 'visible', timeout: 10000 });
  await ticketItem.click();

  await page.locator('.trip-track-panel').waitFor({ state: 'visible', timeout: 15000 });

  // BR-20: the strip only appears on top of an already-rendered state, so fail
  // the NEXT poll -- forced immediately via the visibilitychange handler rather
  // than waiting out the 60s cadence.
  failPosition = true;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.locator('.trip-track-panel__refresh-failed').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(300);

  const mode = dark ? 'dark' : 'light';
  await shot(
    page,
    '.trip-track-panel',
    '.trip-track-panel__refresh-failed',
    `OBRS-726-${PHASE}-refresh-failed-${mode}.png`,
    dark
  );
  await page.close();
}

async function main() {
  const browser = await chromium.launch();
  try {
    for (const dark of [true, false]) {
      await captureMismatchHint(browser, dark);
    }
    for (const dark of [true, false]) {
      await captureRefreshFailed(browser, dark);
    }
  } finally {
    await browser.close();
  }
  console.log(`\n--- ${PHASE} measurements ---`);
  for (const r of results) console.log('  ' + r);
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
