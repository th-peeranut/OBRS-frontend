import { test, expect, Page, Locator } from '@playwright/test';

/**
 * OBRS-83 — customer My Bookings reschedule flow. Runs against a LOCAL
 * full-stack (OBRS-184):
 *
 *   npx playwright test --config=playwright.local.config.ts
 *
 * That config boots the backend on :8181 against a database it drops and
 * rebuilds every run (schema.sql -> data.sql -> e2e/fixtures/reschedule-fixture.sql)
 * and serves the app on :4210 against it. Nothing here is shared with SIT.
 *
 * WHY IT MOVED OFF SIT
 * The spec used to pin four hand-made bookings on live SIT to July-2026 calendar
 * dates. Two failure modes, neither fixable from the test layer: departures drifted
 * into the past, after which the (correct) reschedule-window cutoff disabled Reschedule and the
 * spec read that as a defect; and the pre-consumed states it needs —
 * reschedule_count=1, a cancelled booking, a seat-collision partner — could only be
 * produced BY running the spec, so a re-run found them already spent. Owning the
 * database makes those states seedable and every date relative to `now`.
 *
 * FIXTURE (see e2e/fixtures/reschedule-fixture.sql). All five bookings belong to
 * customer@system.local, ride chonburi_bangkok nong_chak -> mo_chit_2_bus_terminal
 * on a `van`, one seat at fare 200.00. Days are Bangkok, relative to seed time:
 *
 *   BOOK        today+10 09:00   the trip most bookings sit on
 *   OPT_DAY     today+12         TWO departures (08:00, 21:00) -> options returns 2
 *   EMPTY_DAY   today+14         zero schedules            -> options returns []
 *   COLLIDE_DAY today+16 15:00   ONE departure, seat '4' already occupied
 *
 *   booking_number  status     count  trip     seat  role
 *   E2E-ELIGIBLE    confirmed  0      BOOK     4     read-only: options, empty day, NO_SEATS
 *   E2E-MOVE        confirmed  0      BOOK     5     the only booking a test really mutates
 *   E2E-CANCELLED   cancelled  0      BOOK     6     NOT_CONFIRMED disabled-item checks
 *   E2E-MAXCOUNT    confirmed  1      BOOK     7     both MAX_COUNT halves (seeded, not produced):
 *                                                    up-front disabled item, and — with its list
 *                                                    row's count mocked back to 0 — the reactive
 *                                                    options-load rejection
 *   E2E-SEATHOLD    confirmed  0      COLLIDE  4     holds seat 4 on COLLIDE; also the
 *                                                    generic confirmed card for menu checks
 */

const CUSTOMER_EMAIL = 'customer@system.local';
const CUSTOMER_PASSWORD = 'P@ssw0rd';

/** Bangkok calendar date. `month` is 1-based to match both PrimeNG's `data-date`
 * key and the fixture's own day offsets — no 0-based/1-based conversion at any
 * call site. */
interface CalDate {
  year: number;
  month: number;
  day: number;
}

/** Today in Asia/Bangkok, which is the clock the fixture's `today + N` offsets are
 * computed against (`timezone('Asia/Bangkok', now())::date`). Deriving it from the
 * runner's local midnight instead would put every date a day off for any host west
 * of Bangkok. */
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

/** UTC arithmetic purely to borrow the runtime's month/year rollover — these are
 * calendar dates, not instants, so the zone is irrelevant as long as it's fixed. */
function addDays(base: CalDate, days: number): CalDate {
  const t = new Date(Date.UTC(base.year, base.month - 1, base.day + days));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

const TODAY = bangkokToday();
const BOOK_DAY = addDays(TODAY, 10);
const OPT_DAY = addDays(TODAY, 12);
const EMPTY_DAY = addDays(TODAY, 14);
const COLLIDE_DAY = addDays(TODAY, 16);

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The `D MMM YYYY` half of a booking card's departure label — must stay in step
 * with shared/lib/display-date-time.ts's English output (OBRS-178). */
function displayDateEn(d: CalDate): string {
  return `${d.day} ${MONTHS_EN[d.month - 1]} ${d.year}`;
}

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
  return menu.locator('li.p-menu-item').filter({
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

/**
 * Opens the PrimeNG p-datepicker panel.
 *
 * Click the INPUT, not the icon: OBRS-185 moved every date field onto the shared
 * `.app-date-field` style with `[iconDisplay]="'input'"` (see
 * reschedule-date-picker-step.component.html), so the icon is painted inside the
 * input's box and the input itself takes the pointer events — a click aimed at
 * `.app-date-field-icon` is intercepted by `#reschedule-date-input` and never
 * lands. That same change also deleted the `.p-datepicker-trigger` button this
 * helper used to look for.
 *
 * And no `force`. The forced click this replaced was not robustness, it was the
 * bug: SweetAlert2's `.swal2-container` still overlays the viewport for a beat
 * after the action menu closes, and `force` skips exactly the actionability wait
 * that would let it clear — so the click was delivered to the backdrop instead of
 * the input, silently, and the failure only surfaced later as `.p-datepicker`
 * never appearing. An unforced click retries until the overlay is gone.
 */
async function openCalendar(dialog: Locator): Promise<void> {
  await dialog.locator('#reschedule-date-input').click({ timeout: 15_000 });
}

test.describe('My Bookings — Reschedule (OBRS-83)', () => {
  test('AC1/AC2: the action menu lists View e-ticket, Reschedule, Cancel booking (in that order)', async ({ page }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    const card = cardByBookingNumber(page, 'E2E-ELIGIBLE');
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

    const card = cardByBookingNumber(page, 'E2E-ELIGIBLE');
    await openRescheduleFromCard(page, card);

    // Dialog appears immediately (optimistic open) — date step interactive.
    const dialog = page.locator('.reschedule-modal');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.locator('#reschedule-date-input')).toBeVisible();

    await openCalendar(dialog);
    await selectPCalendarDate(page, OPT_DAY);

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

    const card = cardByBookingNumber(page, 'E2E-ELIGIBLE');
    await openRescheduleFromCard(page, card);

    const dialog = page.locator('.reschedule-modal');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.locator('#reschedule-date-input')).toBeVisible();

    // EMPTY_DAY is in-range — 4 days from the booking's own departure, well inside
    // reschedule_max_days_ahead (60 since OBRS-655) — and the fixture deliberately seeds no
    // schedules on it, so this is the empty list rather than a rejected date.
    await openCalendar(dialog);
    await selectPCalendarDate(page, EMPTY_DAY);

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

    // E2E-MOVE exists so this test has a booking of its own to really mutate. It
    // used to run against the same booking the MAX_COUNT test later asserted on,
    // which made that test depend on this one having run first (and pass anyway
    // when it hadn't, because SIT still held the previous session's mutation).
    // MAX_COUNT now reads a pre-seeded reschedule_count=1 booking instead.
    const card = cardByBookingNumber(page, 'E2E-MOVE');
    await expect(card.locator('.booking-card__meta dd').first()).toContainText(displayDateEn(BOOK_DAY));
    await openRescheduleFromCard(page, card);

    const dialog = page.locator('.reschedule-modal');
    await openCalendar(dialog);
    await selectPCalendarDate(page, OPT_DAY);

    // Target OPT_DAY's 21:00 rather than its 08:00 so the assertion below proves a
    // real move of both day AND time-of-day, not just a same-hour day shift.
    await expect(dialog.locator('.reschedule-option-card')).toHaveCount(2, { timeout: 20_000 });
    const target = dialog.locator('.reschedule-option-card').filter({ hasText: '21:0' });
    await target.click();

    const estimate = dialog.locator('.reschedule-estimate');
    await expect(estimate).toBeVisible({ timeout: 30_000 });
    await expect(estimate).toContainText('Current fare');
    await expect(estimate).toContainText('New fare');
    await expect(estimate).toContainText('Reschedule fee');
    // Same 200.00 fare either side and >24h out (so the late fee tier is 0) —
    // netAmount 0, paymentDirection NO_PAYMENT, and no payments row needed.
    await expect(estimate.locator('.reschedule-estimate__net')).toContainText('No additional charge');

    await page.screenshot({ path: 'e2e-evidence/estimate-no-payment.png', fullPage: true });

    await dialog.locator('.reschedule-step__actions .btn-primary').click();

    // Success: dialog closes, toast fires, list refreshes to the new departure.
    // Confirm does a re-fetch-estimate + confirm round trip; local, but keep the
    // headroom — the backend may still be warming its first JIT pass.
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });
    await gotoMyBookings(page);
    const updatedCard = cardByBookingNumber(page, 'E2E-MOVE');
    await expect(updatedCard.locator('.booking-card__meta dd').first()).toContainText(displayDateEn(OPT_DAY));
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

    // E2E-ELIGIBLE holds seat '4' on BOOK; E2E-SEATHOLD holds seat '4' on
    // COLLIDE_DAY's single departure. Moving ELIGIBLE there therefore asks for a
    // seat that is genuinely taken on a genuinely different schedule — a real
    // server-side collision, not a same-schedule no-op. Non-destructive: the
    // endpoint 400s and neither booking changes, so this is safe to repeat.
    const card = cardByBookingNumber(page, 'E2E-ELIGIBLE');
    await openRescheduleFromCard(page, card);

    const dialog = page.locator('.reschedule-modal');
    await openCalendar(dialog);
    await selectPCalendarDate(page, COLLIDE_DAY);

    const optionsList = dialog.locator('.reschedule-options-list');
    await expect(optionsList).toBeVisible({ timeout: 20_000 });
    await expect(dialog.locator('.reschedule-option-card')).toHaveCount(1, { timeout: 20_000 });
    // Loading state must be cleared once options resolve — no stuck spinner.
    await expect(dialog.locator('.reschedule-spinner')).toHaveCount(0);
    await dialog.locator('.reschedule-option-card').first().click();

    await expect(dialog.locator('.reschedule-estimate')).toBeVisible({ timeout: 30_000 });
    await dialog.locator('.reschedule-step__actions .btn-primary').click();

    // Bounced back to the options list (not a silent failure, not a dead dialog).
    // Confirm re-fetches the estimate before submitting, so this is one sequential
    // round trip before the 400 — it must resolve in seconds. No options re-fetch
    // happens anymore, so this must NOT approach the old 45s ceiling.
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
    const unchangedCard = cardByBookingNumber(page, 'E2E-ELIGIBLE');
    await expect(unchangedCard.locator('.status-badge')).toHaveText(/Confirmed/i);
  });

  test('AC2: a cancelled booking has Reschedule disabled with the NOT_CONFIRMED reason', async ({ page }) => {
    // Split from the cancel FLOW, which now lives in its own test at the bottom of
    // this file. This one reads E2E-CANCELLED, seeded `cancelled` by the fixture,
    // so it no longer depends on another test having cancelled a booking first —
    // the coupling that made the old version pass on SIT for the wrong reason
    // (the state was left over from a previous session, not produced by the run).
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    const cancelledCard = cardByBookingNumber(page, 'E2E-CANCELLED');
    await expect(cancelledCard.locator('.status-badge')).toHaveText(/Cancelled/i, { timeout: 30_000 });
    await expect(cancelledCard.locator('.actions-menu-btn')).toBeVisible();
    const cancelledMenu = await openActionsMenu(page, cancelledCard);
    const rescheduleItem = menuItem(cancelledMenu, /^Reschedule$/);
    await expect(rescheduleItem).toBeVisible();
    await expect(rescheduleItem).toHaveAttribute('aria-disabled', 'true');
    await expect(rescheduleItem.locator('.action-menu-item__tooltip')).toHaveText(
      /Confirmed bookings only/i
    );

    await page.screenshot({ path: 'e2e-evidence/not-confirmed-disabled.png', fullPage: true });
  });

  test('AC2: an already-rescheduled booking has Reschedule disabled up front with the ALREADY_USED reason', async ({
    page,
  }) => {
    // The up-front half of the MAX_COUNT rule, and the half that actually fires in
    // production: rescheduleEligibility() (my-bookings.component.ts) gates on
    // `rescheduleCount >= 1` while rendering the card, so a maxed booking never
    // reaches the dialog at all — AC8b's reactive 400 only happens on a stale list.
    //
    // Untestable before this lane existed: it needs a booking that is ALREADY at
    // count=1 when the list first paints. On SIT the only way to get one was to
    // spend a booking by rescheduling it earlier in the same run, which left the
    // rendered card stale and so exercised the reactive path instead of this one.
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    const card = cardByBookingNumber(page, 'E2E-MAXCOUNT');
    const menu = await openActionsMenu(page, card);
    const rescheduleItem = menuItem(menu, /^Reschedule$/);
    await expect(rescheduleItem).toHaveAttribute('aria-disabled', 'true');
    await expect(rescheduleItem.locator('.action-menu-item__tooltip')).toHaveText(
      /Already rescheduled once/i
    );

    await page.screenshot({ path: 'e2e-evidence/already-used-disabled.png', fullPage: false });
  });

  test('AC5/AC6 (network-mocked): TOP_UP shows real amount ahead of the embedded payment step', async ({
    page,
  }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    // E2E-ELIGIBLE, not E2E-SEATHOLD: both estimate and confirm are mocked here, so
    // nothing is really mutated and this test does not need a booking of its own —
    // and E2E-SEATHOLD must keep sitting on COLLIDE_DAY holding seat '4' for AC7.
    const card = cardByBookingNumber(page, 'E2E-ELIGIBLE');
    await openRescheduleFromCard(page, card);

    const dialog = page.locator('.reschedule-modal');
    await openCalendar(dialog);
    await selectPCalendarDate(page, OPT_DAY);
    await expect(dialog.locator('.reschedule-option-card')).toHaveCount(2, { timeout: 20_000 });

    // Every seeded schedule is same-fare and >24h out, so a real TOP_UP cannot be
    // produced from this fixture — mock just the estimate/confirm responses on top
    // of the otherwise-live dialog/options, matching this suite's established
    // mocking convention (b2c-critical-path.spec.ts).
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
    // The id must stay a wildcard: bookings are seeded per run, so their ids are
    // whatever the sequence hands out. `*` cannot cross a `/`, so this still won't
    // swallow `/reschedule-options` or `/reschedule-estimate`.
    await page.route('**/bookings/*/reschedule', (route) =>
      route.fulfill({
        json: {
          code: 200,
          message: 'OK',
          // bookingId here is inert — the dialog confirms with its own @Input()
          // bookingId and never reads it back off the response.
          data: { bookingId: 0, bookingNumber: 'E2E-ELIGIBLE', status: 'PENDING_PAYMENT', paymentIntentId: 999901 },
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
    const unchangedCard = cardByBookingNumber(page, 'E2E-ELIGIBLE');
    await expect(unchangedCard.locator('.booking-card__meta dd').first()).toContainText(displayDateEn(BOOK_DAY));
    await expect(unchangedCard.locator('.status-badge')).toHaveText(/Confirmed/i);
  });

  test('AC5 (network-mocked): REFUND estimate renders the correct label', async ({ page }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    // Mocked estimate only, no confirm — E2E-ELIGIBLE for the same reason as the
    // TOP_UP test above.
    const card = cardByBookingNumber(page, 'E2E-ELIGIBLE');
    await openRescheduleFromCard(page, card);

    const dialog = page.locator('.reschedule-modal');
    await openCalendar(dialog);
    await selectPCalendarDate(page, OPT_DAY);
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

    const card = cardByBookingNumber(page, 'E2E-ELIGIBLE');
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
    await selectPCalendarDate(page, COLLIDE_DAY);
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

  test('AC8b (stale-list mocked): Thai locale — reactive MAX_COUNT rejection on options load renders localized, not a raw key', async ({
    page,
  }) => {
    // WHY THE LIST RESPONSE IS REWRITTEN HERE — the point of this test is the
    // REACTIVE rejection: getRescheduleOptions() validates the count before it
    // builds the list, so the 400 fires the moment a date is picked
    // (loadRescheduleOptionsFailure), not at confirm time. That is a second,
    // independent rejection-message path from AC7/AC8's NO_SEATS, and it stays
    // inline (MAX_COUNT is only "terminal" i.e. dialog-closing for a CONFIRM-time
    // failure, per shared/lib/reschedule-error.ts).
    //
    // But that path is unreachable from an HONEST list: my-bookings.component.ts's
    // rescheduleEligibility() gates on `rescheduleCount >= 1` up front, so a
    // truly-maxed booking renders with Reschedule already disabled and the dialog
    // never opens. It is reachable exactly when the rendered list is STALE — the
    // tab was open before the booking was rescheduled elsewhere — so staleness is
    // what this mock reproduces, and only for E2E-MAXCOUNT's own row. Everything
    // downstream (options request, the 400, the message) is the real backend.
    //
    // The old spec reached it by accident instead: AC5/AC6 drove this same booking's
    // count to 1 mid-session, leaving the already-rendered card stale. That made
    // this test silently depend on run order, and on SIT it passed off a mutation
    // left behind by an earlier session even when the producing test had failed.
    await loginAsCustomer(page, 'th');

    await page.route('**/bookings/me**', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      // `data` is a Spring page (ResponseAPI<PageResponse<MyBookingDto>>), so the
      // rows live under `data.content`.
      const rows = body?.data?.content ?? [];
      const target = rows.find((b: { bookingNumber?: string }) => b.bookingNumber === 'E2E-MAXCOUNT');
      if (!target) {
        // Fail loudly rather than serve the list through untouched: a silent miss
        // here would surface as "Reschedule is disabled", which reads like a
        // product bug instead of a broken mock.
        throw new Error('mock: E2E-MAXCOUNT not found in /bookings/me — has the page shape changed?');
      }
      target.rescheduleCount = 0;
      await route.fulfill({ response, json: body });
    });

    await gotoMyBookings(page);

    const card = cardByBookingNumber(page, 'E2E-MAXCOUNT');
    await openRescheduleFromCard(page, card);

    const dialog = page.locator('.reschedule-modal');
    await openCalendar(dialog);
    // The date is irrelevant to the assertion — the count check rejects before the
    // list is built — but it must be a legal one, or a different error would win.
    await selectPCalendarDate(page, OPT_DAY);

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

    // Any confirmed, cancellable booking serves here; E2E-SEATHOLD is the one the
    // fixture keeps untouched (its only job is occupying a seat on COLLIDE_DAY, and
    // nothing below mutates it).
    const card = cardByBookingNumber(page, 'E2E-SEATHOLD');
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

    // Disabled Reschedule item is still present (not omitted) on the seeded-cancelled
    // E2E-CANCELLED, with the NOT_CONFIRMED reason visible (not hover-only).
    const cancelledCard = cardByBookingNumber(page, 'E2E-CANCELLED');
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

    // E2E-SEATHOLD is confirmed/cancellable — reach the SweetAlert2 confirm via
    // the menu, then back OUT (click the swal2 cancel button, not confirm) so the
    // booking is left untouched; AC7 still needs it holding seat '4' on COLLIDE_DAY.
    const card = cardByBookingNumber(page, 'E2E-SEATHOLD');
    const menu = await openActionsMenu(page, card);
    await clickMenuItem(menu, /Cancel booking/);

    const swalPopup = page.locator('.swal2-popup');
    await expect(swalPopup).toBeVisible({ timeout: 10_000 });
    await expect(swalPopup.locator('.swal2-confirm')).toBeVisible();
    await page.screenshot({ path: 'e2e-evidence/menu-cancel-confirm-dialog.png', fullPage: true });

    await page.locator('.swal2-cancel').click();
    await expect(swalPopup).toHaveCount(0);

    // Unchanged: still confirmed, still cancellable via the menu.
    await expect(cardByBookingNumber(page, 'E2E-SEATHOLD').locator('.status-badge')).toHaveText(/Confirmed/i);
  });

  test('Menu (2fd9153) Thai: trigger aria-label, item labels, and the disabled-Reschedule reason all localize with no raw keys', async ({
    page,
  }) => {
    await loginAsCustomer(page, 'th');
    await gotoMyBookings(page);

    const eligibleCard = cardByBookingNumber(page, 'E2E-SEATHOLD');
    await expect(eligibleCard.locator('.actions-menu-btn')).toHaveAttribute('aria-label', 'การดำเนินการ');

    const menu = await openActionsMenu(page, eligibleCard);
    const labels = (await menu.locator('.action-menu-item__label').allTextContents()).map((l) => l.trim());
    expect(labels).toEqual(['ดูตั๋ว', 'เลื่อนการเดินทาง', 'เปลี่ยนที่นั่ง', 'เปลี่ยนจุดขึ้น-ลง', 'ยกเลิกการจอง']);
    await expect(menu).not.toContainText('MY_BOOKINGS.');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    const cancelledCard = cardByBookingNumber(page, 'E2E-CANCELLED');
    const cancelledMenu = await openActionsMenu(page, cancelledCard);
    const rescheduleItem = menuItem(cancelledMenu, /เลื่อนการเดินทาง/);
    await expect(rescheduleItem).toHaveAttribute('aria-disabled', 'true');
    await expect(rescheduleItem.locator('.action-menu-item__tooltip')).toHaveText(
      'เฉพาะการจองที่ยืนยันแล้ว'
    );
    await expect(cancelledMenu).not.toContainText('MY_BOOKINGS.');
    await page.screenshot({ path: 'e2e-evidence/menu-thai-disabled-reason.png', fullPage: true });
  });

  // Kept LAST on purpose. It is the only test that really cancels anything, and its
  // victim (E2E-MOVE) is also the AC5/AC6 test's — so it must run after that one.
  // playwright.local.config.ts pins workers:1 + fullyParallel:false, which makes
  // file order the run order, so this holds; it is still a coupling.
  //
  // TODO(OBRS-184): give this test its own victim. The fixture has no booking that
  // is both confirmed and unused — E2E-ELIGIBLE, E2E-MAXCOUNT and E2E-SEATHOLD are
  // each read by a later assertion that a cancellation would invalidate — so the
  // real fix is a sixth seeded row (e.g. E2E-CANCEL-ME, confirmed, on BOOK, seat 8)
  // that exists only to be cancelled. That is a fixture change, out of scope here.
  test('Menu (2fd9153): cancelling via the menu confirms and flips the booking to Cancelled', async ({
    page,
  }) => {
    await loginAsCustomer(page);
    await gotoMyBookings(page);

    // The cancel FLOW itself: menu -> SweetAlert2 confirm (not a native browser
    // dialog) -> resulting state. The NOT_CONFIRMED consequence this used to assert
    // on the freshly-cancelled booking is now covered by the AC2 test above against
    // the seeded E2E-CANCELLED, so those two no longer have to share a booking.
    const card = cardByBookingNumber(page, 'E2E-MOVE');
    await expect(card.locator('.status-badge')).toHaveText(/Confirmed/i);
    const cardMenu = await openActionsMenu(page, card);
    await clickMenuItem(cardMenu, /Cancel booking/);
    await page.locator('.swal2-confirm').click({ timeout: 30_000 });
    await expect(cardByBookingNumber(page, 'E2E-MOVE').locator('.status-badge')).toHaveText(
      /Cancelled/i,
      { timeout: 30_000 }
    );

    // Cancelling really took effect on the server, not just in the local list state.
    await gotoMyBookings(page);
    await expect(cardByBookingNumber(page, 'E2E-MOVE').locator('.status-badge')).toHaveText(/Cancelled/i);
    await page.screenshot({ path: 'e2e-evidence/menu-cancel-completed.png', fullPage: true });
  });
});

/** Clicks a day cell in the currently open PrimeNG p-datepicker panel, navigating
 * months first if the target isn't on the visible one.
 *
 * PrimeNG 17 stamps each day cell's <span> with `data-date="YYYY-M-D"` — 1-based
 * month, no zero padding (`formatDateKey` in primeng-calendar.mjs) — which is more
 * robust than matching visible text, and unlike the text it doesn't change under
 * the Thai locale.
 *
 * The `td:not(.p-datepicker-other-month)` scope is load-bearing, not defensive:
 * `showOtherMonths` defaults on, so the panel for the month BEFORE the target
 * already renders a span carrying the target's own data-date in its trailing row —
 * and `selectOtherMonths` defaults off, so clicking that one silently does nothing.
 * The panel opens on the current month while every target here is 10-16 days out,
 * so a target landing in the next month is normal, not an edge case. */
async function selectPCalendarDate(page: Page, target: CalDate): Promise<void> {
  const dialog = page.locator('.reschedule-modal');
  const dateInput = dialog.locator('#reschedule-date-input');
  const panel = page.locator('.p-datepicker').first();
  const key = `${target.year}-${target.month}-${target.day}`;

  await panel.waitFor({ state: 'visible', timeout: 10_000 });

  // Click until the dialog actually leaves the date step, then prove it left.
  //
  // The overlay counts as visible the moment Angular attaches it, while its enter
  // animation is still running (PrimeNG carries `ng-animating` for that window),
  // and a day click landing in that window is DROPPED — no selection, no error.
  // Playwright's stability check cannot cover it: the animation is a fade, so the
  // cell's box never moves and every frame looks stable.
  //
  // The signal has to be the dialog leaving the date step, and nothing cheaper.
  // Waiting out `ng-animating` alone is a race the other way (the class may not be
  // applied yet when we look), and "the panel closed" — the obvious proxy, which
  // this replaces — is WRONG: a swallowed click closes the panel too, so the proxy
  // reported success for a click that selected nothing, and every date-dependent
  // test then failed at its own last assertion instead of here. The date step is
  // only torn down by reschedule-dialog.component.ts's `onDateSelected`, which is
  // also what dispatches loadRescheduleOptions — so this cannot pass without the
  // selection having really happened.
  // The whole attempt is retried as one unit, month hop included. The hop clicks
  // `.p-datepicker-next`, which sits in the same panel and so loses to the same
  // animation — and a swallowed hop click ALSO closes the panel, which surfaces
  // one step later as `.p-datepicker-title` "not found" rather than as anything
  // that names the real problem. Patching only the day click left that half live.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      // A swallowed click still closes the panel, so reopen before retrying.
      if (!(await panel.isVisible().catch(() => false))) {
        await openCalendar(dialog);
        await panel.waitFor({ state: 'visible', timeout: 10_000 });
      }

      const cell = panel.locator(`td:not(.p-datepicker-other-month) span[data-date="${key}"]`);
      const title = panel.locator('.p-datepicker-title');

      // Best-effort settles: they skip a wasted attempt in the common case, but
      // correctness rests on the effect assertions, never on these.
      await expect(panel).not.toHaveClass(/ng-animating/, { timeout: 5_000 }).catch(() => undefined);

      // Bounded: the furthest target is +16 days, so at most one hop is ever needed.
      // The ceiling exists to fail with a locator assertion rather than spin forever.
      for (let hop = 0; hop < 3 && (await cell.count()) === 0; hop++) {
        const before = (await title.textContent()) ?? '';
        await panel.locator('.p-datepicker-next').click();
        // Wait on the header actually changing rather than a fixed delay — the next
        // count() would otherwise race the re-render and hop twice.
        await expect(title).not.toHaveText(before, { timeout: 5_000 });
      }
      await expect(cell).toHaveCount(1);

      await expect(panel).not.toHaveClass(/ng-animating/, { timeout: 5_000 }).catch(() => undefined);
      await cell.click();
      await expect(dateInput).toHaveCount(0, { timeout: 3_000 });
      return;
    } catch {
      // Swallowed somewhere in the attempt — the dialog is still on the date step
      // and the panel may have closed under us. Go round: the top reopens it.
    }
  }
  throw new Error(
    `calendar never registered a click on ${key}: the reschedule dialog was still on ` +
      'the date step after 4 attempts'
  );
}
