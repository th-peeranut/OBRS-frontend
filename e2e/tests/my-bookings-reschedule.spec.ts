import { test, expect, Page, Locator } from '@playwright/test';

/**
 * OBRS-83 — customer My Bookings reschedule flow, verified black-box against
 * live SIT (https://sit-obrs-backend.koyeb.app). Run via
 * `npx playwright test --config=playwright.qa.config.ts` (alt port 4201,
 * --disable-web-security to bypass SIT's :4200-pinned CORS).
 *
 * Current inventory (2026-07-08 QA re-run — see focused re-run brief for the
 * four items AC9/AC7/AC4/AC8):
 *   id=5 B-74DW6T  seat 7  2026-07-09 21:00  -> rescheduleCount=1 already (consumed last
 *                                               session): reschedule-options 400s reactively
 *                                               with RESCHEDULE_ERROR_MAX_COUNT — used for the
 *                                               Thai rejection-message check (fast, no live mutation).
 *   id=2 B-RDE6PG  seat 4  2026-07-09 15:00  -> CANCELLED (consumed last session): NOT_CONFIRMED
 *                                               disabled-menu-item check.
 *   id=3 B-X3F5ML  seat 4  2026-07-09 21:00  -> fresh/eligible: options-list / empty-date checks,
 *                                               plus a REAL non-destructive NO_SEATS repro — on
 *                                               2026-07-17 the only candidate is scheduleId=7
 *                                               (07-17 15:00), whose seat "4" is already occupied
 *                                               by B-P4HPH6's ticket (confirmed via
 *                                               GET /reschedule-options — occupiedSeatNumbers:"4").
 *                                               Confirming against it 400s with
 *                                               RESCHEDULE_ERROR_NO_SEATS without mutating either
 *                                               booking, so it's safe to repeat (used for both the
 *                                               English AC7 check and the Thai AC8 check).
 *   id=4 B-P4HPH6  seat 4  2026-07-17 15:00  -> fresh/eligible: TOP_UP / REFUND checks
 *                                               (network-mocked estimate+confirm), and the seat
 *                                               collision partner for B-X3F5ML's NO_SEATS repro above.
 */

const CUSTOMER_EMAIL = 'customer@system.local';
const CUSTOMER_PASSWORD = 'P@ssw0rd';

async function loginAsCustomer(page: Page, locale: 'en' | 'th' = 'en'): Promise<void> {
  await page.addInitScript((lang) => {
    localStorage.setItem('app_language', lang);
  }, locale);
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

/**
 * OBRS-83 action-menu consolidation: the card's three actions (View
 * e-ticket / Reschedule / Cancel booking) now live behind a single kebab
 * trigger (`.actions-menu-btn`) opening a PrimeNG `p-menu` popup
 * (`appendTo="body"`, so the menu itself is queried from `page`, not scoped
 * under `card`). Each item is `.action-menu-item` with a `.action-menu-item__label`
 * and, when disabled, its ineligibility reason in a `.action-menu-item__tooltip`
 * element — an instant in-app hover tooltip matching register's `.tooltip-box`
 * standard (OBRS-170; it was briefly a native `title`, and before that an inline
 * `.action-menu-item__reason` subtext). The tooltip is `display:none` until hover
 * but always present in the DOM for disabled items, so `toHaveText` can assert it
 * without hovering; enabled items don't render it at all.
 *
 * PrimeNG's popup `p-menu` binds a `ConnectedOverlayScrollHandler` (see
 * node_modules/primeng/fesm2022/primeng-menu.mjs) that closes the menu on
 * ANY ancestor/window scroll — so the card must already be fully in view
 * BEFORE clicking the trigger (a scroll-into-view triggered by the click
 * itself, or any scroll afterward — including a `fullPage` screenshot's
 * internal scroll — will silently dismiss it).
 */
async function openActionsMenu(page: Page, card: Locator): Promise<Locator> {
  await card.locator('.actions-menu-btn').scrollIntoViewIfNeeded();
  await card.locator('.actions-menu-btn').click();
  const menu = page.locator('.p-menu');
  await menu.waitFor({ state: 'visible', timeout: 10_000 });
  return menu;
}

/** The `<li class="p-menuitem">` (carries `aria-disabled`) for a given item's
 * label text — use this for both disabled-state and reason (tooltip) assertions.
 * Filters on the `.action-menu-item__label` descendant specifically so an
 * anchored pattern like `/^Reschedule$/` matches only the label span. */
function menuItem(menu: Locator, labelPattern: RegExp): Locator {
  return menu.locator('li.p-menuitem').filter({
    has: menu.page().locator('.action-menu-item__label', { hasText: labelPattern }),
  });
}

async function clickMenuItem(menu: Locator, labelPattern: RegExp): Promise<void> {
  await menuItem(menu, labelPattern).locator('.action-menu-item__label').click();
}

/** Opens the card's action menu and clicks Reschedule — the replacement for
 * the old direct `card.locator('.btn-reschedule').click()`. Locale-agnostic
 * (matches either the English or Thai label): AC8 switches the page to Thai
 * before its own call to this helper, so a pattern hardcoded to "Reschedule"
 * would never match there. */
async function openRescheduleFromCard(page: Page, card: Locator): Promise<void> {
  const menu = await openActionsMenu(page, card);
  await clickMenuItem(menu, /^(Reschedule|เลื่อนการเดินทาง)$/);
}

/** Opens the PrimeNG p-calendar panel. Prefers the icon trigger button (more
 * reliably re-toggles on a second open than clicking the already-focused
 * input) and falls back to a forced click on the input itself. */
async function openCalendar(dialog: Locator): Promise<void> {
  const trigger = dialog.locator('.p-datepicker-trigger');
  if (await trigger.count()) {
    await trigger.click({ timeout: 10_000 });
    return;
  }
  await dialog.locator('#reschedule-date-input').click({ timeout: 10_000, force: true });
}

test.describe('My Bookings — Reschedule (OBRS-83)', () => {
  test('AC1/AC2: the action menu lists View e-ticket, Reschedule, Cancel booking (in that order)', async ({ page }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    const card = cardByBookingNumber(page, 'B-X3F5ML');
    await expect(card).toBeVisible();
    await expect(card.locator('.actions-menu-btn')).toBeVisible();

    const menu = await openActionsMenu(page, card);
    const labels = await menu.locator('.action-menu-item__label').allTextContents();
    expect(labels.map((l) => l.trim())).toEqual([
      'View e-ticket',
      'Reschedule',
      'Change seat',
      'Change stop',
      'Cancel booking',
    ]);

    const rescheduleItem = menuItem(menu, /^Reschedule$/);
    await expect(rescheduleItem).toHaveAttribute('aria-disabled', 'false');
    // Enabled items render no reason tooltip at all.
    await expect(rescheduleItem.locator('.action-menu-item__tooltip')).toHaveCount(0);

    // fullPage:false deliberately — a fullPage capture scrolls the page,
    // which trips PrimeNG's ConnectedOverlayScrollHandler and silently
    // dismisses the still-needed-open popup menu (see openActionsMenu doc).
    await page.screenshot({
      path: 'e2e-evidence/after-eligible-card.png',
      fullPage: false,
    });

    // Regression: View e-ticket still works on this same card, via the menu.
    await clickMenuItem(menu, /View e-ticket/);
    await expect(page.locator('.ticket-modal')).toBeVisible({ timeout: 15_000 });
    await page.locator('.ticket-modal__close').click();
    await expect(page.locator('.ticket-modal')).toHaveCount(0);
  });

  test('AC3: dialog opens optimistically; options list renders real candidates', async ({
    page,
  }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    const card = cardByBookingNumber(page, 'B-X3F5ML');
    await openRescheduleFromCard(page, card);

    // Dialog appears immediately (optimistic open) — date step interactive.
    const dialog = page.locator('.reschedule-modal');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.locator('#reschedule-date-input')).toBeVisible();

    // Pick a valid in-window date (2026-07-09) with two known candidates.
    await openCalendar(dialog);
    await selectPCalendarDate(page, 9);

    const optionsList = dialog.locator('.reschedule-options-list');
    await expect(optionsList).toBeVisible();
    await expect(dialog.locator('.reschedule-option-card')).toHaveCount(2, { timeout: 20_000 });

    const first = dialog.locator('.reschedule-option-card').first();
    await expect(first.locator('.reschedule-option-card__time')).toContainText(':');
    await expect(first.locator('.reschedule-option-card__vehicle')).toHaveText(/van/i);
    await expect(first.locator('.reschedule-option-card__price')).toContainText('฿');
    await expect(first.locator('.reschedule-option-card__seats')).toContainText(/Seats/i);

    await page.screenshot({ path: 'e2e-evidence/options-list.png', fullPage: true });

    await dialog.locator('.reschedule-modal__close').click();
  });

  test('AC4: a valid in-range date with no schedules renders the empty state, not error/stuck-spinner', async ({
    page,
  }) => {
    // Isolated from AC3 deliberately: the dialog's `step` is a one-way
    // date -> options -> estimate progression (reschedule-dialog.component.html
    // only ever renders one of app-reschedule-date-picker-step /
    // app-reschedule-options-list / app-reschedule-estimate-summary at a time,
    // and reschedule-dialog.component.ts has no back-to-date handler) — there
    // is no in-session way to return to the date step once options have
    // loaded, so a fresh dialog open is the correct way to exercise the
    // empty-date path, not a second `openCalendar()` call after options
    // already rendered.
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    const card = cardByBookingNumber(page, 'B-X3F5ML');
    await openRescheduleFromCard(page, card);

    const dialog = page.locator('.reschedule-modal');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.locator('#reschedule-date-input')).toBeVisible();

    // 2026-07-12 is in-range (within the reschedule window/max-days-ahead)
    // but has no seeded schedules on this route — confirmed live via
    // GET /reschedule-options?date=2026-07-12 -> 200 { data: [] }.
    await openCalendar(dialog);
    await selectPCalendarDate(page, 12);

    await expect(dialog.locator('.reschedule-options-list__state')).toContainText(
      /No available departures/i,
      { timeout: 20_000 }
    );
    // Must be the empty state, not the error state, and the spinner must be cleared.
    await expect(dialog.locator('.bi-exclamation-triangle')).toHaveCount(0);
    await expect(dialog.locator('.reschedule-spinner')).toHaveCount(0);
    await page.screenshot({ path: 'e2e-evidence/options-empty-date.png', fullPage: true });

    await dialog.locator('.reschedule-modal__close').click();
  });

  test('AC5/AC6: NO_PAYMENT reschedule completes end-to-end and list reflects the new departure', async ({
    page,
  }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    const card = cardByBookingNumber(page, 'B-74DW6T'); // id=5, seat 7, 07-09 15:00
    await expect(card.locator('.booking-card__meta dd').first()).toContainText('9 Jul 2026');
    await openRescheduleFromCard(page, card);

    const dialog = page.locator('.reschedule-modal');
    await openCalendar(dialog);
    await selectPCalendarDate(page, 9);

    // schedule 6 = 2026-07-09 21:00 (booking B-X3F5ML's own departure slot,
    // seat 7 free there) — a genuinely different departure time.
    await expect(dialog.locator('.reschedule-option-card')).toHaveCount(2, { timeout: 20_000 });
    const target = dialog.locator('.reschedule-option-card').filter({ hasText: '21:0' });
    await target.click();

    const estimate = dialog.locator('.reschedule-estimate');
    await expect(estimate).toBeVisible({ timeout: 30_000 });
    await expect(estimate).toContainText('Current fare');
    await expect(estimate).toContainText('New fare');
    await expect(estimate).toContainText('Reschedule fee');
    await expect(estimate.locator('.reschedule-estimate__net')).toContainText('No additional charge');

    await page.screenshot({ path: 'e2e-evidence/estimate-no-payment.png', fullPage: true });

    await dialog.locator('.reschedule-step__actions .btn-primary').click();

    // Success: dialog closes, toast fires, list refreshes to the new departure.
    // (Koyeb free-tier can cold-start — confirm does a re-fetch-estimate +
    // confirm round trip, so give this generous headroom.)
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });
    await gotoMyBookings(page);
    const updatedCard = cardByBookingNumber(page, 'B-74DW6T');
    await expect(updatedCard.locator('.booking-card__meta dd').first()).toContainText('9 Jul 2026');
    await expect(updatedCard.locator('.booking-card__meta dd').first()).toContainText('21:00');
    await expect(updatedCard.locator('.status-badge')).toHaveText(/Confirmed/i);

    await page.screenshot({ path: 'e2e-evidence/after-reschedule-success.png', fullPage: true });
  });

  test('AC7: NO_SEATS bounces back to the options list with an inline error, spinner not stuck', async ({
    page,
  }) => {
    // FIXED in commit a4842ab: the NO_SEATS handler no longer re-dispatches
    // loadRescheduleOptions (which used to reset rescheduleOptionsError->null
    // and re-arm the spinner). It now bounces to 'options', clears the stale
    // selection, and surfaces rescheduleConfirmError as a banner
    // (.reschedule-options-list__confirm-error) alongside the still-loaded
    // options list, via reschedule-options-list's new [confirmError] input.
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    // id=3 B-X3F5ML, seat 4. On 2026-07-17 the only candidate is scheduleId=7
    // (07-17 15:00), which already has seat "4" occupied by B-P4HPH6's ticket
    // on the same route (verified live via GET /reschedule-options ->
    // occupiedSeatNumbers:"4"). This is a genuinely different schedule from
    // X3F5ML's own (not a same-schedule no-op), so confirming against it
    // exercises the real seat-collision path server-side. Non-destructive:
    // the endpoint 400s and neither booking is changed.
    const card = cardByBookingNumber(page, 'B-X3F5ML');
    await openRescheduleFromCard(page, card);

    const dialog = page.locator('.reschedule-modal');
    await openCalendar(dialog);
    await selectPCalendarDate(page, 17);

    const optionsList = dialog.locator('.reschedule-options-list');
    await expect(optionsList).toBeVisible({ timeout: 20_000 });
    await expect(dialog.locator('.reschedule-option-card')).toHaveCount(1, { timeout: 20_000 });
    // Loading state must be cleared once options resolve — no stuck spinner.
    await expect(dialog.locator('.reschedule-spinner')).toHaveCount(0);
    await dialog.locator('.reschedule-option-card').first().click();

    await expect(dialog.locator('.reschedule-estimate')).toBeVisible({ timeout: 30_000 });
    await dialog.locator('.reschedule-step__actions .btn-primary').click();

    // Bounced back to the options list (not a silent failure, not a dead dialog).
    // Confirm re-fetches the estimate before submitting, so this is one
    // sequential Koyeb round trip before the 400 — should resolve quickly
    // (a few seconds), not hang. No options re-fetch happens anymore, so
    // this must NOT take anywhere near the old 45s ceiling.
    await expect(dialog.locator('.reschedule-options-list')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.locator('.reschedule-options-list__confirm-error')).toContainText(
      /no longer available/i,
      { timeout: 15_000 }
    );
    // The options list itself must still be shown alongside the banner —
    // not replaced by it.
    await expect(dialog.locator('.reschedule-option-card')).toHaveCount(1);
    // No stuck/re-armed spinner.
    await expect(dialog.locator('.reschedule-spinner')).toHaveCount(0);
    await expect(dialog.locator('.reschedule-options-list__state')).toHaveCount(0);
    await page.screenshot({ path: 'e2e-evidence/no-seats-error-FIXED.png', fullPage: true });

    await dialog.locator('.reschedule-modal__close').click();

    // Confirm the source booking itself was never mutated by the failed attempt.
    await gotoMyBookings(page);
    const unchangedCard = cardByBookingNumber(page, 'B-X3F5ML');
    await expect(unchangedCard.locator('.status-badge')).toHaveText(/Confirmed/i);
  });

  test('AC2: cancelling a booking makes Reschedule disabled with NOT_CONFIRMED reason', async ({ page }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    // Consume booking B-RDE6PG (already used for the NO_SEATS attempt above,
    // which did not change its state) via the existing Cancel flow, now
    // reached through the action menu. The confirmation step is a
    // SweetAlert2 popup, not a native browser dialog.
    const card = cardByBookingNumber(page, 'B-RDE6PG');
    const cardMenu = await openActionsMenu(page, card);
    await clickMenuItem(cardMenu, /Cancel booking/);
    await page.locator('.swal2-confirm').click({ timeout: 30_000 });
    await expect(cardByBookingNumber(page, 'B-RDE6PG').locator('.status-badge')).toHaveText(
      /Cancelled/i,
      { timeout: 30_000 }
    );

    const cancelledCard = cardByBookingNumber(page, 'B-RDE6PG');
    await expect(cancelledCard.locator('.actions-menu-btn')).toBeVisible();
    const cancelledMenu = await openActionsMenu(page, cancelledCard);
    const rescheduleItem = menuItem(cancelledMenu, /^Reschedule$/);
    await expect(rescheduleItem)
      .withContext('never hidden, even when ineligible')
      .toBeVisible();
    await expect(rescheduleItem).toHaveAttribute('aria-disabled', 'true');
    await expect(rescheduleItem.locator('.action-menu-item__tooltip')).toHaveText(
      /Confirmed bookings only/i
    );

    await page.screenshot({ path: 'e2e-evidence/not-confirmed-disabled.png', fullPage: true });
  });

  test('AC5/AC6 (network-mocked): TOP_UP shows real amount ahead of the embedded payment step', async ({
    page,
  }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    const card = cardByBookingNumber(page, 'B-P4HPH6'); // id=4, seat 4, untouched
    await openRescheduleFromCard(page, card);

    const dialog = page.locator('.reschedule-modal');
    await openCalendar(dialog);
    await selectPCalendarDate(page, 9);
    await expect(dialog.locator('.reschedule-option-card')).toHaveCount(2, { timeout: 20_000 });

    // SIT's seeded schedules are all same-fare/>24h-out, so a real TOP_UP
    // can't be produced from this session's data — mock just the
    // estimate/confirm responses on top of the otherwise-live dialog/options,
    // matching this suite's established mocking convention (b2c-critical-path.spec.ts).
    await page.route('**/reschedule-estimate**', (route) =>
      route.fulfill({
        json: {
          code: 200,
          message: 'OK',
          data: {
            oldFare: 200,
            newFare: 350,
            fareDiff: 150,
            rescheduleFee: 0,
            netAmount: 150,
            paymentDirection: 'TOP_UP',
          },
        },
      })
    );
    await page.route('**/bookings/4/reschedule', (route) =>
      route.fulfill({
        json: {
          code: 200,
          message: 'OK',
          data: { bookingId: 4, bookingNumber: 'B-P4HPH6', status: 'PENDING_PAYMENT', paymentIntentId: 999901 },
        },
      })
    );

    await dialog.locator('.reschedule-option-card').first().click();
    const estimate = dialog.locator('.reschedule-estimate');
    await expect(estimate).toBeVisible({ timeout: 15_000 });
    await expect(estimate.locator('.reschedule-estimate__net')).toContainText('You pay');
    await expect(estimate.locator('.reschedule-estimate__net')).toContainText('150');

    await dialog.locator('.reschedule-step__actions .btn-primary').click();

    const paymentStep = dialog.locator('.reschedule-payment-step');
    await expect(paymentStep).toBeVisible({ timeout: 15_000 });
    // The real top-up amount must be visible in the note text regardless of
    // the embedded app-payment-summary's own (zeroed/stale) panel below it.
    await expect(paymentStep.locator('.reschedule-step__hint')).toContainText('150');
    await page.screenshot({ path: 'e2e-evidence/topup-payment-step.png', fullPage: true });

    // Abandon (don't complete payment) — verify the "not complete" message
    // and that the booking is left unchanged (nothing was really mutated
    // server-side since confirm was mocked).
    await dialog.locator('.reschedule-modal__close').click();
    await expect(dialog).toHaveCount(0);
    await gotoMyBookings(page);
    const unchangedCard = cardByBookingNumber(page, 'B-P4HPH6');
    await expect(unchangedCard.locator('.booking-card__meta dd').first()).toContainText('17 Jul 2026');
    await expect(unchangedCard.locator('.status-badge')).toHaveText(/Confirmed/i);
  });

  test('AC5 (network-mocked): REFUND estimate renders the correct label', async ({ page }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    const card = cardByBookingNumber(page, 'B-P4HPH6');
    await openRescheduleFromCard(page, card);

    const dialog = page.locator('.reschedule-modal');
    await openCalendar(dialog);
    await selectPCalendarDate(page, 9);
    await expect(dialog.locator('.reschedule-option-card')).toHaveCount(2, { timeout: 20_000 });

    await page.route('**/reschedule-estimate**', (route) =>
      route.fulfill({
        json: {
          code: 200,
          message: 'OK',
          data: {
            oldFare: 200,
            newFare: 150,
            fareDiff: -50,
            rescheduleFee: 0,
            netAmount: -50,
            paymentDirection: 'REFUND',
          },
        },
      })
    );

    await dialog.locator('.reschedule-option-card').first().click();
    const estimate = dialog.locator('.reschedule-estimate');
    await expect(estimate).toBeVisible({ timeout: 15_000 });
    await expect(estimate.locator('.reschedule-estimate__net')).toContainText("You'll be refunded");
    await expect(estimate.locator('.reschedule-estimate__net')).toContainText('50');
    await page.screenshot({ path: 'e2e-evidence/estimate-refund.png', fullPage: true });

    await dialog.locator('.reschedule-modal__close').click();
  });

  test('AC8: Thai locale run — no raw i18n keys, localized reject message; live language switch stays localized', async ({
    page,
  }) => {
    // Live switch first (English -> Thai), no reload, dialog CLOSED at this
    // point: the reschedule dialog's backdrop is `position: fixed; z-index:
    // 1050` (reschedule-dialog.component.scss) versus the navbar's z-index 50
    // (navbar.component.scss), so a real user cannot reach the navbar's
    // language switcher while the modal is open either — that's correct
    // modal-focus behaviour, not a gap. The live-switch check is done here,
    // then the dialog is opened fresh already in the switched language, which
    // is the reachable equivalent of "switch and see it reflected without a
    // reload".
    await loginAsCustomer(page, 'en');
    await gotoMyBookings(page);

    const card = cardByBookingNumber(page, 'B-X3F5ML');
    const enMenu = await openActionsMenu(page, card);
    await expect(menuItem(enMenu, /Reschedule/)).toHaveText(/Reschedule/i);
    // Close the menu (Escape — PrimeNG p-menu popup) before switching language.
    await page.keyboard.press('Escape');
    await expect(enMenu).toHaveCount(0);

    await page.locator('.navbar-lang-trigger').click();
    await page.locator('.navbar-lang-item', { hasText: 'ไทย' }).click();
    // Instant re-render, same page (no navigation/reload) — the label flips languages.
    const thMenu = await openActionsMenu(page, card);
    await expect(menuItem(thMenu, /เลื่อนการเดินทาง/)).toHaveText(/เลื่อนการเดินทาง/);
    await page.keyboard.press('Escape');
    await expect(thMenu).toHaveCount(0);
    // The lang change also re-fetches the (server-localized) booking list
    // (my-bookings.component.ts subscribes to translate.onLangChange), which
    // shows a blocking SweetAlert2 loading overlay for the round trip — let it
    // clear before interacting further, otherwise it intercepts the next click.
    await expect(page.locator('.swal2-container')).toHaveCount(0, { timeout: 30_000 });

    await openRescheduleFromCard(page, card);
    const dialog = page.locator('.reschedule-modal');
    await expect(dialog.locator('.reschedule-modal__title')).toHaveText(/เลื่อนการเดินทางของคุณ/);
    await expect(dialog).not.toContainText('MY_BOOKINGS.RESCHEDULE');

    await openCalendar(dialog);
    await selectPCalendarDate(page, 17);
    await expect(dialog.locator('.reschedule-option-card')).toHaveCount(1, { timeout: 20_000 });
    await expect(dialog).toContainText('ที่นั่งว่าง'); // "Seats"
    await expect(dialog).not.toContainText('MY_BOOKINGS.RESCHEDULE');
    await page.screenshot({ path: 'e2e-evidence/thai-locale-options.png', fullPage: true });

    // NOTE: this stops at the options list deliberately. Confirming this
    // candidate reproduces the AC7 NO_SEATS bounce-back bug (see AC7 test's
    // comment) — the localized-rejection-message requirement for AC8 is
    // independently covered by AC8b below (Thai MAX_COUNT on options load),
    // which uses a different, unaffected code path.
    await dialog.locator('.reschedule-modal__close').click();
  });

  test('AC8b: Thai locale — reactive MAX_COUNT rejection on options load renders localized, not a raw key', async ({
    page,
  }) => {
    // id=5 B-74DW6T already has rescheduleCount=1 (consumed last session).
    // getRescheduleOptions() validates the count BEFORE building the list, so
    // the 400 fires the moment a date is picked (loadRescheduleOptionsFailure),
    // not at confirm time — a second, independent rejection-message path from
    // AC7/AC8's NO_SEATS, and it stays inline (MAX_COUNT is only "terminal"
    // i.e. dialog-closing for a CONFIRM-time failure, per
    // shared/lib/reschedule-error.ts).
    await loginAsCustomer(page, 'th');
    await gotoMyBookings(page);

    const card = cardByBookingNumber(page, 'B-74DW6T');
    await openRescheduleFromCard(page, card);

    const dialog = page.locator('.reschedule-modal');
    await openCalendar(dialog);
    await selectPCalendarDate(page, 17);

    await expect(dialog.locator('.reschedule-options-list__state')).toContainText(
      'การจองนี้เลื่อนวันไปแล้วหนึ่งครั้งและไม่สามารถเลื่อนได้อีก',
      { timeout: 20_000 }
    );
    await expect(dialog.locator('.reschedule-spinner')).toHaveCount(0);
    await expect(dialog).not.toContainText('MY_BOOKINGS.RESCHEDULE');
    await page.screenshot({ path: 'e2e-evidence/thai-locale-max-count.png', fullPage: true });

    await dialog.locator('.reschedule-modal__close').click();
  });

  test('Menu (2fd9153): keyboard access (Enter/Space open, Escape closes), Cancel item is danger-styled, disabled Reschedule item shown for a cancelled booking', async ({
    page,
  }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    const card = cardByBookingNumber(page, 'B-P4HPH6');
    const trigger = card.locator('.actions-menu-btn');
    await expect(trigger).toHaveAttribute('aria-label', 'Actions');

    // Keyboard: focus + Enter opens.
    await trigger.focus();
    await trigger.press('Enter');
    let menu = page.locator('.p-menu');
    await expect(menu).toBeVisible({ timeout: 5_000 });
    // fullPage:false — see openActionsMenu doc: a fullPage capture's scroll
    // trips PrimeNG's scroll-dismiss handler and closes the menu we still
    // need open for the Escape check right after.
    await page.screenshot({ path: 'e2e-evidence/menu-open-keyboard.png', fullPage: false });

    // Escape closes, and focus returns to the trigger (onActionMenuHide()).
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // Keyboard: Space also opens (re-open, then close via Escape again).
    await trigger.press(' ');
    menu = page.locator('.p-menu');
    await expect(menu).toBeVisible({ timeout: 5_000 });

    // Cancel booking item is danger-styled on a cancellable, confirmed booking.
    const cancelItem = menuItem(menu, /Cancel booking/);
    await expect(cancelItem).toBeVisible();
    await expect(cancelItem.locator('.action-menu-item--danger')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    // Disabled Reschedule item is still present (not omitted) on the
    // already-cancelled B-RDE6PG, with the NOT_CONFIRMED reason visible
    // (not hover-only) — checked directly since RDE6PG was already consumed
    // by an earlier session's cancel-flow run.
    const cancelledCard = cardByBookingNumber(page, 'B-RDE6PG');
    await expect(cancelledCard.locator('.status-badge')).toHaveText(/Cancelled/i);
    const cancelledMenu = await openActionsMenu(page, cancelledCard);
    await expect(cancelledMenu.locator('.action-menu-item').filter({ hasText: 'Cancel booking' })).toHaveCount(0);
    const rescheduleItem = menuItem(cancelledMenu, /^Reschedule$/);
    await expect(rescheduleItem).toBeVisible();
    await expect(rescheduleItem).toHaveAttribute('aria-disabled', 'true');
    await expect(rescheduleItem.locator('.action-menu-item__tooltip')).toHaveText(
      /Confirmed bookings only/i
    );
    await page.screenshot({ path: 'e2e-evidence/menu-disabled-reschedule-reason.png', fullPage: true });
    await page.keyboard.press('Escape');
  });

  test('Menu (2fd9153): Cancel booking via the menu reaches the confirm dialog; backing out leaves the booking unchanged', async ({
    page,
  }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    // B-P4HPH6 is confirmed/cancellable — reach the SweetAlert2 confirm via
    // the menu, then back OUT (click the swal2 cancel button, not confirm)
    // so the booking is left untouched for other tests/sessions.
    const card = cardByBookingNumber(page, 'B-P4HPH6');
    const menu = await openActionsMenu(page, card);
    await clickMenuItem(menu, /Cancel booking/);

    const swalPopup = page.locator('.swal2-popup');
    await expect(swalPopup).toBeVisible({ timeout: 10_000 });
    await expect(swalPopup.locator('.swal2-confirm')).toBeVisible();
    await page.screenshot({ path: 'e2e-evidence/menu-cancel-confirm-dialog.png', fullPage: true });

    await page.locator('.swal2-cancel').click();
    await expect(swalPopup).toHaveCount(0);

    // Unchanged: still confirmed, still cancellable via the menu.
    await expect(cardByBookingNumber(page, 'B-P4HPH6').locator('.status-badge')).toHaveText(/Confirmed/i);
  });

  test('Menu (2fd9153) Thai: trigger aria-label, item labels, and the disabled-Reschedule reason all localize with no raw keys', async ({
    page,
  }) => {
    await loginAsCustomer(page, 'th');
    await gotoMyBookings(page);

    const eligibleCard = cardByBookingNumber(page, 'B-P4HPH6');
    await expect(eligibleCard.locator('.actions-menu-btn')).toHaveAttribute('aria-label', 'การดำเนินการ');

    const menu = await openActionsMenu(page, eligibleCard);
    const labels = (await menu.locator('.action-menu-item__label').allTextContents()).map((l) => l.trim());
    expect(labels).toEqual(['ดูตั๋ว', 'เลื่อนการเดินทาง', 'เปลี่ยนที่นั่ง', 'เปลี่ยนจุดขึ้น-ลง', 'ยกเลิกการจอง']);
    await expect(menu).not.toContainText('MY_BOOKINGS.');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    const cancelledCard = cardByBookingNumber(page, 'B-RDE6PG');
    const cancelledMenu = await openActionsMenu(page, cancelledCard);
    const rescheduleItem = menuItem(cancelledMenu, /เลื่อนการเดินทาง/);
    await expect(rescheduleItem).toHaveAttribute('aria-disabled', 'true');
    await expect(rescheduleItem.locator('.action-menu-item__tooltip')).toHaveText(
      'เฉพาะการจองที่ยืนยันแล้ว'
    );
    await expect(cancelledMenu).not.toContainText('MY_BOOKINGS.');
    await page.screenshot({ path: 'e2e-evidence/menu-thai-disabled-reason.png', fullPage: true });
  });
});

/** Selects a day-of-month in the currently open PrimeNG p-calendar panel for
 * the (fixed) target month of July 2026, which is within the reschedule
 * date-picker's [minDate, maxDate] window for all bookings used in this spec.
 * PrimeNG 17 stamps each day cell's <span> with `data-date="YYYY-M-D"`
 * (no zero-padding), which is more robust than matching visible text. */
async function selectPCalendarDate(page: Page, day: number, month = 7, year = 2026): Promise<void> {
  const panel = page.locator('.p-datepicker');
  await panel.first().waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator(`span[data-date="${year}-${month}-${day}"]`).first().click();
}
