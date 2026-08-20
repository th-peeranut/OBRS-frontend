import { expect, Page, test } from '@playwright/test';

const ok = <T>(data: T) => ({ code: 200, message: 'OK', data });

async function seedBrowserState(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
    localStorage.setItem('auth_token', 'e2e-route-smoke-token');
    localStorage.setItem('auth_username', 'route-smoke@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['admin']));
    localStorage.setItem('active_booking_id', '123');
  });
}

async function mockApi(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const body = responseFor(url.pathname);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

function responseFor(pathname: string): unknown {
  if (pathname.includes('/external/otp/request')) {
    return ok({ token: 'OTP-ROUTE-SMOKE' });
  }

  if (pathname.endsWith('/private/admin/bookings')) {
    return ok(emptyPage());
  }

  if (pathname.endsWith('/private/bookings/me')) {
    return ok(emptyPage());
  }

  if (pathname.endsWith('/private/bookings/123/payments')) {
    return ok({
      paymentSummary: { status: 'pending' },
      transactions: [],
    });
  }

  // OBRS-699: the owner cancel/reschedule policy tab. Stubbed EXPLICITLY, not
  // left to the `ok(null)` fallback below: with null the store throws and the
  // page renders LOAD_FAILED, which passes an "it rendered" assertion while
  // proving the form was never built.
  if (pathname.endsWith('/private/owner/configs/cancel-reschedule-policy')) {
    return ok({
      cancelWindowHours: 2,
      cancelWindowHoursOverridden: false,
      rescheduleWindowHours: 2,
      rescheduleWindowHoursOverridden: false,
      rescheduleMaxDaysAhead: 60,
      rescheduleMaxDaysAheadOverridden: false,
      earlyWindowHours: 24,
      earlyWindowHoursOverridden: true,
      cancelRefundRateEarly: 0.8,
      cancelRefundRateEarlyOverridden: false,
      cancelRefundRateLate: 0.5,
      cancelRefundRateLateOverridden: false,
      rescheduleFeeLateThb: 50,
      rescheduleFeeLateThbOverridden: false,
      rescheduleMaxCount: 0,
      rescheduleMaxCountOverridden: false,
    });
  }

  if (pathname.endsWith('/private/schedules/42/boarding-list')) {
    return ok([]);
  }

  if (pathname.endsWith('/private/schedules/walk-in')) {
    return ok([]);
  }

  if (pathname.endsWith('/private/schedules')) {
    return ok([]);
  }

  if (pathname.endsWith('/private/schedules/')) {
    return ok([]);
  }

  if (pathname.endsWith('/routes')) {
    return ok([]);
  }

  if (
    pathname.endsWith('/private/lookups') ||
    pathname.endsWith('/private/roles') ||
    pathname.endsWith('/private/users') ||
    pathname.endsWith('/private/vehicles') ||
    pathname.endsWith('/private/vehicle-types') ||
    pathname.endsWith('/private/schedule-set') ||
    pathname.endsWith('/stops')
  ) {
    return ok([]);
  }

  return ok(null);
}

function emptyPage() {
  return {
    content: [],
    totalElements: 0,
    totalPages: 0,
    size: 100,
    number: 0,
  };
}

async function prepare(page: Page): Promise<void> {
  await seedBrowserState(page);
  await mockApi(page);
}

test.describe('route smoke coverage', () => {
  test.beforeEach(async ({ page }) => {
    await prepare(page);
  });

  test('public informational pages render', async ({ page }) => {
    await page.goto('/business-policy');
    await expect(page.locator('.policy-card h1')).toBeVisible();

    await page.goto('/how-to-book');
    await expect(page.locator('.how-to-book-card h1')).toBeVisible();

    await page.goto('/privacy-policy');
    await expect(page.locator('.policy-card h1')).toBeVisible();

    await page.goto('/refund-policy');
    await expect(page.locator('.policy-card h1')).toBeVisible();
  });

  test('auth-entry pages render', async ({ page }) => {
    // OBRS-613: this page collects an EMAIL now. It used to ask for a phone number and
    // send an OTP that verified into an empty block.
    await page.goto('/forget-password');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#phoneNo')).toHaveCount(0);

    // OBRS-613: the landing page for the emailed reset link. The path is fixed by the
    // backend's app.mail.reset-password-path; before this route existed the link fell
    // through to '**' and redirected home, so assert we did NOT end up at '/'.
    await page.goto('/reset-password?token=route-smoke-token');
    await expect(page.locator('#newPassword')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();

    await page.goto('/login-mobile');
    await expect(page.locator('#phoneNo')).toBeVisible();

    await page.goto('/register');
    await expect(page.locator('#firstName')).toBeVisible();

    await page.goto('/otp/login/0812345678');
    await expect(page.locator('app-otp')).toBeVisible();
    await expect(page.locator('.otp-ref-text')).toContainText('OTP-ROUTE-SMOKE');

    // OBRS-605 / OBRS-613: this screen serves phone login only. Asserting the redirect
    // (not just that the OTP form is absent) is what would catch an option quietly coming
    // back - a blank render would pass a "not visible" check just as well.
    for (const retired of ['register', 'forget-password']) {
      await page.goto(`/otp/${retired}/0812345678`);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator('app-otp')).toHaveCount(0);
    }
  });

  test('admin management pages render with empty mocked data', async ({ page }) => {
    await page.goto('/admin/lookups');
    await expect(page.locator('.admin-shell.theme-admin')).toBeVisible();
    await expect(page.locator('.admin-table')).toBeVisible();

    await page.goto('/admin/roles');
    await expect(page.locator('.admin-shell.theme-admin')).toBeVisible();
    await expect(page.locator('.admin-table')).toBeVisible();

    await page.goto('/admin/routes');
    await expect(page.locator('.admin-shell.theme-admin')).toBeVisible();
    await expect(page.locator('.admin-table')).toBeVisible();

    await page.goto('/admin/users');
    await expect(page.locator('.admin-shell.theme-admin')).toBeVisible();
    await expect(page.locator('.admin-table')).toBeVisible();
  });

  // OBRS-699: the tab is generated from SYSTEM_SETTINGS_TABS, so a missing
  // entry ships as a 404-to-home rather than a compile error — and the legacy
  // redirect is generated the same way.
  test('the cancel/reschedule policy settings tab renders its eight fields', async ({ page }) => {
    // `networkidle`, unlike every other goto in this file: this route is the FIRST thing to pull
    // the lazy admin chunk in some run orders, and on a cold `ng serve` that activation can throw
    // and bounce to `/` — a flake that reads as "the tab does not exist". The idiom is the one
    // obrs766-counter-cancel.spec.ts already uses for admin pages.
    await page.goto('/admin/settings/cancel-reschedule-policy', { waitUntil: 'networkidle' });
    // Asserted BEFORE the shell so a bounce fails saying where it landed, rather than the
    // downstream "element not found" that hides the cause.
    await expect(page).toHaveURL(/\/admin\/settings\/cancel-reschedule-policy$/);
    await expect(page.locator('.admin-shell.theme-admin')).toBeVisible();
    // The form is behind the store's fetch, so wait for it rather than racing the skeleton.
    await expect(page.locator('#cancelWindowHours')).toHaveValue('2');
    // Whole percent on screen, 0.80 on the wire (UX §4.2).
    await expect(page.locator('#cancelRefundRateEarlyPct')).toHaveValue('80');
    await expect(page.locator('#earlyWindowHours')).toHaveValue('24');
    // OBRS-1447: eight, not seven - the badge count IS the field count, which is why this
    // assertion is the one that goes red when a key is added on one side only.
    await expect(page.locator('app-config-source-badge')).toHaveCount(8);
    // One overridden of eight => the MIXED arm, and the reset card exists.
    await expect(
      page.locator('[data-testid="cancel-reschedule-policy-reset-btn"]')
    ).toBeVisible();

    await page.goto('/admin/cancel-reschedule-policy-config', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/admin\/settings\/cancel-reschedule-policy$/);
  });

  test('customer booking and payment pages render with mocked state', async ({ page }) => {
    await page.goto('/my-bookings');
    await expect(page.locator('.my-bookings__header h1')).toBeVisible();

    await page.goto('/payment');
    // OBRS-391 moved card entry into Omise's hosted iframe, so `#creditCardNo` — what
    // this smoke test used to key on — no longer exists. The pay button is asserted
    // FIRST and positively: it is what proves the payment page actually rendered, and
    // without it the card-input count below would pass just as happily on a 404.
    await expect(page.locator('app-payment-creditcard .payment-btn')).toBeVisible();
    await expect(page.locator('#creditCardNo, #cvv')).toHaveCount(0);

    await page.goto('/payment/result');
    await expect(page.locator('.payment-result h1')).toBeVisible();
  });

  test('staff driver and boarding pages render with empty mocked data', async ({ page }) => {
    await page.goto('/staff/driver');
    await expect(page.locator('.admin-shell.theme-staff')).toBeVisible();
    await expect(page.locator('.admin-title-block h2')).toBeVisible();

    await page.goto('/staff/boarding');
    await expect(page.locator('.admin-shell.theme-staff')).toBeVisible();
    await expect(page.locator('app-boarding-entry-page')).toBeVisible();

    await page.goto('/staff/boarding/42');
    await expect(page.locator('.admin-shell.theme-staff')).toBeVisible();
    await expect(page.locator('app-boarding-list-page table')).toBeVisible();
  });
});
