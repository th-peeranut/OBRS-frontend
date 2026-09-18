/**
 * OBRS-1959 evidence — the promo-code field's border against the surface it sits on.
 *
 *   npx ng serve --port 4331                                    # the fix
 *   node e2e/capture-obrs-1959-promo-border-contrast.mjs
 *
 *   npx ng serve --port 4332                                    # a tree at origin/dev
 *   OBRS_BASE_URL=http://localhost:4332 OBRS_OUT_DIR=<...>/before \
 *     node e2e/capture-obrs-1959-promo-border-contrast.mjs
 *
 * The whole point of the card is that this control is only measurable ENABLED, and it is
 * disabled until both forms on /passenger-info are valid — so the script fills them first and
 * then asserts, out loud in `measured.json`, that the input it measured was not disabled. A
 * reading taken on the disabled control is a reading of `$primary-lightgrey` painted as a FILL,
 * which is a different element's number (the mistake OBRS-811 recorded).
 *
 * The ratio is computed the way the gate computes it — WCAG relative luminance on the two
 * composited colours — rather than eyeballed off the image, and both themes are captured
 * because the light and dark recipes are separate declarations that failed separately.
 *
 * NO BACKEND: `/api/**` is answered here and the booking context is seeded into localStorage,
 * the same harness `capture-obrs-1955-validation-points-at-field.mjs` uses.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4331';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e-evidence/obrs-1959/after');
const THEMES = ['light', 'dark'];

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

const measured = {};

async function contextFor(browser, theme) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript(
    ([isDark, envelope]) => {
      window.localStorage.setItem('app_language', 'th');
      window.localStorage.setItem('obrs.booking_context', envelope);
      if (isDark) window.localStorage.setItem('app_admin_theme', 'dark');
      else window.localStorage.removeItem('app_admin_theme');
    },
    [
      theme === 'dark',
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        value: { filter: FILTER, searchPayload: SEARCH_PAYLOAD, selection: [SCHEDULE] },
      }),
    ]
  );
  return ctx;
}

async function mockApi(page) {
  await page.route('**/api/**', async (route) => {
    const p = new URL(route.request().url()).pathname;
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
 * Reads the border and the surface BEHIND the control (walking up until something opaque
 * paints, because `transparent` is what an unpainted ancestor computes to) and returns the
 * WCAG ratio between them.
 */
const READ_BORDER = () => {
  const toRgb = (value) => {
    const m = /rgba?\(([^)]+)\)/.exec(value);
    if (!m) return null;
    const parts = m[1].split(',').map((n) => parseFloat(n.trim()));
    if (parts.length >= 4 && parts[3] === 0) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length >= 4 ? parts[3] : 1 };
  };
  const over = (fg, bg) =>
    fg.a >= 1
      ? fg
      : {
          r: fg.r * fg.a + bg.r * (1 - fg.a),
          g: fg.g * fg.a + bg.g * (1 - fg.a),
          b: fg.b * fg.a + bg.b * (1 - fg.a),
          a: 1,
        };
  const lum = ({ r, g, b }) => {
    const f = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const hex = ({ r, g, b }) =>
    '#' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');

  const input = document.querySelector('.promo-code-input');
  if (!input) return { found: false };

  let surface = null;
  for (let el = input.parentElement; el; el = el.parentElement) {
    const c = toRgb(getComputedStyle(el).backgroundColor);
    if (c && c.a > 0) {
      surface = c;
      break;
    }
  }
  surface = surface ?? { r: 255, g: 255, b: 255, a: 1 };

  const style = getComputedStyle(input);
  const rawBorder = toRgb(style.borderTopColor);
  if (!rawBorder) return { found: true, disabled: input.disabled, border: null };

  const border = over(rawBorder, surface);
  const l1 = lum(border);
  const l2 = lum(surface);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  return {
    found: true,
    // The number only means anything on an ENABLED control; WCAG exempts an inactive one and a
    // disabled input here paints its own fill over the border's surface.
    disabled: input.disabled,
    borderDeclared: style.borderTopColor,
    borderComposited: hex(border),
    surface: hex(surface),
    borderWidth: style.borderTopWidth,
    ratio: Math.round(ratio * 100) / 100,
    meetsAA: ratio >= 3,
  };
};

async function captureTheme(browser, theme) {
  const ctx = await contextFor(browser, theme);
  const page = await ctx.newPage();
  await mockApi(page);

  await page.goto(`${BASE}/passenger-info`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#booker-lastName', { state: 'visible', timeout: 60000 });

  // Both cards valid — otherwise the field stays disabled and every number below is a
  // measurement of the wrong state.
  await page.fill('#booker-firstName', 'สมชาย');
  await page.fill('#booker-lastName', 'รักดี');
  await page.fill('#booker-phoneNumber', '0812345678');
  await page.fill('#firstName-0', 'สมชาย');
  await page.fill('#lastName-0', 'รักดี');
  await page.waitForTimeout(800);

  const promo = page.locator('.promo-code-field').first();
  await promo.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  measured[theme] = await page.evaluate(READ_BORDER);

  await promo.screenshot({ path: path.join(OUT, `promo-field-${theme}.png`) });
  await page.screenshot({ path: path.join(OUT, `summary-${theme}.png`) });

  await ctx.close();
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
for (const theme of THEMES) {
  await captureTheme(browser, theme);
}
await browser.close();

await writeFile(path.join(OUT, 'measured.json'), JSON.stringify({ base: BASE, measured }, null, 2));
console.log(JSON.stringify(measured, null, 2));
console.log(`images + measured.json in ${OUT}`);
