// OBRS-1530 before/after capture for /my-parcels in both themes.
//
// Same no-backend recipe as capture-obrs752.js: AuthService.isAuthenticated() is a
// pure localStorage check, so seeding auth_token/auth_roles clears AuthGuard, and one
// page.route('**/api/**') answers every call. Nothing here writes to any environment.
//
// Usage:
//   npx ng serve --configuration=gate --port 4400     # AFTER  (this worktree)
//   npx ng serve --configuration=gate --port 4300     # BEFORE (a worktree on origin/dev)
//   CAPTURE_BASE=http://localhost:4300 node e2e/scripts/capture-obrs1530.js before
//   CAPTURE_BASE=http://localhost:4400 node e2e/scripts/capture-obrs1530.js after
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const MODE = (process.argv[2] || 'after').toLowerCase();
const BASE = process.env.CAPTURE_BASE || 'http://localhost:4400';
const OUT_DIR = process.env.CAPTURE_OUT || path.resolve(__dirname, '..', '..', 'capture-obrs1530');
fs.mkdirSync(OUT_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const parcel = (id, deliveryStatus, bookingStatus, extra = {}) => ({
  parcelId: id,
  trackingNumber: 'P-00' + id,
  bookingId: 900 + id,
  bookingNumber: 'B-000' + (900 + id),
  amount: 120,
  deliveryStatus,
  bookingStatus,
  collectionCode: null,
  recipientName: 'Somchai Jaidee',
  pickupStop: 'Nong Chak',
  dropoffStop: 'Mo Chit 2 Terminal',
  departureDateTime: '2030-06-17T08:00:00+07:00',
  weightKg: 3,
  expiresAt: null,
  leftAtStopAt: null,
  leftAtStopPhotoUrl: null,
  ...extra,
});
const MY_PARCELS = ok({
  content: [
    parcel(1, 'created', 'pending', { expiresAt: '2030-06-16T08:00:00+07:00' }),
    parcel(2, 'in_transit', 'confirmed'),
    parcel(3, 'collected', 'confirmed'),
  ],
  totalElements: 3,
  totalPages: 1,
  size: 20,
  number: 0,
  numberOfElements: 3,
});

const NO_PARCELS = ok({
  content: [],
  totalElements: 0,
  totalPages: 0,
  size: 20,
  number: 0,
  numberOfElements: 0,
});

function readPainted() {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      sel,
      background: cs.backgroundColor,
      color: cs.color,
      borderColor: cs.borderColor,
    };
  };
  return [
    '.my-parcels',
    '.my-parcels__header h1',
    '.my-parcels__header p',
    '.parcel-card',
    '.parcel-card__route',
    '.parcel-card__departure',
    '.parcel-card__meta dt',
    '.parcel-card__meta dd',
    '.icon-btn',
    '.admin-status',
    '.state-card',
    '.state-card p',
    '.parcel-btn-primary',
  ].map(pick).filter(Boolean);
}

(async () => {
  const browser = await chromium.launch();
  const out = {};
  const EMPTY = process.env.CAPTURE_EMPTY === '1';
  const payload = EMPTY ? NO_PARCELS : MY_PARCELS;
  const waitFor = EMPTY ? '.state-card--empty' : '.parcel-card';
  const suffix = EMPTY ? '-empty' : '';
  for (const dark of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript((isDark) => {
      localStorage.setItem('app_language', 'en');
      localStorage.setItem('auth_token', 'obrs-1530-capture-token');
      localStorage.setItem('auth_username', 'customer@system.local');
      localStorage.setItem('auth_roles', JSON.stringify(['user']));
      if (isDark) localStorage.setItem('app_admin_theme', 'dark');
      else localStorage.removeItem('app_admin_theme');
    }, dark);
    await page.route('**/api/**', async (route) => {
      const pathname = route.request().url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
      const body = /\/parcels\/me$/.test(pathname) ? payload : ok(null);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route('**/maps.googleapis.com/**', (r) => r.abort());
    await page.route('**/accounts.google.com/**', (r) => r.abort());
    await page.route('**/ssl.gstatic.com/**', (r) => r.abort());

    await page.goto(BASE + '/my-parcels', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(waitFor, { timeout: 30000 });
    const isDarkOnBody = await page.evaluate(() => document.body.classList.contains('is-dark'));
    if (dark !== isDarkOnBody) throw new Error('theme not applied: expected dark=' + dark);
    await page.waitForTimeout(400);

    const theme = dark ? 'dark' : 'light';
    const file = path.join(OUT_DIR, `OBRS-1530-${MODE.toUpperCase()}-my-parcels${suffix}-${theme}.png`);
    await page.screenshot({ path: file, fullPage: true });
    out[theme] = await page.evaluate(readPainted);
    console.log('saved', file);
    await ctx.close();
  }
  const paintedFile = path.join(OUT_DIR, `painted-${MODE}${suffix}.json`);
  fs.writeFileSync(paintedFile, JSON.stringify(out, null, 2));
  console.log('painted ->', paintedFile);
  await browser.close();
})();
