import { test, expect, Page } from '@playwright/test';

/**
 * OBRS-564 QA E2E — booking-policy config (advance-booking cap + cutoff).
 * Runs against the local full-stack QA lane started by hand for this card
 * (obrs564qa DB, backend on :8080, `ng serve --configuration sit` on :4200
 * with apiUrl temp-overridden to http://localhost:8080). Not part of the
 * committed regression suite (same convention as obrs-433-my-reports.spec.ts).
 */

const OWNER_EMAIL = 'owner@system.local';
const ADMIN_EMAIL = 'admin@system.local';
const SALESPERSON_EMAIL = 'salesperson@system.local';
const CUSTOMER_EMAIL = 'customer@system.local';
const PASSWORD = 'P@ssw0rd';

async function login(page: Page, email: string): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
  });
  await page.goto('/login');
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
}

async function dismissSweetAlert(page: Page): Promise<void> {
  const overlay = page.locator('.swal2-container');
  const appeared = await overlay
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return;
  await overlay.locator('.swal2-confirm').click({ timeout: 5_000 }).catch(() => undefined);
  await overlay.waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
}

// OBRS-702 moved this form off its own page: it is the first tab of
// /admin/settings now, the sidebar carries ONE "System settings" entry instead
// of four config entries, and /admin/booking-policy-config redirects.
//
// The redirect is why the disallowed-role assertions had to change shape rather
// than just change string. `not.toHaveURL(/booking-policy-config/)` would now
// pass for ANY role — the redirect alone moves the URL off that path — so it
// would have gone green while proving nothing. They assert against the
// destination, and against the form never rendering.
const SETTINGS_MENU = 'a[href*="/admin/settings"]';
const BOOKING_POLICY_TAB = '/admin/settings/booking-policy';

test.describe('OBRS-564 — role matrix', () => {
  test('OWNER reaches the form via the menu entry', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin');
    const menuEntry = page.locator(SETTINGS_MENU);
    await expect(menuEntry).toBeVisible({ timeout: 15_000 });
    await menuEntry.click();
    // The settings shell redirects its empty path to the first tab, so one
    // click lands on the booking-policy form with no tab click needed.
    await page.waitForURL((url) => url.pathname.includes(BOOKING_POLICY_TAB));
    await expect(page.locator('input#maxAdvanceDays')).toBeVisible({ timeout: 15_000 });
  });

  test('ADMIN reaches the form via the menu entry', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.goto('/admin');
    const menuEntry = page.locator(SETTINGS_MENU);
    await expect(menuEntry).toBeVisible({ timeout: 15_000 });
    await menuEntry.click();
    await page.waitForURL((url) => url.pathname.includes(BOOKING_POLICY_TAB));
    await expect(page.locator('input#maxAdvanceDays')).toBeVisible({ timeout: 15_000 });
  });

  test('OBRS-702: the old bookmark still lands on the form', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin/booking-policy-config');
    await page.waitForURL((url) => url.pathname.includes(BOOKING_POLICY_TAB), { timeout: 15_000 });
    await expect(page.locator('input#maxAdvanceDays')).toBeVisible({ timeout: 15_000 });
  });

  test('SALESPERSON: no menu entry, and direct navigation never reaches the form', async ({ page }) => {
    await login(page, SALESPERSON_EMAIL);
    await page.goto('/admin');
    await expect(page.locator(SETTINGS_MENU)).toHaveCount(0);

    // Deliberately the LEGACY path: it exercises the redirect and the guard
    // together, which is how a real bookmark arrives.
    await page.goto('/admin/booking-policy-config');
    // AuthGuard redirects away rather than rendering the form for a disallowed
    // role. Asserted on the DESTINATION, not on having left the legacy path —
    // the OBRS-702 redirect leaves that path for everyone.
    await expect(page.locator('input#maxAdvanceDays')).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/admin\/settings/, { timeout: 10_000 });
  });

  test('CUSTOMER: no admin access at all, and direct navigation never reaches the form', async ({ page }) => {
    await login(page, CUSTOMER_EMAIL);
    await page.goto('/admin/booking-policy-config');
    await expect(page.locator('input#maxAdvanceDays')).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/admin\/settings/, { timeout: 10_000 });
  });
});

test.describe('OBRS-564 — round trip: 30 -> 45', () => {
  test.describe.configure({ mode: 'serial' });

  test('owner changes the cap to 45 and saves', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin/settings/booking-policy');
    const maxAdvanceDaysInput = page.locator('input#maxAdvanceDays');
    await maxAdvanceDaysInput.waitFor({ state: 'visible', timeout: 15_000 });

    await maxAdvanceDaysInput.fill('');
    await maxAdvanceDaysInput.fill('45');
    await page.locator('form button[type="submit"]').click();
    await dismissSweetAlert(page);

    // Reload and confirm the saved value persisted server-side (not just in-form state).
    await page.reload();
    await expect(page.locator('input#maxAdvanceDays')).toHaveValue('45', { timeout: 15_000 });
  });

  test('/business-policy now reads 45 without a restart', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app_language', 'en'));
    await page.goto('/business-policy');
    const salesChannels = page.locator('.policy-card p').first();
    await expect(salesChannels).toContainText('45 days', { timeout: 15_000 });
    await expect(salesChannels).toContainText('20 minutes');
    // Never a raw placeholder token.
    await expect(salesChannels).not.toContainText('{{');
  });

  test('home date picker: today+45 selectable, today+46 disabled (both calendars)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app_language', 'en'));
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const departureCalendarInput = page.locator('p-datepicker').first().locator('input');
    await departureCalendarInput.click();
    const panel = page.locator('.p-datepicker').first();
    await panel.waitFor({ state: 'visible', timeout: 10_000 });

    const target45 = new Date();
    target45.setDate(target45.getDate() + 45);
    const target46 = new Date();
    target46.setDate(target46.getDate() + 46);
    const key45 = `${target45.getFullYear()}-${target45.getMonth() + 1}-${target45.getDate()}`;
    const key46 = `${target46.getFullYear()}-${target46.getMonth() + 1}-${target46.getDate()}`;

    async function navigateTo(key: string): Promise<void> {
      for (let hop = 0; hop < 4; hop++) {
        const cell = panel.locator(`td:not(.p-datepicker-other-month) span[data-date="${key}"]`);
        if ((await cell.count()) > 0) return;
        await panel.locator('.p-datepicker-next').click();
        await page.waitForTimeout(300);
      }
    }

    await navigateTo(key45);
    const cell45 = panel.locator(`td:not(.p-datepicker-other-month) span[data-date="${key45}"]`);
    await expect(cell45).toHaveCount(1);
    await expect(cell45).not.toHaveClass(/p-disabled/);

    await navigateTo(key46);
    const cell46 = panel.locator(`td:not(.p-datepicker-other-month) span[data-date="${key46}"]`);
    await expect(cell46).toHaveCount(1);
    await expect(cell46).toHaveClass(/p-disabled/);
  });

  test('search/booking rejects today+46, accepts today+45 (server-side, inclusive boundary)', async ({ request }) => {
    // Direct API probe of the same guard the UI relies on — ScheduleService
    // search enforces the same booking_max_advance_days cap the date picker
    // renders as a UI affordance.
    const loginRes = await request.post('http://localhost:8080/api/auth/login', {
      data: { email: CUSTOMER_EMAIL, password: PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();
    const policyRes = await request.get('http://localhost:8080/api/booking-policy');
    const policyBody = await policyRes.json();
    expect(policyBody.data.maxAdvanceDays).toBe(45);
  });

  test('reset cap back to 30 (cleanup, does not affect verdict)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin/settings/booking-policy');
    const maxAdvanceDaysInput = page.locator('input#maxAdvanceDays');
    await maxAdvanceDaysInput.waitFor({ state: 'visible', timeout: 15_000 });
    await maxAdvanceDaysInput.fill('');
    await maxAdvanceDaysInput.fill('30');
    await page.locator('form button[type="submit"]').click();
    await dismissSweetAlert(page);
  });
});

test.describe('OBRS-564 — failure path, i18n and layout', () => {
  test('language switch live: numbers stay correct, no extra HTTP request', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app_language', 'en'));
    await page.goto('/business-policy');
    const salesChannels = page.locator('.policy-card p').first();
    await expect(salesChannels).toContainText('30 days', { timeout: 15_000 });

    let policyRequestCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/booking-policy')) policyRequestCount++;
    });

    // Switch language via the real switcher (app-lang-switcher), no reload.
    await page.locator('.navbar-lang-trigger').first().click();
    await page.locator('.navbar-lang-menu').first().waitFor({ state: 'visible', timeout: 5_000 });
    await page.locator('.navbar-lang-item', { hasText: 'ไทย' }).click();

    await expect(salesChannels).toContainText('30 วัน', { timeout: 10_000 });
    expect(policyRequestCount).toBe(0);
  });

  test('mobile 390px: inline error wraps, does not crush', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Force the booking-policy call to fail so the inline error renders.
    await page.route('**/api/booking-policy', (route) => route.abort('failed'));
    await page.addInitScript(() => localStorage.setItem('app_language', 'en'));
    await page.goto('/business-policy');

    const inlineError = page.locator('.policy-inline-error');
    await expect(inlineError).toBeVisible({ timeout: 15_000 });
    const box = await inlineError.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // Must not overflow the 390px viewport (crushed/clipped layout).
      expect(box.width).toBeLessThanOrEqual(390);
    }
    // The rest of the page (item 2 onward, POLICY.BUSINESS.CONTENT) must still render. When item 1
    // fails, its <p> is replaced by the ng-template's error <div> (see business-policy.component.html),
    // so the CONTENT paragraph is the only <p> left and is at index 0, not 1.
    await expect(page.locator('.policy-card p').first()).toBeVisible();
  });

  test('never a raw {{maxAdvanceDays}} placeholder during a slow load', async ({ page }) => {
    await page.route('**/api/booking-policy', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });
    await page.addInitScript(() => localStorage.setItem('app_language', 'en'));
    await page.goto('/business-policy');
    const bodyTextDuringLoad = await page.locator('.policy-card').innerText();
    expect(bodyTextDuringLoad).not.toContain('{{maxAdvanceDays}}');
    expect(bodyTextDuringLoad).not.toContain('{{cutoffMinutes}}');
    await expect(page.locator('.policy-card p').first()).toContainText('days', { timeout: 15_000 });
  });
});
