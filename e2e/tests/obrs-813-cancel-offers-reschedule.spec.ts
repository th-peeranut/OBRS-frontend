import { expect, Page, test } from '@playwright/test';
import { seedAnalyticsConsent } from '../support/analytics-consent';

/**
 * OBRS-813 — the cancel modal now names the other door.
 *
 * The card's own hard limit is what this spec exists to hold: adding the offer
 * must not cost the traveler a single extra click on the way to cancelling.
 * That claim is measured here with a CONTROL ARM rather than a hardcoded
 * number — the same cancel journey is walked twice, once on a booking that is
 * reschedule-eligible (offer rendered) and once on one that is not (today's
 * layout, byte for byte) — and the two click counts are compared. A constant
 * like `expect(clicks).toBe(4)` would be a number nobody measured before the
 * change; two arms measured in the same run cannot rot that way.
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
 * comparison below is measuring the offer and not two different bookings.
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

const ELIGIBLE = booking(601, 'B-000601', 0);
const NOT_ELIGIBLE = booking(602, 'B-000602', 1);

/** The lane the whole card is about: 80% back, by hand, later. */
const CANCEL_POLICY = ok({
  originalAmount: 500,
  refundAmount: 400,
  penaltyAmount: 100,
  refundRatePercent: '80%',
  refundMethod: 'MANUAL_REFUND_REQUIRED',
  policyWindow: 'EARLY',
});

interface Harness {
  /** Every POST .../cancel this run made it to. */
  cancels: number[];
}

async function seed(page: Page): Promise<Harness> {
  const harness: Harness = { cancels: [] };

  await seedAnalyticsConsent(page);
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
    localStorage.setItem('auth_token', 'obrs-813-gate-token');
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
      return json(
        ok({
          bookingId: Number(cancelMatch[1]),
          bookingNumber: 'B-000601',
          status: 'cancelled',
          refundAmount: 400,
          refundMethod: 'MANUAL_REFUND_REQUIRED',
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

/** Fill a PromptPay destination and confirm. Returns the clicks it took. */
async function confirmCancel(page: Page): Promise<number> {
  await page.locator('.rdf-toggle-btn', { hasText: 'PromptPay' }).click();
  await page.locator('#rdf-promptpay-phone').fill('0812345678');
  await page.locator('.crdm-actions .btn-primary').click();
  return 2;
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

test('OBRS-813: an eligible booking is shown the reschedule door, with the server\'s own numbers on both sides', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/my-bookings');
  await openCancelModal(page, 'B-000601');

  const offer = page.locator('.crdm-offer');
  await expect(offer).toBeVisible();

  // The kept-value figure is `originalAmount` from the cancel-policy response
  // (500), not the 400 the cancel lane pays out — the two sides of the choice,
  // both quoted from the same server payload.
  await expect(offer).toContainText('500');
  await expect(page.locator('.crdm-modal')).toContainText('400');

  // No fee is quoted for the reschedule side, because none is knowable before a
  // trip is picked. What is promised instead is that it will be shown first.
  await expect(offer).toContainText('before you confirm');
});

test('OBRS-813: taking the offer opens the reschedule dialog and cancels NOTHING', async ({ page }) => {
  const harness = await seed(page);
  await page.goto('/my-bookings');
  await openCancelModal(page, 'B-000601');

  await page.locator('.crdm-offer__cta').click();

  await expect(page.locator('.reschedule-modal')).toBeVisible();
  await expect(page.locator('.crdm-modal')).toHaveCount(0);
  expect(harness.cancels).toEqual([]);
});

test('OBRS-813: the offer is absent when the booking cannot be rescheduled', async ({ page }) => {
  await seed(page);
  await page.goto('/my-bookings');
  await openCancelModal(page, 'B-000602');

  await expect(page.locator('.crdm-offer')).toHaveCount(0);
  await expect(page.locator('.crdm-subheading')).toHaveCount(0);
  // The cancel side is untouched by the offer's absence.
  await expect(page.locator('.crdm-modal')).toContainText('400');
});

test('OBRS-813 AC4: cancelling costs the SAME number of clicks with the offer as without it', async ({
  page,
}) => {
  const harness = await seed(page);
  await page.goto('/my-bookings');

  // Control arm: the layout as it was before this card (no offer rendered).
  const control = (await openCancelModal(page, 'B-000602')) + (await confirmCancel(page));
  await expect(page.locator('.crdm-modal')).toHaveCount(0);
  expect(harness.cancels).toEqual([602]);
  await dismissSuccessAlert(page);

  // Test arm: same journey on the booking that DOES get the offer.
  const withOffer = (await openCancelModal(page, 'B-000601')) + (await confirmCancel(page));
  await expect(page.locator('.crdm-modal')).toHaveCount(0);
  await dismissSuccessAlert(page);

  expect(harness.cancels).toEqual([602, 601]);
  expect(withOffer).toBe(control);
});
