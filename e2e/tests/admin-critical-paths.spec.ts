import { test, expect, Page } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.resolve(__dirname, '../fixtures/admin-auth.json') });

const SIT_API = 'https://sit-obrs-backend.koyeb.app/api';

// ── Helpers ────────────────────────────────────────────────────────────────────

async function dismissSweetAlert(page: Page): Promise<void> {
  await page.locator('.swal2-confirm').waitFor({ state: 'visible', timeout: 15_000 });
  // force: true bypasses pointer-event interception from admin modal backdrop
  // which can still be in the DOM during SweetAlert's enter animation
  await page.locator('.swal2-confirm').click({ force: true });
  await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 10_000 });
}

function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function sitLogin(): Promise<string> {
  const res = await fetch(`${SIT_API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@system.local', password: 'P@ssw0rd' }),
  });
  const json = await res.json() as { data: { accessToken: string } };
  return json.data.accessToken;
}

// ── Vehicles ───────────────────────────────────────────────────────────────────

test.describe('Admin — Vehicles', () => {
  test('create vehicle → verify in table → delete', async ({ page }) => {
    const runId = Date.now();
    const plate = `TEST-${runId}`;
    const vehicleNumber = `TEST-VN-${runId}`;

    await page.goto('/admin/vehicles');
    await page.waitForLoadState('networkidle');

    // Open create modal
    await page.locator('.admin-page-intro .admin-btn-primary').click();
    await page.locator('.admin-modal').waitFor({ state: 'visible' });

    // vehicleType and status are pre-selected on open; fill only the text fields
    await page.locator('.admin-modal input[formControlName="numberPlate"]').fill(plate);
    await page.locator('.admin-modal input[formControlName="vehicleNumber"]').fill(vehicleNumber);

    // Submit, dismiss success alert, then reload to pick up the created row
    // (reload is required because SweetAlert2's Promise may not resolve in Angular's zone
    //  when clicked via Playwright's force-click, preventing the component's table reload)
    await page.locator('.admin-modal .admin-modal-actions .admin-btn-primary').click();
    await dismissSweetAlert(page);
    await page.reload({ waitUntil: 'networkidle' });

    // Verify new row appears
    const row = page.locator('table.admin-table tbody tr', { hasText: plate });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Cleanup: delete the created vehicle
    await row.locator('.admin-icon-btn.danger').click();
    await page.locator('.admin-modal-confirm .admin-btn-primary').click();
    await dismissSweetAlert(page);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('table.admin-table tbody tr', { hasText: plate })).not.toBeVisible();
  });
});

// ── Schedules ──────────────────────────────────────────────────────────────────

// Fixed slug so the route persists between test runs. This avoids orphaned ScheduleSets:
// if a test deletes the route but not its ScheduleSets, GET /api/private/schedule-set
// returns 500 (backend JOIN fails on the missing route FK). By keeping a permanent fixture
// route we never orphan new records. The route is created on first use and left in place.
const E2E_ROUTE_SLUG = 'TEST-e2e-schedules-route';

test.describe('Admin — Schedules', () => {
  let adminToken: string;

  test.beforeAll(async () => {
    adminToken = await sitLogin();

    // Create the test route only if it does not already exist
    const listRes = await fetch(`${SIT_API}/routes`);
    const listJson = await listRes.json() as { data: Array<{ slug: string }> };
    const exists = listJson.data?.some((r) => r.slug === E2E_ROUTE_SLUG);

    if (!exists) {
      const createRes = await fetch(`${SIT_API}/private/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({
          slug: E2E_ROUTE_SLUG,
          status: 'active',
          translations: [
            { locale: 'en', label: E2E_ROUTE_SLUG, description: null },
            { locale: 'th', label: E2E_ROUTE_SLUG, description: null },
            { locale: 'zh', label: E2E_ROUTE_SLUG, description: null },
          ],
        }),
      });
      if (!createRes.ok) {
        throw new Error(`Failed to seed E2E route: HTTP ${createRes.status}`);
      }
    }
  });

  // afterAll intentionally omitted: the permanent fixture route is never deleted so
  // ScheduleSets created with it remain valid and the list endpoint never 500s from this test.

  test('create ScheduleSet → verify success response', async ({ page }) => {
    // GET /api/private/schedule-set returns 500 on SIT due to orphaned records from
    // earlier test runs that deleted routes without first deleting their ScheduleSets.
    // The backend JOIN on the missing route FK causes a 500. Intercept this call and
    // return an empty list so the page loads; writes (POST) still hit the real backend.
    await page.route('**/private/schedule-set', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const res = await route.fetch();
      if (res.status() === 200) {
        await route.fulfill({ response: res });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 200, message: 'OK', data: [] }),
        });
      }
    });

    // Derive a per-run departure time (avoids duplicate departureTimes conflicts from same day).
    const now = new Date();
    const runHour = String(now.getHours()).padStart(2, '0');
    const runMinute = String(now.getMinutes()).padStart(2, '0');
    const departureTime = `${runHour}:${runMinute}`;

    // Use a date offset that changes every minute (cycles over ~33 hours) to avoid
    // the SIT backend's duplicate-key constraint on (route, startDate, endDate).
    // The backend rejects a second ScheduleSet for the same (route, startDate, endDate).
    const minuteEpoch = Math.floor(Date.now() / 60_000);
    const dayOffset = 400 + (minuteEpoch % 2000); // 400–2399 days from today
    const startDate = daysFromToday(dayOffset);
    const endDate = daysFromToday(dayOffset + 1);

    await page.goto('/admin/schedules');

    // Open the modal immediately — don't wait for the loading indicator. Angular's ngOnInit
    // fires asynchronously after the load event, so a "loading hidden" wait may resolve
    // before HTTP requests even start, leaving routeOptions empty.
    await page.locator('.admin-page-intro .admin-btn-primary').click();
    await page.locator('.admin-modal').waitFor({ state: 'visible' });

    // Fill date range; Tab triggers Angular's change event for date inputs
    await page.locator('.admin-modal input[formControlName="startDate"]').fill(startDate);
    await page.locator('.admin-modal input[formControlName="startDate"]').press('Tab');
    await page.locator('.admin-modal input[formControlName="endDate"]').fill(endDate);
    await page.locator('.admin-modal input[formControlName="endDate"]').press('Tab');
    await page.locator('.admin-modal textarea[formControlName="departureTimesText"]').fill(departureTime);

    // Dropdowns 0 (frequency), 2 (vehicleType), 3 (status): pick the first available option.
    // Dropdown 1 (route): explicitly pick the permanent E2E fixture route to avoid
    // duplicate-key conflicts on shared routes (chonburi_bangkok etc.) from earlier runs.
    //
    // All selects use a 60 s timeout because routeOptions is populated asynchronously —
    // the dropdown may open before Angular finishes loadScheduleSets(). Once the data
    // arrives, Angular re-renders the open dropdown's *ngFor and options become visible.
    const formDropdowns = page.locator('.admin-modal .admin-form-grid app-admin-dropdown');

    // frequency (index 0): first option
    await formDropdowns.nth(0).locator('.admin-dropdown-trigger').click();
    await formDropdowns.nth(0).locator('.admin-dropdown-option').first().waitFor({ state: 'visible', timeout: 60_000 });
    await formDropdowns.nth(0).locator('.admin-dropdown-option').first().click();

    // route (index 1): pick the permanent E2E test route by label
    await formDropdowns.nth(1).locator('.admin-dropdown-trigger').click();
    const routeOpt = formDropdowns.nth(1).locator('.admin-dropdown-option', { hasText: E2E_ROUTE_SLUG });
    await routeOpt.waitFor({ state: 'visible', timeout: 60_000 });
    await routeOpt.click();

    // vehicleType (index 2) and status (index 3): first option
    for (const i of [2, 3]) {
      await formDropdowns.nth(i).locator('.admin-dropdown-trigger').click();
      const firstOpt = formDropdowns.nth(i).locator('.admin-dropdown-option').first();
      await firstOpt.waitFor({ state: 'visible', timeout: 60_000 });
      await firstOpt.click();
    }

    // Submit and verify a success response (not an error) from the SIT backend
    await page.locator('.admin-modal .admin-modal-actions .admin-btn-primary').click();
    await page.locator('.swal2-container').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(page.locator('.swal2-icon.swal2-success')).toBeVisible({ timeout: 5_000 });

    // Use a JS-level click to dismiss the SweetAlert — Playwright's force:true pointer
    // dispatch can fail when a page.route() handler is active during SweetAlert rendering.
    await page.evaluate(() => {
      (document.querySelector('.swal2-confirm') as HTMLButtonElement | null)?.click();
    });
    await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 15_000 });

    // Remove the route intercept before the test ends. loadScheduleSets() fires after
    // SweetAlert dismiss and would trigger another GET /schedule-set request. Without
    // unrouting, that request arrives after the test frame tears down and Playwright
    // reports a "route.fetch: Test ended" error that bumps the exit code to 1.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });
});

// ── Bookings ───────────────────────────────────────────────────────────────────

test.describe('Admin — Bookings', () => {
  test('page renders and attempts to load data from SIT backend', async ({ page }) => {
    await page.goto('/admin/bookings');

    // Wait for the loading indicator to clear (may not appear for fast or failed responses)
    await page
      .locator('p.admin-muted', { hasText: 'Loading' })
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {});

    // Table structure must be present regardless of data availability
    await expect(page.locator('table.admin-table')).toBeVisible();
    await expect(page.locator('table.admin-table thead')).toBeVisible();
  });
});
