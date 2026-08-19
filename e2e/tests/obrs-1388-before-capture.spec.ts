import { test, expect, Page } from '@playwright/test';

/**
 * OBRS-1388 QA -- BEFORE evidence. Runs against ../OBRS-frontend (clean origin/dev
 * checkout, HEAD c1626562) served on :4200, pointed at the SAME local backend :8080
 * used for the AFTER evidence (additive API -- the old FE simply never calls the
 * new endpoints). Login/DB fixtures are identical (obrs1388qa, same seed accounts).
 */

const BASE = 'http://localhost:4200';

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[formcontrolname="password"]').fill('P@ssw0rd');
  await page.getByRole('button', { name: /เข้าสู่ระบบ|login|sign in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
}

test('BEFORE: staff parcel delivery list has NO "ยื่นเคลม" action', async ({ page }) => {
  await login(page, 'salesperson@system.local');
  await page.goto(`${BASE}/staff/parcels/schedule/1`);
  await page.getByRole('tab', { name: 'ส่งมอบ' }).click();
  await expect(page.locator('table').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'ยื่นเคลม' })).toHaveCount(0);
  await page.screenshot({ path: 'docs/prod/evidence/OBRS-1388-BEFORE-staff-delivery-list-no-claim-action.png', fullPage: true });
});

test('BEFORE: /admin/parcel-claims route does not exist', async ({ page }) => {
  await login(page, 'owner@system.local');
  await page.goto(`${BASE}/admin/parcel-claims`);
  await page.waitForTimeout(1500);
  // No nav item, and the route bounces (AuthGuard has no matching route data at all --
  // Angular's router falls through to the wildcard/home redirect).
  await expect(page.getByText('เคลมพัสดุ')).toHaveCount(0);
  await page.screenshot({ path: 'docs/prod/evidence/OBRS-1388-BEFORE-admin-parcel-claims-route-absent.png', fullPage: true });
});
