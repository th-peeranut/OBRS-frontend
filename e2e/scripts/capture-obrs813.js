// Standalone capture script for OBRS-813 visual evidence (not a Playwright test,
// not part of the suite).
//
//   node e2e/scripts/capture-obrs813.js --port 4300 --tag AFTER
//   node e2e/scripts/capture-obrs813.js --port 4400 --tag BEFORE
//
// No backend and no SIT: every /api call is fulfilled here, so BEFORE (an
// origin/dev throwaway worktree) and AFTER (this branch) can be served in
// parallel on two ports and shot in one pass against byte-identical data.
//
// Nothing is composed or force-styled. Each state is reached by driving the real
// UI — open the card's overflow menu, click Cancel booking — and the script
// REFUSES to save a shot whose DOM disagrees with what the picture will be read
// as claiming: no swal overlay, the modal actually open, and the offer present
// on AFTER / absent on BEFORE.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const PORT = arg('port', '4300');
const TAG = arg('tag', 'AFTER');
const BASE = `http://localhost:${PORT}`;

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-813');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const lookup = (id, code, label) => ({ id, code, display: { en: { label }, th: { label } } });

/** Same fixture as the gate spec: confirmed, one-way, never rescheduled, far out. */
const BOOKING = {
  id: 601,
  bookingNumber: 'B-000601',
  totalAmount: 500,
  status: 'confirmed',
  bookingType: 'one_way',
  bookingChannel: 'online',
  createdAt: '2026-07-20T10:00:00+07:00',
  rescheduleCount: 0,
  seatChangeCount: 0,
  stopChangeCount: 0,
  // OBRS-699: without the operator's window on the row the booking is
  // ineligible and the offer this capture exists to photograph is absent.
  // OBRS-1447: the cap is on the same contract now - `0` is UNLIMITED, absent withholds.
  rescheduleWindowHours: 2,
  rescheduleMaxDaysAhead: 60,
  rescheduleMaxCount: 0,
  contact: { fullName: 'Somchai Jaidee', phoneNumber: '0812345678' },
  bookingSchedules: [
    {
      id: 1601,
      departureDateTime: '2030-06-17T08:00:00+07:00',
      arrivalDateTime: '2030-06-17T10:30:00+07:00',
      legType: 'outbound',
      fromStop: lookup(1, 'nong_chak', 'Nong Chak'),
      toStop: lookup(4, 'bkr_mochit2', 'Mo Chit 2 Terminal'),
      routeSlug: 'chonburi_bangkok',
      seatingMode: 'ASSIGNED',
      tickets: [{ id: 7601, ticketNumber: 'T-007601', seatNumber: 'A1', status: 'confirmed' }],
    },
  ],
};

// The lane this card is about: 80% back, by hand, later.
const CANCEL_POLICY = ok({
  originalAmount: 500,
  refundAmount: 400,
  penaltyAmount: 100,
  refundRatePercent: '80%',
  refundMethod: 'MANUAL_REFUND_REQUIRED',
  policyWindow: 'EARLY',
  // OBRS-699 (D-4): the offer's "within N days" bullet is quoted from here.
  rescheduleWindowHours: 2,
  rescheduleMaxDaysAhead: 60,
});

async function seed(context, dark) {
  await context.addInitScript(
    (isDark) => {
      localStorage.setItem('app_language', 'en');
      localStorage.setItem('auth_token', 'obrs-813-capture-token');
      localStorage.setItem('auth_username', 'customer@system.local');
      localStorage.setItem('auth_roles', JSON.stringify(['user']));
      // A settled PDPA answer, or the consent bar covers the bottom of the shot.
      localStorage.setItem('obrs_analytics_consent_v1', 'denied');
      if (isDark) localStorage.setItem('app_admin_theme', 'dark');
      else localStorage.removeItem('app_admin_theme');
    },
    dark,
  );

  // Catch-all LAST is wrong under Playwright (last registered wins), so the
  // single handler branches instead of relying on registration order.
  await context.route('**/api/**', async (route) => {
    const pathname = route.request().url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (/\/bookings\/\d+\/cancel-policy$/.test(pathname)) return json(CANCEL_POLICY);
    if (/\/bookings\/me$/.test(pathname)) {
      return json(
        ok({
          content: [BOOKING],
          totalElements: 1,
          totalPages: 1,
          size: 100,
          number: 0,
          numberOfElements: 1,
        }),
      );
    }
    if (/\/stops$/.test(pathname)) {
      return json(ok([lookup(1, 'nong_chak', 'Nong Chak'), lookup(4, 'bkr_mochit2', 'Mo Chit 2 Terminal')]));
    }
    // The reschedule dialog's own background loads. Contract-shaped, not a bare
    // null: a null here reaches `toSeatAssignments` and the global error
    // handler puts a swal over the dialog the shot is FOR (OBRS-622's lesson).
    if (/\/bookings\/\d+\/tickets$/.test(pathname)) {
      return json(
        ok({
          bookingId: 601,
          bookingNumber: 'B-000601',
          bookingStatus: 'confirmed',
          totalTickets: 1,
          totalAmount: 500,
          journeys: [
            {
              legType: { code: 'outbound', display: { en: { label: 'Outbound' } } },
              fromStop: lookup(1, 'nong_chak', 'Nong Chak'),
              toStop: lookup(4, 'bkr_mochit2', 'Mo Chit 2 Terminal'),
              departureDateTime: '2030-06-17T08:00:00+07:00',
              arrivalDateTime: '2030-06-17T10:30:00+07:00',
              seatingMode: 'ASSIGNED',
              tickets: [
                {
                  id: 7601,
                  ticketNumber: 'T-007601',
                  passengerName: 'Somchai Jaidee',
                  seatNumber: 'A1',
                  status: { code: 'confirmed', display: { en: { label: 'Confirmed' } } },
                },
              ],
            },
          ],
        }),
      );
    }
    return json(ok(null));
  });
}

async function measure(page) {
  return page.evaluate(() => {
    const modal = document.querySelector('.crdm-modal');
    const offer = document.querySelector('.crdm-offer');
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    // `.crdm-backdrop` / `.reschedule-modal-backdrop` are `position: fixed`, so
    // the dialog is laid out against the VIEWPORT and `window.scrollY` moves
    // the page behind it, not the thing being shot. Adding scrollY here (the
    // OBRS-702 recipe, written for an in-flow sidebar) would overstate the
    // bottom and then fail on a scroll that cannot clip anything. What CAN
    // clip it is the backdrop's own `overflow-y: auto` — that is `ancestorScroll`.
    const scrolled = [];
    for (let el = modal; el && el !== document.documentElement; el = el.parentElement) {
      if (el.scrollTop !== 0) scrolled.push(`${el.tagName}.${el.className}=${el.scrollTop}`);
    }
    return {
      modalOpen: !!modal,
      /** Viewport coords — must fit inside the viewport height before shooting. */
      modalBottom: modal ? Math.round(modal.getBoundingClientRect().bottom) : 0,
      ancestorScroll: scrolled.join(', '),
      offerCount: offer ? 1 : 0,
      offerText: norm(offer?.textContent),
      modalText: norm(modal?.textContent),
      rescheduleDialogs: document.querySelectorAll('.reschedule-modal').length,
      isDark: document.body.classList.contains('is-dark'),
      swalCount: document.querySelectorAll('.swal2-popup').length,
      swalText: norm(document.querySelector('.swal2-popup')?.textContent),
      viewportHeight: window.innerHeight,
    };
  });
}

async function shoot(page, file, expect) {
  // The global loading swal ("Loading…") is a real, transient state on the way
  // into the reschedule dialog — wait it out rather than photographing it. If
  // it never clears, the assertion below still refuses the shot.
  await page
    .waitForFunction(() => document.querySelectorAll('.swal2-popup').length === 0, undefined, { timeout: 15_000 })
    .catch(() => undefined);

  const m = await measure(page);
  const fail = [];
  if (m.swalCount !== 0) fail.push(`swal overlay present (${m.swalCount})`);
  if (m.ancestorScroll) fail.push(`a scroll container is not at 0 (${m.ancestorScroll})`);
  if (m.modalBottom > m.viewportHeight) {
    fail.push(`dialog bottom ${m.modalBottom} is below the fold (${m.viewportHeight}) - the shot would be blank there`);
  }
  for (const [key, want] of Object.entries(expect)) {
    if (m[key] !== want) fail.push(`${key} is ${JSON.stringify(m[key])}, expected ${JSON.stringify(want)}`);
  }
  if (fail.length) {
    throw new Error(`REFUSING to save ${file}:\n  - ${fail.join('\n  - ')}\n  measured: ${JSON.stringify(m)}`);
  }

  const target = m.rescheduleDialogs ? '.reschedule-modal' : '.crdm-modal';
  await page.locator(target).screenshot({ path: path.join(ASSETS_DIR, file) });
  console.log(`saved ${file}  ${JSON.stringify(m).slice(0, 220)}`);
}

/** Land on /my-bookings with the cancel modal open. Returns the measurement. */
async function openCancelModal(page) {
  await page.goto(`${BASE}/my-bookings`, { waitUntil: 'domcontentloaded' });
  await page.locator('.booking-card', { hasText: 'B-000601' }).waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.booking-card .actions-menu-btn').click();
  await page.locator('.action-menu-item__label', { hasText: 'Cancel booking' }).click();
  await page.locator('.crdm-modal').waitFor({ state: 'visible' });

  // Grow the window from a live measurement rather than scrolling: an element
  // screenshot taller than the viewport comes back with the off-screen part
  // unpainted white, and it passes silently (OBRS-702). Opening the menu
  // scrolls the page a little, and `.crdm-backdrop` is its own scroll
  // container, so BOTH have to be back at 0 or the grown viewport still shoots
  // a clipped box.
  await resetScroll(page);
  const { modalBottom, viewportHeight } = await measure(page);
  const size = page.viewportSize();
  if (modalBottom + 40 > viewportHeight) {
    await page.setViewportSize({ width: size.width, height: modalBottom + 40 });
    await page.waitForTimeout(150);
    await resetScroll(page);
  }
}

/** window + every scrolled ancestor of the modal back to 0. */
async function resetScroll(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const modal = document.querySelector('.crdm-modal, .reschedule-modal');
    for (let el = modal; el && el !== document.documentElement; el = el.parentElement) {
      if (el.scrollTop !== 0) el.scrollTop = 0;
    }
  });
  await page.waitForTimeout(50);
}

(async () => {
  const browser = await chromium.launch();
  const offerExpected = TAG === 'AFTER';

  for (const dark of [false, true]) {
    const context = await browser.newContext({
      viewport: { width: 900, height: 900 },
      deviceScaleFactor: 2,
    });
    await seed(context, dark);
    const page = await context.newPage();

    await openCancelModal(page);
    await shoot(page, `OBRS-813-${TAG}-cancel-modal-${dark ? 'dark' : 'light'}.png`, {
      modalOpen: true,
      isDark: dark,
      offerCount: offerExpected ? 1 : 0,
    });

    // The door has to lead somewhere. Only on AFTER — on BEFORE there is no
    // button to press, which is the whole point of the card.
    if (offerExpected && !dark) {
      await page.locator('.crdm-offer__cta').click();
      await page.locator('.reschedule-modal').waitFor({ state: 'visible' });
      await resetScroll(page);
      await shoot(page, `OBRS-813-${TAG}-reschedule-dialog-from-offer.png`, {
        modalOpen: false,
        rescheduleDialogs: 1,
      });
    }

    await context.close();
  }

  await browser.close();
  console.log(`\n${TAG} capture complete -> ${ASSETS_DIR}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
