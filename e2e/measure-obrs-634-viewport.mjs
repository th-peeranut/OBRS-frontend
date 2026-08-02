/**
 * OBRS-634 — repeatable mobile-viewport overflow measurement (AC-5).
 *
 * WHAT IT PROVES
 *   AC-1  `window.innerWidth` equals the device width (±1px) once the page has
 *         loaded, on `/schedule-booking` and `/payment`.
 *   AC-2  No element under `<body>` has `max(scrollWidth, boundingRect.width)`
 *         greater than the device width, EXCEPT one that is itself, or lives
 *         inside, a deliberate `overflow-x: auto|scroll` container.
 *   AC-4  The `/my-bookings` `⋯` menu sits fully inside the screen.
 *
 * WHY `scrollWidth > innerWidth` IS NOT THE CHECK
 *   Chrome's shrink-to-fit widens the layout viewport until the widest box
 *   fits, so AFTER the damage is done `document.scrollWidth === innerWidth`
 *   exactly. The observable is `window.innerWidth > device width` — everything
 *   here is measured against the DEVICE width passed to the emulator, never
 *   against `innerWidth`.
 *
 * RUN
 *   node e2e/measure-obrs-634-viewport.mjs [baseUrl] [label] [outDir]
 *     baseUrl  default http://localhost:4266   (an `ng serve --configuration sit`)
 *     label    default `before`                (names the output folder)
 *   env: OBRS_API_URL (default the SIT backend), OBRS_EMAIL, OBRS_PASSWORD.
 *
 * The departure date is PROBED against the live search endpoint, never
 * hardcoded — seeded trips move and a hardcoded date decays into "0 results",
 * which would measure an empty page and pass every assertion.
 */
import pwNs from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const chromium = pwNs.chromium ?? pwNs.default?.chromium;

const BASE = process.argv[2] || 'http://localhost:4266';
const LABEL = process.argv[3] || 'before';
const OUT = process.argv[4] || join(process.cwd(), 'e2e', 'out', `obrs-634-${LABEL}`);

const API = process.env['OBRS_API_URL'] || 'https://sit-obrs-backend.koyeb.app';
const EMAIL = process.env['OBRS_EMAIL'] || 'customer@system.local';
const PASSWORD = process.env['OBRS_PASSWORD'] || 'P@ssw0rd';

/** Stop ids/slugs come from GET /api/stops; the pair is a long-label route on
 *  purpose — a short one would not exercise the `.route` truncation at all. */
const FROM = { id: 1, slug: 'nong_chak' };
const TO = { id: 25, slug: 'mo_chit_2_bus_terminal' };

const DEVICES = [
  { name: 'iphone12-390x664', width: 390, height: 664, dsf: 3, mobile: true },
  { name: 'android-360x740', width: 360, height: 740, dsf: 3, mobile: true },
  // AC-6's control arm. Desktop must not move, and "it looks the same" is not a
  // measurement — this row records the geometry of the boxes the fix touches so
  // before/after can be diffed number by number. 1536x864 @1.25 is the owner's
  // real viewport.
  { name: 'desktop-1536x864', width: 1536, height: 864, dsf: 1.25, mobile: false },
];

/** Boxes whose geometry the fix could plausibly move. Recorded on every device,
 *  so the desktop rows are a before/after diff rather than an impression. */
const PROBE_SELECTORS = [
  '.schedule-item',
  '.schedule-item .left',
  '.schedule-item .time-info',
  '.schedule-item .time-info img',
  '.schedule-item .route',
  'app-payment-info .card-body',
  'app-payment-info .schedule-info',
  'app-payment-info .time-info',
  'app-payment-info .time-info img',
];

const UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/125.0.0.0 Mobile Safari/537.36';

mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);

/* ------------------------------------------------------------------ probing */

async function probeDepartureDate() {
  const today = new Date();
  for (let i = 1; i <= 21; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const res = await fetch(`${API}/api/schedules/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingType: 'one_way',
        numberOfPassengers: 1,
        fromStop: FROM.slug,
        toStop: TO.slug,
        departureDate: iso,
      }),
    });
    if (!res.ok) continue;
    const json = await res.json();
    const n = json?.data?.departureSchedules?.length ?? 0;
    if (n > 0) {
      log(`probe: ${iso} has ${n} departure schedule(s) — using it`);
      return iso;
    }
  }
  throw new Error('probe: no date in the next 21 days returns a schedule');
}

/* -------------------------------------------------------------- measurement */

/** Runs in the page. Returns every box wider than the DEVICE width, with the
 *  reason it is (or is not) allowed to be. */
function collect({ deviceWidth, probeSelectors }) {
  const cssPath = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 6; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) {
        s += `#${n.id}`;
        parts.unshift(s);
        break;
      }
      const cls = (n.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
      if (cls.length) s += '.' + cls.slice(0, 3).join('.');
      parts.unshift(s);
      if (n.parentElement === document.body) break;
    }
    return parts.join(' > ');
  };

  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    const w = Math.max(el.scrollWidth, r.width);
    if (w <= deviceWidth + 1) continue;

    // A box may legitimately be wider than the screen when it, or an ancestor,
    // clips it with a scroller. `.stepper-container` is the in-repo precedent.
    let allowedBy = null;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') {
        allowedBy = cssPath(n);
        break;
      }
    }

    const cs = getComputedStyle(el);
    offenders.push({
      path: cssPath(el),
      widest: Math.round(w),
      scrollWidth: el.scrollWidth,
      rectWidth: +r.width.toFixed(1),
      rectLeft: +r.left.toFixed(1),
      rectRight: +r.right.toFixed(1),
      allowedBy,
      whiteSpace: cs.whiteSpace,
      minWidth: cs.minWidth,
      maxWidth: cs.maxWidth,
      flexShrink: cs.flexShrink,
    });
  }
  offenders.sort((a, b) => b.widest - a.widest);

  const probes = {};
  for (const sel of probeSelectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    probes[sel] = {
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      left: +r.left.toFixed(1),
      top: +r.top.toFixed(1),
      scrollWidth: el.scrollWidth,
    };
  }

  return {
    probes,
    innerWidth: window.innerWidth,
    outerWidth: window.outerWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    visualViewport: window.visualViewport
      ? { width: +window.visualViewport.width.toFixed(1), scale: window.visualViewport.scale }
      : null,
    offenderCount: offenders.length,
    violationCount: offenders.filter((o) => !o.allowedBy).length,
    offenders: offenders.slice(0, 25),
  };
}

async function measurePage(page, deviceWidth, pageName, device) {
  // Layout has to be settled: a mid-load page is narrower than the finished one
  // and would under-report. Two rAFs after the app's own readiness signal.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );
  const m = await page.evaluate(collect, {
    deviceWidth,
    probeSelectors: PROBE_SELECTORS,
  });
  m.page = pageName;
  m.device = device.name;
  m.deviceWidth = deviceWidth;
  m.url = page.url();
  m.ac1Pass = Math.abs(m.innerWidth - deviceWidth) <= 1;
  m.ac2Pass = m.violationCount === 0;
  // Shoot the box the card is about, not whatever happens to be at scroll 0.
  // A screenshot always "succeeds", so the subject is scrolled to and its text
  // read back before the file is written.
  const SUBJECT = {
    'schedule-booking': '.schedule-item',
    payment: 'app-payment-info .card-body',
  };
  const subjectSel = SUBJECT[pageName];
  m.subject = null;
  if (subjectSel) {
    const subject = page.locator(subjectSel).first();
    if (await subject.isVisible().catch(() => false)) {
      await subject.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      m.subject = {
        selector: subjectSel,
        text: (await subject.innerText()).replace(/\s+/g, ' ').trim().slice(0, 90),
      };
    }
  }
  await page.screenshot({
    path: join(OUT, `${device.name}__${pageName}.png`),
    fullPage: false,
  });
  if (m.subject) log(`      subject ${m.subject.selector}: "${m.subject.text}"`);
  log(
    `  [${device.name}] ${pageName}: innerWidth=${m.innerWidth} (device ${deviceWidth}) ` +
      `AC1=${m.ac1Pass ? 'PASS' : 'FAIL'} · over-wide=${m.offenderCount} ` +
      `violations=${m.violationCount} AC2=${m.ac2Pass ? 'PASS' : 'FAIL'}`
  );
  for (const o of m.offenders.slice(0, 6)) {
    log(
      `      ${o.allowedBy ? 'allowed ' : 'VIOLATE '} ${o.widest}px  ${o.path}` +
        (o.allowedBy ? `   (clipped by ${o.allowedBy})` : '')
    );
  }
  return m;
}

/* -------------------------------------------------------------------- flow */

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').waitFor({ state: 'visible', timeout: 90000 });
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('button[type="submit"].login-btn').click();
  // The URL still reads /login for a beat after success — the token is the signal.
  await page.waitForFunction(() => !!localStorage.getItem('auth_token'), null, {
    timeout: 90000,
  });
}

/** Seeds the OBRS-903 cross-tab booking context so `/schedule-booking` re-runs
 *  the search on arrival (ScheduleBookingFilterComponent auto-searches whenever
 *  the restored filter is complete). Two API-free lines replace the whole
 *  home-page dropdown + p-calendar gauntlet. */
function bookingContextInit(departureDate) {
  return ({ fromId, toId, date }) => {
    localStorage.setItem(
      'obrs.booking_context',
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        value: {
          filter: {
            roundTrip: 1,
            passengerInfo: [
              { type: 'ADULT', count: 1 },
              { type: 'KIDS', count: 0 },
            ],
            startStationId: fromId,
            stopStationId: toId,
            departureDate: date,
            returnDate: null,
          },
          searchPayload: null,
          selection: null,
        },
      })
    );
  };
}

async function dismissAlert(page) {
  const ok = page.locator('.swal2-confirm');
  if (await ok.isVisible().catch(() => false)) {
    await ok.click();
    await page.waitForTimeout(400);
  }
}

/** The analytics consent banner is a fixed overlay on a first visit. It is
 *  dismissed only AFTER the first page is measured, so the measurement still
 *  describes what a first-time customer actually sees. */
async function dismissConsentBanner(page) {
  const btn = page.locator('.consent-banner__btn--accept');
  if (await btn.isVisible().catch(() => false)) {
    await btn.click({ force: true });
    await page.waitForTimeout(400);
    return true;
  }
  return false;
}

/** Checks a radio/checkbox by dispatching the click on the input itself.
 *  `check({force:true})` still clicks a COORDINATE, so on an over-wide layout
 *  the point can land on a neighbouring box and the control silently stays
 *  unchecked — which then reads as "the form is invalid for no reason".
 *  Asserts the resulting state rather than trusting the dispatch. */
async function tick(page, selector) {
  const el = page.locator(selector);
  await el.waitFor({ state: 'attached', timeout: 30000 });
  if (!(await el.isChecked())) await el.dispatchEvent('click');
  if (!(await el.isChecked())) {
    await el.evaluate((n) => {
      n.checked = true;
      n.dispatchEvent(new Event('input', { bubbles: true }));
      n.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  if (!(await el.isChecked())) throw new Error(`could not check ${selector}`);
  await page.waitForTimeout(200);
}

/** `app-dropdown-obrs` is a Bootstrap dropdown, not a `<select>`: open the
 *  toggle, then pick an option out of `.dropdown-menu`. */
async function pickDropdownOption(page, hostSelector, index = 0) {
  const host = page.locator(hostSelector);
  await host.waitFor({ state: 'visible', timeout: 30000 });
  await host.locator('.dropdown-toggle').click({ force: true });
  const option = host.locator('.dropdown-menu .dropdown-option').nth(index);
  await option.waitFor({ state: 'visible', timeout: 15000 });
  await option.dispatchEvent('click');
  await page.waitForTimeout(300);
}

async function hasEmptyDropdown(page, hostSelector) {
  return page
    .locator(`${hostSelector} .value-text`)
    .innerText()
    .then((t) => t.trim().length === 0)
    .catch(() => false);
}

/** Clicking through an over-wide layout is exactly what this card is about:
 *  a real click lands on whatever box is covering the button. Dispatching the
 *  event on the element itself drives the flow past the symptom without
 *  pretending it isn't there — and the caller still asserts the navigation. */
async function clickThrough(page, selector) {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: 60000 });
  await page.locator(selector).first().dispatchEvent('click');
}

async function run(device, departureDate) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.dsf,
    // isMobile is the load-bearing flag: it turns on Chrome's mobile viewport
    // handling, which is what shrink-to-fit lives in. Without it innerWidth is
    // always exactly the viewport width and the bug is invisible.
    isMobile: device.mobile,
    hasTouch: device.mobile,
    ...(device.mobile ? { userAgent: UA } : {}),
  });
  await ctx.addInitScript(bookingContextInit(departureDate), {
    fromId: FROM.id,
    toId: TO.id,
    date: departureDate,
  });

  const page = await ctx.newPage();
  const results = [];

  try {
    await login(page);

    // ---- /schedule-booking -------------------------------------------------
    await page.goto(`${BASE}/schedule-booking`, { waitUntil: 'domcontentloaded' });
    // The restored filter is patched into the form immediately, but the
    // component's auto-search maps station id → slug against the station list,
    // which arrives later over HTTP — so on a cold load the auto-search sees no
    // slugs and never fires. Pressing the page's own search button once the
    // list is in is the same dispatch, without the race.
    await page.locator('.btn-search').waitFor({ state: 'visible', timeout: 120000 });
    let searched = false;
    for (let attempt = 0; attempt < 8 && !searched; attempt++) {
      // dispatchEvent, not click(): the consent banner is a fixed overlay and a
      // coordinate click — even forced — is swallowed by whatever sits on top.
      await page.locator('.btn-search').dispatchEvent('click');
      searched = await page
        .locator('.schedule-item')
        .first()
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      if (!searched) await dismissAlert(page);
    }
    if (!searched) throw new Error('/schedule-booking: no .schedule-item after 8 searches');
    results.push(await measurePage(page, device.width, 'schedule-booking', device));

    // ---- /payment ----------------------------------------------------------
    await dismissConsentBanner(page);
    await clickThrough(page, '.select-btn');
    await page.waitForURL('**/review-schedule-booking', { timeout: 60000 });
    // A sticky footer intercepts the confirm button on a phone viewport.
    await clickThrough(page, '.btn-confirm');
    await page.waitForURL('**/passenger-info', { timeout: 60000 });

    await page.locator('#booker-firstName').waitFor({ state: 'visible', timeout: 60000 });
    // Title is a required `app-dropdown-obrs`, and it is set FIRST: the
    // useBookerInfo copy below carries whatever the booker holds at that
    // moment, so an empty title copies an empty title and "ถัดไป" stays dead.
    await pickDropdownOption(page, '#booker-title');
    await page.locator('#booker-firstName').fill('Wiput');
    await page.locator('#booker-lastName').fill('Testchai');
    await page.locator('#booker-phoneNumber').fill('0812345678');
    // Required by `bookerForm` even though the label carries no asterisk —
    // leaving it empty is what keeps "ถัดไป" disabled with no visible error.
    await page.locator('#booker-email').fill('obrs634.measure@example.com');
    await tick(page, '#booker-gender_male');
    // Copies booker → passenger 0; without it the per-passenger form stays
    // invalid and "ถัดไป" never enables.
    await tick(page, '#useBookerInfo-0');
    await page.waitForTimeout(500);
    if (await hasEmptyDropdown(page, '#title-0')) {
      await pickDropdownOption(page, '#title-0');
    }

    // FIXED-seating schedules require a seat before the form validates; an OPEN
    // one has no seat map at all, so this is best-effort by design.
    const seat = page.locator('.seat-map-inner button:not([disabled])').first();
    if (await seat.isVisible().catch(() => false)) {
      await seat.click({ force: true });
    }

    const next = page.locator('.btn-next');
    await next.waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(
      () => {
        const b = document.querySelector('.btn-next');
        return !!b && !b.hasAttribute('disabled') && !b.disabled;
      },
      null,
      { timeout: 60000 }
    );
    await next.dispatchEvent('click');
    await page.waitForURL('**/payment', { timeout: 120000 });
    await dismissAlert(page);
    await page.locator('.total-container').waitFor({ state: 'visible', timeout: 60000 });
    results.push(await measurePage(page, device.width, 'payment', device));

    // ---- /my-bookings ⋯ menu (AC-4) ---------------------------------------
    await page.goto(`${BASE}/my-bookings`, { waitUntil: 'domcontentloaded' });
    await page
      .locator('.actions-menu-btn')
      .first()
      .waitFor({ state: 'visible', timeout: 120000 });
    await page.locator('.actions-menu-btn').first().click();
    await page.locator('.my-bookings-action-menu').waitFor({
      state: 'visible',
      timeout: 30000,
    });
    const menu = await page.evaluate(() => {
      const el = document.querySelector('.my-bookings-action-menu');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: +r.left.toFixed(1),
        right: +r.right.toFixed(1),
        width: +r.width.toFixed(1),
      };
    });
    const m = await measurePage(page, device.width, 'my-bookings-menu-open', device);
    m.menuRect = menu;
    m.ac4Pass =
      !!menu && menu.left >= -1 && menu.right <= device.width + 1 && m.ac1Pass;
    log(
      `  [${device.name}] ⋯ menu: left=${menu?.left} right=${menu?.right} ` +
        `width=${menu?.width} AC4=${m.ac4Pass ? 'PASS' : 'FAIL'}`
    );
    results.push(m);
  } finally {
    await ctx.close();
    await browser.close();
  }

  return results;
}

/* -------------------------------------------------------------------- main */

const departureDate = await probeDepartureDate();
const all = [];
for (const device of DEVICES) {
  log(`\n=== ${device.name} (${LABEL}) ===`);
  all.push(...(await run(device, departureDate)));
}

const summary = {
  label: LABEL,
  baseUrl: BASE,
  apiUrl: API,
  departureDate,
  route: `${FROM.slug} -> ${TO.slug}`,
  takenAt: new Date().toISOString(),
  results: all,
};
writeFileSync(join(OUT, 'measurements.json'), JSON.stringify(summary, null, 2));

const lines = [
  `OBRS-634 viewport measurement — ${LABEL}`,
  `base=${BASE}  api=${API}  departureDate=${departureDate}  route=${summary.route}`,
  `takenAt=${summary.takenAt}`,
  '',
  'device                page                     deviceW  innerW  AC1   over-wide  violations  AC2',
];
for (const r of all) {
  lines.push(
    `${r.device.padEnd(20)}  ${r.page.padEnd(24)} ${String(r.deviceWidth).padStart(7)} ` +
      `${String(r.innerWidth).padStart(7)}  ${(r.ac1Pass ? 'PASS' : 'FAIL').padEnd(5)} ` +
      `${String(r.offenderCount).padStart(9)}  ${String(r.violationCount).padStart(10)}  ` +
      `${r.ac2Pass ? 'PASS' : 'FAIL'}`
  );
}
lines.push('', 'Violations (over device width and NOT inside an overflow-x scroller):');
for (const r of all) {
  const v = r.offenders.filter((o) => !o.allowedBy);
  if (!v.length) {
    lines.push(`  ${r.device} / ${r.page}: none`);
    continue;
  }
  lines.push(`  ${r.device} / ${r.page}:`);
  for (const o of v.slice(0, 12)) {
    lines.push(
      `    ${String(o.widest).padStart(5)}px  ws=${o.whiteSpace} minW=${o.minWidth} ` +
        `maxW=${o.maxWidth} shrink=${o.flexShrink}  ${o.path}`
    );
  }
}
lines.push(
  '',
  'Probe geometry — the boxes the fix touches. The desktop rows are AC-6:',
  'they must be byte-identical between the before and after runs.'
);
for (const r of all) {
  const keys = Object.keys(r.probes || {});
  if (!keys.length) continue;
  lines.push(`  ${r.device} / ${r.page}:`);
  for (const k of keys) {
    const p = r.probes[k];
    lines.push(
      `    ${k.padEnd(34)} w=${String(p.w).padStart(7)} h=${String(p.h).padStart(6)} ` +
        `left=${String(p.left).padStart(7)} scrollW=${String(p.scrollWidth).padStart(5)}`
    );
  }
}

const menuRows = all.filter((r) => r.menuRect);
if (menuRows.length) {
  lines.push('', 'AC-4 — /my-bookings ⋯ menu box:');
  for (const r of menuRows) {
    lines.push(
      `  ${r.device}: left=${r.menuRect.left} right=${r.menuRect.right} ` +
        `width=${r.menuRect.width} deviceW=${r.deviceWidth} -> ${r.ac4Pass ? 'PASS' : 'FAIL'}`
    );
  }
}
const text = lines.join('\n');
writeFileSync(join(OUT, 'measurements.txt'), text + '\n');
log('\n' + text);
log(`\nwrote ${join(OUT, 'measurements.json')}`);

const failed = all.some((r) => !r.ac1Pass || !r.ac2Pass || r.ac4Pass === false);
process.exit(failed ? 1 : 0);
