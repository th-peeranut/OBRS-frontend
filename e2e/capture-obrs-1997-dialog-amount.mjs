/**
 * OBRS-1997 evidence — the reschedule / change-stop payment step must price THIS
 * change, not whatever booking the NgRx store happens to still hold.
 *
 *   npx ng serve --port 4200
 *   OBRS_OUT_DIR=... OBRS_LABEL=BEFORE node e2e/capture-obrs-1997-dialog-amount.mjs
 *
 * WHAT IS REAL AND WHAT IS NOT, stated up front because the answer decides what this
 * proves. Real: the app, the dialogs, their templates, the payment leaf components,
 * `app-payment-summary`, every NgRx selector and reducer in between. Replaced: the
 * SERVER ROUND-TRIPS only - `/api/**` is answered from the table below, and the
 * estimate/confirm handoff is dispatched as the REAL actions the real effects emit
 * (`seedStore` in e2e/support/customer-pages.ts does the same, for the same reason).
 *
 * That split is the right one for this card: the defect is entirely client-side - the
 * dialogs never bound `[amountOverride]`, so the summary fell back to the store. AC1
 * asks that the displayed amount equal the ESTIMATE RESPONSE, so controlling that
 * response is what makes the comparison decidable rather than approximate.
 *
 * The verdict is measured.json, not the PNGs: the summary's footer text and the
 * presence of the stale breakdown body are read off the live DOM at each step.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e-evidence/obrs-1997');
const LABEL = process.env.OBRS_LABEL ?? 'RUN';

/** The one number this whole capture turns on: what the estimate says is owed. */
const ESTIMATE_NET = 137;
const BOOKING_ID = 501;

const ok = (data) => ({ code: 200, message: 'OK', data });
const lookup = (id, code, label) => ({ id, code, name: label, nameEn: label, nameTh: label });

const booking = {
  id: BOOKING_ID,
  bookingNumber: 'B-000501',
  // Deliberately NOT 137: this is the OLD booking's money, and it is exactly what the
  // broken build reaches for. Keeping them different is what makes the two runs legible.
  totalAmount: 360,
  netAmount: 360,
  status: 'confirmed',
  bookingType: 'one_way',
  bookingChannel: 'online',
  createdAt: '2026-07-20T10:00:00+07:00',
  rescheduleCount: 0,
  seatChangeCount: 0,
  stopChangeCount: 0,
  // OBRS-699 / OBRS-1447: absent means "no governing operator" and the overflow menu
  // withholds both actions, so the dialog can never open. Load-bearing, not decoration.
  rescheduleWindowHours: 2,
  rescheduleMaxDaysAhead: 60,
  rescheduleMaxCount: 0,
  contact: { fullName: 'Somchai Jaidee', phoneNumber: '0812345678' },
  bookingSchedules: [
    {
      id: 601,
      departureDateTime: '2030-06-17T08:00:00+07:00',
      arrivalDateTime: '2030-06-17T10:30:00+07:00',
      legType: 'outbound',
      fromStop: lookup(1, 'nong_chak', 'Nong Chak'),
      toStop: lookup(4, 'bkr_mochit2', 'Mo Chit 2 Terminal'),
      routeSlug: 'chonburi_bangkok',
      seatingMode: 'ASSIGNED',
      tickets: [{ id: 701, ticketNumber: 'T-000701', seatNumber: 'A1', status: 'confirmed' }],
    },
  ],
};

const FIXTURES = [
  [/\/bookings\/me$/, () => ok({ content: [booking], totalElements: 1, totalPages: 1, size: 100, number: 0, numberOfElements: 1 })],
  [/\/reschedule-policy$/, () => ok({ rescheduleWindowHours: 2, rescheduleMaxDaysAhead: 60, rescheduleFeeLateThb: 30, rescheduleMaxCount: 0 })],
];

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
  const page = await context.newPage();
  const measured = { label: LABEL, base: BASE, at: new Date().toISOString(), estimateNetAmount: ESTIMATE_NET, oldBookingTotal: booking.totalAmount };

  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
    localStorage.setItem('auth_token', 'obrs-1997-capture-token');
    localStorage.setItem('auth_username', 'customer@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['user']));
    // Deliberately NOT seeding `active_booking_id`: on /my-bookings it makes the page
    // try to verify a total it has no grant for and raise a modal that eats the
    // overflow-menu click. Measured against a probe with and without it.
  });

  await page.route('**/api/**', async (route) => {
    const pathname = route.request().url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    for (const [re, make] of FIXTURES) {
      if (re.test(pathname)) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(make()) });
        return;
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) });
  });
  await page.route('**/maps.googleapis.com/**', (r) => r.abort());
  await page.route('**/accounts.google.com/**', (r) => r.abort());
  await page.route('**/ssl.gstatic.com/**', (r) => r.abort());

  /** Dispatch a real action object into the real root Store (see seedStore's note). */
  const dispatch = async (action) =>
    page.evaluate((a) => {
      const ng = window.ng;
      if (!ng || !ng.getComponent) throw new Error('window.ng is absent -- not a development build?');
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const cmp = ng.getComponent(el);
        if (cmp && cmp.store && typeof cmp.store.dispatch === 'function') {
          cmp.store.dispatch(a);
          return;
        }
      }
      throw new Error('no component on the page exposes an NgRx Store');
    }, action);

  /**
   * What the payment step's inline summary is showing. `footer` is the total line both
   * branches render; `hasStaleBreakdown` is TRUE only on the @else branch, i.e. only when
   * the summary is pricing the store's leftover booking instead of this change.
   */
  const readSummary = async () =>
    page.evaluate(() => {
      const el = document.querySelector('app-payment-summary');
      if (!el) return { present: false };
      const footer = el.querySelector('.card-footer');
      return {
        present: true,
        footer: footer ? footer.innerText.replace(/\s+/g, ' ').trim() : null,
        hasStaleBreakdown: !!el.querySelector('.card-body'),
        allText: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 240),
      };
    });

  /**
   * The `ok(null)` catch-all answers endpoints this capture does not model, and at least
   * one of them makes the page raise a SweetAlert. It is centred and modal, so it eats the
   * overflow-menu click. Record what it said before dismissing it - a modal nobody read is
   * how a capture ends up proving something about the wrong screen.
   */
  const dismissAlerts = async () => {
    for (let i = 0; i < 4; i++) {
      const box = page.locator('.swal2-container');
      if (!(await box.count())) return;
      const text = await box.first().innerText().catch(() => '');
      (measured.dismissedAlerts ??= []).push(text.replace(/\s+/g, ' ').trim().slice(0, 160));
      await page.locator('.swal2-confirm, .swal2-close').first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(700);
    }
  };

  /**
   * The modal is raised ASYNCHRONOUSLY after load, so dismissing once and then clicking
   * races it - measured: a single dismiss saw zero containers and the click still spent
   * its whole 30 s being intercepted. Alternate dismiss and click instead, with a short
   * per-attempt timeout, and keep every alert's text in measured.json.
   */
  const openMenuItem = async (label) => {
    let lastErr = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      await dismissAlerts();
      try {
        await page.locator('button.actions-menu-btn').first().click({ timeout: 5000 });
        await page.locator('.my-bookings-action-menu').getByText(label, { exact: true }).click({ timeout: 5000 });
        return;
      } catch (e) {
        lastErr = e;
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(500);
      }
    }
    await writeFile(path.join(OUT, `${LABEL}-debug-menu.txt`), JSON.stringify(measured, null, 2), 'utf8');
    await page.screenshot({ path: path.join(OUT, `${LABEL}-debug-menu.png`), fullPage: true });
    throw lastErr;
  };

  const shoot = async (file) => page.screenshot({ path: path.join(OUT, `${LABEL}-${file}.png`), fullPage: true });

  await page.goto(`${BASE}/my-bookings`, { waitUntil: 'networkidle' });
  await page.locator('app-my-bookings').waitFor({ timeout: 20000 });

  // ---------- reschedule ----------
  await openMenuItem('Reschedule');
  await page.locator('app-reschedule-date-picker-step p-datepicker').waitFor({ timeout: 15000 });
  await dispatch({
    type: '[MyBookings API] Load reschedule estimate success',
    estimate: { oldFare: 360, newFare: 497, fareDiff: 137, rescheduleFee: 0, netAmount: ESTIMATE_NET, paymentDirection: 'charge', cashRefundEligible: false },
  });
  await dispatch({ type: '[MyBookings API] Reschedule requires payment', bookingId: BOOKING_ID, paymentIntentId: 42 });
  await page.waitForTimeout(1200);
  await shoot('1-reschedule-payment-step');
  measured.reschedule = await readSummary();

  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  // ---------- change stop ----------
  await openMenuItem('Change stop');
  await page.waitForTimeout(1200);
  await dispatch({
    type: '[MyBookings API] Load change stop estimate success',
    estimate: { oldFare: 360, newFare: 497, fareDiff: 137, netAmount: ESTIMATE_NET, paymentDirection: 'charge' },
  });
  await dispatch({ type: '[MyBookings API] Change stop requires payment', bookingId: BOOKING_ID, paymentIntentId: 43 });
  await page.waitForTimeout(1200);
  await shoot('2-change-stop-payment-step');
  measured.changeStop = await readSummary();

  // The verdict, stated as a comparison rather than left to whoever opens the PNG.
  const shows = (s) => (s && s.footer ? /\b137\b/.test(s.footer) : false);
  const showsOld = (s) => (s && s.footer ? /\b360\b/.test(s.footer) : false);
  measured.verdict = {
    rescheduleShowsEstimate: shows(measured.reschedule),
    rescheduleShowsOldBookingTotal: showsOld(measured.reschedule),
    rescheduleFellBackToStore: measured.reschedule?.hasStaleBreakdown === true,
    changeStopShowsEstimate: shows(measured.changeStop),
    changeStopShowsOldBookingTotal: showsOld(measured.changeStop),
    changeStopFellBackToStore: measured.changeStop?.hasStaleBreakdown === true,
  };

  await writeFile(path.join(OUT, `${LABEL}-measured.json`), JSON.stringify(measured, null, 2), 'utf8');
  console.log(JSON.stringify(measured, null, 2));
  await browser.close();
};

run().catch(async (e) => { console.error('CAPTURE FAILED:', e.message); process.exit(1); });
