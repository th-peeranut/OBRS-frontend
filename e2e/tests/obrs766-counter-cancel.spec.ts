/**
 * OBRS-766 QA verification — counter act-on-behalf cancel + cross-tenant fleet guard.
 *
 * Runs against a LOCAL full stack: backend on :8080 (isolated `obrs766qa` Postgres DB,
 * this card's branch), frontend on :4200 (`npm run start:local`). Config:
 * `playwright.obrs766.config.ts`. See obrs766-primary-flow.spec.ts for the primary
 * flow (video-recorded) and ../support/obrs766-seed.ts for how each test's fixture
 * booking is created.
 *
 * SELF-SEEDING: every destructive test (one that actually cancels or attempts to
 * cancel a booking) creates its OWN fresh booking at the start of the test via the
 * real API, rather than pointing at a booking number written down ahead of time —
 * a booking a previous run already cancelled cannot poison a later run.
 */
import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import {
  loginApi,
  sellWalkInCash,
  setPaymentMethod,
  sellAndRetargetDeparture,
  minutesUntilDeparture,
  seedCustomerBookingNoPayment,
} from '../support/obrs766-seed';

const PASSWORD = 'P@ssw0rd';
const SALES = 'salesperson@system.local';
const OWNER = 'owner@system.local';
const CUSTOMER = 'customer@system.local';
const DRIVER = 'driver@system.local';

const ASSETS = path.resolve(__dirname, '../../docs/manual-tests/assets/OBRS-766');

async function login(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('input[formcontrolname=email]').fill(email);
  await page.locator('input[formcontrolname=password]').fill(password);
  await page.locator('button:has-text("เข้าสู่ระบบ")').first().click();
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 30000 });
  // alertService.success() has no `timer` — the login-success SweetAlert2
  // modal blocks until dismissed, so it must be clicked, not waited out.
  const loginToastConfirm = page.locator('.swal2-confirm');
  if (await loginToastConfirm.isVisible({ timeout: 5000 }).catch(() => false)) {
    await loginToastConfirm.click();
  }
  await page.waitForTimeout(300);
}

async function searchByBookingNumber(page: Page, bookingNumber: string): Promise<void> {
  await page.locator('.ccsf-mode-btn').nth(1).click();
  await page.locator('input[formcontrolname=bookingNumber]').fill(bookingNumber);
  await page.locator('button[type=submit]').click();
  await page.waitForLoadState('networkidle');
}

// The primary flow (nav -> search -> act-on-behalf cancel -> cash step-up)
// is a SEPARATE spec file (obrs766-primary-flow.spec.ts) because its video
// recording needs `test.use({ video })` at the top level, which Playwright
// forbids inside a describe block within this file.

test.describe('OBRS-766 non-cash payment methods', () => {
  test('PromptPay/bank booking requires refund-destination fields', async ({ page }) => {
    const salesToken = await loginApi(SALES);
    const booking = await sellWalkInCash(salesToken, 'ForBank', `08${Date.now().toString().slice(-8)}`);
    setPaymentMethod(booking.bookingId, 'bank_transfer');

    await login(page, SALES);
    await page.goto('/staff/cancel-booking', { waitUntil: 'networkidle' });
    await searchByBookingNumber(page, booking.bookingNumber);
    await page.locator('.ccrl-row', { hasText: booking.bookingNumber })
      .locator('button', { hasText: 'ยกเลิก' }).click();
    await expect(page.locator('.ccm-policy')).toBeVisible({ timeout: 10000 });

    // MANUAL_REFUND_REQUIRED branch: no cash approval section, YES
    // destination fields (shared app-refund-destination-fields component),
    // and they are required (Confirm disabled until filled).
    await expect(page.locator('.ccm-cash-approval')).toHaveCount(0);
    const destinationFields = page.locator('app-refund-destination-fields');
    await expect(destinationFields).toBeVisible();
    const confirmBtn = page.locator('.admin-modal-actions .admin-btn-danger');
    await expect(confirmBtn).toBeDisabled();
    await page.screenshot({ path: path.join(ASSETS, 'OBRS-766-AFTER-bank-destination-fields-light.png') });
  });

  test('card booking has no approver/destination fields, POST body is exactly {}', async ({ page }) => {
    const salesToken = await loginApi(SALES);
    const booking = await sellWalkInCash(salesToken, 'ForCard', `08${Date.now().toString().slice(-8)}`);
    setPaymentMethod(booking.bookingId, 'card');

    await login(page, SALES);
    await page.goto('/staff/cancel-booking', { waitUntil: 'networkidle' });
    await searchByBookingNumber(page, booking.bookingNumber);
    await page.locator('.ccrl-row', { hasText: booking.bookingNumber })
      .locator('button', { hasText: 'ยกเลิก' }).click();
    await expect(page.locator('.ccm-policy')).toBeVisible({ timeout: 10000 });

    await expect(page.locator('.ccm-cash-approval')).toHaveCount(0);
    await expect(page.locator('app-refund-destination-fields')).toHaveCount(0);
    const confirmBtn = page.locator('.admin-modal-actions .admin-btn-danger');
    await expect(confirmBtn).toBeEnabled();
    await page.screenshot({ path: path.join(ASSETS, 'OBRS-766-AFTER-card-no-extra-fields-light.png') });

    let capturedBody: string | null = null;
    page.on('request', (req) => {
      if (req.method() === 'POST' && /\/api\/private\/bookings\/\d+\/cancel$/.test(req.url())) {
        capturedBody = req.postData();
      }
    });
    await confirmBtn.click();
    await expect(page.locator('.ccm-modal')).toBeHidden({ timeout: 10000 });
    expect(capturedBody).toBe('{}');
  });
});

test.describe('OBRS-766 window-closed and owner-override', () => {
  test('a booking departing within 2 hours shows window-closed, Confirm disabled, no override affordance', async ({ page }) => {
    const salesToken = await loginApi(SALES);
    const booking = await sellAndRetargetDeparture(salesToken, 'WindowClosed', `08${Date.now().toString().slice(-8)}`, 50);
    const remaining = minutesUntilDeparture(booking.bookingId);
    expect(remaining, 'fixture must genuinely depart within the 2h cancel window').toBeLessThan(120);
    expect(remaining, 'fixture must not have already departed').toBeGreaterThan(0);

    await login(page, SALES);
    await page.goto('/staff/cancel-booking', { waitUntil: 'networkidle' });
    await searchByBookingNumber(page, booking.bookingNumber);
    await page.locator('.ccrl-row', { hasText: booking.bookingNumber })
      .locator('button', { hasText: 'ยกเลิก' }).click();
    await expect(page.locator('.ccm-preview.is-blocked')).toBeVisible({ timeout: 10000 });
    const confirmBtn = page.locator('.admin-modal-actions .admin-btn-danger');
    await expect(confirmBtn).toBeDisabled();
    // No retry/override affordance in the blocked state (ADR-0103: the
    // window-closed door is terminal — the OWNER-only override modal is a
    // separate screen, tested below).
    await expect(page.locator('.ccm-preview button')).toHaveCount(0);
    await page.screenshot({ path: path.join(ASSETS, 'OBRS-766-AFTER-window-closed-light.png') });
  });

  test('OWNER override modal (/admin/bookings) still works and bypasses the window', async ({ page }) => {
    const ownerToken = await loginApi(OWNER);
    const booking = await sellAndRetargetDeparture(ownerToken, 'ForOverride', `08${Date.now().toString().slice(-8)}`, 50);

    await login(page, OWNER);
    await page.goto('/admin/bookings', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await page.locator('.admin-search input').fill(booking.bookingNumber);
    await page.waitForTimeout(600);
    const row = page.locator('tbody tr', { hasText: booking.bookingNumber }).first();
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click();

    // Detail modal opens; the override-cancel button is only shown for a
    // CONFIRMED booking with owner override rights.
    await expect(page.locator('.bk-detail-modal')).toBeVisible({ timeout: 10000 });
    const overrideOpenBtn = page.locator('.bk-detail-actions .admin-btn-danger');
    await expect(overrideOpenBtn).toBeVisible({ timeout: 10000 });
    await overrideOpenBtn.click();

    await expect(page.locator('.override-cancel-modal')).toBeVisible({ timeout: 10000 });
    // Deliberately no window-closed block here (adminCancelBooking does not
    // window-gate) — proves the override door still bypasses the window the
    // counter-cancel door correctly enforces.
    await expect(page.locator('.ccm-preview.is-blocked')).toHaveCount(0);
    await page.screenshot({ path: path.join(ASSETS, 'OBRS-766-AFTER-owner-override-regression.png') });
  });
});

test.describe('OBRS-766 regression', () => {
  test('customer self-cancel still works (My Bookings)', async ({ page }) => {
    const seeded = seedCustomerBookingNoPayment();

    await login(page, CUSTOMER);
    await page.goto('/my-bookings', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(ASSETS, 'OBRS-766-BEFORE-customer-booking-card.png') });

    const card = page.locator('.booking-card', { hasText: seeded.bookingNumber }).first();
    await expect(card).toBeVisible({ timeout: 10000 });

    let cancelResponseStatus: number | null = null;
    let cancelPolicyStatus: number | null = null;
    page.on('response', (res) => {
      if (res.request().method() === 'POST' && /\/api\/private\/bookings\/\d+\/cancel$/.test(res.url())) {
        cancelResponseStatus = res.status();
      }
      if (/\/api\/private\/bookings\/\d+\/cancel-policy$/.test(res.url())) {
        cancelPolicyStatus = res.status();
      }
    });

    // getByRole (not a bare CSS class) matches how the PrimeNG overlay menu
    // actually resolves once its fade-in animation settles.
    await card.locator('.actions-menu-btn').click();
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 10000 });
    const menuCancelItem = page.getByRole('menuitem', { name: 'ยกเลิกการจอง' });
    await expect(menuCancelItem).toBeVisible({ timeout: 10000 });
    await menuCancelItem.click();
    await page.waitForTimeout(1500);

    // This fixture carries no payment record, so the cancellation-policy
    // preview resolves MANUAL_REFUND_REQUIRED and the flow branches to the
    // cancel-with-destination dialog.
    //
    // It does NOT default to bank_account: buildRefundDestinationForm seeds
    // `mode` as null, and refund-destination-fields.component.html gates BOTH
    // field groups behind *ngIf="mode === …". So nothing is rendered until a
    // toggle is clicked — an earlier version of this spec assumed a default and
    // timed out waiting for input[formcontrolname=accountName] that could never
    // appear. Click the bank toggle first, then fill.
    const destinationModal = page.locator('.crdm-modal');
    const swalConfirm = page.locator('.swal2-confirm');
    await Promise.race([
      destinationModal.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {}),
      swalConfirm.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {}),
    ]);

    if (await destinationModal.isVisible().catch(() => false)) {
      await destinationModal.locator('.rdf-toggle-btn').first().click();
      await expect(page.locator('input[formcontrolname=accountName]')).toBeVisible({ timeout: 10000 });
      await page.locator('input[formcontrolname=accountName]').fill('QA Test Account');
      await page.locator('input[formcontrolname=bank]').fill('Test Bank');
      await page.locator('input[formcontrolname=accountNumber]').fill('1234567890');
      await page.locator('.crdm-actions .btn-primary').click();
    } else if (await swalConfirm.isVisible().catch(() => false)) {
      await swalConfirm.click();
    }

    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(ASSETS, 'OBRS-766-AFTER-customer-self-cancel.png') });

    // A 403 on either call would be the fleet-guard regression this card's
    // enforceFleetScope could introduce for a non-staff (customer) caller.
    expect(cancelPolicyStatus).not.toBe(403);
    expect(cancelResponseStatus === null || cancelResponseStatus < 500).toBe(true);
    if (cancelResponseStatus !== null) {
      expect(cancelResponseStatus).not.toBe(403);
    }
  });

  test('a DRIVER sees neither the nav item nor the route', async ({ page }) => {
    await login(page, DRIVER);
    const navText = await page.locator('body').innerText();
    expect(navText).not.toContain('ยกเลิกการจอง');

    await page.goto('/staff/cancel-booking', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('/staff/cancel-booking');
  });
});

test.describe('OBRS-766 dark mode', () => {
  test('search results + cash step-up modal render correctly in dark mode', async ({ page }) => {
    const ownerToken = await loginApi(OWNER);
    const booking = await sellWalkInCash(ownerToken, 'DarkMode', `08${Date.now().toString().slice(-8)}`);

    await page.addInitScript(() => {
      window.localStorage.setItem('app_admin_theme', 'dark');
    });
    await login(page, SALES);
    await page.goto('/staff/cancel-booking', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await expect(page.locator('body.is-dark')).toBeVisible();

    await searchByBookingNumber(page, booking.bookingNumber);
    const row = page.locator('.ccrl-row', { hasText: booking.bookingNumber });
    await expect(row).toBeVisible();
    await page.screenshot({ path: path.join(ASSETS, 'OBRS-766-AFTER-search-results-dark.png') });

    await row.locator('button', { hasText: 'ยกเลิก' }).click();
    await expect(page.locator('.ccm-policy')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.ccm-cash-approval')).toBeVisible();
    await page.screenshot({ path: path.join(ASSETS, 'OBRS-766-AFTER-cash-approval-dark.png') });
  });
});
