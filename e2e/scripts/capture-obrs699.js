// Standalone capture script for OBRS-699 visual evidence. Not a Playwright test and not part of
// any suite — run it by hand:
//
//   npx ng serve --port 4200
//   node e2e/scripts/capture-obrs699.js
//
//   OBRS699_BASE_URL     override the dev-server origin (default http://localhost:4200)
//   OBRS699_CAPTURE_DIR  override where the PNGs land (default docs/manual-tests/assets/OBRS-699)
//
// No backend. Every /api call is stubbed with page.route() (the OBRS-677 lane).
//
// ── Why every stubbed number below is a value the platform default could NOT produce ──
// This card's whole subject is that the frontend used to state numbers of its own. A frame built on
// the platform defaults (2 / 2 / 60 / 24 / 0.8 / 0.5) cannot tell "read off the wire" from "still
// hardcoded" — both render identically. So the fixtures use 5 / 45 / 36 / 0.90 / 0.40 / 120, the
// same technique obrs-627-refund-policy.spec.ts uses (36h / 3h / 90% / 45%) for the same reason.
// Anything on screen that matches these came from the response.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.OBRS699_BASE_URL || 'http://localhost:4200';
const ASSETS_DIR =
  process.env.OBRS699_CAPTURE_DIR ||
  path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-699');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

// The seven values, none of them a platform default.
const POLICY_VALUES = {
  cancelWindowHours: 5,
  rescheduleWindowHours: 5,
  rescheduleMaxDaysAhead: 45,
  earlyWindowHours: 36,
  cancelRefundRateEarly: 0.9, // renders as 90 — the page converts at its two boundaries
  cancelRefundRateLate: 0.4, // renders as 40
  rescheduleFeeLateThb: 120,
};

const ALL_DEFAULT_FLAGS = {
  cancelWindowHoursOverridden: false,
  rescheduleWindowHoursOverridden: false,
  rescheduleMaxDaysAheadOverridden: false,
  earlyWindowHoursOverridden: false,
  cancelRefundRateEarlyOverridden: false,
  cancelRefundRateLateOverridden: false,
  rescheduleFeeLateThbOverridden: false,
};

// 3 of 7. The arm that today can only arrive from data written outside this UI (PUT/DELETE move all
// seven together), and the one a page rendering "all default" would be lying about.
const MIXED_FLAGS = {
  ...ALL_DEFAULT_FLAGS,
  cancelWindowHoursOverridden: true,
  cancelRefundRateEarlyOverridden: true,
  earlyWindowHoursOverridden: true,
};

const policyConfig = (flags) => ok({ ...POLICY_VALUES, ...flags });

// ── my-bookings (frame 5) ────────────────────────────────────────────────────────────────────────
// The frame has to prove the 4h-vs-2h drift is closed, so the departure is chosen to make the OLD
// and NEW code disagree:
//
//   departure = now + 3h, wire rescheduleWindowHours = 1
//     old code: reschedule (const 2) SHOWS, change-seat (const 4) and change-stop (const 4) HIDE
//     new code: all three read the wire's 1 → all three SHOW
//
// 1 is not 2, not 4 and not 60, so no reintroduced literal reproduces this frame either.
const RESCHEDULE_WINDOW_ON_THE_WIRE = 1;
const departureInHours = (hours) => new Date(Date.now() + hours * 3600 * 1000).toISOString();

const myBookings = () =>
  ok({
    content: [
      {
        id: 699,
        bookingNumber: 'BK-699',
        totalAmount: 500,
        status: 'confirmed',
        bookingType: 'one_way',
        bookingChannel: 'online',
        createdAt: '2026-08-01T09:00:00+07:00',
        rescheduleCount: 0,
        seatChangeCount: 0,
        stopChangeCount: 0,
        // OBRS-699: the two fields this card added to BookingRespDto.
        rescheduleWindowHours: RESCHEDULE_WINDOW_ON_THE_WIRE,
        rescheduleMaxDaysAhead: 45,
        contact: { fullName: 'สมชาย ใจดี', phoneNumber: '0812345678' },
        bookingSchedules: [
          {
            id: 1,
            departureDateTime: departureInHours(3),
            passengerCount: 1,
            seatingMode: 'ASSIGNED', // change-seat is a domain no-op on OPEN seating
            fromStop: { id: 1, slug: 'nong_chak', translations: [] },
            toStop: { id: 2, slug: 'mo_chit', translations: [] },
            tickets: [{ id: 11, seatNumber: '1' }],
          },
        ],
      },
    ],
    totalElements: 1,
    totalPages: 1,
    number: 0,
    size: 20,
  });

// ── /admin/bookings override-cancel modal (frame 4) ──────────────────────────────────────────────
// Departure is 2026-09-20; the deadline is over a month EARLIER. No `departure - 2h` derivation can
// produce it, which is exactly the point: the banner's date can only have come off the wire. It also
// puts the modal in its violation state, so the frame carries the AC2 consequence (the reason field
// becomes mandatory) in the same shot.
const OVERRIDE_DEPARTURE = '2026-09-20T08:00:00+07:00';
const OVERRIDE_CANCELLATION_DEADLINE = '2026-08-11T14:35:00+07:00';

const ADMIN_BOOKINGS_PAGE = ok({
  content: [
    {
      id: 699,
      bookingNumber: 'BK-699',
      status: 'confirmed',
      bookingType: 'one_way',
      totalAmount: 500,
      createdAt: '2026-08-01T09:00:00+07:00',
      contact: { fullName: 'สมชาย ใจดี', phoneNumber: '0812345678' },
      bookingSchedules: [
        {
          id: 1,
          departureDateTime: OVERRIDE_DEPARTURE,
          fromStop: { id: 1, slug: 'nong_chak', translations: [] },
          toStop: { id: 2, slug: 'mo_chit', translations: [] },
        },
      ],
    },
  ],
  totalElements: 1,
  totalPages: 1,
  number: 0,
  size: 100,
});

const ADMIN_BOOKING_DETAIL = ok({
  id: 699,
  bookingNumber: 'BK-699',
  status: { code: 'confirmed', label: 'Confirmed' },
  bookingType: { code: 'one_way', label: 'One way' },
  createdAt: '2026-08-01T09:00:00+07:00',
  contact: { fullName: 'สมชาย ใจดี', phoneNumber: '0812345678' },
  journeys: [
    {
      departureDateTime: OVERRIDE_DEPARTURE,
      fromStop: { code: 'nong_chak', label: 'หนองจอก' },
      toStop: { code: 'mo_chit', label: 'หมอชิต' },
    },
  ],
});

const REFUND_METHOD_INFO = ok({
  refundMethod: 'card',
  destinationRequired: false,
  // OBRS-699: the fields this card added to RefundMethodInfoRespDto. The rates are the same
  // 0.90/0.40 pair the config-tab frames use, and deliberately not the 80/50 that used to be
  // typed into the i18n bundle — so the frame shows the operator's rates, not the platform's.
  cancellationDeadline: OVERRIDE_CANCELLATION_DEADLINE,
  policyRefundRateEarly: POLICY_VALUES.cancelRefundRateEarly,
  policyRefundRateLate: POLICY_VALUES.cancelRefundRateLate,
});

async function newPage(browser, { roles, dark, viewport, policyFlags }) {
  const page = await browser.newPage({ viewport: viewport || { width: 1280, height: 1900 } });
  await page.addInitScript(
    ([rolesJson, isDark]) => {
      localStorage.setItem('app_language', 'th');
      // The consent banner is fixed to the bottom of the customer pages and covers a third of the
      // my-bookings frame. Seeded 'denied' (the same key and value e2e/support/analytics-consent.ts
      // uses) so the capture answers it rather than photographing around it.
      localStorage.setItem('obrs_analytics_consent_v1', 'denied');
      localStorage.setItem('auth_token', 'fake-owner-token-for-capture');
      localStorage.setItem('auth_username', 'owner@obrs.test');
      // AuthGuard reads roles from this key, not from the token — nothing in src/app decodes a JWT.
      localStorage.setItem('auth_roles', rolesJson);
      // The admin shell's own storage key, written by ThemeService. Seeding the service's real input
      // rather than stamping a class on — a hardcoded `.is-dark` photographs a theme the app never
      // actually entered. `assertTheme()` below then verifies the app really is in that mode.
      if (isDark) localStorage.setItem('app_admin_theme', 'dark');
      else localStorage.removeItem('app_admin_theme');
    },
    [JSON.stringify(roles), !!dark]
  );

  // Catch-all FIRST — last-registered wins in Playwright, so the specific routes below override it.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) })
  );
  await page.route('**/api/private/owner/configs/cancel-reschedule-policy', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(policyConfig(policyFlags || ALL_DEFAULT_FLAGS)),
    })
  );
  await page.route('**/api/private/bookings/me**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(myBookings()) })
  );
  await page.route('**/api/private/admin/bookings**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_BOOKINGS_PAGE) })
  );
  await page.route('**/api/private/admin/bookings/*/refund-method', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REFUND_METHOD_INFO) })
  );
  await page.route('**/api/private/bookings/699', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_BOOKING_DETAIL) })
  );
  return page;
}

/** OBRS-702 lesson: a global error swal over the page photographs a passing AC as broken. */
async function assertNoErrorOverlay(page) {
  await page.waitForTimeout(600); // the loading swal is a real transient state — let it settle
  if ((await page.locator('.swal2-popup').count()) > 0) {
    throw new Error('refusing to save: a SweetAlert popup is covering the page');
  }
}

/** A frame labelled "dark" that is not actually dark is worse than no frame. */
async function assertTheme(page, dark, name) {
  const themed = await page.evaluate(
    () => !!document.querySelector('.admin-shell.is-dark, .is-dark, body.is-dark')
  );
  if (!!dark !== themed) {
    throw new Error(`refusing to save ${name}: dark=${!!dark} but themed=${themed}`);
  }
}

async function save(target, name) {
  await target.screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log('captured', name);
}

// ── The config tab ───────────────────────────────────────────────────────────────────────────────

async function openConfigTab(browser, { dark, policyFlags }) {
  const page = await newPage(browser, {
    roles: ['owner'],
    dark,
    policyFlags,
    viewport: { width: 1280, height: 2000 },
  });
  await page.goto(`${BASE_URL}/admin/settings/cancel-reschedule-policy`, { waitUntil: 'networkidle' });
  // Wait for the FORM, not the shell: the shell renders during load and during LOAD_FAILED too, so
  // waiting on it would photograph either as a success.
  await page.locator('#earlyWindowHours').waitFor({ state: 'visible', timeout: 30000 });
  return page;
}

/** Guard: the frame is only evidence if the values on screen are the stubbed ones. */
async function assertWireValues(page) {
  const expected = {
    '#cancelWindowHours': '5',
    '#cancelRefundRateEarlyPct': '90',
    '#cancelRefundRateLatePct': '40',
    '#rescheduleWindowHours': '5',
    '#rescheduleMaxDaysAhead': '45',
    '#rescheduleFeeLateThb': '120',
    '#earlyWindowHours': '36',
  };
  for (const [selector, want] of Object.entries(expected)) {
    const got = await page.locator(selector).inputValue();
    if (got !== want) {
      throw new Error(`refusing to save: ${selector} shows "${got}", wire said "${want}"`);
    }
  }
}

async function shotAllDefault(browser, name) {
  const page = await openConfigTab(browser, { dark: false, policyFlags: ALL_DEFAULT_FLAGS });
  await assertWireValues(page);

  const badges = await page.locator('app-config-source-badge .admin-status.is-neutral').count();
  if (badges !== 7) {
    throw new Error(`refusing to save ${name}: expected 7 "platform default" badges, found ${badges}`);
  }
  if ((await page.locator('[data-testid="cancel-reschedule-policy-reset-btn"]').count()) !== 0) {
    throw new Error(`refusing to save ${name}: the reset card must be absent with nothing overridden`);
  }
  await assertNoErrorOverlay(page);
  await assertTheme(page, false, name);
  await save(page, name);
  await page.close();
}

async function shotMixed(browser, name) {
  const page = await openConfigTab(browser, { dark: false, policyFlags: MIXED_FLAGS });

  const owned = await page.locator('app-config-source-badge .admin-status.is-info').count();
  const inherited = await page.locator('app-config-source-badge .admin-status.is-neutral').count();
  if (owned !== 3 || inherited !== 4) {
    throw new Error(`refusing to save ${name}: expected 3 owned / 4 inherited badges, got ${owned}/${inherited}`);
  }
  await page.locator('[data-testid="cancel-reschedule-policy-reset-btn"]').waitFor({ state: 'visible' });
  const stateLine = await page.locator('[data-testid="cancel-reschedule-policy-state"]').innerText();
  if (!stateLine.includes('3')) {
    throw new Error(`refusing to save ${name}: the state line does not carry the count — "${stateLine}"`);
  }
  await assertNoErrorOverlay(page);
  await save(page, name);
  await page.close();
}

/** D-2 as the owner meets it first: the client hint, before a round trip is spent on it. */
async function shotCoherenceHint(browser, name) {
  const page = await openConfigTab(browser, { dark: false, policyFlags: MIXED_FLAGS });

  await page.locator('#cancelRefundRateEarlyPct').fill('30');
  await page.locator('#cancelRefundRateLatePct').fill('70');
  await page.locator('#cancelRefundRateLatePct').blur();

  await page
    .locator('[data-testid="cancel-reschedule-policy-early-rate-error"]')
    .waitFor({ state: 'visible', timeout: 10000 });
  if (await page.locator('button[type="submit"]').isEnabled()) {
    throw new Error(`refusing to save ${name}: Save must be disabled while the policy is incoherent`);
  }
  await assertNoErrorOverlay(page);
  await save(page, name);
  await page.close();
}

/** D-2's other half: the server said no, and the reason is still on screen after the toast. */
async function shotServerRejection(browser, name) {
  const page = await newPage(browser, {
    roles: ['owner'],
    policyFlags: MIXED_FLAGS,
    viewport: { width: 1280, height: 2000 },
  });
  // A 400 shaped like the backend's: a translated message plus the field it names. The client hint
  // cannot pre-empt every rejection, which is the whole reason this surface exists.
  await page.route('**/api/private/owner/configs/cancel-reschedule-policy', (route) => {
    if (route.request().method() !== 'PUT') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(policyConfig(MIXED_FLAGS)),
      });
    }
    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 400,
        errorCode: 'VALIDATION_FAILED',
        message: 'อัตราคืนเงินแบบ early ต้องไม่น้อยกว่าแบบ late',
        errors: [
          {
            field: 'cancelRefundRateEarly',
            rejectedValue: 0.9,
            reason: 'ต้องไม่น้อยกว่า cancelRefundRateLate',
          },
        ],
      }),
    });
  });

  await page.goto(`${BASE_URL}/admin/settings/cancel-reschedule-policy`, { waitUntil: 'networkidle' });
  await page.locator('#earlyWindowHours').waitFor({ state: 'visible', timeout: 30000 });

  // Dirty the form without breaking a client rule, so Save is reachable and the SERVER is what
  // refuses — the frame is worthless if the client stopped it first.
  await page.locator('#rescheduleFeeLateThb').fill('150');
  await page.locator('#rescheduleFeeLateThb').blur();
  await page.locator('button[type="submit"]').click();

  // Something still inherited => the takeover confirm fires first. Accept it.
  const confirmBtn = page.locator('.swal2-confirm');
  await confirmBtn.waitFor({ state: 'visible', timeout: 10000 });
  await confirmBtn.click();

  const banner = page.locator('[data-testid="cancel-reschedule-policy-server-error"]');
  await banner.waitFor({ state: 'visible', timeout: 10000 });
  // The error toast is dismissed on purpose: the point of this frame is that the reason SURVIVES it.
  const toastClose = page.locator('.swal2-confirm');
  if (await toastClose.count()) {
    await toastClose.first().click();
  }
  await page.waitForTimeout(600);
  await assertNoErrorOverlay(page);
  await save(page, name);
  await page.close();
}

async function shotDark(browser, name) {
  const page = await openConfigTab(browser, { dark: true, policyFlags: MIXED_FLAGS });
  await assertWireValues(page);
  await assertNoErrorOverlay(page);
  await assertTheme(page, true, name);
  await save(page, name);
  await page.close();
}

// ── The override-cancel modal ────────────────────────────────────────────────────────────────────

async function shotOverrideCancelModal(browser, name) {
  const page = await newPage(browser, { roles: ['owner'], viewport: { width: 1280, height: 1200 } });
  await page.goto(`${BASE_URL}/admin/bookings`, { waitUntil: 'networkidle' });

  const row = page.locator('tbody tr', { hasText: 'BK-699' }).first();
  await row.waitFor({ state: 'visible', timeout: 30000 });
  await row.click();

  const openBtn = page.locator('.bk-detail-actions .admin-btn-danger');
  await openBtn.waitFor({ state: 'visible', timeout: 15000 });
  await openBtn.click();

  const modal = page.locator('.override-cancel-modal');
  await modal.waitFor({ state: 'visible', timeout: 15000 });

  // The banner only exists once the refund-method read resolves; without this the frame can catch
  // the state where no deadline is known yet, which photographs as a modal that says nothing.
  const banner = page.locator('.override-cancel-window');
  await banner.waitFor({ state: 'visible', timeout: 15000 });
  const text = await banner.innerText();
  if (!text.includes('2026')) {
    throw new Error(`refusing to save ${name}: the banner states no instant — "${text}"`);
  }
  if (/2\s*ชั่วโมง|2-hour/.test(text)) {
    throw new Error(`refusing to save ${name}: the banner still states a fixed window — "${text}"`);
  }

  // The POLICY rate hint is the other half of the same defect: it used to read "(80% / 50%)",
  // the PLATFORM pair, on a screen that decides how much money goes back.
  const hint = await page.locator('.override-cancel-modal .admin-hint').first().innerText();
  if (!hint.includes('90') || !hint.includes('40')) {
    throw new Error(`refusing to save ${name}: the rate hint does not state the wire's pair — "${hint}"`);
  }
  if (/80|50/.test(hint)) {
    throw new Error(`refusing to save ${name}: the rate hint still leaks a platform rate — "${hint}"`);
  }
  await assertNoErrorOverlay(page);
  await save(modal, name);
  await page.close();
}

// ── my-bookings ──────────────────────────────────────────────────────────────────────────────────

async function shotMyBookingsActions(browser, name) {
  const page = await newPage(browser, { roles: ['user'], viewport: { width: 900, height: 1000 } });
  await page.goto(`${BASE_URL}/my-bookings`, { waitUntil: 'networkidle' });

  const menuBtn = page.locator('.actions-menu-btn').first();
  await menuBtn.waitFor({ state: 'visible', timeout: 30000 });
  await menuBtn.click();

  const menu = page.locator('.my-bookings-action-menu');
  await menu.waitFor({ state: 'visible', timeout: 15000 });

  // The frame's entire claim: with the wire's 1-hour window, all three actions are offered on a
  // booking 3 hours out. Under the old 4-hour constants two of them would be disabled — so if any
  // of them IS disabled here, the frame proves the opposite of what it is captioned and must not
  // be saved.
  const enabled = await menu.locator('.action-menu-item:not(.action-menu-item--disabled)').count();
  const disabled = await menu.locator('.action-menu-item--disabled').count();
  if (disabled > 0) {
    const which = await menu.locator('.action-menu-item--disabled .action-menu-item__label').allInnerTexts();
    throw new Error(`refusing to save ${name}: ${disabled} action(s) still disabled — ${which.join(', ')}`);
  }
  if (enabled < 4) {
    throw new Error(`refusing to save ${name}: expected view/reschedule/seat/stop/cancel, found ${enabled}`);
  }
  await assertNoErrorOverlay(page);
  await save(page, name);
  await page.close();
}

async function main() {
  const browser = await chromium.launch();
  const steps = [
    ['0-config-tab-all-default', () => shotAllDefault(browser, 'OBRS-699-AFTER-0-config-tab-all-default.png')],
    ['1-config-tab-mixed', () => shotMixed(browser, 'OBRS-699-AFTER-1-config-tab-mixed.png')],
    ['2-coherence-hint', () => shotCoherenceHint(browser, 'OBRS-699-AFTER-2-coherence-hint-early-below-late.png')],
    ['3-config-tab-dark', () => shotDark(browser, 'OBRS-699-AFTER-3-config-tab-dark.png')],
    ['4-override-cancel-deadline', () => shotOverrideCancelModal(browser, 'OBRS-699-AFTER-4-override-cancel-deadline.png')],
    ['5-my-bookings-actions', () => shotMyBookingsActions(browser, 'OBRS-699-AFTER-5-my-bookings-actions-open.png')],
    ['6-server-rejection', () => shotServerRejection(browser, 'OBRS-699-AFTER-6-save-rejected-banner.png')],
  ];

  let failed = 0;
  for (const [label, run] of steps) {
    try {
      await run();
    } catch (error) {
      failed += 1;
      console.error(`FAILED ${label}:`, error.message);
    }
  }

  await browser.close();
  console.log(failed === 0 ? 'DONE' : `DONE with ${failed} failure(s)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
