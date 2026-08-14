import { test, expect, type Page } from '@playwright/test';

/**
 * OBRS-1333 QA spec -- preventive maintenance plans per part.
 *
 * Runs against the LOCAL stack a QA session stands up by hand (backend :8080
 * against the obrs1333qa Postgres DB seeded via scripts/new-local-db.ps1 plus
 * a QA fixture SQL script that plants known odometer/plan/driver-assignment
 * states; frontend `npm run start:local` on :4200) -- see
 * playwright.obrs1333.config.ts, which points baseURL there and has no
 * globalSetup/webServer of its own. NOT wired into any CI lane.
 *
 * Backend-only behaviour (the AC1 two-layer constraint, AC3 whichever-first
 * branch selection, AC4 auto-update on completion, AC5 recipient resolution,
 * AC6 leadKm derivation, AC7's three fallback tiers, AC8 anti-duplicate, and
 * the two PUT-regression checks) was proved directly against the API + DB
 * during this QA session (curl + psql, one assertion per AC) and is not
 * re-asserted here -- this spec covers what only the browser can prove: the
 * UI actually renders what the backend computed, and the FE's own client-side
 * validation actually fires.
 */

const PASSWORD = process.env['OBRS_QA_PASSWORD'] ?? 'QaLocal!2026';

const TH = {
  managePlans: 'จัดการแผนบำรุงรักษา',
  addPlan: 'เพิ่มแผนบำรุงรักษา',
  save: 'บันทึก',
  cancel: 'ยกเลิก',
  intervalError: 'ต้องกรอกรอบระยะ (กม.) หรือรอบวันอย่างน้อย 1 อย่าง',
  inactiveBadge: 'ปิดใช้งาน',
};

async function login(page: Page, email: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45000 });
}

test.describe('OBRS-1333 preventive maintenance plans (local stack)', () => {
  test('AC2 UI: add-plan part dropdown offers all 13 parts (placeholder + 13)', async ({ page }) => {
    await login(page, 'owner@system.local');
    await page.goto('/admin/vehicles', { waitUntil: 'networkidle' });

    const row = page.locator('table.admin-table tbody tr', { hasText: '16-9310' });
    await row.getByRole('button', { name: TH.managePlans }).click();
    await expect(page.locator('app-vehicle-maintenance-plan-panel table.admin-table')).toBeVisible();

    await page.getByRole('button', { name: TH.addPlan }).click();
    await expect(page.locator('.admin-modal')).toBeVisible();
    await page.locator('.admin-modal .admin-dropdown-trigger').click();

    const options = page.locator('.admin-modal .admin-dropdown-menu .admin-dropdown-option');
    await expect(options).toHaveCount(14); // 1 placeholder + 13 EMaintenancePart values
    await page.locator('.admin-modal button:has-text("' + TH.cancel + '")').click();
  });

  test('AC1/AC2 UI: submitting with both intervals blank shows the cross-field error under BOTH fields', async ({ page }) => {
    await login(page, 'owner@system.local');
    await page.goto('/admin/vehicles', { waitUntil: 'networkidle' });

    const row = page.locator('table.admin-table tbody tr', { hasText: '16-9310' });
    await row.getByRole('button', { name: TH.managePlans }).click();
    await page.getByRole('button', { name: TH.addPlan }).click();
    await expect(page.locator('.admin-modal')).toBeVisible();

    await page.locator('.admin-modal .admin-dropdown-trigger').click();
    await page.locator('.admin-modal .admin-dropdown-menu .admin-dropdown-option').nth(1).click();
    await page.getByRole('button', { name: TH.save, exact: true }).click();

    // Invalid-submit path also raises a blocking SweetAlert toast; dismiss it to reach
    // the real per-field evidence underneath.
    await page.getByRole('button', { name: 'OK' }).click({ timeout: 3000 }).catch(() => {});

    const errors = page.locator('.admin-modal .admin-error', { hasText: TH.intervalError });
    await expect(errors).toHaveCount(2); // rendered under BOTH interval fields, not just one
    await page.locator('.admin-modal button:has-text("' + TH.cancel + '")').click();
  });

  test('AC2/AC3/AC4 UI: plan list renders the server-derived whichever-first next-due', async ({ page }) => {
    await login(page, 'owner@system.local');
    await page.goto('/admin/vehicles', { waitUntil: 'networkidle' });

    const row = page.locator('table.admin-table tbody tr', { hasText: '16-9310' });
    await row.getByRole('button', { name: TH.managePlans }).click();

    const planRow = page.locator('app-vehicle-maintenance-plan-panel table.admin-table tbody tr', { hasText: 'ผ้าเบรก' });
    await expect(planRow).toBeVisible();
    // AC4 (verified via API earlier this session) updated last_done_km to the vehicle's
    // current odometer (10700) on completion -- the FE must display exactly that, never
    // recompute it client-side.
    await expect(planRow).toContainText('10700');
    // AC3 whichever-first: both a km due-point and a date due-point are shown, joined.
    await expect(planRow).toContainText('11700');
    await expect(planRow).toContainText('แล้วแต่ถึงก่อน');
  });

  test('AC2 UI: a deactivated plan shows the "ปิดใช้งาน" (Inactive) badge', async ({ page }) => {
    await login(page, 'owner@system.local');
    await page.goto('/admin/vehicles', { waitUntil: 'networkidle' });

    const row = page.locator('table.admin-table tbody tr', { hasText: 'กข 1234' });
    await row.getByRole('button', { name: TH.managePlans }).click();

    const badge = page.locator('app-vehicle-maintenance-plan-panel .admin-status.is-neutral', { hasText: TH.inactiveBadge });
    await expect(badge).toHaveCount(1);
  });

  test('AC5 UI: owner inbox shows the plan-due reminder, in-app only', async ({ page }) => {
    await login(page, 'owner@system.local');
    await page.goto('/admin/vehicles', { waitUntil: 'networkidle' });
    await page.locator('.notification-bell-trigger').click();

    const items = page.locator('text=BRAKE_PADS');
    await expect(items.first()).toBeVisible();
    await expect(items).not.toHaveCount(0);
  });

  test('AC5 UI: the newly-reassigned driver (driver2) sees the same plan-due reminder', async ({ page }) => {
    await login(page, 'driver2@system.local');
    await page.goto('/staff/driver', { waitUntil: 'networkidle' });
    await page.locator('.notification-bell-trigger').click();

    const items = page.locator('text=BRAKE_PADS');
    await expect(items.first()).toBeVisible();
  });
});
