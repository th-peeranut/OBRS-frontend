/**
 * QA E2E tests for ao/google-signin-email-verify feature.
 *
 * Run with:  npx playwright test --config playwright.qa.config.ts --project chromium
 *   (serves on :4201 with --disable-web-security to bypass SIT CORS)
 *
 * Google OAuth completion is NOT tested here — the committed googleClientId is an
 * empty-string placeholder (ops step deferred). All other ACs are verified.
 */
import { test, expect, Page } from '@playwright/test';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Collect SweetAlert2 containers that are currently in the DOM. */
async function countSwal2Containers(page: Page): Promise<number> {
  return page.locator('.swal2-container').count();
}

/** Dismiss a visible SweetAlert2 by clicking its confirm button. */
async function dismissSwal(page: Page): Promise<void> {
  const confirm = page.locator('.swal2-confirm');
  await confirm.waitFor({ state: 'visible', timeout: 15_000 });
  await confirm.click({ force: true });
  await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 10_000 });
}

// ── Suite ──────────────────────────────────────────────────────────────────────

test.describe('Google Sign-In + Email Verify', () => {
  test.beforeEach(async ({ page }) => {
    // Force English so i18n assertions use predictable strings
    await page.addInitScript(() => {
      localStorage.setItem('app_language', 'en');
    });
  });

  // ── AC#1: New login-page elements render in correct order ──────────────────
  test('AC#1 — login page: PDPA checkbox + GIS area rendered after phone button, before register link', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Elements that must be present
    const phoneBtn = page.locator('.login-by-phone-no-btn');
    const pdpaCheckbox = page.locator('#pdpaGoogleConsent');
    const gisWrapper = page.locator('.gis-btn-wrapper');
    const registerLink = page.locator('.register-link');

    await expect(phoneBtn).toBeVisible();
    await expect(pdpaCheckbox).toBeVisible();
    await expect(gisWrapper).toBeAttached(); // container is in DOM (GIS button may or may not render)
    await expect(registerLink).toBeVisible();

    // Verify DOM ordering by comparing bounding-box Y positions
    const phoneBtnY = (await phoneBtn.boundingBox())!.y;
    const pdpaCheckboxY = (await pdpaCheckbox.boundingBox())!.y;
    const gisWrapperY = (await gisWrapper.boundingBox())!.y;
    const registerLinkY = (await registerLink.boundingBox())!.y;

    expect(phoneBtnY).toBeLessThan(pdpaCheckboxY);
    expect(pdpaCheckboxY).toBeLessThan(gisWrapperY);
    expect(gisWrapperY).toBeLessThan(registerLinkY);
  });

  // ── GIS script loaded (no ReferenceError on blank client ID) ──────────────
  test('No ReferenceError on cold-load of /login (GIS script with blank client ID)', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Hard reload to simulate a cache-disabled cold load
    await page.reload({ waitUntil: 'networkidle' });

    const referenceErrors = pageErrors.filter((e) =>
      e.toLowerCase().includes('referenceerror')
    );

    expect(
      referenceErrors,
      `Unexpected ReferenceError(s): ${referenceErrors.join('; ')}`
    ).toHaveLength(0);
  });

  // ── PDPA overlay gates GIS button ─────────────────────────────────────────
  test('PDPA overlay visible when unchecked; click reveals required-error message', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Overlay should be present when checkbox is unchecked
    const overlay = page.locator('.gis-disabled-overlay');
    await expect(overlay).toBeVisible();

    // Click the overlay — should mark the control as touched
    await overlay.click();

    // Required-error should appear (touched && !value)
    const errorMsg = page.locator('.text-error', {
      hasText: 'Please accept the consent to sign in with Google',
    });
    await expect(errorMsg).toBeVisible({ timeout: 5_000 });
  });

  test('PDPA overlay hides when checkbox is checked', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const overlay = page.locator('.gis-disabled-overlay');
    await expect(overlay).toBeVisible();

    await page.locator('#pdpaGoogleConsent').check();
    await expect(overlay).not.toBeVisible();
  });

  // ── AC#6: i18n — login page shows no raw keys ─────────────────────────────
  test('AC#6 — login page: no raw i18n keys visible (en)', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').innerText();
    const rawKeyPattern = /LOGIN\.\w+/;
    expect(
      rawKeyPattern.test(bodyText),
      `Raw i18n key found in page body: ${bodyText.match(rawKeyPattern)?.[0]}`
    ).toBe(false);
  });

  // ── AC#7, AC#8: /verify-email — no token → immediate failed state ─────────
  test('AC#7,8 — /verify-email with no token shows failed state; no API call made', async ({
    page,
  }) => {
    const apiCallsMade: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/verify-email') && !req.url().includes('/resend')) {
        apiCallsMade.push(req.url());
      }
    });

    await page.goto('/verify-email');
    await page.waitForLoadState('networkidle');

    // Should immediately show failed state (no token → synchronous branch)
    const failIcon = page.locator('.fail-icon');
    await expect(failIcon).toBeVisible({ timeout: 5_000 });

    const failTitle = page.locator('.state-title');
    await expect(failTitle).toContainText('Verification failed');

    // Error message should be the token-missing translation
    const errorText = page.locator('.state-text');
    await expect(errorText).toContainText('No verification token found');

    // Resend form must be visible
    await expect(page.locator('.resend-section')).toBeVisible();

    // No API call should have been made
    expect(apiCallsMade).toHaveLength(0);
  });

  // ── AC#7, AC#8: /verify-email — garbage token → API called → failed state ──
  test('AC#7,8 — /verify-email with garbage token calls API and shows failed state', async ({
    page,
  }) => {
    const verifyApiCalls: string[] = [];
    page.on('request', (req) => {
      if (
        req.url().includes('/api/auth/verify-email') &&
        !req.url().includes('/resend') &&
        req.method() === 'POST'
      ) {
        verifyApiCalls.push(req.url());
      }
    });

    await page.goto('/verify-email?token=INVALID_GARBAGE_TOKEN_XYZ_QA_TEST');

    // Wait for the API response to be processed (live SIT call)
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3_000);

    // At least one verify API call must have been made
    expect(verifyApiCalls.length).toBeGreaterThan(0);

    // Should show failed state
    await expect(page.locator('.fail-icon')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.state-title')).toContainText('Verification failed');

    // Error message should be one of the invalid/expired/generic translations (not a raw key)
    const errText = await page.locator('.state-text').innerText();
    const isRawKey = /VERIFY_EMAIL\.ERROR\.\w+/.test(errText);
    expect(isRawKey, `Error text appears to be a raw key: "${errText}"`).toBe(false);

    // Resend form must be visible
    await expect(page.locator('.resend-section')).toBeVisible();
  });

  // ── AC#10, #11: Resend form — blank email → required error ────────────────
  test('AC#10,11 — resend form: blank email submit shows required error', async ({
    page,
  }) => {
    await page.goto('/verify-email');
    await page.waitForLoadState('networkidle');

    await page.locator('.resend-section').waitFor({ state: 'visible' });
    await page.locator('.resend-section button[type="submit"]').click();

    const reqError = page.locator('.text-error', {
      hasText: 'Please enter your email',
    });
    await expect(reqError).toBeVisible({ timeout: 5_000 });
  });

  // ── AC#10, #11: Resend form — whitespace-only email → required error ───────
  test('AC#10,11 — resend form: whitespace-only email blocked by trimmedRequired validator', async ({
    page,
  }) => {
    await page.goto('/verify-email');
    await page.waitForLoadState('networkidle');

    await page.locator('.resend-section').waitFor({ state: 'visible' });

    const emailInput = page.locator('#resend-email');
    await emailInput.fill('   ');

    await page.locator('.resend-section button[type="submit"]').click();

    const reqError = page.locator('.text-error', {
      hasText: 'Please enter your email',
    });
    await expect(reqError).toBeVisible({ timeout: 5_000 });
  });

  // ── AC#11: Resend form — invalid email format → format error ──────────────
  test('AC#11 — resend form: invalid email format shows format error', async ({
    page,
  }) => {
    await page.goto('/verify-email');
    await page.waitForLoadState('networkidle');

    await page.locator('.resend-section').waitFor({ state: 'visible' });

    const emailInput = page.locator('#resend-email');
    await emailInput.fill('notanemail');
    await emailInput.blur();

    await page.locator('.resend-section button[type="submit"]').click();

    const fmtError = page.locator('.text-error', {
      hasText: 'Please enter a valid email',
    });
    await expect(fmtError).toBeVisible({ timeout: 5_000 });
  });

  // ── AC: Only ONE toast on resend error (no double-alert from SKIP_GLOBAL_ERROR_ALERT) ──
  test('AC — resend form: plausible email triggers exactly ONE SweetAlert (no double-alert)', async ({
    page,
  }) => {
    await page.goto('/verify-email');
    await page.waitForLoadState('networkidle');

    await page.locator('.resend-section').waitFor({ state: 'visible' });

    const emailInput = page.locator('#resend-email');
    await emailInput.fill('qa-nonexistent-user@example.com');
    await page.locator('.resend-section button[type="submit"]').click();

    // Wait for the live SIT response
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5_000);

    // Check SweetAlert is visible
    await page.locator('.swal2-container').waitFor({ state: 'visible', timeout: 15_000 });

    // Verify exactly ONE swal2 container (no duplicate alerts)
    const swalCount = await countSwal2Containers(page);
    expect(swalCount, 'Expected exactly one SweetAlert2 dialog, got more').toBe(1);

    // Dismiss the alert
    await dismissSwal(page);
  });

  // ── AC#6: i18n — /verify-email no raw keys in English ──────────────────────
  test('AC#6 — /verify-email: no raw i18n keys visible (en)', async ({ page }) => {
    await page.goto('/verify-email');
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').innerText();
    const rawKeyPattern = /VERIFY_EMAIL\.\w+/;
    expect(
      rawKeyPattern.test(bodyText),
      `Raw i18n key found: ${bodyText.match(rawKeyPattern)?.[0]}`
    ).toBe(false);
  });

  // ── AC#6: i18n — /verify-email Thai language spot-check ───────────────────
  test('AC#6 — /verify-email: Thai translations are loaded (no raw keys in th)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('app_language', 'th');
    });

    await page.goto('/verify-email');
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').innerText();

    expect(bodyText).not.toMatch(/VERIFY_EMAIL\.\w+/);
    // Verify it contains actual Thai text (fail title is translated)
    expect(bodyText).toContain('การยืนยันล้มเหลว');
  });

  // ── AC#6: i18n — login page Chinese spot-check ────────────────────────────
  test('AC#6 — login page: Chinese translations loaded (no raw keys in zh)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('app_language', 'zh');
    });

    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/LOGIN\.\w+/);
    // Chinese PDPA text present
    expect(bodyText).toContain('我同意收集和使用我的个人数据');
  });

  // ── AC#14: Regression — email/password login fields present and validated ──
  test('AC#14 — regression: email/password login fields present; form validation fires', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // Trigger validation by submitting with empty fields
    await submitBtn.click();

    const emailError = page.locator('.text-error', {
      hasText: 'Please enter a valid email',
    });
    await expect(emailError).toBeVisible({ timeout: 5_000 });
  });

  // ── AC#14: Regression — phone-number sign-in button still present ──────────
  test('AC#14 — regression: phone-number sign-in button present and correct text', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const phoneBtn = page.locator('.login-by-phone-no-btn');
    await expect(phoneBtn).toBeVisible();
    await expect(phoneBtn).toContainText('Sign in with your phone number');
  });

  // ── General regression — nav elements on /login ────────────────────────────
  test('regression — theme toggle and lang switcher present on /login', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('app-theme-toggle')).toBeVisible();
    await expect(page.locator('app-lang-switcher')).toBeVisible();
  });

  // ── General regression — booking flow smoke test (login → home nav) ────────
  test('regression — email/password login succeeds and navigates to /home (live SIT)', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"]').fill('admin@system.local');
    await page.locator('input[type="password"]').fill('P@ssw0rd');
    await page.locator('button[type="submit"]').click();

    // Wait for navigation away from /login (up to 60 s for Koyeb cold-start)
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 60_000,
    });

    // Should land somewhere that is not /login
    expect(page.url()).not.toContain('/login');

    // Dismiss success alert if visible
    const swalConfirm = page.locator('.swal2-confirm');
    if (await swalConfirm.isVisible()) {
      await swalConfirm.click({ force: true });
    }
  });
});
