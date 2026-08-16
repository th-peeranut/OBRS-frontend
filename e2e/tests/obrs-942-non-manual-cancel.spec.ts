import { expect, Page, test } from '@playwright/test';
import { seedAnalyticsConsent } from '../support/analytics-consent';

/**
 * OBRS-942 — one cancel screen for every refund method.
 *
 * Before this card, `MyBookingsEffect.requestCancel$` forked on `refundMethod`:
 * `MANUAL_REFUND_REQUIRED` opened `CancelBookingModalComponent` (the ONLY place
 * carrying the OBRS-813 reschedule offer); every other method — card, gateway,
 * `CASH` — fell through to a plain SweetAlert that never mentioned it. A card
 * payer could lose 20% where a free reschedule would have kept 100%, purely
 * because of WHO moves the money, which is irrelevant to the traveler's
 * decision. This spec is the control-arm counterpart to
 * `obrs-813-cancel-offers-reschedule.spec.ts`: same booking shapes, same click
 * budget, `refundMethod: 'card'` instead of `'MANUAL_REFUND_REQUIRED'`.
 *
 * What it proves that the 813 spec cannot: BOTH arms of that spec, and every
 * `confirmCancelWithDestination$` unit test, use `MANUAL_REFUND_REQUIRED` — the
 * non-manual lane had zero E2E coverage before this card.
 *
 * Hermetic on the same terms as the rest of the gate lane: a synthetic customer
 * session in localStorage, every `/api/**` call fulfilled here, no backend.
 */

const ok = <T>(data: T) => ({ code: 200, message: 'OK', data });

/** Far enough out that the 2h reschedule window and the cancel window are both open. */
const DEPARTURE = '2030-06-17T08:00:00+07:00';

const lookup = (id: number, code: string, label: string) => ({
  id,
  code,
  display: { en: { label }, th: { label } },
});

/**
 * `rescheduleCount: 1` is what makes the control booking ineligible — it fails
 * `computeRescheduleEligibility`'s ALREADY_USED check while staying confirmed
 * and fully cancellable. Nothing else about the two rows differs, so the
 * comparison below is measuring the offer and not two different bookings —
 * same fixture shape as `obrs-813-cancel-offers-reschedule.spec.ts`.
 */
const booking = (id: number, number: string, rescheduleCount: number) => ({
  id,
  bookingNumber: number,
  totalAmount: 500,
  status: 'confirmed',
  bookingType: 'one_way',
  bookingChannel: 'online',
  createdAt: '2026-07-20T10:00:00+07:00',
  rescheduleCount,
  seatChangeCount: 0,
  stopChangeCount: 0,
  contact: { fullName: 'Somchai Jaidee', phoneNumber: '0812345678' },
  bookingSchedules: [
    {
      id: 900 + id,
      departureDateTime: DEPARTURE,
      arrivalDateTime: '2030-06-17T10:30:00+07:00',
      legType: 'outbound',
      fromStop: lookup(1, 'nong_chak', 'Nong Chak'),
      toStop: lookup(4, 'bkr_mochit2', 'Mo Chit 2 Terminal'),
      routeSlug: 'chonburi_bangkok',
      seatingMode: 'ASSIGNED',
      tickets: [{ id: 700 + id, ticketNumber: `T-00${700 + id}`, seatNumber: 'A1', status: 'confirmed' }],
    },
  ],
});

const ELIGIBLE = booking(701, 'B-000701', 0);
const NOT_ELIGIBLE = booking(702, 'B-000702', 1);

/** The lane OBRS-942 fixes: the gateway auto-refunds, nobody at the counter
 * moves money by hand — and until this card, this lane never heard about the
 * reschedule door at all. */
const CANCEL_POLICY = ok({
  originalAmount: 500,
  refundAmount: 400,
  penaltyAmount: 100,
  refundRatePercent: '80%',
  refundMethod: 'card',
  policyWindow: 'EARLY',
});

interface Harness {
  /** Every POST .../cancel this run made it to. */
  cancels: number[];
  /** The raw wire body of the last cancel POST — proves refundDestination
   * never rides along on this lane. */
  lastCancelBody: unknown;
}

async function seed(page: Page): Promise<Harness> {
  const harness: Harness = { cancels: [], lastCancelBody: undefined };

  await seedAnalyticsConsent(page);
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
    localStorage.setItem('auth_token', 'obrs-942-gate-token');
    localStorage.setItem('auth_username', 'customer@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['user']));
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = request.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    const cancelMatch = /\/bookings\/(\d+)\/cancel$/.exec(pathname);
    if (cancelMatch && request.method() === 'POST') {
      harness.cancels.push(Number(cancelMatch[1]));
      harness.lastCancelBody = request.postDataJSON();
      return json(
        ok({
          bookingId: Number(cancelMatch[1]),
          bookingNumber: 'B-000701',
          status: 'cancelled',
          refundAmount: 400,
          refundMethod: 'card',
        })
      );
    }
    if (/\/bookings\/\d+\/cancel-policy$/.test(pathname)) {
      return json(CANCEL_POLICY);
    }
    if (/\/bookings\/me$/.test(pathname)) {
      return json(
        ok({
          content: [ELIGIBLE, NOT_ELIGIBLE],
          totalElements: 2,
          totalPages: 1,
          size: 100,
          number: 0,
          numberOfElements: 2,
        })
      );
    }
    if (/\/stops$/.test(pathname)) {
      return json(ok([lookup(1, 'nong_chak', 'Nong Chak'), lookup(4, 'bkr_mochit2', 'Mo Chit 2 Terminal')]));
    }
    // Everything the reschedule dialog loads in the background once it opens.
    // It renders its date step regardless, which is all this spec asserts on.
    return json(ok(null));
  });

  return harness;
}

/** Open the overflow menu of the card showing `bookingNumber` and click Cancel booking. */
async function openCancelModal(page: Page, bookingNumber: string): Promise<number> {
  const card = page.locator('.booking-card', { hasText: bookingNumber });
  await expect(card).toBeVisible();
  await card.locator('.actions-menu-btn').click();
  await page.locator('.action-menu-item__label', { hasText: 'Cancel booking' }).click();
  await expect(page.locator('.crdm-modal')).toBeVisible();
  return 2;
}

/**
 * Confirm on the non-manual lane — no destination to fill in, Confirm is
 * enabled the instant the modal opens (`applyRefundDestinationRequired(form,
 * false)`), so this is a SINGLE click, same as the manual lane's `confirmCancel`
 * in `obrs-813-cancel-offers-reschedule.spec.ts` costs 2 (toggle + Confirm).
 */
async function confirmCancel(page: Page): Promise<number> {
  await page.locator('.crdm-actions .btn-primary').click();
  return 1;
}

/**
 * The success Swal that `cancelSuccess$` fires. Dismissed rather than counted:
 * it lands AFTER the cancel has already been submitted, and identically in both
 * arms, so it is not part of the journey being compared — but it is modal, and
 * leaving it up would swallow the next arm's first click.
 */
async function dismissSuccessAlert(page: Page): Promise<void> {
  const confirm = page.locator('.swal2-confirm');
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(page.locator('.swal2-container')).toHaveCount(0);
}

test('OBRS-942: a non-manual (card) cancel opens the SAME modal, with no destination form and Confirm enabled immediately', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/my-bookings');
  await openCancelModal(page, 'B-000701');

  const modal = page.locator('.crdm-modal');
  await expect(modal.locator('app-refund-destination-fields')).toHaveCount(0);
  await expect(modal.locator('.crdm-note')).toHaveCount(0);

  const confirmBtn = modal.locator('.crdm-actions .btn-primary');
  await expect(confirmBtn).toBeEnabled();
});

test('OBRS-942: the reschedule offer now reaches the card/gateway lane too, with the server\'s own numbers on both sides', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/my-bookings');
  await openCancelModal(page, 'B-000701');

  const offer = page.locator('.crdm-offer');
  await expect(offer).toBeVisible();
  await expect(offer).toContainText('500');
  await expect(page.locator('.crdm-modal')).toContainText('400');
});

test('OBRS-942: taking the offer opens the reschedule dialog and cancels NOTHING', async ({ page }) => {
  const harness = await seed(page);
  await page.goto('/my-bookings');
  await openCancelModal(page, 'B-000701');

  await page.locator('.crdm-offer__cta').click();

  await expect(page.locator('.reschedule-modal')).toBeVisible();
  await expect(page.locator('.crdm-modal')).toHaveCount(0);
  expect(harness.cancels).toEqual([]);
});

test('OBRS-942 AC: cancelling on the non-manual lane costs the SAME number of clicks as before this card', async ({
  page,
}) => {
  const harness = await seed(page);
  await page.goto('/my-bookings');

  // Control arm: the booking that cannot be rescheduled — today's layout,
  // byte for byte, matching what the OBRS-813 spec measures for the manual
  // lane's control arm.
  const control = (await openCancelModal(page, 'B-000702')) + (await confirmCancel(page));
  await expect(page.locator('.crdm-modal')).toHaveCount(0);
  expect(harness.cancels).toEqual([702]);
  await dismissSuccessAlert(page);

  // Test arm: same journey on the booking that DOES get the offer.
  const withOffer = (await openCancelModal(page, 'B-000701')) + (await confirmCancel(page));
  await expect(page.locator('.crdm-modal')).toHaveCount(0);
  await dismissSuccessAlert(page);

  expect(harness.cancels).toEqual([702, 701]);
  expect(withOffer).toBe(control);
});

test('OBRS-942: the non-manual cancel POSTs a wire body of {} — refundDestination never rides along', async ({
  page,
}) => {
  const harness = await seed(page);
  await page.goto('/my-bookings');
  await openCancelModal(page, 'B-000702');
  await confirmCancel(page);

  await expect.poll(() => harness.lastCancelBody).toEqual({});
});

/**
 * QA regression (my-bookings.reducer.ts): dismissing the modal via × dispatches
 * `closeCancelRefundDestinationModal`, which — before the fix — cleared only
 * `refundDestinationModal`, never `cancellingBookingId`. That flag drives
 * `[disabled]="cancellingBookingId !== null"` on the SHARED overflow menu's
 * Cancel item, so one dismissal permanently disabled Cancel for every booking
 * card, not just the one that was open, until a page reload. Reproduced by QA
 * by hand; this pins it at the browser layer (the reducer unit test in
 * `my-bookings.reducer.spec.ts` pins the same fact at the state layer).
 * Asserts on the item's ENABLED state directly, not just on the modal
 * reappearing — a stale-disabled item that happens to still be clickable
 * would pass a looser check.
 */
test('OBRS-942 regression: dismissing the modal (×) leaves Cancel enabled on reopen — for every booking, not just the one dismissed', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/my-bookings');

  await openCancelModal(page, 'B-000701');
  await page.locator('.crdm-modal__close').click();
  await expect(page.locator('.crdm-modal')).toHaveCount(0);

  // Reopen the SAME booking's menu.
  const card = page.locator('.booking-card', { hasText: 'B-000701' });
  await card.locator('.actions-menu-btn').click();
  const cancelItem = page.locator('.action-menu-item--danger');
  await expect(cancelItem).toBeVisible();
  await expect(cancelItem).not.toHaveClass(/action-menu-item--disabled/);

  await page.locator('.action-menu-item__label', { hasText: 'Cancel booking' }).click();
  await expect(page.locator('.crdm-modal')).toBeVisible();
  await page.locator('.crdm-modal__close').click();
  await expect(page.locator('.crdm-modal')).toHaveCount(0);

  // Also the OTHER booking's Cancel item — this is the "every booking, not
  // just the one dismissed" half of the regression: `cancellingBookingId` is
  // a single app-wide flag, so a stale non-null value disables every card's
  // menu item, not only B-000701's.
  const otherCard = page.locator('.booking-card', { hasText: 'B-000702' });
  await otherCard.locator('.actions-menu-btn').click();
  const otherCancelItem = page.locator('.action-menu-item--danger');
  await expect(otherCancelItem).toBeVisible();
  await expect(otherCancelItem).not.toHaveClass(/action-menu-item--disabled/);
});

/**
 * The reschedule-offer exit (`onRescheduleInsteadOfCancel`) dispatches
 * `closeCancelRefundDestinationModal()` then `openRescheduleDialog()` — same
 * action, same fix, but pinned as its own case since it is a second, distinct
 * caller of the dismiss action or the QA-found gap would only ever be proven
 * for the × button.
 */
test('OBRS-942 regression: taking the reschedule offer also leaves Cancel enabled on reopen', async ({ page }) => {
  await seed(page);
  await page.goto('/my-bookings');

  await openCancelModal(page, 'B-000701');
  await page.locator('.crdm-offer__cta').click();
  await expect(page.locator('.reschedule-modal')).toBeVisible();
  await expect(page.locator('.crdm-modal')).toHaveCount(0);

  // Close the reschedule dialog to get back to the card list, then reopen the
  // SAME booking's action menu.
  await page.keyboard.press('Escape');
  await expect(page.locator('.reschedule-modal')).toHaveCount(0);

  const card = page.locator('.booking-card', { hasText: 'B-000701' });
  await card.locator('.actions-menu-btn').click();
  const cancelItem = page.locator('.action-menu-item--danger');
  await expect(cancelItem).toBeVisible();
  await expect(cancelItem).not.toHaveClass(/action-menu-item--disabled/);
});
