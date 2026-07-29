import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, Page, Route, test } from '@playwright/test';

/**
 * OBRS-854 AC-2 / AC-3 — the counter QR and the email footer both point one place: `/account`.
 *
 * A customer who asks a salesperson to delete their data cannot be helped at the counter
 * (ADR-0114: staff hold no rights over a passenger account, and `DELETE /users/{id}` 404s for
 * every passenger). The only route that exists is the one the customer walks themselves, from a
 * phone, starting logged OUT — which means `/account` is reached through `AuthGuard`, a bounce to
 * `/login`, and a return trip. Every previous card asserted the pieces; nothing asserted that the
 * trip completes, and "the URL is correct" is not the claim being made — "you can finish the
 * deletion from a phone" is.
 *
 * So this spec walks the whole path at a phone viewport and presses the destructive button for
 * real (against a stubbed DELETE): bounce -> login -> land back on /account -> open the dialog ->
 * type the translated confirm phrase -> submit -> assert the request that actually left the page.
 *
 * The discriminating assertion is `landsBackOnAccount` vs `landsHomeWithoutAReturnUrl`. A customer
 * role's `getHomeRoute()` is `/`, so if the stored return URL ever stopped being consumed the
 * first test would land on `/` — exactly where AC-3 says a customer must not be abandoned — and
 * the second proves `/account` is not simply where every login goes.
 */

const ok = <T>(data: T) => ({ code: 200, message: 'OK', data });

const EMAIL = 'counter-deletion@example.test';
const PASSWORD = 'Str0ng-Passw0rd!';

/**
 * Read the confirm phrase from the shipped bundle rather than hardcoding it. The dialog compares
 * against the TRANSLATED string (deliberately — OBRS-632 refused to make a Thai reader type an
 * English word), so a hardcoded copy here would pin this spec to today's wording and would quietly
 * pass a Thai customer a phrase they cannot type.
 */
function confirmPhrase(lang: 'th' | 'en'): string {
  // Resolved from __dirname, not process.cwd() — trip-details-edit.spec.ts reads the same bundles
  // this way, and cwd depends on which config invoked the run.
  const i18nDir = resolve(__dirname, '../../public/i18n');
  const bundle = JSON.parse(readFileSync(join(i18nDir, `${lang}.json`), 'utf8')) as {
    ACCOUNT: { CLOSE_CONFIRM_PHRASE: string };
  };
  return bundle.ACCOUNT.CLOSE_CONFIRM_PHRASE;
}

const PROFILE = {
  id: 4242,
  title: 'MR',
  firstName: 'Somchai',
  middleName: null,
  lastName: 'Counter',
  email: EMAIL,
  phoneNumber: '0812345678',
  preferredLocale: 'th',
  // Current version, so the re-consent banner does not sit between the customer and the button.
  pdpaConsentVersion: '1.0',
};

const LOGIN_RESPONSE = ok({
  accessToken: 'obrs-854-e2e-token',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: {
    id: PROFILE.id,
    fullName: 'Somchai Counter',
    email: EMAIL,
    preferredLocale: 'th',
    status: 'active',
    roles: ['customer'],
  },
});

/** Every DELETE that reached `/api/private/users/me`, recorded off the wire. */
type Wire = { deletes: string[] };

async function prepare(page: Page, lang: 'th' | 'en'): Promise<Wire> {
  const wire: Wire = { deletes: [] };

  await page.addInitScript((language) => {
    localStorage.setItem('app_language', language);
    // Deliberately NO auth_token: the whole point is arriving logged out, off a QR code.
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_username');
    localStorage.removeItem('auth_roles');
  }, lang);

  // Google Identity Services is a real remote script on /login. Aborting it keeps this spec in the
  // hermetic GATE lane; the password form under test does not need it.
  await page.route('https://accounts.google.com/**', (route: Route) => route.abort());

  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname.endsWith('/api/auth/login')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(LOGIN_RESPONSE),
      });
    }

    if (url.pathname.endsWith('/api/private/users/me')) {
      if (method === 'DELETE') {
        wire.deletes.push(url.pathname);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(ok(null)),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(PROFILE)),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok(null)),
    });
  });

  return wire;
}

async function logIn(page: Page): Promise<void> {
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button.login-btn[type="submit"]');
}

test.describe('OBRS-854: the counter QR lands a logged-out phone on a working close-account page', () => {
  // A real handset, not the default desktop viewport. AC-2 is about someone holding a phone at a
  // ticket counter; asserting the button exists at 1280px would evidence a screen nobody uses.
  test.use({ viewport: { width: 390, height: 844 } });

  test('logged out -> /account bounces to /login and comes BACK to /account', async ({ page }) => {
    await prepare(page, 'th');

    await page.goto('/account');
    await expect(page).toHaveURL(/\/login$/);

    await logIn(page);

    // The assertion AC-3 exists for. Without the stored return URL this lands on '/'.
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.locator('[data-testid="close-account-card"]')).toBeVisible();
  });

  test('reaching /login directly still lands home - /account is not simply where every login goes', async ({
    page,
  }) => {
    await prepare(page, 'th');

    await page.goto('/login');
    await logIn(page);

    // A customer's getHomeRoute() is '/'. If this ever became '/account' the test above would be
    // passing for the wrong reason and would stop covering the return-url machinery at all.
    await expect(page).toHaveURL(/\/$/);
  });

  test('the close-account button is reachable and tappable inside a 390px viewport', async ({
    page,
  }) => {
    await prepare(page, 'th');
    await page.goto('/account');
    await logIn(page);
    await expect(page).toHaveURL(/\/account$/);

    const button = page.locator('[data-testid="close-account-open"]');
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();

    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    // Inside the viewport horizontally (an overflowing danger card is the failure that a
    // toBeVisible() check alone would happily pass) and big enough to hit with a thumb.
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.height).toBeGreaterThanOrEqual(30);
  });

  test('the customer can press it through to the end - DELETE /users/me really leaves the page', async ({
    page,
  }) => {
    const wire = await prepare(page, 'th');
    await page.goto('/account');
    await logIn(page);
    await expect(page).toHaveURL(/\/account$/);

    await page.locator('[data-testid="close-account-open"]').scrollIntoViewIfNeeded();
    await page.click('[data-testid="close-account-open"]');

    const submit = page.locator('[data-testid="close-account-submit"]');
    await expect(submit).toBeVisible();
    // Guard against a vacuous pass: the button must be disabled BEFORE the phrase is typed, or
    // "it submitted" would prove nothing about the confirmation step.
    await expect(submit).toBeDisabled();

    await page.fill('[data-testid="close-account-confirmation"]', confirmPhrase('th'));
    await expect(submit).toBeEnabled();
    await submit.click();

    // The effect, not a proxy: the request that actually left the page, and the session it killed.
    await expect.poll(() => wire.deletes).toEqual(['/api/private/users/me']);
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
  });
});
