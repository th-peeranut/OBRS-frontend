import { Page, expect, test } from '@playwright/test';
import { seedGateAdminSession } from '../support/gate-admin-session';

/**
 * OBRS-1811 evidence capture — see playwright.obrs1811capture.config.ts for how to run it.
 *
 * Every shot asserts what it is supposed to show BEFORE shooting it, because a screenshot of a
 * page that silently failed to render is indistinguishable from proof.
 *
 * The BEFORE half is NOT in this file. It is shot by running an equivalent, uncommitted spec from
 * a second worktree checked out at `origin/dev`, against the same fixture below — same schedule,
 * same rows, only the code differs. Keeping it here would mean committing a spec that asserts the
 * old DOM and fails on this branch from the moment it lands.
 *
 * Screenshots land in e2e-evidence/ (gitignored), are uploaded to the card, then deleted.
 */

const ASSETS = 'e2e-evidence/obrs-1811';

const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'OK', data }),
});

const SCHEDULE_ID = 77;

/**
 * Three rows, because the claim is about telling them APART. Row 1's recipient was never reached
 * and the provider said so; row 2 has no recipient number at all (a case that wrote nothing
 * anywhere before this card); row 3 went out fine. A one-row fixture would let a badge that
 * renders unconditionally pass.
 */
const ROWS = [
  {
    parcelId: 501,
    trackingNumber: 'P-FAILEDSMS1',
    senderName: 'สมชาย ใจดี',
    senderPhone: '0811111111',
    recipientName: 'สมศรี มีสุข',
    recipientPhone: '0899999999',
    pickupStop: { slug: 'nong-chak', name: 'หนองชาก' },
    dropoffStop: { slug: 'mochit', name: 'หมอชิต' },
    weightKg: 12,
    deliveryStatus: 'arrived_notified',
    bookingStatus: 'confirmed',
    arrivalNotificationResult: 'failed',
  },
  {
    parcelId: 502,
    trackingNumber: 'P-NOPHONE002',
    senderName: 'วิไล ศรีสุข',
    senderPhone: '0822222222',
    recipientName: 'ประเสริฐ ทองดี',
    recipientPhone: '0866666666',
    pickupStop: { slug: 'nong-chak', name: 'หนองชาก' },
    dropoffStop: { slug: 'mochit', name: 'หมอชิต' },
    weightKg: 4,
    deliveryStatus: 'arrived_notified',
    bookingStatus: 'confirmed',
    arrivalNotificationResult: 'no_phone',
  },
  {
    parcelId: 503,
    trackingNumber: 'P-DELIVERED3',
    senderName: 'อนันต์ พูลทรัพย์',
    senderPhone: '0833333333',
    recipientName: 'กมล แสงทอง',
    recipientPhone: '0877777777',
    pickupStop: { slug: 'nong-chak', name: 'หนองชาก' },
    dropoffStop: { slug: 'mochit', name: 'หมอชิต' },
    weightKg: 7,
    deliveryStatus: 'arrived_notified',
    bookingStatus: 'confirmed',
    arrivalNotificationResult: 'sent',
  },
];

async function openDeliveryList(page: Page): Promise<void> {
  await seedGateAdminSession(page, {
    username: 'staff@system.local',
    roles: ['salesperson'],
    language: 'th',
  });
  await page.route(`**/api/private/schedules/${SCHEDULE_ID}/parcels/consigned`, (route) =>
    route.fulfill(ok(ROWS))
  );
  await page.route(`**/api/private/schedules/${SCHEDULE_ID}/parcels/pending-verification`, (route) =>
    route.fulfill(ok([]))
  );
  // ?tab=handover: the delivery list lives under the ส่งมอบ tab of the schedule page, and the
  // page picks its opening tab from work due unless the query param names one. Pinning it here
  // keeps the shot deterministic rather than dependent on what the fixture makes "due".
  await page.goto(`/staff/parcels/schedule/${SCHEDULE_ID}?tab=handover`);
  await expect(page.getByText('P-FAILEDSMS1')).toBeVisible();
}

test.describe('OBRS-1811 — recovering a parcel whose arrival SMS never landed', () => {
  test('AFTER-1: the staff list shows WHICH recipients were not reached, and offers the resend on every arrived row', async ({ page }) => {
    await openDeliveryList(page);

    // The badge is the free half of this card: the backend was already recording these failures,
    // nothing read them back. Counted per row, including the zero.
    await expect(page.locator('[data-testid="notify-warning-501"]'))
      .toHaveText('แจ้งเตือนไม่สำเร็จ');
    await expect(page.locator('[data-testid="notify-warning-502"]'))
      .toHaveText('ไม่มีเบอร์ผู้รับ');
    await expect(page.locator('[data-testid="notify-warning-503"]'))
      .toHaveCount(0);

    // The recovery door, on every arrived row - a failure is not the only reason to press it
    // (a recipient can ring the counter saying nothing arrived, on a row that reads 'sent').
    await expect(page.locator('[data-testid="resend-notification-501"]')).toBeVisible();
    await expect(page.locator('[data-testid="resend-notification-503"]')).toBeVisible();

    await page.screenshot({ path: `${ASSETS}/OBRS-1811-AFTER-1-delivery-list-badges.png`, fullPage: true });
  });

  test('AFTER-2: the resend dialog opens pre-filled with the parcel’s current number, and says nothing about the collection code', async ({ page }) => {
    await openDeliveryList(page);
    await page.locator('[data-testid="resend-notification-501"]').click();

    const dialog = page.locator('[data-testid="parcel-resend-dialog"]');
    await expect(dialog).toBeVisible();
    // Pre-filled, not blank: the common case is a right number and a phone that was off, and
    // making staff retype it invites a second typo on the screen that exists to fix the first.
    await expect(page.locator('[data-testid="parcel-resend-phone"]')).toHaveValue('0899999999');
    // Not a correction yet, so no warning.
    await expect(page.locator('[data-testid="parcel-resend-correction-warning"]')).toHaveCount(0);
    // AC-8: option ค was rejected - this screen never shows the handoff CODE. Asserted on the
    // shape of the value, not on the words: the hint deliberately SAYS "พร้อมรหัสรับพัสดุ" (that is
    // what the SMS carries), so a phrase match would fail on correct copy. What must not appear is
    // a 6-digit code, and  keeps the 10-digit phone numbers on screen out of the match.
    const dialogText = (await dialog.innerText()).replace(/\s+/g, ' ');
    expect(dialogText).not.toMatch(/\d{6}/);

    await page.screenshot({ path: `${ASSETS}/OBRS-1811-AFTER-2-resend-dialog.png`, fullPage: true });
  });

  test('AFTER-3: typing a different number warns that the parcel’s recipient is being amended', async ({ page }) => {
    await openDeliveryList(page);
    await page.locator('[data-testid="resend-notification-501"]').click();

    await page.locator('[data-testid="parcel-resend-phone"]').fill('0866666666');

    await expect(page.locator('[data-testid="parcel-resend-correction-warning"]')).toBeVisible();
    await expect(page.locator('[data-testid="parcel-resend-confirm"]')).toBeEnabled();

    await page.screenshot({ path: `${ASSETS}/OBRS-1811-AFTER-3-correction-warning.png`, fullPage: true });
  });

  test('AFTER-4: a corrected resend reports the new number back onto the row and clears its failure badge', async ({ page }) => {
    await openDeliveryList(page);
    await page.route('**/api/private/parcels/501/arrival-notification/resend', (route) =>
      route.fulfill(ok({ result: 'sent', attemptNo: 2, recipientPhone: '0866666666', phoneCorrected: true }))
    );

    await page.locator('[data-testid="resend-notification-501"]').click();
    await page.locator('[data-testid="parcel-resend-phone"]').fill('0866666666');
    await page.locator('[data-testid="parcel-resend-confirm"]').click();

    await expect(page.locator('[data-testid="parcel-resend-dialog"]')).toHaveCount(0);
    // The badge is gone because the LATEST attempt succeeded - the row tracks the newest verdict,
    // not a sticky flag.
    await expect(page.locator('[data-testid="notify-warning-501"]')).toHaveCount(0);

    await page.screenshot({ path: `${ASSETS}/OBRS-1811-AFTER-4-after-resend.png`, fullPage: true });
  });
});
