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
    await page.goto('/forget-password');
    await expect(page.locator('#phoneNo')).toBeVisible();

    await page.goto('/login-mobile');
    await expect(page.locator('#phoneNo')).toBeVisible();

    await page.goto('/register');
    await expect(page.locator('#firstName')).toBeVisible();

    await page.goto('/otp/register/0812345678');
    await expect(page.locator('app-otp')).toBeVisible();
    await expect(page.locator('.otp-ref-text')).toContainText('OTP-ROUTE-SMOKE');
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

  test('customer booking and payment pages render with mocked state', async ({ page }) => {
    await page.goto('/my-bookings');
    await expect(page.locator('.my-bookings__header h1')).toBeVisible();

    await page.goto('/payment');
    await expect(page.locator('#creditCardNo')).toBeVisible();

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
