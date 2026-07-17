import { test, expect, Page, Locator } from '@playwright/test';

/**
 * OBRS-483 — open-seating flows on My Bookings: reschedule, change-stop, and
 * change-seat, exercised against a booking whose schedule is genuinely
 * `seating_mode = 'OPEN'` with a NULL-seat confirmed ticket (see
 * e2e/fixtures/obrs483-open-seating-fixture.sql).
 *
 * WHY THIS EXISTS
 * The default seed booking (DRV-FIXTURE-1) sits on an OPEN schedule but carries
 * SEATED tickets ('1'..'8') — a state the product can never really reach (OPEN
 * never assigns a seat), documented as the "impossible schedule" trap by
 * OBRS-475. A suite that only ever exercises that fixture can stay green while
 * testing nothing about OPEN seating. This fixture instead seeds the real
 * invariant: seat_number NULL throughout.
 *
 * Before this card, the FE's reschedule/change-stop ticket-eligibility filter
 * was `!!ticket.seatNumber` — which silently drops EVERY ticket on an OPEN
 * schedule, so both dialogs opened with zero eligible tickets: no request ever
 * left the browser, no error surfaced, nothing to click. OBRS-483 replaced that
 * with an explicit `ticket.status === 'confirmed'` check (seatNumber ?? null is
 * carried through instead of used as a filter) and taught the backend to gate
 * OPEN capacity by headcount (TicketRepository's 5th segment query family)
 * instead of by seat_number.
 *
 * Change-seat is the deliberate exception: OPEN has no assigned seat to change
 * at all (a permanent domain rule, not a limitation), so it must render
 * disabled with a reason — never hidden (design-system §6/§11).
 *
 * Runs against the local full-stack lane (playwright.obrs483.config.ts): a
 * backend on :8181 booted from OBRS-backend-wt-obrs-483-open-seating against
 * `obrs483qa` (schema.sql -> data.sql -> obrs483-open-seating-fixture.sql), and
 * the frontend served on :4210 via `ng serve --configuration e2e`.
 */

const CUSTOMER_EMAIL = 'customer@system.local';
const CUSTOMER_PASSWORD = 'P@ssw0rd';
const BOOKING_NUMBER = 'OBRS483-OPEN';

interface CalDate {
  year: number;
  month: number;
  day: number;
}

function bangkokToday(): CalDate {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .split('-')
    .map(Number);
  return { year, month, day };
}

function addDays(base: CalDate, days: number): CalDate {
  const t = new Date(Date.UTC(base.year, base.month - 1, base.day + days));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

const TODAY = bangkokToday();
// Matches obrs483-open-seating-fixture.sql: BOOK = today+11 09:00, OPT = today+13 08:00.
const OPT_DAY = addDays(TODAY, 13);

async function loginAsCustomer(page: Page): Promise<void> {
  // The app defaults to Thai when no language has been chosen yet — pin English
  // so every locale-sensitive selector/assertion below (label text, tooltip
  // text) matches deterministically, mirroring my-bookings-reschedule.spec.ts.
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
  });
  await page.goto('/login');
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[type="email"]').fill(CUSTOMER_EMAIL);
  await page.locator('input[type="password"]').fill(CUSTOMER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
}

async function gotoMyBookings(page: Page): Promise<void> {
  await page.goto('/my-bookings');
  await page.locator('.booking-card:not(.booking-card--skeleton)').first().waitFor({ timeout: 30_000 });
}

function cardByBookingNumber(page: Page, bookingNumber: string) {
  return page.locator('.booking-card').filter({ hasText: bookingNumber });
}

async function openActionsMenu(page: Page, card: Locator): Promise<Locator> {
  await card.locator('.actions-menu-btn').scrollIntoViewIfNeeded();
  await card.locator('.actions-menu-btn').click();
  const menu = page.locator('.p-menu');
  await menu.waitFor({ state: 'visible', timeout: 10_000 });
  return menu;
}

function menuItem(menu: Locator, labelPattern: RegExp): Locator {
  return menu.locator('li.p-menuitem').filter({
    has: menu.page().locator('.action-menu-item__label', { hasText: labelPattern }),
  });
}

async function clickMenuItem(menu: Locator, labelPattern: RegExp): Promise<void> {
  await menuItem(menu, labelPattern).locator('.action-menu-item__label').click();
}

/** See my-bookings-reschedule.spec.ts's identical helper for the full rationale
 * (PrimeNG's ng-animating window silently swallows a click landing inside it). */
async function openCalendar(dialog: Locator): Promise<void> {
  await dialog.locator('#reschedule-date-input').click({ timeout: 15_000 });
}

async function selectPCalendarDate(page: Page, target: CalDate): Promise<void> {
  const dialog = page.locator('.reschedule-modal');
  const dateInput = dialog.locator('#reschedule-date-input');
  const panel = page.locator('.p-datepicker').first();
  const key = `${target.year}-${target.month}-${target.day}`;

  await panel.waitFor({ state: 'visible', timeout: 10_000 });

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      if (!(await panel.isVisible().catch(() => false))) {
        await openCalendar(dialog);
        await panel.waitFor({ state: 'visible', timeout: 10_000 });
      }

      const cell = panel.locator(`td:not(.p-datepicker-other-month) span[data-date="${key}"]`);
      const title = panel.locator('.p-datepicker-title');

      await expect(panel).not.toHaveClass(/ng-animating/, { timeout: 5_000 }).catch(() => undefined);

      for (let hop = 0; hop < 3 && (await cell.count()) === 0; hop++) {
        const before = (await title.textContent()) ?? '';
        await panel.locator('.p-datepicker-next').click();
        await expect(title).not.toHaveText(before, { timeout: 5_000 });
      }
      await expect(cell).toHaveCount(1);

      await expect(panel).not.toHaveClass(/ng-animating/, { timeout: 5_000 }).catch(() => undefined);
      await cell.click();
      await expect(dateInput).toHaveCount(0, { timeout: 3_000 });
      return;
    } catch {
      // Swallowed somewhere in the attempt — go round.
    }
  }
  throw new Error(`calendar never registered a click on ${key}`);
}

test.describe('My Bookings — OPEN-seating flows (OBRS-483)', () => {
  test('Reschedule: OPEN booking lists its ticket, options load, and confirm really moves it', async ({
    page,
  }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    const card = cardByBookingNumber(page, BOOKING_NUMBER);
    await expect(card).toBeVisible();

    const menu = await openActionsMenu(page, card);
    const rescheduleItem = menuItem(menu, /^Reschedule$/);
    // FIXED (OBRS-483): before this card, the OPEN ticket was silently filtered
    // out of the eligible list, which showed up as Reschedule being either
    // disabled with the wrong reason or the dialog opening to an empty options
    // list forever — never as an error. Proving it enabled here is the first
    // half of "not a silent no-op".
    await expect(rescheduleItem).toHaveAttribute('aria-disabled', 'false');
    await clickMenuItem(menu, /^Reschedule$/);

    const dialog = page.locator('.reschedule-modal');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.locator('#reschedule-date-input')).toBeVisible();

    await openCalendar(dialog);
    await selectPCalendarDate(page, OPT_DAY);

    // Real network round trip: the options list must show the real OPT
    // schedule, not an empty state (the old-logic symptom this card fixes).
    const optionsList = dialog.locator('.reschedule-options-list');
    await expect(optionsList).toBeVisible();
    await expect(dialog.locator('.reschedule-option-card')).toHaveCount(1, { timeout: 20_000 });

    await page.screenshot({
      path: 'docs/manual-tests/assets/OBRS-483/after-reschedule-options.png',
      fullPage: true,
    });

    await dialog.locator('.reschedule-option-card').first().click();

    const estimate = dialog.locator('.reschedule-estimate');
    await expect(estimate).toBeVisible({ timeout: 30_000 });
    await expect(estimate).toContainText('Current fare');
    await expect(estimate).toContainText('New fare');
    await expect(estimate.locator('.reschedule-estimate__net')).toContainText('No additional charge');

    await page.screenshot({
      path: 'docs/manual-tests/assets/OBRS-483/after-reschedule-estimate.png',
      fullPage: true,
    });

    // The effect, not a proxy: confirm dispatches a real request and the
    // dialog closes only on a real success response.
    await dialog.locator('.reschedule-step__actions .btn-primary').click();
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });

    await gotoMyBookings(page);
    const updatedCard = cardByBookingNumber(page, BOOKING_NUMBER);
    await expect(updatedCard.locator('.status-badge')).toHaveText(/Confirmed/i);
    await expect(updatedCard.locator('.booking-card__meta dd').first()).toContainText('08:00');

    await page.screenshot({
      path: 'docs/manual-tests/assets/OBRS-483/after-reschedule-success.png',
      fullPage: true,
    });
  });

  test('Change-stop: OPEN booking opens the dialog, resolves stops, and confirm succeeds', async ({
    page,
  }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    const card = cardByBookingNumber(page, BOOKING_NUMBER);
    const menu = await openActionsMenu(page, card);
    const changeStopItem = menuItem(menu, /^Change stop$/);
    // FIXED (OBRS-483): change-stop is fully available on OPEN — unlike
    // change-seat, there is no domain reason to gate it, and the backend now
    // supports the OPEN headcount-capacity path (5th segment query).
    await expect(changeStopItem).toHaveAttribute('aria-disabled', 'false');
    await expect(changeStopItem.locator('.action-menu-item__tooltip')).toHaveCount(0);
    await clickMenuItem(menu, /^Change stop$/);

    const dialog = page.locator('.change-stop-modal');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Pickup step: real route stops loaded from the server (not an empty list —
    // the old-logic symptom would have been an empty ticket set upstream of
    // this step ever rendering at all).
    const pickupList = dialog.locator('app-route-stop-list .stop-row');
    await expect(pickupList.first()).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
      path: 'docs/manual-tests/assets/OBRS-483/after-change-stop-pickup.png',
      fullPage: true,
    });

    // Keep the same pickup (nong_chak, the booking's current origin) — it must
    // be present and selectable.
    await dialog.locator('.stop-row', { hasText: 'Nong chak' }).click();
    await dialog.locator('p-button', { hasText: 'Confirm pickup' }).click();

    // Drop-off step: pick a stop ONE short of the current destination
    // (mo_chit_2_bus_terminal) — bts_mo_chit — which the fixture doc notes
    // shares the same 200.00 fare, so this is a real net-zero swap.
    const dropoffList = dialog.locator('app-route-stop-list .stop-row');
    await expect(dropoffList.first()).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
      path: 'docs/manual-tests/assets/OBRS-483/after-change-stop-dropoff.png',
      fullPage: true,
    });

    await dialog.locator('.stop-row', { hasText: 'Bts mo chit' }).click();
    await dialog.locator('p-button', { hasText: 'Confirm drop-off' }).click();

    // Real network round trip for the estimate — the headline behavior this
    // card ships: change-stop under OPEN now resolves instead of 400ing with
    // `change-stop.error.open-seating-not-supported`.
    const estimate = dialog.locator('.reschedule-estimate');
    await expect(estimate).toBeVisible({ timeout: 30_000 });
    // The container renders immediately on entering the estimate step, showing
    // "Calculating your new fare…" while the real network call is in flight —
    // wait for the resolved content (not just the container) before touching
    // Confirm, or the click races a still-disabled button (onConfirm() no-ops
    // while `!estimate`) and spins until the test's own timeout instead.
    await expect(estimate).toContainText('Current fare', { timeout: 30_000 });
    await expect(estimate).toContainText('New fare');
    await page.screenshot({
      path: 'docs/manual-tests/assets/OBRS-483/after-change-stop-estimate.png',
      fullPage: true,
    });

    await dialog.locator('.change-stop-step__actions .btn-primary, .reschedule-step__actions .btn-primary')
      .first()
      .click();

    // The effect: dialog closes (or moves to a payment step only if a genuine
    // top-up is owed — this pair is same-fare, so it should close directly),
    // and the booking's own stopChangeCount / route reflects the change.
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });

    await gotoMyBookings(page);
    const updatedCard = cardByBookingNumber(page, BOOKING_NUMBER);
    await expect(updatedCard.locator('.status-badge')).toHaveText(/Confirmed/i);
    await page.screenshot({
      path: 'docs/manual-tests/assets/OBRS-483/after-change-stop-success.png',
      fullPage: true,
    });
  });

  test('Change-seat: disabled with the OPEN_SEATING reason, not hidden, on an OPEN booking', async ({
    page,
  }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    const card = cardByBookingNumber(page, BOOKING_NUMBER);
    const menu = await openActionsMenu(page, card);

    // Present (never omitted — design-system §6/§11) but permanently disabled:
    // OPEN has no assigned seat to change at all, a domain rule rather than a
    // temporary limitation, so this must NOT read as a dead/missing feature.
    const changeSeatItem = menuItem(menu, /^Change seat$/);
    await expect(changeSeatItem).toBeVisible();
    await expect(changeSeatItem).toHaveAttribute('aria-disabled', 'true');
    await expect(changeSeatItem.locator('.action-menu-item__tooltip')).toHaveText(
      /open.?seating/i
    );

    await page.screenshot({
      path: 'docs/manual-tests/assets/OBRS-483/after-change-seat-disabled.png',
      fullPage: false,
    });
  });
});
