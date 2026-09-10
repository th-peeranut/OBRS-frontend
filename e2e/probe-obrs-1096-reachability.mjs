/**
 * OBRS-1096 premise probe — is the language switcher reachable at all while the
 * my-bookings ticket modal (the only host of `app-trip-track-panel`) is open?
 *
 * The card's AC-1 describes a customer who hits the 403 error and switches
 * language to read it. That story needs the switcher to be operable with the
 * panel mounted. `.ticket-modal-backdrop` is `position: fixed; inset: 0;
 * z-index: 1050` and the navbar tops out at 50, so this measures — with
 * `elementFromPoint`, not by reading CSS — who actually receives the click.
 *
 *   node e2e/probe-obrs-1096-reachability.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4360';
const OUT = path.resolve('..', 'obrs-agent-office', '.claude', 'agent-office', 'scripts', 'captures', 'obrs-1096');
const ok = (data) => ({ code: 200, message: 'OK', data });

const BOOKING = {
  id: 501, bookingNumber: 'B-000501', totalAmount: 360, status: 'confirmed',
  bookingType: 'one_way', bookingChannel: 'online', createdAt: '2026-07-20T10:00:00+07:00',
  rescheduleCount: 0, seatChangeCount: 0, stopChangeCount: 0,
  contact: { fullName: 'Somchai Jaidee', phoneNumber: '0812345678' },
  bookingSchedules: [{
    id: 601, departureDateTime: '2030-06-17T08:00:00+07:00', arrivalDateTime: '2030-06-17T10:30:00+07:00',
    legType: 'outbound', fromStop: { id: 1, slug: 'nong_chak', label: 'Nong Chak' },
    toStop: { id: 4, slug: 'bkr_mochit2', label: 'Mo Chit 2 Terminal' },
    routeSlug: 'chonburi_bangkok', seatingMode: 'ASSIGNED',
    tickets: [{ id: 777, ticketNumber: 'T-000777', seatNumber: 'A1', status: 'confirmed' }],
  }],
};

const BOOKING_TICKETS = {
  bookingId: 501, bookingNumber: 'B-000501', totalAmount: '360.00', contactPhoneNumber: '0812345678',
  journeys: [{
    legType: { code: 'outbound', label: 'Outbound' },
    fromStop: { code: 'nong_chak', label: 'Nong Chak', latitude: 13.3611, longitude: 100.9847, distanceKmFromOrigin: 0, offsetMinutesFromOrigin: 0 },
    toStop: { code: 'bkr_mochit2', label: 'Mo Chit 2 Terminal', latitude: 13.8129, longitude: 100.5486, distanceKmFromOrigin: 95, offsetMinutesFromOrigin: 150 },
    departureDateTime: '2030-06-17T08:00:00+07:00', arrivalDateTime: '2030-06-17T10:30:00+07:00',
    vehicle: { vehicleType: { code: 'van', label: 'Van' }, numberPlate: '1234', vehicleNumber: '12' },
    tickets: [{ id: 777, ticketNumber: 'T-000777', seatNumber: 'A1', passengerName: 'Somchai Jaidee', status: { code: 'confirmed', label: 'Confirmed' } }],
  }],
};

const browser = await chromium.launch();
const out = { base: BASE, viewports: {} };

for (const width of [1440, 900]) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
    localStorage.setItem('auth_token', 'obrs-1096-probe-token');
    localStorage.setItem('auth_username', 'customer@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['user']));
  });
  await page.route('**/api/**', async (route) => {
    const p = route.request().url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const body = /\/tickets\/\d+\/vehicle-position$/.test(p)
      ? { status: 403, payload: { code: 403, message: 'Forbidden', data: null } }
      : /\/bookings\/\d+\/tickets$/.test(p)
        ? { status: 200, payload: ok(BOOKING_TICKETS) }
        : /\/bookings\/me$/.test(p)
          ? { status: 200, payload: ok({ content: [BOOKING], totalElements: 1, totalPages: 1, size: 100, number: 0, numberOfElements: 1 }) }
          : { status: 200, payload: ok(null) };
    await route.fulfill({ status: body.status, contentType: 'application/json', body: JSON.stringify(body.payload) });
  });
  await page.route('**/accounts.google.com/**', (r) => r.abort());
  await page.route('**/ssl.gstatic.com/**', (r) => r.abort());

  await page.goto(BASE + '/my-bookings', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.booking-card', { state: 'visible', timeout: 60000 });

  const beforeOpen = await probe(page);
  await page.locator('.actions-menu-btn').first().click();
  await page.locator('.my-bookings-action-menu .action-menu-item__label').first().click();
  await page.waitForSelector('app-trip-track-panel', { state: 'visible', timeout: 30000 });
  const withModalOpen = await probe(page);

  // The pointer measurement above is only half the question. The modal declares
  // `role="dialog" aria-modal="true"` and implements NO focus trap (no
  // cdkTrapFocus, no `inert`, only a document:keydown.escape handler), so a
  // keyboard / screen-reader user is not confined to it. Tab until the switcher
  // takes focus, then activate it with Enter the way that user would.
  const keyboard = { tabsToReachSwitcher: null, activatedWithEnter: false, langAfter: null };
  for (let i = 1; i <= 60; i += 1) {
    await page.keyboard.press('Tab');
    const onSwitcher = await page.evaluate(() =>
      !!document.activeElement?.closest('.navbar-lang-trigger')
    );
    if (onSwitcher) {
      keyboard.tabsToReachSwitcher = i;
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      keyboard.activatedWithEnter = await page.evaluate(
        () => document.querySelectorAll('.navbar-lang-item').length > 0
      );
      break;
    }
  }
  keyboard.panelStillMounted = await page.evaluate(() => !!document.querySelector('app-trip-track-panel'));

  out.viewports[width] = { beforeOpen, withModalOpen, keyboard };
  await context.close();
}

/** Who really receives a click at the language trigger's own centre. */
async function probe(page) {
  return page.evaluate(() => {
    const triggers = Array.from(document.querySelectorAll('.navbar-lang-trigger'));
    return {
      triggerCount: triggers.length,
      triggers: triggers.map((el) => {
        const r = el.getBoundingClientRect();
        const rendered = r.width > 0 && r.height > 0;
        const hit = rendered ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
        return {
          rendered,
          box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          hitElement: hit ? hit.tagName.toLowerCase() + '.' + String(hit.className || '').split(' ').filter(Boolean).join('.') : null,
          hitIsTheTrigger: !!hit && (hit === el || el.contains(hit)),
        };
      }),
      backdrop: !!document.querySelector('.ticket-modal-backdrop'),
      panel: !!document.querySelector('app-trip-track-panel'),
      // Who owns the point the trigger occupied BEFORE the modal opened
      // (measured at 1440: x=1283, y=107). If the backdrop answers here, the
      // switcher is not merely scrolled away - it is covered.
      ownerOfTriggerHomePoint: (() => {
        const hit = document.elementFromPoint(1283, 107);
        return hit ? hit.tagName.toLowerCase() + '.' + String(hit.className || '').split(' ').filter(Boolean).join('.') : null;
      })(),
    };
  });
}

await browser.close();
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'reachability-probe.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify(out, null, 2));
