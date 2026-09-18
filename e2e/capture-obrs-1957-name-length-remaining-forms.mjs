/**
 * OBRS-1957 evidence — the three forms OBRS-1952 did not reach now refuse a name the backend
 * would refuse, and send the value they measured.
 *
 *   npx ng serve --port 4357                      # the fix
 *   node e2e/capture-obrs-1957-name-length-remaining-forms.mjs
 *
 *   npx ng serve --port 4358                      # a worktree parked on origin/dev
 *   OBRS_BASE_URL=http://localhost:4358 OBRS_OUT_DIR=e2e-evidence/obrs-1957/before \
 *     node e2e/capture-obrs-1957-name-length-remaining-forms.mjs
 *
 * ONE script for both frames, for the reason capture-obrs-1952-name-length.mjs gives: the BEFORE
 * is not a different walk, it is the same walk meeting a form that lets the value through.
 *
 * NO BACKEND, NO DATABASE, NO LOGIN — `AuthGuard` only reads `auth_token` + `auth_roles` from
 * localStorage (capture-obrs-1752-checkout-visibility.mjs relies on the same thing), and every
 * `/api/**` call is answered here.
 *
 * Each form is walked twice and BOTH results are recorded as numbers, not impressions:
 *   1. a 1-character name        -> must be refused in the browser
 *   2. a 50-character name with a space on each side -> must be ACCEPTED, and what leaves the
 *      browser must be 50 characters, not 52. That second half is the finding scrutinize
 *      returned on 2026-09-17: measuring the trimmed length while posting the raw string is
 *      the same 400 by another road, so `sentNameLength` is captured off the real request body.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4357';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e-evidence/obrs-1957/after');
const LANG = 'th';

const SHORT = 'ก';
const FIFTY = 'ก'.repeat(50);
const PADDED_FIFTY = ` ${FIFTY} `;

const ok = (data) => ({ code: 200, message: 'OK', data });

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso(new Date());
const ROUTE_SLUG = 'chonburi_bangkok';

/** WalkInTripDto, field for field — copied from capture-obrs-1752-checkout-visibility.mjs. */
const trip = (scheduleId, hh) => ({
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
  availableSeatNumbers: [],
  deletable: false,
  confirmedBookingCount: 1,
  // OPEN, not ASSIGNED: an open trip sells by passenger count, which starts at 1, so the sell
  // button's `ticketCount >= 1` is satisfied without a seat map standing between this script and
  // the only thing it is here to measure - the name that leaves the browser.
  seatingMode: 'OPEN',
  normalCapacity: 13,
});

const ROUTE_GROUPS = [
  {
    routeSlug: ROUTE_SLUG,
    routeLabel: 'Chonburi - Bangkok',
    trips: [trip(9101, '08'), trip(9102, '11')],
  },
];

const STOP = (slug, name) => ({ slug, name });
const SEGMENTS = {
  route: STOP(ROUTE_SLUG, 'Chonburi - Bangkok'),
  stopPairs: [
    {
      segmentId: 1,
      fromStop: STOP('nong_chak', 'Nong Chak'),
      toStop: STOP('mo_chit', 'Mo Chit'),
      vehicleType: STOP('van', 'Van'),
      fare: '500',
      estimatedDurationMinutes: 180,
    },
  ],
  popularPickupStops: [{ slug: 'nong_chak', name: 'Nong Chak', count: 9 }],
  popularDropoffStops: [{ slug: 'mo_chit', name: 'Mo Chit', count: 9 }],
};

const ROUTE_STOPS = {
  stops: [
    { stopOrder: 1, offsetMinutesFromOrigin: 0, stop: { id: 101, code: 'nong_chak' } },
    { stopOrder: 2, offsetMinutesFromOrigin: 180, stop: { id: 102, code: 'mo_chit' } },
  ],
  defaultPickupStopSlug: 'nong_chak',
};

/** `MyAccountProfile` — pdpaConsentVersion matches PRIVACY_POLICY_VERSION so no re-consent panel. */
const PROFILE = {
  id: 7001,
  title: 'MR',
  firstName: 'สมชาย',
  middleName: null,
  lastName: 'รักดี',
  nickname: null,
  email: 'customer@system.local',
  phoneNumber: '0812345678',
  preferredLocale: 'th',
  pdpaConsentVersion: '2.6',
};

/**
 * Every request body this card can be wrong about, recorded as it leaves the browser. A form that
 * validates the trimmed length and posts the raw string looks identical on screen and is still the
 * bug; only the outgoing length tells them apart.
 */
function recordRequests(page, sink) {
  page.on('request', (req) => {
    if (!['POST', 'PUT'].includes(req.method())) return;
    if (!/\/api\//.test(req.url())) return;
    let body = null;
    try {
      body = JSON.parse(req.postData() ?? 'null');
    } catch {
      return;
    }
    sink.push({ method: req.method(), path: new URL(req.url()).pathname, body });
  });
}

/** The name lengths in the last recorded request, or null if nothing was sent. */
function sentNameLengths(sink) {
  const last = sink[sink.length - 1];
  if (!last) return null;
  const from = (o) =>
    o && typeof o === 'object'
      ? Object.fromEntries(
          ['firstName', 'middleName', 'lastName', 'nickname']
            .filter((k) => typeof o[k] === 'string')
            .map((k) => [k, o[k].length])
        )
      : {};
  return {
    path: last.path,
    top: from(last.body),
    contact: from(last.body?.contact),
  };
}

async function baseContext(browser, roles) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(
    ([language, r]) => {
      window.localStorage.setItem('app_language', language);
      window.localStorage.setItem('auth_token', 'capture-only-not-a-real-token');
      window.localStorage.setItem('auth_username', 'customer@system.local');
      window.localStorage.setItem('auth_roles', r);
    },
    [LANG, JSON.stringify(roles)]
  );
  return ctx;
}

async function mockApi(page) {
  await page.route('**/api/**', async (route) => {
    const p = new URL(route.request().url()).pathname;
    const send = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(data)) });
    if (/\/private\/schedules\/walk-in$/.test(p)) return send(ROUTE_GROUPS);
    if (/\/private\/segments\//.test(p)) return send(SEGMENTS);
    if (/\/private\/route-stops\//.test(p)) return send(ROUTE_STOPS);
    if (/\/private\/users\/drivers$/.test(p)) return send([]);
    if (/\/private\/users\/me$/.test(p)) return send(PROFILE);
    return send(null);
  });
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
  await page.route('**/accounts.google.com/**', (route) => route.abort());
}

/** Visible inline errors under a field, plus whether the control is marked invalid. */
async function fieldState(page, selector) {
  return page.evaluate((sel) => {
    const input = document.querySelector(sel);
    if (!input) return null;
    const cell = input.closest('div');
    const messages = Array.from(cell?.querySelectorAll('.invalid-feedback, .text-error, .form-error') ?? [])
      .map((el) => el.textContent.trim())
      .filter(Boolean);
    // Two different classes mark an invalid control in this codebase: walk-in binds Bootstrap's
    // `is-invalid`, register and account bind `form-error`. Reading only the first would report
    // `false` for two of the three forms no matter what the control actually was.
    const invalid = input.classList.contains('is-invalid') || input.classList.contains('form-error');
    return { value: input.value, valueLength: input.value.length, messages, markedInvalid: invalid };
  }, selector);
}

/**
 * The clip is taken in page coordinates, so the page is scrolled to the top first and the
 * measured height is checked against the region asked for — a truncated frame throws instead of
 * being saved (OBRS-702, the same guard capture-obrs-1952-name-length.mjs carries).
 */
async function shoot(page, selector, file) {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const box = await el.boundingBox();
  if (!box || box.height < 40) {
    throw new Error(`${selector} measured ${JSON.stringify(box)} - nothing worth shooting`);
  }
  await el.screenshot({ path: file });
}

/** ---- walk-in POS checkout ------------------------------------------------------------- */
async function captureWalkIn(browser, measured) {
  const ctx = await baseContext(browser, ['salesperson']);
  const page = await ctx.newPage();
  const sent = [];
  await mockApi(page);
  recordRequests(page, sent);

  await page.goto(`${BASE}/staff/sell`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.trip-row', { state: 'visible', timeout: 60000 });
  await page.locator('.trip-row').first().click();
  await page.waitForSelector('app-walk-in-checkout input[formControlName="firstName"]', {
    state: 'visible',
    timeout: 60000,
  });
  await page.waitForTimeout(400);

  const first = 'app-walk-in-checkout input[formControlName="firstName"]';
  const last = 'app-walk-in-checkout input[formControlName="lastName"]';
  const phone = 'app-walk-in-checkout input[formControlName="phoneNumber"]';

  await page.fill(first, SHORT);
  await page.fill(last, SHORT);
  await page.fill(phone, '0812345678');
  await page.locator(first).blur();
  await page.locator(last).blur();
  await page.waitForTimeout(500);

  const tooShort = {
    firstName: await fieldState(page, first),
    lastName: await fieldState(page, last),
  };
  await shoot(page, 'app-walk-in-checkout', path.join(OUT, 'walk-in-too-short.png'));

  await page.fill(first, PADDED_FIFTY);
  await page.fill(last, PADDED_FIFTY);
  await page.locator(first).blur();
  await page.locator(last).blur();
  await page.waitForTimeout(500);

  const padded = {
    firstName: await fieldState(page, first),
    lastName: await fieldState(page, last),
  };
  await shoot(page, 'app-walk-in-checkout', path.join(OUT, 'walk-in-padded-fifty.png'));

  // Take the payment and sell: the fields hold 52 characters, the request must carry 50.
  await page.fill('app-walk-in-checkout input[type="number"]', '5000');
  await page.locator('app-walk-in-checkout input[type="number"]').blur();
  await page.waitForTimeout(400);
  await page.locator('app-walk-in-checkout button.btn-success').first().click({ force: true });
  await page.waitForTimeout(1500);

  measured.walkIn = { tooShort, padded, sent: sentNameLengths(sent), requestCount: sent.length };
  await ctx.close();
}

/** ---- public register ------------------------------------------------------------------ */
async function captureRegister(browser, measured) {
  const ctx = await baseContext(browser, []);
  const page = await ctx.newPage();
  const sent = [];
  await mockApi(page);
  recordRequests(page, sent);

  await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#firstName', { state: 'visible', timeout: 60000 });
  await page.waitForTimeout(400);

  for (const id of ['#firstName', '#lastName']) {
    await page.fill(id, SHORT);
    await page.locator(id).blur();
  }
  await page.waitForTimeout(500);
  const tooShort = {
    firstName: await fieldState(page, '#firstName'),
    lastName: await fieldState(page, '#lastName'),
  };
  await shoot(page, '#firstName >> xpath=ancestor::form', path.join(OUT, 'register-too-short.png'));

  for (const id of ['#firstName', '#lastName', '#middleName']) {
    await page.fill(id, PADDED_FIFTY);
    await page.locator(id).blur();
  }
  await page.waitForTimeout(500);
  const padded = {
    firstName: await fieldState(page, '#firstName'),
    middleName: await fieldState(page, '#middleName'),
    lastName: await fieldState(page, '#lastName'),
  };
  await shoot(page, '#firstName >> xpath=ancestor::form', path.join(OUT, 'register-padded-fifty.png'));

  // Fill the rest so the form is submittable, then send it: what the three name fields hold is
  // 52 characters, and what must leave the browser is 50. Only the request body shows that.
  await page.fill('#email', 'somchai@example.com');
  await page.fill('#phoneNumber', '0812345678');
  await page.fill('#password', 'Passw0rd!2026');
  await page.fill('#confirmPassword', 'Passw0rd!2026');
  await page.locator('#pdpaConsent').check({ force: true });
  await page.waitForTimeout(300);
  await page.locator('button[type="submit"]').first().click({ force: true });
  await page.waitForTimeout(1200);

  measured.register = { tooShort, padded, sent: sentNameLengths(sent), requestCount: sent.length };
  await ctx.close();
}

/** ---- account profile ------------------------------------------------------------------ */
async function captureAccount(browser, measured) {
  const ctx = await baseContext(browser, ['user']);
  const page = await ctx.newPage();
  const sent = [];
  await mockApi(page);
  recordRequests(page, sent);

  await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="profile-edit"]', { state: 'visible', timeout: 60000 });
  await page.locator('[data-testid="profile-edit"]').click();
  await page.waitForSelector('#account-profile-first-name', { state: 'visible', timeout: 60000 });
  await page.waitForTimeout(400);

  const ids = {
    firstName: '#account-profile-first-name',
    middleName: '#account-profile-middle-name',
    lastName: '#account-profile-last-name',
    nickname: '#account-profile-nickname',
  };

  for (const id of [ids.firstName, ids.lastName, ids.nickname]) {
    await page.fill(id, SHORT);
    await page.locator(id).blur();
  }
  await page.waitForTimeout(500);
  const tooShort = Object.fromEntries(
    await Promise.all(Object.entries(ids).map(async ([k, sel]) => [k, await fieldState(page, sel)]))
  );
  await shoot(page, '[data-testid="profile-card"]', path.join(OUT, 'account-too-short.png'));

  for (const id of Object.values(ids)) {
    await page.fill(id, PADDED_FIFTY);
    await page.locator(id).blur();
  }
  await page.waitForTimeout(400);
  // Read and shoot BEFORE saving: a successful save leaves edit mode, and the fields this is
  // measuring stop existing the moment it does.
  const padded = Object.fromEntries(
    await Promise.all(Object.entries(ids).map(async ([k, sel]) => [k, await fieldState(page, sel)]))
  );
  await shoot(page, '[data-testid="profile-card"]', path.join(OUT, 'account-padded-fifty.png'));

  await page.locator('[data-testid="profile-save"]').click({ force: true });
  await page.waitForTimeout(1200);
  await shoot(page, '[data-testid="profile-card"]', path.join(OUT, 'account-saved.png'));

  measured.account = { tooShort, padded, sent: sentNameLengths(sent), requestCount: sent.length };
  await ctx.close();
}

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const measured = {};
  await captureWalkIn(browser, measured);
  await captureRegister(browser, measured);
  await captureAccount(browser, measured);
  await browser.close();

  await writeFile(path.join(OUT, 'measured.json'), JSON.stringify({ base: BASE, measured }, null, 2));
  console.log(JSON.stringify(measured, null, 2));
  console.log(`images + measured.json in ${OUT}`);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
