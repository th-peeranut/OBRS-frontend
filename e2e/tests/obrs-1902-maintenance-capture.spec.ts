import { expect, Page, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { mockPublicPageApis } from '../fixtures/public-page-mocks';
import { seedAnalyticsConsent } from '../support/analytics-consent';
import { seedSignedInCustomer, searchAndConfirmASchedule } from '../support/b2c-booking-walk';

/**
 * OBRS-1902 AFTER evidence — the scheduled-downtime banner, and the pay button it disables.
 *
 * Owner ruling 2026-09-14: a banner configured from the back office PLUS the start-payment
 * button disabled during the countdown; explicitly NOT a full maintenance mode.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. The app is the real build; every decision the frames
 * below show — whether to render the strip, what the countdown says, whether the pay button
 * is disabled, whether the QR tab is allowed to create a charge — is taken by the real
 * frontend code from the announcement payload. The API answering `GET /api/operations-policy`
 * is mocked at the browser, exactly as `mockPublicPageApis` mocks the rest of this walk: the
 * backend half of the card (the json config row, the owner endpoint, the expiry filter) is
 * held by its own tests on the other side, and pairing them here would prove neither better.
 *
 *   npx playwright test --config=playwright.obrs1902capture.config.ts
 */

const ASSETS = 'e2e-evidence/obrs-1902';
mkdirSync(ASSETS, { recursive: true });

/** An announcement whose payment lock is ALREADY open — the state the card is about. */
function lockedWindow() {
  const startAt = new Date(Date.now() + 5 * 60_000);
  const endAt = new Date(startAt.getTime() + 30 * 60_000);
  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    paymentLockMinutesBefore: 10,
    // 10 minutes before a start 5 minutes away: in the past, so payments are shut.
    paymentLockedFrom: new Date(startAt.getTime() - 10 * 60_000).toISOString(),
    messageTh: 'ระบบจะปิดปรับปรุงชั่วคราวเพื่ออัปเดตเว็บจองตั๋ว ขออภัยในความไม่สะดวก',
    messageEn: 'The booking site will be briefly unavailable while we ship an update.',
  };
}

/**
 * The evidence is for a Thai-reading owner, and the language decides WHICH of the two stored
 * messages the strip shows - so it is pinned rather than inherited from whatever the gate
 * build happens to boot in (measured: it boots in English).
 */
async function readInThai(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('app_language', 'th'));
}

async function announceMaintenance(page: Page): Promise<void> {
  await page.route('**/api/operations-policy', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'OK',
        data: { noShowCutoffMinutes: 10, maintenanceWindow: lockedWindow() },
      }),
    })
  );
}

test('OBRS-1902: the countdown banner reaches a customer on the home page', async ({ page }) => {
  await mockPublicPageApis(page);
  await seedAnalyticsConsent(page);
  await readInThai(page);
  await announceMaintenance(page);

  await page.goto('/');
  const strip = page.locator('.maintenance-notice');
  await expect(strip).toBeVisible();
  // The owner's own sentence, not a translation key - this is what makes the banner worth
  // configuring rather than hardcoding.
  await expect(strip).toContainText('ปิดปรับปรุงชั่วคราว');

  await page.screenshot({ path: `${ASSETS}/01-home-banner.png`, fullPage: false });
});

test('OBRS-1902: the pay button is disabled during the countdown, and the QR tab creates no charge', async ({
  page,
}) => {
  await mockPublicPageApis(page);
  await seedAnalyticsConsent(page);
  // NOT readInThai here, deliberately: the shared booking walk clicks stations by their English
  // names, and switching the app to Thai renames them out from under it. What this frame is
  // evidence for - the button being disabled and no charge being created - does not depend on
  // which of the two stored messages the strip happens to show.
  await announceMaintenance(page);
  await seedSignedInCustomer(page);

  /** Every attempt to start a payment, so "no charge was created" is measured, not assumed. */
  const paymentAttempts: string[] = [];
  await page.route('**/api/private/payments', async (route) => {
    paymentAttempts.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'OK', data: {} }),
    });
  });
  await page.route('**/api/private/bookings', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'OK',
        data: { bookingId: 190201, bookingNumber: 'OBRS-1902-CAP', totalAmount: 200, netAmount: 200 },
      }),
    })
  );

  await searchAndConfirmASchedule(page);
  await page.waitForURL('**/passenger-info');

  await page.locator('#booker-title .dropdown-btn').click();
  await page.locator('#booker-title .dropdown-option').first().click();
  await page.fill('#booker-firstName', 'Somchai');
  await page.fill('#booker-lastName', 'Jaidee');
  await page.fill('#booker-phoneNumber', '0812345678');
  // OBRS-1953: the email sits behind a disclosure link now — expand before filling.
  await page.click('#booker-email-disclosure');
  await page.fill('#booker-email', 'somchai.jaidee@example.com');
  await page.locator('#title-0 .dropdown-btn').click();
  await page.locator('#title-0 .dropdown-option').first().click();
  await page.fill('#firstName-0', 'Somchai');
  await page.fill('#lastName-0', 'Jaidee');
  await page.locator('#gender_male-0').click();

  await expect(page.locator('.btn-next')).not.toBeDisabled();
  await page.locator('.btn-next').click();
  await page.locator('.swal2-confirm').click().catch(() => {});
  await page.waitForURL('**/payment');

  // The success alert from the reserve step has to be gone before any frame is taken.
  await expect(page.locator('.swal2-popup')).toHaveCount(0);

  // The card tab is the one the payment page opens on.
  const payNow = page.locator('app-payment-creditcard .payment-btn');
  await expect(payNow).toBeDisabled();
  // Disabled has to be VISIBLE, not just true in the DOM: a lock the customer cannot see is the
  // same as no lock at all. `.payment-btn-diabled` is the greyed-out modifier this stylesheet
  // actually defines.
  await expect(payNow).toHaveClass(/payment-btn-diabled/);
  await expect(page.locator('.payment-maintenance-hint')).toBeVisible();
  await expect(page.locator('.maintenance-notice')).toBeVisible();
  // fullPage: the strip is at the top of the document and the pay button is most of a screen
  // below it. A viewport frame can hold one or the other; the claim needs both in one image.
  await page.screenshot({ path: `${ASSETS}/02-payment-card-locked.png`, fullPage: true });

  // The QR tab is the other door, and it is the dangerous one: opening it normally CREATES
  // a PromptPay charge. Nothing may reach the gateway while the lock is open.
  await page.getByRole('button', { name: /QR/i }).first().click();
  await page.waitForTimeout(1500);
  expect(paymentAttempts, 'the QR tab must not create a charge during the lock').toEqual([]);
  await page.screenshot({ path: `${ASSETS}/03-payment-qr-locked.png`, fullPage: true });
});

test('OBRS-1902: the back-office form the announcement is written from', async ({ page }) => {
  await mockPublicPageApis(page);
  await seedAnalyticsConsent(page);
  await readInThai(page);
  await announceMaintenance(page);
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'obrs-1902-capture-token');
    localStorage.setItem('auth_username', 'owner@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['owner']));
  });
  await page.route('**/api/private/admin/configs/maintenance-window', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'OK', data: lockedWindow() }),
    })
  );

  await page.goto('/admin/settings/maintenance-window');
  await expect(page.locator('.admin-card')).toBeVisible();
  // The "call it off" action exists only because something is scheduled.
  await expect(page.locator('.admin-btn-danger')).toBeVisible();

  await page.screenshot({ path: `${ASSETS}/04-admin-form.png`, fullPage: true });
});
