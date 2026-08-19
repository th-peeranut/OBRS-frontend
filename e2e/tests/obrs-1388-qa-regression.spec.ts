import { test, expect, Page } from '@playwright/test';

/**
 * OBRS-1388 QA (black-box) — parcel damage-claim record + cross-counter claim history.
 *
 * Targets the QA session's own already-running local stack (localhost:4200 / localhost:8080,
 * database obrs1388qa) via playwright.obrs1388qa.config.ts — throwaway evidence for the QA
 * report, left uncommitted in the worktree per obrs-qa.md.
 *
 * Fixture parcels (created via API before this spec runs, all on schedule 1 / stops 1->20):
 *   parcel 1 (P-SPYDKJCE3J) sender 0812345678  "TestClaimantA"  -- claim FILED here (AC-2 flow)
 *   parcel 2 (P-RKBBJWJTB4) sender 66812345678 "TestClaimantA"  -- SAME human, spelled long-form
 *   parcel 4 (P-Z5A4AH7MCH) sender 0899990002  "TestClaimantD"  -- claim id 3, already APPROVED via API (i18n test only opens+cancels)
 *   parcel 5 (P-YZHFF4CTFQ) sender 0899990003  "TestClaimantE"  -- claim id 4, PENDING (ceiling test)
 * user_profiles.active_sales_point_id for salesperson@system.local was set to NULL right before
 * this spec ran, to reproduce the real prod state (OBRS-1371) that BR-1 exists for -- observed
 * during QA setup that POST /parcels/walk-in resets it to a default sales point as a side effect,
 * so nothing in this spec re-creates parcels after the NULL reset.
 */

const BASE = 'http://localhost:4200';

async function switchAccount(page: Page, email: string) {
  // No /logout route exists (logout is a navbar button, not a URL) -- clear the
  // stored session directly and re-login as the next role.
  await page.evaluate(() => localStorage.clear());
  await login(page, email);
}

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[formcontrolname="password"]').fill('P@ssw0rd');
  await page.getByRole('button', { name: /เข้าสู่ระบบ|login|sign in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
}

/** /staff/parcels/schedule/:scheduleId lands on the "ตรวจรับ" (verify) tab by default;
 * the "ยื่นเคลม" action lives on the sibling "ส่งมอบ" (deliver) tab (parcel-delivery-list-page). */
async function goToDeliveryTab(page: Page, scheduleId: string) {
  await page.goto(`${BASE}/staff/parcels/schedule/${scheduleId}`);
  await page.getByRole('tab', { name: 'ส่งมอบ' }).click();
}

test.describe.serial('OBRS-1388 parcel damage claims', () => {
  test('AC-2 flow: file on parcel A, approve as OWNER, claim visible on parcel B before decision (cross-spelling phone) + BR-1 + BR-11', async ({ page }) => {
    // ---- Step 1: SALESPERSON files a claim on parcel A (P-SPYDKJCE3J) ----
    await login(page, 'salesperson@system.local');
    await goToDeliveryTab(page, '1');

    const rowA = page.locator('tr', { hasText: 'P-SPYDKJCE3J' });
    await expect(rowA).toBeVisible({ timeout: 15000 });
    await rowA.getByRole('button', { name: 'ยื่นเคลม' }).click();

    const dialog = page.locator('.admin-modal');
    await expect(dialog).toBeVisible();
    // AC-2: history panel visible at first paint, before any decision. Claimant A has no
    // prior claims yet, so it is legitimately empty here.
    await expect(dialog.getByText('ลูกค้ารายนี้ไม่เคยเคลมมาก่อน')).toBeVisible({ timeout: 10000 });

    await dialog.locator('textarea[formcontrolname="claimReason"]').fill('กล่องเปิด ของด้านในแตก - OBRS-1388 QA');
    await dialog.getByRole('button', { name: 'ยื่นเคลม' }).click();

    // Filed confirmation shows the SERVER-resolved claimant name/phone.
    await expect(dialog.getByText('TestClaimantA').first()).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText('0812345678', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'e2e-evidence/OBRS-1388-AFTER-staff-claim-filed-confirm.png', fullPage: true });
    await dialog.getByRole('button', { name: 'เสร็จสิ้น (รอ OWNER อนุมัติ)' }).click();
    await expect(dialog).toBeHidden();

    // ---- Step 2: OWNER queue shows the PENDING claim, BR-1 unassigned label ----
    await switchAccount(page, 'owner@system.local');
    await page.goto(`${BASE}/admin/parcel-claims`);

    const queueRow = page.locator('tr', { hasText: 'P-SPYDKJCE3J' });
    await expect(queueRow).toBeVisible({ timeout: 15000 });
    // BR-1: site 1 of 3 -- the owner queue column.
    await expect(queueRow.getByText('ยังไม่ได้กำหนดจุดขาย')).toBeVisible();
    await page.screenshot({ path: 'e2e-evidence/OBRS-1388-AFTER-owner-queue-pending.png', fullPage: true });

    await queueRow.getByRole('button', { name: 'อนุมัติ' }).click();
    const approveModal = page.locator('.admin-modal');
    await expect(approveModal).toBeVisible();
    // ceiling hint text visible before any submit attempt.
    await expect(approveModal.getByText('สูงสุด 500 บาทต่อพัสดุ ตามระเบียบรถร่วม บขส. 2547')).toBeVisible();
    // BR-1: site 2 of 3 -- the approve modal's own claim-info panel. (The history table
    // below can ALSO legitimately show this claim itself with the same label -- scope tightly.)
    await expect(approveModal.locator('.pca-info-value').getByText('ยังไม่ได้กำหนดจุดขาย')).toBeVisible();
    await page.screenshot({ path: 'e2e-evidence/OBRS-1388-AFTER-approve-modal-500-hint.png', fullPage: true });

    await approveModal.locator('input[formcontrolname="approvedAmount"]').fill('500');
    await approveModal.locator('textarea[formcontrolname="decisionNote"]').fill('ยอมรับตามระเบียบ เพดาน 500 บาท');

    // ---- BR-11: confirm gates the money -- dismiss must not call the API ----
    let approveCalled = false;
    await page.route('**/api/private/parcel-claims/*/approve', async (route) => {
      approveCalled = true;
      await route.continue();
    });

    await approveModal.getByRole('button', { name: 'อนุมัติ', exact: true }).click();
    const confirmDialog = page.locator('.swal2-popup, [role="dialog"]:has-text("ยืนยันการอนุมัติ")').first();
    await expect(confirmDialog).toBeVisible({ timeout: 10000 });
    await confirmDialog.getByRole('button', { name: 'ยกเลิก' }).click();
    await expect(confirmDialog).toBeHidden();
    await page.waitForTimeout(500);
    expect(approveCalled, 'approve API must NOT be called when the BR-11 confirm dialog is dismissed').toBe(false);

    // Real confirm this time.
    await approveModal.getByRole('button', { name: 'อนุมัติ', exact: true }).click();
    const confirmDialog2 = page.locator('.swal2-popup, [role="dialog"]:has-text("ยืนยันการอนุมัติ")').first();
    await expect(confirmDialog2).toBeVisible({ timeout: 10000 });
    await confirmDialog2.getByRole('button', { name: 'อนุมัติ' }).click();
    await page.waitForResponse((r) => r.url().includes('/parcel-claims/') && r.url().includes('/approve') && r.request().method() === 'POST');
    expect(approveCalled, 'approve API must be called after the BR-11 confirm dialog is confirmed').toBe(true);
    await expect(page.locator('tr', { hasText: 'P-SPYDKJCE3J' })).toBeHidden({ timeout: 10000 });

    // ---- Step 3: back at the counter, open parcel B (same human, 66-prefixed phone) ----
    await switchAccount(page, 'salesperson@system.local');
    await goToDeliveryTab(page, '1');

    const rowB = page.locator('tr', { hasText: 'P-RKBBJWJTB4' });
    await expect(rowB).toBeVisible({ timeout: 15000 });
    await rowB.getByRole('button', { name: 'ยื่นเคลม' }).click();

    const dialogB = page.locator('.admin-modal');
    await expect(dialogB).toBeVisible();
    // THE MONEY SHOT: claim A (filed on a DIFFERENT parcel, phone spelled 0812345678) must
    // appear in claimant A's history on parcel B (phone spelled 66812345678) -- BEFORE any
    // decision is made here, at first paint, via ThaiMsisdn canonicalization (BR-2).
    const historyRow = dialogB.locator('table tr', { hasText: 'P-SPYDKJCE3J' });
    await expect(historyRow).toBeVisible({ timeout: 10000 });
    await expect(historyRow.getByText('อนุมัติแล้ว')).toBeVisible();
    // BR-1: site 3 of 3 -- every history row.
    await expect(historyRow.getByText('ยังไม่ได้กำหนดจุดขาย')).toBeVisible();
    await page.screenshot({ path: 'e2e-evidence/OBRS-1388-AFTER-history-visible-cross-phone-spelling.png', fullPage: true });
  });

  test('SALESPERSON cannot reach the owner /admin/parcel-claims surface (UI)', async ({ page }) => {
    await login(page, 'salesperson@system.local');
    // No nav item at all for this role.
    await goToDeliveryTab(page, '1');
    await expect(page.getByText('เคลมพัสดุ')).toHaveCount(0);

    // Direct URL is bounced by AuthGuard.
    await page.goto(`${BASE}/admin/parcel-claims`);
    await page.waitForTimeout(1500);
    expect(page.url(), 'AuthGuard must redirect a SALESPERSON away from the OWNER-only route').not.toContain('/admin/parcel-claims');
  });

  test('ceiling validation: 501 shows inline range error before submit, submit stays disabled', async ({ page }) => {
    await login(page, 'owner@system.local');
    await page.goto(`${BASE}/admin/parcel-claims`);

    const rowE = page.locator('tr', { hasText: 'P-YZHFF4CTFQ' });
    await expect(rowE).toBeVisible({ timeout: 15000 });
    await rowE.getByRole('button', { name: 'อนุมัติ' }).click();

    const modal = page.locator('.admin-modal');
    await expect(modal).toBeVisible();
    const amountInput = modal.locator('input[formcontrolname="approvedAmount"]');

    await amountInput.fill('501');
    await amountInput.blur();
    await expect(modal.getByText('กรอกจำนวนเงินระหว่าง 0.01–500 บาท')).toBeVisible();
    await expect(modal.getByRole('button', { name: 'อนุมัติ', exact: true })).toBeDisabled();
    await page.screenshot({ path: 'e2e-evidence/OBRS-1388-AFTER-ceiling-501-inline-error.png', fullPage: true });

    await amountInput.fill('0');
    await amountInput.blur();
    await expect(modal.getByText('กรอกจำนวนเงินระหว่าง 0.01–500 บาท')).toBeVisible();

    await amountInput.fill('-50');
    await amountInput.blur();
    await expect(modal.getByText('กรอกจำนวนเงินระหว่าง 0.01–500 บาท')).toBeVisible();
  });

  test('i18n: Thai renders cold, and a live language switch (no reload) updates the claim dialog', async ({ page }) => {
    await login(page, 'salesperson@system.local');
    await goToDeliveryTab(page, '1');

    // Cold load: default language is Thai.
    await expect(page.getByRole('button', { name: 'ยื่นเคลม' }).first()).toBeVisible({ timeout: 15000 });

    const rowE2 = page.locator('tr', { hasText: 'P-Z5A4AH7MCH' });
    await rowE2.getByRole('button', { name: 'ยื่นเคลม' }).click();
    const dialog = page.locator('.admin-modal');
    await expect(dialog.getByText('ยื่นเคลมความเสียหาย')).toBeVisible();
    await dialog.getByRole('button', { name: 'ยกเลิก' }).click();

    // Live switch, no reload. The dropdown items are role="menuitemradio" with an
    // aria-label like "เปลี่ยนเป็นภาษาอังกฤษ" -- the accessible NAME is that label, not the
    // visible endonym text, so match on visible text instead of accessible name.
    await page.locator('.navbar-lang-trigger').first().click();
    await page.locator('.navbar-lang-menu').getByText('English', { exact: true }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: 'File Claim' }).first()).toBeVisible({ timeout: 10000 });

    await rowE2.getByRole('button', { name: 'File Claim' }).click();
    const dialogEn = page.locator('.admin-modal');
    await expect(dialogEn.getByRole('heading', { name: 'File a damage claim' })).toBeVisible();
    await page.screenshot({ path: 'e2e-evidence/OBRS-1388-AFTER-i18n-live-switch-en.png', fullPage: true });

    // Switch back to Thai for later tests / cleanliness.
    await dialogEn.getByRole('button', { name: /Cancel/i }).click();
    await page.locator('.navbar-lang-trigger').first().click();
    await page.locator('.navbar-lang-menu').getByText('ไทย', { exact: true }).click();
  });

  test('the 16th expense category (PARCEL_COMPENSATION) renders its Thai label, not a raw i18n key', async ({ page }) => {
    await login(page, 'owner@system.local');

    // Site 1: admin expenses page.
    await page.goto(`${BASE}/admin/expenses`);
    await expect(page.getByText('ค่าชดเชยพัสดุเสียหาย').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('ADMIN.EXPENSES.CATEGORIES.PARCEL_COMPENSATION')).toHaveCount(0);

    // Site 2: driver-cash-day-return-modal (the salesperson's cash box the claim payout landed in).
    await page.goto(`${BASE}/admin/settlements`);
    const dayRow = page.locator('tr, [role="row"]', { hasText: 'salesperson@system.local' }).first();
    if (await dayRow.count() === 0) {
      // Fall back: click the first non-header row in the driver-cash days list.
      await page.locator('.admin-table tbody tr').first().click();
    } else {
      await dayRow.click();
    }
    const returnModal = page.locator('.admin-modal, [role="dialog"]').first();
    await expect(returnModal).toBeVisible({ timeout: 10000 });
    // Two entries land here (both OBRS-1388 test claims paid out of the same filer's box) --
    // both correctly composed, not a raw key; assert on the first and that zero raw keys leaked.
    await expect(returnModal.getByText('ค่าชดเชยพัสดุเสียหาย').first()).toBeVisible({ timeout: 10000 });
    await expect(returnModal.getByText('ADMIN.EXPENSES.CATEGORIES.PARCEL_COMPENSATION')).toHaveCount(0);
    await page.screenshot({ path: 'e2e-evidence/OBRS-1388-AFTER-expense-category-label-return-modal.png', fullPage: true });
  });
});
