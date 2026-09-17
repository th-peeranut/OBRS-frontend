/**
 * OBRS-1953 — before/after evidence for "the booking form's optional fields sit behind
 * a `+ เพิ่ม…` disclosure link instead of carrying the same weight as the required ones".
 *
 * Same hermetic lane as capture-obrs1944.js, which shot this exact page: AuthService
 * .isAuthenticated() is a pure localStorage check, so seeding auth_token/auth_roles walks
 * the AuthGuard, and every /api/** call is fulfilled here. The catch-all is registered
 * FIRST because the LAST matching route registered is the one Playwright runs.
 *
 * /passenger-info is driven by the checkout NgRx session and has no deep link, so the page
 * is seeded the way e2e/support/customer-pages.ts seeds it: dispatch the real action types
 * into the real Store through `window.ng`, then flush a tick, because a dispatch from
 * inside page.evaluate() runs in the browser's ROOT zone and schedules none.
 *
 * ⛔ Serve with `--configuration gate`, NOT `sit`: the SIT feature flags redirect
 * /passenger-info to the homepage, and an optimized build exposes no `window.ng` for the
 * seed above.
 *
 *   npx ng serve --configuration gate --port 4360      # this branch
 *   node e2e/scripts/capture-obrs1953.js http://localhost:4360 <outDir> AFTER
 *   npx ng serve --configuration gate --port 4361      # the base branch
 *   node e2e/scripts/capture-obrs1953.js http://localhost:4361 <outDir> BEFORE
 *
 * The images illustrate; the console block is the evidence. The script THROWS rather than
 * saving whenever what it measured disagrees with the AC, and refuses to save a shot while
 * a swal or an error toast is on screen — with the backend down, the global HTTP-error
 * interceptor throws a modal over every page and a passing AC would photograph as a broken
 * one. The loading swal is a real transient state, so it is waited out before being judged.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(
  'C:', 'Users', 'thpee', 'Desktop', 'workshop', 'OBRS-frontend', 'node_modules', 'playwright'
));

const BASE = process.argv[2] || 'http://localhost:4360';
const OUT = process.argv[3] || path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1953');
const TAG = process.argv[4] || 'AFTER';

fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (data) => ({ code: 200, message: 'OK', data });

// Contract-shaped bodies: `ResponseAPI<T>`, the ENVELOPE, not the inner element. A bare []
// here is what makes the page draw an error modal instead of a form.
const stop = (id, slug, label) => ({ id, slug, name: label, nameEn: label, latitude: 13.3, longitude: 101.1 });
const STATIONS = [stop(1, 'nong_chak', 'Nong Chak'), stop(4, 'bkr_mochit2', 'Mo Chit 2 Terminal')];

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

const passenger = (over = {}) => ({
  isAdult: true,
  title: 1,
  firstName: '',
  middleName: '',
  lastName: '',
  phoneNumber: '',
  gender: '',
  isSelectSeat: true,
  passengerSeat: 'A1',
  useBookerInfo: false,
  email: '',
  seatPreference: null,
  seatRequirement: null,
  ...over,
});

const storeSeed = (passengers) => ({
  filter: {
    roundTrip: { id: 'one_way', name: 'One way' },
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
  passengers,
  bookingResult: { id: 501, bookingNumber: 'B-000501', totalAmount: 180, status: 'pending' },
});

const FIXTURES = [
  [/\/schedules\/availability$/, () => ok({ availableDates: ['2030-06-17'], effectiveDays: 7 })],
  [/\/schedules\/search/, () => ok({ departureSchedules: SCHEDULES, arrivalSchedules: null })],
  [/\/stations/, () => ok(STATIONS)],
  [/\/stops/, () => ok(STATIONS)],
  [/\/provinces/, () => ok([{ id: 1, name: 'Chonburi', nameEn: 'Chonburi', stations: STATIONS }])],
];

async function seedStore(page, seed) {
  await page.waitForFunction(
    () => {
      const ng = window.ng;
      if (!ng || !ng.getComponent) return false;
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const cmp = ng.getComponent(el);
        if (cmp && cmp.store && typeof cmp.store.dispatch === 'function') return true;
      }
      return false;
    },
    undefined,
    { timeout: 30000 }
  );

  await page.evaluate((s) => {
    const ng = window.ng;
    let store = null;
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cmp = ng.getComponent(el);
      if (cmp && cmp.store && typeof cmp.store.dispatch === 'function') {
        store = cmp.store;
        break;
      }
    }
    if (!store) throw new Error('no component on the page exposes an NgRx Store');
    store.dispatch({ type: '[ScheduleFilter API] Set Schedule Filter Success', schedule_filter: s.filter });
    store.dispatch({ type: '[ScheduleList API] Set Schedule List Success', schedule_list: s.list });
    store.dispatch({ type: '[ScheduleBooking API] Set Schedule Booking Success', schedule_booking: s.booking });
    store.dispatch({ type: '[PassengerInfo API] Set Passenger Info Success', passengerInfo: s.passengers });
    store.dispatch({ type: '[Booking API] Set Booking Success', booking: s.bookingResult });
  }, seed);

  // The dispatches above ran outside the Angular zone, so nothing scheduled a tick.
  await page.evaluate(() => {
    const ng = window.ng;
    if (!ng || !ng.applyChanges || !ng.getComponent) return;
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cmp = ng.getComponent(el);
      if (cmp) {
        ng.applyChanges(cmp);
        return;
      }
    }
  });
}

/** Throws rather than saving: an error modal over the page is not evidence of an AC. */
async function assertClean(page, label) {
  const swal = await page.locator('.swal2-popup').count();
  const toast = await page.locator('.p-toast-message-error, .toast-error, .alert-danger').count();
  if (swal || toast) {
    const text = swal ? (await page.locator('.swal2-popup').first().innerText()).slice(0, 300) : '';
    throw new Error(`${label}: ${swal} swal / ${toast} error toast on screen — refusing to save. ${text}`);
  }
}

const visible = (page, selector) => page.locator(selector).isVisible().catch(() => false);

/** The whole block the AC is about: the booker card and the passenger card together. */
const BLOCK = '.form-container';

async function shoot(page, { width, height, name }) {
  const block = page.locator(BLOCK);
  // An element screenshot taller than the viewport is NOT stitched — the off-screen part
  // comes back blank white and the run still goes green. Grow from a live measurement of
  // the rect's BOTTOM (height alone ignores everything above it).
  const bottom = await block.evaluate((el) => Math.ceil(el.getBoundingClientRect().bottom + window.scrollY));
  if (bottom + 40 > height) {
    await page.setViewportSize({ width, height: bottom + 40 });
    await sleep(500);
    await assertClean(page, `${TAG} ${name} (after grow)`);
  }
  const file = path.join(OUT, `OBRS-1953-${TAG}-${name}.png`);
  await block.screenshot({ path: file });
  console.log(`  shot -> ${path.basename(file)}`);
  // Put the viewport back so the next state in this same context measures like the first.
  await page.setViewportSize({ width, height });
  await sleep(300);
}

async function openPage(browser, { width, height }, passengers) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    locale: 'th-TH',
  });
  await context.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'obrs-1953-capture-token');
    localStorage.setItem('auth_username', 'customer@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['user']));
    // The consent bar is `position: fixed; bottom: 0; z-index: 1000`, so an un-answered
    // question bleeds into an element screenshot once the viewport is grown.
    localStorage.setItem('obrs_analytics_consent_v1', 'denied');
  });

  const page = await context.newPage();

  // Catch-all FIRST — the last matching route registered is the one that runs.
  await page.route('**/api/**', async (route) => {
    const pathname = route.request().url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    for (const [re, make] of FIXTURES) {
      if (re.exec(pathname)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(make()) });
      }
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) });
  });
  await page.route('**/maps.googleapis.com/**', (r) => r.abort());
  await page.route('**/accounts.google.com/**', (r) => r.abort());
  await page.route('**/ssl.gstatic.com/**', (r) => r.abort());

  await page.goto(`${BASE}/passenger-info`, { waitUntil: 'networkidle' });
  await seedStore(page, storeSeed(passengers));
  await sleep(1200);

  await page.locator(BLOCK).waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('app-booker-info-form').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('app-passenger-info-form').waitFor({ state: 'visible', timeout: 30000 });

  // The loading swal is a real transient state, so wait before judging it.
  await page
    .waitForFunction(() => document.querySelectorAll('.swal2-popup').length === 0, undefined, { timeout: 15000 })
    .catch(() => {});

  return { context, page };
}

/** Measured, not declared: the rendered box is what the thumb gets. */
async function measureLink(page, selector) {
  const el = page.locator(selector);
  if (!(await el.count())) return null;
  return el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return {
      tagName: node.tagName,
      height: Math.round(r.height * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      tabIndex: node.tabIndex,
      ariaExpanded: node.getAttribute('aria-expanded'),
      text: (node.innerText || '').trim().slice(0, 60),
    };
  });
}

const LINKS = [
  '#booker-email-disclosure',
  '#booker-middleName-disclosure',
  '#middleName-disclosure-0',
  '#phoneNumber-disclosure-0',
];
const FIELDS = ['#booker-email', '#booker-middleName', '#middleName-0', '#phoneNumber-0'];
const REQUIRED = ['#booker-firstName', '#booker-lastName', '#booker-phoneNumber', '#firstName-0', '#lastName-0'];

async function captureAfter(browser, viewport, name) {
  const { context, page } = await openPage(browser, viewport, [passenger()]);
  const report = { name };

  // --- collapsed -----------------------------------------------------------
  for (const sel of REQUIRED) {
    if (!(await visible(page, sel))) {
      throw new Error(`${TAG} ${name}: required field ${sel} is not on screen — this card must not hide one`);
    }
  }
  for (const sel of FIELDS) {
    if (await visible(page, sel)) {
      throw new Error(`${TAG} ${name}: optional field ${sel} is still on screen while collapsed`);
    }
  }
  report.links = {};
  for (const sel of LINKS) {
    const m = await measureLink(page, sel);
    if (!m) throw new Error(`${TAG} ${name}: no disclosure link at ${sel}`);
    if (m.tagName !== 'BUTTON') {
      throw new Error(`${TAG} ${name}: ${sel} is a <${m.tagName}>, not a real <button> — Tab would skip it`);
    }
    if (m.tabIndex < 0) throw new Error(`${TAG} ${name}: ${sel} is not tabbable (tabIndex ${m.tabIndex})`);
    if (m.ariaExpanded !== 'false') {
      throw new Error(`${TAG} ${name}: ${sel} collapsed but aria-expanded=${m.ariaExpanded}`);
    }
    if (m.height < 44) {
      throw new Error(`${TAG} ${name}: ${sel} renders ${m.height}px tall — design-system.md §11 wants ≥ 44`);
    }
    report.links[sel] = m;
  }
  await assertClean(page, `${TAG} ${name} collapsed`);
  await shoot(page, { ...viewport, name: `collapsed-${name}` });

  // --- Tab/Enter, not a div with a click handler ---------------------------
  await page.locator('#booker-email-disclosure').focus();
  const focusedIsTheLink = await page.evaluate(() => document.activeElement?.id);
  if (focusedIsTheLink !== 'booker-email-disclosure') {
    throw new Error(`${TAG} ${name}: focus landed on #${focusedIsTheLink}, not the disclosure link`);
  }
  await page.keyboard.press('Enter');
  await sleep(400);
  if (!(await visible(page, '#booker-email'))) {
    throw new Error(`${TAG} ${name}: Enter on the focused link did not reveal the email field`);
  }
  report.enterOpensTheSection = true;

  // --- expanded ------------------------------------------------------------
  await page.locator('#booker-middleName-disclosure').click();
  await page.locator('#middleName-disclosure-0').click();
  await page.locator('#phoneNumber-disclosure-0').click();
  await sleep(500);
  for (const sel of FIELDS) {
    if (!(await visible(page, sel))) throw new Error(`${TAG} ${name}: ${sel} still hidden after expanding`);
  }
  // The hint is the whole point of the reworded link: the number is never stored on a
  // ticket and nobody calls it, so the screen has to say who we DO contact.
  const phoneHint = await page.locator('#phoneNumber-field-0 small').innerText().catch(() => '');
  if (!phoneHint.includes('ผู้จอง')) {
    throw new Error(`${TAG} ${name}: the passenger-phone hint does not name the booker — got ${JSON.stringify(phoneHint)}`);
  }
  report.passengerPhoneHint = phoneHint.trim();
  report.expandedAria = {};
  for (const sel of LINKS) {
    const m = await measureLink(page, sel);
    if (m.ariaExpanded !== 'true') {
      throw new Error(`${TAG} ${name}: ${sel} expanded but aria-expanded=${m.ariaExpanded}`);
    }
    report.expandedAria[sel] = m.ariaExpanded;
  }
  await assertClean(page, `${TAG} ${name} expanded`);
  await shoot(page, { ...viewport, name: `expanded-${name}` });

  // --- collapsing does not clear what was typed ----------------------------
  await page.fill('#booker-email', 'somchai.jaidee@example.com');
  await page.locator('#booker-email-disclosure').click();
  await sleep(400);
  if (await visible(page, '#booker-email')) {
    throw new Error(`${TAG} ${name}: the email field is still on screen after collapsing`);
  }
  await page.locator('#booker-email-disclosure').click();
  await sleep(400);
  const kept = await page.inputValue('#booker-email');
  if (kept !== 'somchai.jaidee@example.com') {
    throw new Error(`${TAG} ${name}: collapsing CLEARED the email — got ${JSON.stringify(kept)}`);
  }
  report.collapseKeepsTheValue = kept;

  await context.close();
  return report;
}

/**
 * The AC most likely to be got wrong: come back to the page with a value already in the
 * store (Back from /payment) and the section has to open itself, or the traveler sees an
 * empty form while the value sits in the store. The passenger row is the real path —
 * `passengerInfo` is the slice that is restored.
 */
async function captureRestored(browser, viewport, name) {
  const { context, page } = await openPage(browser, viewport, [
    passenger({ firstName: 'สมชาย', middleName: 'กลาง', lastName: 'ใจดี', phoneNumber: '0898765432' }),
  ]);

  if (!(await visible(page, '#phoneNumber-0'))) {
    throw new Error(`${TAG} ${name}: a row restored WITH a number did not open its own section`);
  }
  if (!(await visible(page, '#middleName-0'))) {
    throw new Error(`${TAG} ${name}: a row restored WITH a middle name did not open its own section`);
  }
  const shown = await page.inputValue('#phoneNumber-0');
  if (!shown.replace(/\D/g, '').includes('0898765432')) {
    throw new Error(`${TAG} ${name}: the section opened but shows ${JSON.stringify(shown)}`);
  }
  const m = await measureLink(page, '#phoneNumber-disclosure-0');
  if (m.ariaExpanded !== 'true') {
    throw new Error(`${TAG} ${name}: the section opened itself but aria-expanded=${m.ariaExpanded}`);
  }

  await assertClean(page, `${TAG} ${name}`);
  await shoot(page, { ...viewport, name: `restored-opens-itself-${name}` });

  await context.close();
  return { name, restoredValue: shown, ariaExpanded: m.ariaExpanded, linkHeight: m.height };
}

/** The baseline: every optional field in the first view, no disclosure link anywhere. */
async function captureBefore(browser, viewport, name) {
  const { context, page } = await openPage(browser, viewport, [passenger()]);

  const links = await page.locator(LINKS.join(', ')).count();
  if (links !== 0) throw new Error(`${TAG} ${name}: ${links} disclosure link(s) on the BASE branch — wrong tree?`);
  for (const sel of [...REQUIRED, ...FIELDS]) {
    if (!(await visible(page, sel))) {
      throw new Error(`${TAG} ${name}: ${sel} is not on screen on the base branch — wrong tree?`);
    }
  }

  await assertClean(page, `${TAG} ${name}`);
  await shoot(page, { ...viewport, name });

  await context.close();
  return { name, disclosureLinks: links, optionalFieldsInFirstView: FIELDS.length };
}

const DESKTOP = { width: 1400, height: 1100 };
const MOBILE = { width: 390, height: 844 };

(async () => {
  const browser = await chromium.launch();
  console.log(`${TAG} against ${BASE}`);
  const out = { TAG, BASE };

  if (TAG === 'BEFORE') {
    out.desktop = await captureBefore(browser, DESKTOP, 'desktop');
    out.mobile = await captureBefore(browser, MOBILE, 'mobile-390');
  } else {
    out.desktop = await captureAfter(browser, DESKTOP, 'desktop');
    out.mobile = await captureAfter(browser, MOBILE, 'mobile-390');
    out.restoredDesktop = await captureRestored(browser, DESKTOP, 'desktop');
    out.restoredMobile = await captureRestored(browser, MOBILE, 'mobile-390');
  }

  await browser.close();
  console.log(JSON.stringify(out, null, 2));
  console.log('DONE');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
