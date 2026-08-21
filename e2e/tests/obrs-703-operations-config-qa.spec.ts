import { test, expect, Page, APIRequestContext } from '@playwright/test';
import * as path from 'path';
import { seedAnalyticsConsent } from '../support/analytics-consent';

/**
 * OBRS-703 QA E2E - owner-scoped operations config tab (/admin/settings/operations) +
 * the public /api/operations-policy readout it feeds into /business-policy and
 * /how-to-book. Runs against the LOCAL full stack started by hand for this QA pass
 * (backend on :8081 with `dev,local` profiles against a dedicated `obrs703qa`
 * database; frontend `npm run start:local` on :4200, environment.ts apiUrl pointed at
 * :8081 for this worktree only - see playwright.obrs703qa.config.ts). Not part of the
 * committed regression suite.
 *
 * Server-side facts (validator boundaries, cross-owner MIN, history rows,
 * expires_at-not-moving, admin 403 on all three verbs) were already proven directly
 * against the API/DB with curl + psql during this QA pass - this spec exists to
 * capture the VISUAL evidence the Jira card requires (AFTER screenshots) and to walk
 * the same surface through a real browser session.
 */

const OWNER_EMAIL = 'owner@system.local';
const ADMIN_EMAIL = 'admin@system.local';
const PASSWORD = 'P@ssw0rd';
const API_BASE = 'http://localhost:8081';

// Evidence lands under e2e-evidence/ (gitignored). scripts/check-e2e-lanes.mjs rule 3:
// a spec must not write into another repository, and an absolute path carries one
// developer's username with it.
const CAPTURE_DIR = path.resolve('e2e-evidence/obrs-703');

function shot(name: string): string {
  return path.join(CAPTURE_DIR, `OBRS-703-${name}.png`);
}

async function login(page: Page, email: string, language = 'en'): Promise<void> {
  await page.addInitScript((lang) => {
    localStorage.setItem('app_language', lang);
  }, language);
  await page.goto('/login');
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
}

async function apiLogin(request: APIRequestContext, email: string): Promise<string> {
  const resp = await request.post(`${API_BASE}/api/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(resp.ok()).toBe(true);
  const body = await resp.json();
  return body.data.accessToken as string;
}

async function setOperationsConfig(
  request: APIRequestContext,
  token: string,
  payload: {
    seatReservationMinutes: number;
    reschedulePaymentTimeoutMinutes: number;
    noShowCutoffMinutes: number;
    nearFullAlertThresholdPercent: number;
  }
): Promise<void> {
  const resp = await request.put(`${API_BASE}/api/private/owner/configs/operations`, {
    headers: { Authorization: `Bearer ${token}` },
    data: payload,
  });
  expect(resp.ok()).toBe(true);
}

async function dismissSwalIfPresent(page: Page): Promise<void> {
  const overlay = page.locator('.swal2-container');
  if (await overlay.isVisible().catch(() => false)) {
    await overlay
      .locator('.swal2-confirm')
      .click({ timeout: 5_000 })
      .catch(() => undefined);
    await overlay.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
  }
}

/** save()/resetToPlatformDefault() can each show TWO swal2 dialogs in sequence: a
 * confirm ("are you sure") before the write, then a success/error alert after it
 * resolves. Dismiss in a short loop rather than once, so the second dialog (whose
 * appearance is async, after the HTTP response) does not block the next action. */
async function dismissAllSwals(page: Page, attempts = 5): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    await page.waitForTimeout(400);
    await dismissSwalIfPresent(page);
  }
}

test.describe('OBRS-703 operations config', () => {
  test('AC: owner sees the operations tab with real data + source badges', async ({ page }) => {
    await login(page, OWNER_EMAIL, 'th');
    await page.goto('/admin/settings/operations');
    await expect(page.locator('[data-testid="operations-config-state"]')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('#seatReservationMinutes')).toHaveValue('15');
    await expect(page.locator('#reschedulePaymentTimeoutMinutes')).toHaveValue('15');
    await expect(page.locator('#noShowCutoffMinutes')).toHaveValue('10');
    await expect(page.locator('#nearFullAlertThresholdPercent')).toHaveValue('80');
    await expect(page.locator('[data-testid="config-source-badge"]').first()).toBeVisible();
    await page.screenshot({ path: shot('AFTER-0-operations-tab-loaded'), fullPage: true });
  });

  test('AC: no-show and near-full warnings are visible before any edit', async ({ page }) => {
    await login(page, OWNER_EMAIL, 'th');
    await page.goto('/admin/settings/operations');
    const noShowWarning = page.locator('[data-testid="operations-config-no-show-warning"]');
    const nearFullWarning = page.locator('[data-testid="operations-config-near-full-warning"]');
    await expect(noShowWarning).toBeVisible({ timeout: 20_000 });
    await expect(nearFullWarning).toBeVisible();
    await noShowWarning.screenshot({ path: shot('AFTER-1-no-show-money-warning') });
    await nearFullWarning.screenshot({ path: shot('AFTER-2-near-full-100-warning') });
  });

  test('AC: tab strip at 1366px', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 800 } });
    const page = await context.newPage();
    await login(page, OWNER_EMAIL, 'th');
    await page.goto('/admin/settings/operations');
    const strip = page.locator('[data-testid="system-settings-tabs"]');
    await expect(strip).toBeVisible({ timeout: 20_000 });
    const measurement = await strip.evaluate((ul) => {
      const entries = [...ul.children] as HTMLElement[];
      return {
        rows: new Set(entries.map((li) => Math.round(li.getBoundingClientRect().top))).size,
        entries: entries.length,
      };
    });
    console.log('OBRS-703 tab strip @1366px:', JSON.stringify(measurement));
    await page.screenshot({ path: shot('AFTER-3-tab-strip-1366px'), fullPage: false });
    await context.close();
  });

  test('AC: tab strip at 390px', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await login(page, OWNER_EMAIL, 'th');
    await page.goto('/admin/settings/operations');
    const strip = page.locator('[data-testid="system-settings-tabs"]');
    await expect(strip).toBeVisible({ timeout: 20_000 });
    const measurement = await strip.evaluate((ul) => {
      const entries = [...ul.children] as HTMLElement[];
      return {
        rows: new Set(entries.map((li) => Math.round(li.getBoundingClientRect().top))).size,
        entries: entries.length,
      };
    });
    console.log('OBRS-703 tab strip @390px:', JSON.stringify(measurement));
    await page.screenshot({ path: shot('AFTER-4-tab-strip-390px'), fullPage: false });
    await context.close();
  });

  test('AC: admin sees the 403 forbidden state, never an empty form', async ({ page }) => {
    await login(page, ADMIN_EMAIL, 'th');
    await page.goto('/admin/settings/operations');
    const forbidden = page.locator('[data-testid="operations-config-forbidden"]');
    await expect(forbidden).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('form')).toHaveCount(0);
    await page.screenshot({ path: shot('AFTER-5-admin-403-forbidden'), fullPage: true });
  });

  test('AC: save writes a real override + reset restores platform default', async ({
    page,
    request,
  }) => {
    // Start from a known baseline: all four at platform default.
    const ownerToken = await apiLogin(request, OWNER_EMAIL);
    await setOperationsConfig(request, ownerToken, {
      seatReservationMinutes: 15,
      reschedulePaymentTimeoutMinutes: 15,
      noShowCutoffMinutes: 10,
      nearFullAlertThresholdPercent: 80,
    });
    // DELETE to guarantee overridden=false across all four before the UI test starts.
    await request.delete(`${API_BASE}/api/private/owner/configs/operations`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    await login(page, OWNER_EMAIL, 'th');
    await page.goto('/admin/settings/operations');
    await expect(page.locator('[data-testid="operations-config-state"]')).toBeVisible({
      timeout: 20_000,
    });

    const nearFullInput = page.locator('#nearFullAlertThresholdPercent');
    await nearFullInput.fill('85');
    await page.locator('button[type="submit"]').click();
    await dismissAllSwals(page); // confirm ("takeover") dialog
    await expect
      .poll(async () => nearFullInput.inputValue(), { timeout: 15_000 })
      .toBe('85');
    await dismissAllSwals(page); // success dialog, appears after the PUT resolves
    await page.screenshot({ path: shot('AFTER-6-save-success'), fullPage: true });

    const resetBtn = page.locator('[data-testid="operations-config-reset-btn"]');
    await expect(resetBtn).toBeVisible({ timeout: 10_000 });
    await resetBtn.click();
    await dismissAllSwals(page); // confirm dialog
    await expect
      .poll(async () => nearFullInput.inputValue(), { timeout: 15_000 })
      .toBe('80');
    await dismissAllSwals(page); // success dialog
    await page.screenshot({ path: shot('AFTER-7-reset-to-default'), fullPage: true });
  });

  test('AC: business-policy + how-to-book reflect the no-show cutoff, 3 locales, before/after', async ({
    browser,
    request,
  }) => {
    const ownerToken = await apiLogin(request, OWNER_EMAIL);
    // Known baseline before the "before" shots: platform default (10).
    await request.delete(`${API_BASE}/api/private/owner/configs/operations`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    const locales = ['th', 'en', 'zh'] as const;
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

    for (const locale of locales) {
      const page = await context.newPage();
      await page.addInitScript((lang) => localStorage.setItem('app_language', lang), locale);
      await seedAnalyticsConsent(page, 'denied');

      await page.goto('/business-policy');
      await expect(page.locator('.policy-card')).toContainText('10', { timeout: 20_000 });
      await page.screenshot({ path: shot(`BEFORE-8-business-policy-${locale}`), fullPage: true });

      await page.goto('/how-to-book');
      await expect(page.locator('ul.tips')).toContainText('10', { timeout: 20_000 });
      await page.screenshot({ path: shot(`BEFORE-8-how-to-book-${locale}`), fullPage: true });

      await page.close();
    }

    // Rotate the value.
    await setOperationsConfig(request, ownerToken, {
      seatReservationMinutes: 15,
      reschedulePaymentTimeoutMinutes: 15,
      noShowCutoffMinutes: 33,
      nearFullAlertThresholdPercent: 80,
    });

    for (const locale of locales) {
      const page = await context.newPage();
      await page.addInitScript((lang) => localStorage.setItem('app_language', lang), locale);
      await seedAnalyticsConsent(page, 'denied');

      await page.goto('/business-policy');
      await expect(page.locator('.policy-card')).toContainText('33', { timeout: 20_000 });
      await page.screenshot({ path: shot(`AFTER-8-business-policy-${locale}`), fullPage: true });

      await page.goto('/how-to-book');
      await expect(page.locator('ul.tips')).toContainText('33', { timeout: 20_000 });
      await page.screenshot({ path: shot(`AFTER-8-how-to-book-${locale}`), fullPage: true });

      await page.close();
    }

    await context.close();

    // Restore platform default so the DB is left clean for anything after this run.
    await request.delete(`${API_BASE}/api/private/owner/configs/operations`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
  });
});
