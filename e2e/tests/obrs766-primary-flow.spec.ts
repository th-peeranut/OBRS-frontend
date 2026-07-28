/**
 * OBRS-766 primary flow, recorded on video (webm) — salesperson logs in,
 * searches, and cancels a CONFIRMED booking they did NOT sell (act-on-behalf),
 * including the cash second-person approval step-up. Split into its own file
 * because `test.use({ video })` must be top-level, not inside a describe.
 * See obrs766-counter-cancel.spec.ts for the rest of the AC matrix and
 * ../support/obrs766-seed.ts for the self-seeding helpers.
 *
 * SELF-SEEDING: the booking this test cancels is created fresh via the real
 * API at the start of the test (sold by owner@system.local, so it is
 * genuinely NOT sold by the salesperson doing the cancelling) — a re-run
 * never depends on a booking an earlier run already cancelled.
 */
import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import { loginApi, sellWalkInCash } from '../support/obrs766-seed';

const PASSWORD = 'P@ssw0rd';
const SALES = 'salesperson@system.local';
const OWNER = 'owner@system.local';
const ASSETS = path.resolve(__dirname, '../../docs/manual-tests/assets/OBRS-766');

test.use({
  video: { mode: 'on', size: { width: 1280, height: 900 } },
});

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

test('salesperson logs in, sees nav, searches, cancels a booking they did not sell (cash step-up)', async ({ page }) => {
  const ownerToken = await loginApi(OWNER);
  const phone = `08${Date.now().toString().slice(-8)}`;
  const booking = await sellWalkInCash(ownerToken, 'ActOnBehalf', phone);
  const maskedTail = phone.slice(-4);

  // AC1: nav item + page loads
  await login(page, SALES);
  const navItem = page.locator('a, button', { hasText: 'ยกเลิกการจอง' }).first();
  await expect(navItem).toBeVisible();
  await page.screenshot({ path: path.join(ASSETS, 'OBRS-766-AFTER-staff-nav.png') });

  await navItem.click();
  await page.waitForURL(/\/staff\/cancel-booking/);
  await expect(page.locator('.ccsf-form')).toBeVisible();

  // AC2: search by phone, then by booking number — result renders booking
  // number, full name, MASKED phone, route/departure, total, status; raw
  // phone never present in the DOM or the network response.
  let sawRawPhoneInResponse = false;
  page.on('response', async (res) => {
    if (/\/api\/private\/bookings\/search/.test(res.url())) {
      const body = await res.text().catch(() => '');
      if (body.includes(phone)) sawRawPhoneInResponse = true;
    }
  });

  await page.locator('input[formcontrolname=phone]').fill(phone);
  await page.locator('button[type=submit]').click();
  await page.waitForLoadState('networkidle');

  const row = page.locator('.ccrl-row', { hasText: booking.bookingNumber });
  await expect(row).toBeVisible();
  await expect(row.locator('.ccrl-phone')).toContainText('••••');
  await expect(row.locator('.ccrl-phone')).toContainText(maskedTail);
  const rowText = await row.innerText();
  expect(rowText).not.toContain(phone);
  const domHtml = await page.content();
  expect(domHtml).not.toContain(phone);
  expect(sawRawPhoneInResponse).toBe(false);

  // search by booking number too
  await searchByBookingNumber(page, booking.bookingNumber);
  const row2 = page.locator('.ccrl-row', { hasText: booking.bookingNumber });
  await expect(row2).toBeVisible();
  await page.screenshot({ path: path.join(ASSETS, 'OBRS-766-AFTER-search-results-light.png') });

  // AC3/AC4: open the modal on a CONFIRMED booking the salesperson did NOT
  // sell (sold by owner@system.local) — the act-on-behalf case. Refund
  // amount/rate must show BEFORE commit.
  await row2.locator('button', { hasText: 'ยกเลิก' }).click();
  await expect(page.locator('.ccm-modal')).toBeVisible();
  await expect(page.locator('.ccm-policy')).toBeVisible({ timeout: 10000 });
  const policyText = await page.locator('.ccm-policy').innerText();
  expect(policyText).toMatch(/80%/); // EARLY window rate per system_configs default

  // Refund must be 80% of THIS booking's own total — derived, never hardcoded.
  // sellWalkInCash alternates scheduleId 1/2 per call and those schedules are
  // priced differently (฿200 vs ฿180), so a literal expectation silently depends
  // on call order: this assertion was written as /144/ (= 180 * 0.8) and failed
  // against a ฿200 booking whose refund of ฿160.00 was perfectly correct.
  const rowTotalText = await row2.locator('td').filter({ hasText: /฿/ }).last().innerText();
  const rowTotal = Number(rowTotalText.replace(/[^0-9.]/g, ''));
  expect(rowTotal).toBeGreaterThan(0);
  const expectedRefund = (rowTotal * 0.8).toFixed(2);
  expect(policyText.replace(/,/g, '')).toContain(expectedRefund);
  await page.screenshot({ path: path.join(ASSETS, 'OBRS-766-AFTER-cancel-modal-policy-light.png') });

  // Cash step-up section: visually distinct + tells staff to hand the
  // device to an owner.
  const cashSection = page.locator('.ccm-cash-approval');
  await expect(cashSection).toBeVisible();
  await expect(page.locator('.ccm-cash-approval-title')).toBeVisible();
  await expect(page.locator('.ccm-cash-approval-body')).toBeVisible();
  await page.screenshot({ path: path.join(ASSETS, 'OBRS-766-AFTER-cash-approval-light.png') });

  // AC6: own email as approver -> inline hint + Confirm stays disabled
  const confirmBtn = page.locator('.admin-modal-actions .admin-btn-danger');
  await page.locator('input[formcontrolname=approverEmail]').fill(SALES);
  await page.locator('input[formcontrolname=approverPassword]').fill(PASSWORD);
  await expect(page.locator('.ccm-self-hint')).toBeVisible();
  await expect(confirmBtn).toBeDisabled();

  // AC8 setup + AC7: wrong password for a DIFFERENT (valid) approver ->
  // rejected, password field cleared; then the correct password succeeds
  // in exactly ONE more request (no second round trip / approval queue).
  // (Previously failed here — CounterCancelModalComponent compared the
  // backend's derived UPPER_SNAKE errorCode against dotted messageKey
  // literals and never matched. Fixed in commit 7438d81a via
  // errorCodeFromMessageKey(); these are now plain hard assertions.)
  await page.locator('input[formcontrolname=approverEmail]').fill(OWNER);
  await page.locator('input[formcontrolname=approverPassword]').fill('WrongPassword123!');
  await expect(confirmBtn).toBeEnabled();

  const cancelPosts: { status: number; url: string }[] = [];
  page.on('response', (res) => {
    if (res.request().method() === 'POST' && /\/api\/private\/bookings\/\d+\/cancel$/.test(res.url())) {
      cancelPosts.push({ status: res.status(), url: res.url() });
    }
  });

  await confirmBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ASSETS, 'OBRS-766-AFTER-wrong-approver-rejected.png') });

  await expect(page.locator('.ccm-cash-approval .admin-error').last()).toBeVisible({ timeout: 10000 });
  await expect(page.locator('input[formcontrolname=approverPassword]')).toHaveValue('');
  expect(cancelPosts.length).toBe(1);
  expect(cancelPosts[0].status).toBeGreaterThanOrEqual(400);

  // AC7: correct approver credentials -> succeeds in one MORE request
  // (total 2 POSTs to /cancel across this whole flow: one rejected, one
  // accepted — never a separate "approve" endpoint).
  await page.locator('input[formcontrolname=approverPassword]').fill(PASSWORD);
  await confirmBtn.click();
  await expect(page.locator('.ccm-modal')).toBeHidden({ timeout: 10000 });
  expect(cancelPosts.length).toBe(2);
  expect(cancelPosts[1].status).toBe(200);
  await page.screenshot({ path: path.join(ASSETS, 'OBRS-766-AFTER-cancel-success.png') });

  // alertService.success() on the cancellation result is ALSO a
  // no-timer SweetAlert2 modal (same shape as the login toast) — dismiss it
  // before driving the page further.
  const successToastConfirm = page.locator('.swal2-confirm');
  if (await successToastConfirm.isVisible({ timeout: 5000 }).catch(() => false)) {
    await successToastConfirm.click();
  }

  // Confirm the cancellation actually landed: re-search shows CANCELLED /
  // not cancellable.
  await searchByBookingNumber(page, booking.bookingNumber);
  const finalRow = page.locator('.ccrl-row', { hasText: booking.bookingNumber });
  await expect(finalRow).toBeVisible();
  await expect(finalRow.locator('button', { hasText: 'ยกเลิก' })).toHaveCount(0);
});
