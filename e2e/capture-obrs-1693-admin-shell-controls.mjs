/**
 * OBRS-1693 — the rendered SIZE of every Bootstrap checkbox under `.admin-shell`,
 * read off a live browser, on one `ng serve`, run twice with nothing changed but
 * the two style files under test:
 *
 *   npx ng serve --port 4393
 *   node e2e/capture-obrs-1693-admin-shell-controls.mjs --label before   # sources at origin/dev
 *   node e2e/capture-obrs-1693-admin-shell-controls.mjs --label after    # sources with the fix
 *
 * WHY A SIZE AND NOT A VALUE (this is AC-4, and the reason the bug shipped)
 * Every Karma spec on these forms asserts the control's VALUE - `checked`, the form
 * value - and Karma's DOM never loads `admin-theme.scss` at all. So a checkbox that
 * renders 2px wide, whose tick state a clerk physically cannot read, passes every
 * spec in the repo. Only a real browser with the real stylesheet can see it, and only
 * if something reads `getBoundingClientRect()`. That is all this script does.
 *
 * WHY EVERY /api CALL IS STUBBED
 * The thing under test is a CSS cascade, which no backend can make more or less true.
 * `AuthGuard` on `/staff` checks exactly two things - `isAuthenticated()` is
 * `!!getToken()` (no JWT is decoded, auth.service.ts:420) and `hasAnyRole()` reads
 * `auth_roles` from localStorage - so both are seeded and every `/api/**` is answered
 * here.
 *
 * WHAT IT REFUSES TO CALL A PASS
 * A checkbox that is absent reads the same as a checkbox that is fine if you only
 * look for "nothing too small". So each surface first waits for its control to be
 * visible, and the run fails if a surface yields zero controls. On `--label after` a
 * width below MIN_PX exits non-zero: that is the regression guard, not the images.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4393';
const OUT = path.resolve(
  '..', 'obrs-agent-office', '.claude', 'agent-office', 'scripts', 'captures', 'obrs-1693'
);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 || !process.argv[i + 1] ? fallback : process.argv[i + 1];
};
const LABEL = arg('--label', null);
if (LABEL !== 'before' && LABEL !== 'after') {
  throw new Error('--label <before|after> is required - an unlabelled pair proves nothing');
}

/**
 * Bootstrap draws `.form-check-input` at `width: 1em`, and the shell pins
 * `font-size: 14px !important`, so the correct render is 14px. The bug rendered 2.
 * 10 sits far from both, so this threshold cannot be met by a near miss either way.
 */
const MIN_PX = 10;

const ok = (data) => ({ code: 200, message: 'OK', data });
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso(new Date());

const trip = (scheduleId, hh, seatingMode) => ({
  scheduleId,
  vehicleType: 'van',
  licensePlate: 'AB-1234',
  driverName: 'Somchai',
  departureDateTime: `${TODAY}T${hh}:00:00`,
  arrivalDateTime: `${TODAY}T${String(Number(hh) + 3).padStart(2, '0')}:00:00`,
  pricePerSeat: '500',
  capacity: 13,
  availableCount: 12,
  reservedUnpaidCount: 0,
  soldPaidCount: 1,
  availableSeatNumbers: ['1', '2', '3', '4', '5', '7', '8', '9', '10', '11', '12', '13'],
  deletable: false,
  confirmedBookingCount: 1,
  seatingMode,
  normalCapacity: 13,
});

const ROUTE_GROUPS = [
  {
    routeSlug: 'chonburi_bangkok',
    routeLabel: 'Chonburi - Bangkok',
    trips: [trip(9101, '08', 'ASSIGNED')],
  },
];

const SEGMENTS = {
  route: { slug: 'chonburi_bangkok', name: 'Chonburi - Bangkok' },
  stopPairs: [
    {
      segmentId: 1,
      fromStop: { slug: 'nong_chak', name: 'Nong Chak' },
      toStop: { slug: 'mo_chit', name: 'Mo Chit' },
      vehicleType: { slug: 'van', name: 'Van' },
      fare: '500',
      estimatedDurationMinutes: 180,
    },
  ],
  popularPickupStops: [],
  popularDropoffStops: [],
};

const ROUTE_STOPS = {
  stops: [
    { stopOrder: 1, offsetMinutesFromOrigin: 0, stop: { id: 101, code: 'nong_chak' } },
    { stopOrder: 2, offsetMinutesFromOrigin: 180, stop: { id: 102, code: 'mo_chit' } },
  ],
  defaultPickupStopSlug: 'nong_chak',
};

const POLICY = {
  maxWeightKg: 100,
  carryOnFreeSizeMaxInch: 28,
  carryOnFreeAisleMaxPerTrip: 10,
  prohibitedCategories: ['flammable', 'explosive', 'weapon', 'narcotic', 'corpse'],
};

async function stub(page) {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'obrs-1693-capture-token');
    localStorage.setItem('auth_username', 'salesperson@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['salesperson']));
  });
  await page.route('**/api/**', (route) => {
    const p = new URL(route.request().url()).pathname;
    const send = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(data)) });
    if (/\/private\/schedules\/walk-in$/.test(p)) return send(ROUTE_GROUPS);
    if (/\/private\/segments\//.test(p)) return send(SEGMENTS);
    if (/\/private\/route-stops\//.test(p)) return send(ROUTE_STOPS);
    if (/\/parcel-policy$/.test(p)) return send(POLICY);
    if (/\/private\/parcels\/share-config$/.test(p))
      return send({ driverPct: 30, salespersonPct: 10, configured: true });
    return send(null);
  });
  await page.route('**/accounts.google.com/**', (route) => route.abort());
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
}

/** Every `.form-check-input` currently on screen, with the size the browser gave it. */
const readAll = (page) =>
  page.$$eval('.admin-shell .form-check-input', (nodes) =>
    nodes.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.id || null,
        type: el.getAttribute('type'),
        widthPx: Math.round(r.width),
        heightPx: Math.round(r.height),
        computedWidth: getComputedStyle(el).width,
        appearance: getComputedStyle(el).appearance,
      };
    })
  );

/**
 * Clip TIGHTLY around the control itself, not around its `.form-check` row. The first
 * version of this script framed the whole row - ~1100px wide - and the two arms came
 * out visually identical, because a 12px difference inside an 1100px image is a
 * hairline either way. The defect is 12 pixels; the frame has to be small enough that
 * 12 pixels is most of it. `deviceScaleFactor: 3` on the context does the rest.
 */
const SHOT_W = 220;
const SHOT_H = 34;
async function shoot(page, selector, file) {
  const box = await page.locator(selector).first().evaluate(
    (el, [w, h]) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.max(0, r.x - 8),
        y: Math.max(0, r.y + r.height / 2 - h / 2),
        width: w,
        height: h,
      };
    },
    [SHOT_W, SHOT_H]
  );
  await page.screenshot({ path: file, clip: box });
}

const browser = await chromium.launch();
const results = { label: LABEL, base: BASE, minPx: MIN_PX, surfaces: {} };
await mkdir(OUT, { recursive: true });

async function surface(name, open, anchor) {
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    deviceScaleFactor: 3,
  });
  const page = await ctx.newPage();
  // `ng serve` builds lazy routes on first request; the default 30s navigation timeout
  // expires on a cold /staff chunk long before anything is wrong with the page.
  page.setDefaultNavigationTimeout(180000);
  await stub(page);
  await open(page);
  await page.locator(anchor).first().waitFor({ state: 'visible', timeout: 30000 });
  // Both anchors sit below the fold on a 1100px viewport, and a clip outside the
  // viewport is not a screenshot Playwright will take.
  await page.locator(anchor).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const controls = await readAll(page);
  await shoot(page, anchor, path.join(OUT, `${name}-${LABEL}.png`));
  results.surfaces[name] = { anchor, controlCount: controls.length, controls };
  await ctx.close();
}

// 1. /staff/parcels/consign - `#prohibitedAcknowledged` renders unconditionally.
await surface(
  'parcel-consign',
  async (page) => {
    await page.goto(`${BASE}/staff/parcels/consign`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('app-parcel-consign-form', { state: 'visible', timeout: 60000 });
    await page.waitForTimeout(600);
  },
  '#prohibitedAcknowledged'
);

// 2. /staff/sell - the consent box only exists once a monk/nun is the selected type
//    (OBRS-1666). `.ptype-tile` order is male, female, monk, nun.
await surface(
  'pos-walk-in',
  async (page) => {
    await page.goto(`${BASE}/staff/sell`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.trip-row', { state: 'visible', timeout: 60000 });
    await page.locator('.trip-row').first().click();
    await page.waitForSelector('.ptype-tile', { state: 'visible', timeout: 30000 });
    await page.locator('.ptype-tile').nth(2).click();
    await page.waitForTimeout(600);
  },
  '#walkin-passenger-type-consent'
);

await browser.close();

const all = Object.values(results.surfaces).flatMap((s) => s.controls);
const empty = Object.entries(results.surfaces).filter(([, s]) => s.controlCount === 0);
const collapsed = all.filter((c) => c.widthPx < MIN_PX);
results.verdict = { totalControls: all.length, emptySurfaces: empty.map(([n]) => n), collapsed };

await writeFile(path.join(OUT, `result-${LABEL}.json`), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

if (empty.length > 0) {
  console.error(`FAIL: no control found on ${empty.map(([n]) => n).join(', ')} - the run proves nothing`);
  process.exit(2);
}
if (LABEL === 'after' && collapsed.length > 0) {
  console.error(`FAIL: ${collapsed.length} control(s) still render under ${MIN_PX}px wide`);
  process.exit(1);
}
console.log(`OK: ${all.length} control(s) measured, ${collapsed.length} under ${MIN_PX}px`);
