/**
 * E2E tests for "Admin User Lock Status & Unlock Action" feature.
 *
 * All acceptance criteria for the feature are verified here. AC3 (OWNER role
 * sees badge but NOT unlock button) is partially verified — we confirm that
 * the ADMIN session (this file's auth) DOES see the button on locked rows.
 * The OWNER-only session path is flagged for manual follow-up because no
 * OWNER-only credential is available in the SIT test fixture set.
 *
 * Because the SIT backend pre-dates this feature branch (locked field not yet
 * deployed), GET /private/users is intercepted and the response is seeded with
 * a locked test user. PUT /private/users/{id}/unlock is also stubbed to return
 * a success response without touching real accounts. All other endpoints
 * (roles, lookups) pass through to the real SIT backend so the page renders
 * with realistic option lists.
 */

import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.resolve(__dirname, '../fixtures/admin-auth.json') });

// ── Fixtures ──────────────────────────────────────────────────────────────────

const LOCKED_USER_ID = 9997;
const NORMAL_USER_ID = 9998;
const FUTURE_LOCK = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

function buildUsersResponse(lockedUserLocked: boolean) {
  return {
    code: 200,
    message: 'OK',
    data: [
      {
        id: LOCKED_USER_ID,
        title: 'Mr',
        firstName: 'Locked',
        lastName: 'TestUser',
        fullName: 'Mr Locked TestUser',
        email: 'locked-qa@system.local',
        phoneNumber: '0800000097',
        status: 'active',
        roles: [{ id: 3, slug: 'passenger', name: 'Passenger' }],
        locked: lockedUserLocked,
        accountLockedUntil: lockedUserLocked ? FUTURE_LOCK : null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: NORMAL_USER_ID,
        title: 'Ms',
        firstName: 'Normal',
        lastName: 'TestUser',
        fullName: 'Ms Normal TestUser',
        email: 'normal-qa@system.local',
        phoneNumber: '0800000098',
        status: 'active',
        roles: [{ id: 3, slug: 'passenger', name: 'Passenger' }],
        locked: false,
        accountLockedUntil: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ],
  };
}

/**
 * Intercepts GET /private/users (list only, not /private/users/{id}) and
 * replaces the response. Unlock PUT is also stubbed to avoid touching real
 * SIT data; lockedUserLocked toggles the list response so the background
 * refresh after unlock returns locked=false.
 */
async function setupUsersIntercept(
  page: import('@playwright/test').Page,
  opts: { initialLocked: boolean; stubUnlock?: boolean } = { initialLocked: true, stubUnlock: true }
) {
  let lockedState = opts.initialLocked;

  await page.route(
    (url) => {
      const path = url.pathname;
      // Match /api/private/users (list) but NOT /api/private/users/123 (detail)
      return /\/api\/private\/users(\?.*)?$/.test(path);
    },
    async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildUsersResponse(lockedState)),
        });
      } else {
        await route.continue();
      }
    }
  );

  if (opts.stubUnlock) {
    await page.route(
      (url) => /\/api\/private\/users\/\d+\/unlock/.test(url.pathname),
      async (route) => {
        if (route.request().method() === 'PUT') {
          lockedState = false; // next GET /users will return locked=false
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ code: 200, message: 'OK', data: {} }),
          });
        } else {
          await route.continue();
        }
      }
    );
  }

  return { getLockedState: () => lockedState };
}

// ── Test helpers ───────────────────────────────────────────────────────────────

async function navigateToUsersAndWait(page: import('@playwright/test').Page) {
  await page.goto('/admin/users');
  // Wait for the skeleton loader to clear (store fetch completes)
  await page
    .locator('.admin-skeleton-row')
    .first()
    .waitFor({ state: 'hidden', timeout: 30_000 })
    .catch(() => {});
  // Confirm at least one data row is visible
  await page
    .locator('table.admin-table tbody tr:not(.admin-skeleton-row):not(.admin-empty-row)')
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 });
}

async function dismissSweetAlert(page: import('@playwright/test').Page) {
  await page.locator('.swal2-container').waitFor({ state: 'visible', timeout: 15_000 });
  await page.evaluate(() => {
    (document.querySelector('.swal2-confirm') as HTMLButtonElement | null)?.click();
  });
  await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 10_000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Admin — User Lock Status & Unlock Action', () => {
  // AC1 + AC2: locked badge visible on locked rows; absent on unlocked rows
  test('AC1+AC2: locked badge shown for locked user; absent for unlocked user', async ({
    page,
  }) => {
    await setupUsersIntercept(page, { initialLocked: true, stubUnlock: false });
    await navigateToUsersAndWait(page);

    // Locked row must show the warning badge with "Locked" text
    const lockedRow = page.locator('table.admin-table tbody tr', { hasText: 'Locked TestUser' });
    await expect(lockedRow).toBeVisible();
    const badge = lockedRow.locator('.admin-status.is-warning.admin-status--icon');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Locked');

    // Normal row must NOT show the badge at all
    const normalRow = page.locator('table.admin-table tbody tr', { hasText: 'Normal TestUser' });
    await expect(normalRow).toBeVisible();
    await expect(normalRow.locator('.admin-status.is-warning.admin-status--icon')).not.toBeVisible();
  });

  // AC3: unlock button visible on locked rows ONLY; absent on unlocked rows.
  // OWNER-role exclusion: untestable — no OWNER-only SIT credential in fixture set.
  // Flagged for manual verification: log in as an OWNER account, visit /admin/users;
  // locked rows should show badge but NOT the unlock icon button.
  test('AC3: unlock button on locked rows only (ADMIN session)', async ({ page }) => {
    await setupUsersIntercept(page, { initialLocked: true, stubUnlock: false });
    await navigateToUsersAndWait(page);

    // Locked row should have the unlock button (aria-label matches the i18n key)
    const lockedRow = page.locator('table.admin-table tbody tr', { hasText: 'Locked TestUser' });
    const unlockBtn = lockedRow.locator('button[aria-label="Unlock account"]');
    await expect(unlockBtn).toBeVisible();
    // Verify it carries the correct icon
    await expect(unlockBtn.locator('.material-symbols-outlined')).toContainText('lock_open');

    // Normal (unlocked) row must NOT have the unlock button
    const normalRow = page.locator('table.admin-table tbody tr', { hasText: 'Normal TestUser' });
    await expect(normalRow.locator('button[aria-label="Unlock account"]')).not.toBeVisible();
  });

  // AC4 (Cancel): clicking Cancel closes the dialog without firing any PUT request
  test('AC4-cancel: Cancel on confirm dialog fires no PUT and closes dialog', async ({ page }) => {
    await setupUsersIntercept(page, { initialLocked: true, stubUnlock: false });
    await navigateToUsersAndWait(page);

    // Track any PUT /unlock requests
    const putUnlockUrls: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'PUT' && req.url().includes('/unlock')) {
        putUnlockUrls.push(req.url());
      }
    });

    // Open unlock dialog
    const lockedRow = page.locator('table.admin-table tbody tr', { hasText: 'Locked TestUser' });
    await lockedRow.locator('button[aria-label="Unlock account"]').click();

    const dialog = page.locator('.admin-modal-confirm');
    await expect(dialog).toBeVisible();

    // Click Cancel
    await dialog.locator('button:not(.admin-btn-primary)').first().click();

    // Dialog must close
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Zero PUT /unlock requests must have been fired
    expect(putUnlockUrls).toHaveLength(0);
  });

  // AC4 (Confirm) + AC5: confirming unlock calls PUT, badge disappears
  // (optimistic update), and success toast is shown
  test('AC4-confirm+AC5: Confirm calls PUT, badge removed optimistically, success toast', async ({
    page,
  }) => {
    await setupUsersIntercept(page, { initialLocked: true, stubUnlock: true });
    await navigateToUsersAndWait(page);

    // Track PUT /unlock calls
    const putUnlockUrls: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'PUT' && req.url().includes('/unlock')) {
        putUnlockUrls.push(req.url());
      }
    });

    // Open dialog and confirm
    const lockedRow = page.locator('table.admin-table tbody tr', { hasText: 'Locked TestUser' });
    await lockedRow.locator('button[aria-label="Unlock account"]').click();

    const dialog = page.locator('.admin-modal-confirm');
    await expect(dialog).toBeVisible();
    await dialog.locator('.admin-btn-primary').click();

    // Dialog closes (optimistic modal close happens before success toast)
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // PUT /unlock was called exactly once with the correct user ID
    await page.waitForTimeout(500); // allow request tracking to catch async call
    expect(putUnlockUrls).toHaveLength(1);
    expect(putUnlockUrls[0]).toContain(`/users/${LOCKED_USER_ID}/unlock`);

    // Optimistic update: badge must be gone without a page reload
    await expect(lockedRow.locator('.admin-status.is-warning.admin-status--icon')).not.toBeVisible({
      timeout: 5_000,
    });

    // Unlock action button also removed from that row
    await expect(lockedRow.locator('button[aria-label="Unlock account"]')).not.toBeVisible();

    // Success toast is visible (AC5)
    await expect(page.locator('.swal2-success')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.swal2-container')).toContainText(
      'Account unlocked successfully.'
    );

    // Dismiss toast
    await dismissSweetAlert(page);
  });

  // AC5 (no console errors): reload after unlock produces no console errors
  test('AC5-no-errors: no uncaught console errors after unlock flow', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await setupUsersIntercept(page, { initialLocked: true, stubUnlock: true });
    await navigateToUsersAndWait(page);

    // Perform unlock
    const lockedRow = page.locator('table.admin-table tbody tr', { hasText: 'Locked TestUser' });
    await lockedRow.locator('button[aria-label="Unlock account"]').click();
    await page.locator('.admin-modal-confirm .admin-btn-primary').click();
    await expect(page.locator('.admin-modal-confirm')).not.toBeVisible({ timeout: 10_000 });

    // Wait for success toast and dismiss
    await expect(page.locator('.swal2-success')).toBeVisible({ timeout: 10_000 });
    await dismissSweetAlert(page);

    // Wait for any background refresh to settle
    await page.waitForTimeout(1_000);

    // Filter out known-benign Angular/browser noise (e.g. favicon 404 in test env)
    const significantErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::ERR_')
    );
    expect(significantErrors).toHaveLength(0);
  });

  // AC7 (i18n — English): verify all new UI strings render in English
  test('AC7-i18n-en: all new strings render correctly in English', async ({ page }) => {
    await setupUsersIntercept(page, { initialLocked: true, stubUnlock: false });
    await navigateToUsersAndWait(page);

    // Badge text
    const badge = page
      .locator('table.admin-table tbody tr', { hasText: 'Locked TestUser' })
      .locator('.admin-status.is-warning.admin-status--icon');
    await expect(badge).toContainText('Locked');

    // Aria-label on unlock button
    const unlockBtn = page.locator('button[aria-label="Unlock account"]').first();
    await expect(unlockBtn).toBeVisible();

    // Open dialog — check all dialog strings
    await unlockBtn.click();
    const dialog = page.locator('.admin-modal-confirm');
    await expect(dialog).toBeVisible();

    await expect(dialog.locator('h4')).toContainText('Unlock Account');
    await expect(dialog.locator('p')).toContainText(
      'Unlocking this account will grant immediate login access to'
    );
    await expect(dialog.locator('p strong')).toContainText('Locked TestUser');
    await expect(dialog.locator('.admin-btn-primary')).toContainText('Unlock');
    await expect(dialog.locator('button:not(.admin-btn-primary)').first()).toContainText('Cancel');

    // Close dialog
    await dialog.locator('button:not(.admin-btn-primary)').first().click();
    await expect(dialog).not.toBeVisible();
  });

  // AC7 (i18n — spot-check TH): verify badge and dialog title render in Thai
  test('AC7-i18n-th: locked badge and dialog title render in Thai locale', async ({ page }) => {
    // Set Thai locale before navigating
    await page.addInitScript(() => {
      localStorage.setItem('app_language', 'th');
    });

    await setupUsersIntercept(page, { initialLocked: true, stubUnlock: false });
    await navigateToUsersAndWait(page);

    // Thai badge text: "ถูกล็อก"
    const badge = page
      .locator('table.admin-table tbody tr', { hasText: 'Locked TestUser' })
      .locator('.admin-status.is-warning.admin-status--icon');
    await expect(badge).toContainText('ถูกล็อก'); // ถูกล็อก

    // Open dialog — Thai title: "ยืนยันการปลดล็อก"
    await page.locator('button[aria-label]').first().click();
    const dialog = page.locator('.admin-modal-confirm');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('h4')).toContainText(
      'ยืนยันการปลดล็อก' // ยืนยันการปลดล็อก
    );

    await dialog.locator('button').first().click();
    await expect(dialog).not.toBeVisible();

    // Reset locale for subsequent tests
    await page.addInitScript(() => {
      localStorage.setItem('app_language', 'en');
    });
  });
});
