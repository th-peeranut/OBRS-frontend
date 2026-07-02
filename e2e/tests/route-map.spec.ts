/**
 * E2E tests for the Interactive Pickup/Drop-off Route Map feature.
 *
 * The new backend endpoint GET /api/routes/{slug}/pickup-dropoff is NOT deployed
 * to SIT yet, so every test mocks it via Playwright HTTP interception.
 * The /api/stops endpoint is also mocked so pickup/dropoff slugs resolve to
 * real station IDs in the NgRx store (slug→ID lookup required for confirm).
 *
 * Acceptance criteria covered:
 *   1. Tabs show pickup/dropoff with count badges; numbered lists render in order.
 *   2. Selecting a row updates the two bottom detail cards; selection is emphasized.
 *   3. CONFIRM GUARD: confirm with only one side selected shows VALIDATION_SELECT_BOTH.
 *   4. A1 BLOCKER: 0 passengers → SEARCH_VALIDATION; set >= 1 → navigate to /schedule-booking.
 *   5. Empty-state (empty arrays → EMPTY_STATE); error-state (500 → LOAD_FAILED + retry).
 *   6. DEGRADED MAP: blank mapsApiKey → MAP_UNAVAILABLE placeholder, no Google Maps console errors.
 *   7. Tri-locale: EN/TH/ZH labels correct, no raw i18n keys visible.
 *   8. REGRESSION: existing home-booking search box navigates to /schedule-booking.
 */

import { test, expect, Page } from '@playwright/test';
import stationsFixture from '../fixtures/stations.json';
import schedulesFixture from '../fixtures/schedules.json';

// ---------------------------------------------------------------------------
// Mock payloads
// ---------------------------------------------------------------------------

/**
 * Representative success payload.
 * Pickup slug "nong-sak" and dropoff slug "bangkok" must exist in stationsFixture
 * so the slug→station-ID resolution in HomeComponent succeeds.
 */
const successPayload = {
  code: 200,
  message: 'OK',
  data: {
    route: {
      slug: 'chonburi_bangkok',
      titleLocalized: { en: 'Chonburi to Bangkok', th: 'ชลบุรี ถึง กรุงเทพฯ', zh: '春武里至曼谷' },
      totalDistanceKm: 80,
      durationMinMinutes: 90,
      durationMaxMinutes: 120,
      originProvinceLabel: 'Chonburi',
      destinationProvinceLabel: 'Bangkok',
    },
    pickup: [
      {
        order: 1,
        slug: 'nong-sak',
        name: 'Nong Sak Station',
        address: '123 Test Road, Nong Sak',
        approxTime: '05:00',
        latitude: 13.0,
        longitude: 101.0,
        primaryPhotoUrl: 'https://placehold.co/640x360?text=nong-sak',
        googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=13.0,101.0',
      },
    ],
    dropoff: [
      {
        order: 2,
        slug: 'bangkok',
        name: 'Bangkok Station',
        address: '456 Bangkok Road',
        approxTime: '06:30',
        latitude: 13.76,
        longitude: 100.5,
        primaryPhotoUrl: 'https://placehold.co/640x360?text=bangkok',
        googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=13.76,100.5',
      },
    ],
  },
};

const emptyPayload = {
  code: 200,
  message: 'OK',
  data: {
    route: {
      slug: 'chonburi_bangkok',
      titleLocalized: { en: 'Chonburi to Bangkok', th: '', zh: '' },
      totalDistanceKm: 80,
      durationMinMinutes: 90,
      durationMaxMinutes: 120,
      originProvinceLabel: 'Chonburi',
      destinationProvinceLabel: 'Bangkok',
    },
    pickup: [],
    dropoff: [],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupCommonMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
  });
  await page.route('**/api/stops', (route) =>
    route.fulfill({ json: stationsFixture })
  );
  await page.route('**/api/schedules/search', (route) =>
    route.fulfill({ json: schedulesFixture })
  );
}

/** Wait until the route-map section has left the loading state. */
async function waitForRouteMapLoaded(page: Page): Promise<void> {
  // The loading spinner contains the LOADING key translation
  await page.waitForTimeout(300); // brief settle after navigation
  // Wait for stop rows to be visible (loaded) OR the empty/error state
  await Promise.race([
    page.locator('.stop-row').first().waitFor({ state: 'visible', timeout: 15_000 }),
    page.locator('.route-map-section .alert-danger').waitFor({ state: 'visible', timeout: 15_000 }),
    page.locator('.route-map-section .text-center.py-5').waitFor({ state: 'visible', timeout: 15_000 }),
  ]);
}

/** Dismiss a SweetAlert2 popup by clicking its confirm button. */
async function dismissSweetAlert(page: Page): Promise<void> {
  const confirmBtn = page.locator('.swal2-confirm');
  await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await confirmBtn.click();
  await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// Test suite: SUCCESS state
// ---------------------------------------------------------------------------

test.describe('Route Map – Success State', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await page.route('**/api/routes/*/pickup-dropoff', (route) =>
      route.fulfill({ json: successPayload })
    );
  });

  // ── Criterion 1 ──────────────────────────────────────────────────────────

  test('Criterion 1: pickup tab badge = 1, dropoff tab badge = 1, stop list renders in order', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRouteMapLoaded(page);

    // Left panel pickup tab should be active (first tab) — verify pickup list renders
    const pickupRow = page.locator('.stop-row').first();
    await pickupRow.waitFor({ state: 'visible' });

    // Order badge shows "1"
    await expect(pickupRow.locator('.stop-order-badge')).toContainText('1');
    // Stop name from mock
    await expect(pickupRow.locator('.stop-name')).toContainText('Nong Sak Station');
    // Address from mock
    await expect(pickupRow.locator('.stop-address')).toContainText('123 Test Road');
    // approxTime from mock
    await expect(pickupRow.locator('.stop-time')).toContainText('05:00');

    // Tab header for pickup should contain the province label and badge "1"
    const pickupTab = page.locator('.p-tabview-nav li').filter({ hasText: 'Pickup' }).first();
    await expect(pickupTab).toBeVisible();
    await expect(pickupTab.locator('.p-badge')).toContainText('1');

    // Switch to dropoff tab
    const dropoffTab = page.locator('.p-tabview-nav li').filter({ hasText: 'Drop-off' }).first();
    await dropoffTab.click();

    // Use .stop-row--dropoff to avoid matching the hidden pickup row still in DOM
    const dropoffRow = page.locator('.stop-row--dropoff').first();
    await dropoffRow.waitFor({ state: 'visible' });
    await expect(dropoffRow.locator('.stop-order-badge')).toContainText('2');
    await expect(dropoffRow.locator('.stop-name')).toContainText('Bangkok Station');
    await expect(dropoffRow.locator('.stop-time')).toContainText('06:30');

    // Dropoff tab badge should show "1"
    await expect(dropoffTab.locator('.p-badge')).toContainText('1');
  });

  // ── Criterion 2 ──────────────────────────────────────────────────────────

  test('Criterion 2: selecting pickup+dropoff rows updates detail cards with photo/name/address/buttons', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRouteMapLoaded(page);

    // Select pickup stop (in first/active tab)
    const pickupRow = page.locator('.stop-row').first();
    await pickupRow.click();

    // The pickup stop row should be visually selected
    await expect(pickupRow).toHaveClass(/stop-row--selected/);

    // Switch to dropoff tab
    const dropoffTab = page.locator('.p-tabview-nav li').filter({ hasText: 'Drop-off' }).first();
    await dropoffTab.click();

    // Use .stop-row--dropoff to avoid matching the hidden pickup row still in DOM
    const dropoffRow = page.locator('.stop-row--dropoff').first();
    await dropoffRow.waitFor({ state: 'visible' });
    await dropoffRow.click();

    // Dropoff row selected
    await expect(dropoffRow).toHaveClass(/stop-row--selected/);

    // Detail cards — pickup card should show Nong Sak Station
    const detailCards = page.locator('app-route-stop-detail-card');
    const pickupCard = detailCards.nth(0);
    const dropoffCard = detailCards.nth(1);

    await expect(pickupCard).toContainText('Nong Sak Station');
    await expect(pickupCard).toContainText('123 Test Road');
    await expect(pickupCard).toContainText('05:00');

    await expect(dropoffCard).toContainText('Bangkok Station');
    await expect(dropoffCard).toContainText('456 Bangkok Road');
    await expect(dropoffCard).toContainText('06:30');

    // Action button visible: "Open in Google Maps" (the "View photo" button was removed in OBRS-72)
    await expect(pickupCard.locator('button', { hasText: 'Open in Google Maps' })).toBeVisible();
    await expect(dropoffCard.locator('button', { hasText: 'Open in Google Maps' })).toBeVisible();
  });

  // ── Criterion 3 ──────────────────────────────────────────────────────────

  test('Criterion 3: confirm guard — only pickup selected → VALIDATION_SELECT_DROPOFF, switches to Drop-off tab, no navigation', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRouteMapLoaded(page);

    // Select only pickup (do NOT switch to dropoff tab or select dropoff)
    const pickupRow = page.locator('.stop-row').first();
    await pickupRow.click();

    // Click "Confirm pickup"
    const confirmPickupBtn = page.locator('button', { hasText: 'Confirm pickup' }).first();
    await confirmPickupBtn.waitFor({ state: 'visible' });
    await confirmPickupBtn.click();

    // SweetAlert2 warning should appear with the drop-off-specific message
    await page.locator('.swal2-container').waitFor({ state: 'visible', timeout: 5_000 });
    await expect(page.locator('.swal2-title')).toContainText(
      'Please select a drop-off point before confirming'
    );

    // Must NOT navigate away from the home page
    expect(new URL(page.url()).pathname).toBe('/');

    await dismissSweetAlert(page);

    // The active tab should have switched to Drop-off to guide the user there
    const dropoffTab = page.locator('.p-tabview-nav li').filter({ hasText: 'Drop-off' }).first();
    await expect(dropoffTab).toHaveClass(/p-highlight/);
  });

  test('Criterion 3b: confirm guard — only dropoff selected → VALIDATION_SELECT_PICKUP, switches to Pickup tab, no navigation', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRouteMapLoaded(page);

    // Switch to dropoff tab and select only dropoff (pickup stays unselected)
    await page.locator('.p-tabview-nav li').filter({ hasText: 'Drop-off' }).first().click();
    const dropoffRow = page.locator('.stop-row--dropoff').first();
    await dropoffRow.waitFor({ state: 'visible' });
    await dropoffRow.click();

    const confirmDropoffBtn = page.locator('button', { hasText: 'Confirm drop-off' }).first();
    await confirmDropoffBtn.waitFor({ state: 'visible' });
    await confirmDropoffBtn.click();

    await page.locator('.swal2-container').waitFor({ state: 'visible', timeout: 5_000 });
    await expect(page.locator('.swal2-title')).toContainText(
      'Please select a pickup point before confirming'
    );

    expect(new URL(page.url()).pathname).toBe('/');

    await dismissSweetAlert(page);

    // The active tab should have switched back to Pickup to guide the user there
    const pickupTab = page.locator('.p-tabview-nav li').filter({ hasText: 'Pickup' }).first();
    await expect(pickupTab).toHaveClass(/p-highlight/);
  });

  // ── Criterion 4 (A1 BLOCKER) ─────────────────────────────────────────────

  test('Criterion 4 A1: 0 passengers → SEARCH_VALIDATION warning; set passenger → navigates to /schedule-booking', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRouteMapLoaded(page);

    // Select pickup stop
    const pickupRow = page.locator('.stop-row').first();
    await pickupRow.click();

    // Switch to dropoff tab and select dropoff stop
    await page.locator('.p-tabview-nav li').filter({ hasText: 'Drop-off' }).first().click();
    // Use .stop-row--dropoff to avoid matching the hidden pickup row still in DOM
    const dropoffRow = page.locator('.stop-row--dropoff').first();
    await dropoffRow.waitFor({ state: 'visible' });
    await dropoffRow.click();

    // Click "Confirm drop-off" with 0 passengers in the booking form
    const confirmDropoffBtn = page.locator('button', { hasText: 'Confirm drop-off' }).first();
    await confirmDropoffBtn.waitFor({ state: 'visible' });
    await confirmDropoffBtn.click();

    // Should show PASSENGER_VALIDATION warning (not navigate) — origin/dest are
    // already set by the map picks, so only the passenger count can be missing.
    await page.locator('.swal2-container').waitFor({ state: 'visible', timeout: 5_000 });
    await expect(page.locator('.swal2-title')).toContainText(
      'Please select at least one passenger before searching.'
    );
    expect(new URL(page.url()).pathname).toBe('/');

    await dismissSweetAlert(page);

    // Now set at least 1 passenger in the home-booking form
    await page.locator('#dropdownObrsPassenger').click();
    await page.getByAltText('Passenger Add Icon').first().click();
    await page.locator('body').click({ position: { x: 10, y: 10 } });

    // Click "Confirm drop-off" again — both slugs still selected
    await confirmDropoffBtn.click();

    // Should navigate to /schedule-booking
    await page.waitForURL('**/schedule-booking', { timeout: 10_000 });
  });

  // ── Criterion 6 ──────────────────────────────────────────────────────────

  test('Criterion 6: mapsApiKey blank → MAP_UNAVAILABLE placeholder shown, no Google Maps console errors', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await waitForRouteMapLoaded(page);

    // The map placeholder should be visible (mapsApiKey is '' in environment.sit.ts)
    const placeholder = page.locator('.route-map-placeholder');
    await expect(placeholder).toBeVisible();
    await expect(placeholder).toContainText('Map unavailable');

    // Give a moment for any async scripts to run
    await page.waitForTimeout(1_000);

    // No Google Maps-related console errors (no API key → no script load attempt)
    const gmapsErrors = consoleErrors.filter(
      (e) =>
        e.toLowerCase().includes('google') ||
        e.toLowerCase().includes('maps') ||
        e.toLowerCase().includes('gm_authfailure')
    );
    expect(gmapsErrors).toHaveLength(0);
  });

  // ── Criterion 7 ──────────────────────────────────────────────────────────

  test('Criterion 7: tri-locale — TH shows Thai labels, ZH shows Chinese labels, no raw i18n keys', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRouteMapLoaded(page);

    // ── Switch to Thai ──────────────────────────────────────────────────────
    await page.locator('.navbar-lang-trigger').first().click();
    await page.locator('button', { hasText: 'ไทย' }).click();

    // Wait for Angular to re-render translations
    await page.waitForTimeout(800);

    // Pickup tab label in Thai.
    const pickupTabTh = page.locator('.p-tabview-nav li').filter({ hasText: 'จุดรับ' }).first();
    await expect(pickupTabTh).toBeVisible();

    // Confirm button in Thai
    await expect(page.locator('button', { hasText: 'ยืนยันจุดรับ' }).first()).toBeVisible();

    // No raw i18n key leak
    const pageText = await page.locator('app-route-map-home').innerText();
    expect(pageText).not.toContain('HOME.ROUTE_MAP.');

    // ── Switch to Chinese ───────────────────────────────────────────────────
    await page.locator('.navbar-lang-trigger').first().click();
    await page.locator('button', { hasText: '中文' }).click();

    await page.waitForTimeout(800);

    // Pickup tab label in Chinese: "上车 (Chonburi)"
    const pickupTabZh = page.locator('.p-tabview-nav li').filter({ hasText: '上车' }).first();
    await expect(pickupTabZh).toBeVisible();

    // Confirm button in Chinese
    await expect(page.locator('button', { hasText: '确认上车点' }).first()).toBeVisible();

    // No raw i18n key leak
    const pageTextZh = await page.locator('app-route-map-home').innerText();
    expect(pageTextZh).not.toContain('HOME.ROUTE_MAP.');

    // ── Switch back to English ──────────────────────────────────────────────
    await page.locator('.navbar-lang-trigger').first().click();
    await page.locator('button', { hasText: 'English' }).click();
    await page.waitForTimeout(500);
  });
});

// ---------------------------------------------------------------------------
// Test suite: EMPTY state
// ---------------------------------------------------------------------------

test.describe('Route Map – Empty State', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await page.route('**/api/routes/*/pickup-dropoff', (route) =>
      route.fulfill({ json: emptyPayload })
    );
  });

  test('Criterion 5a: empty pickup+dropoff arrays render EMPTY_STATE message', async ({
    page,
  }) => {
    await page.goto('/');

    // Wait for empty state — stops won't appear
    const emptyState = page.locator('.route-map-section .text-center.py-5');
    await emptyState.waitFor({ state: 'visible', timeout: 15_000 });

    await expect(emptyState).toContainText('No stops configured for this route');
  });
});

// ---------------------------------------------------------------------------
// Test suite: ERROR state
// ---------------------------------------------------------------------------

test.describe('Route Map – Error State', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await page.route('**/api/routes/*/pickup-dropoff', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' })
    );
  });

  test('Criterion 5b: 500 response renders LOAD_FAILED message and Retry button', async ({
    page,
  }) => {
    await page.goto('/');

    // Wait for error state
    const errorAlert = page.locator('.route-map-section .alert-danger');
    await errorAlert.waitFor({ state: 'visible', timeout: 15_000 });

    await expect(errorAlert).toContainText('Unable to load stop data. Please try again.');
    await expect(errorAlert.locator('button', { hasText: 'Retry' })).toBeVisible();

    // SKIP_GLOBAL_ERROR_ALERT must suppress the global interceptor's SweetAlert.
    // If it fires, a swal2-backdrop-show element would block the whole page.
    await expect(page.locator('.swal2-backdrop-show')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Test suite: REGRESSION — existing home-booking form
// ---------------------------------------------------------------------------

test.describe('Regression – Home Booking Search', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    // Mock pickup-dropoff so route-map doesn't interfere with regression test
    await page.route('**/api/routes/*/pickup-dropoff', (route) =>
      route.fulfill({ json: successPayload })
    );
  });

  test('Criterion 8 regression: existing home-booking form search navigates to /schedule-booking', async ({
    page,
  }) => {
    await page.goto('/');

    // Wait for station dropdowns to render
    await page
      .locator('[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]')
      .waitFor({ state: 'visible', timeout: 20_000 });

    // Add 1 adult passenger
    await page.locator('#dropdownObrsPassenger').click();
    await page.getByAltText('Passenger Add Icon').first().click();
    await page.locator('body').click({ position: { x: 10, y: 10 } });

    // Select source station
    await page
      .locator('[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]')
      .click();
    await page
      .locator('.dropdown-menu.show .dropdown-option', { hasText: 'Nong Sak' })
      .click();

    // Select destination station
    await page
      .locator('[id="dropdownObrsHOME.HOME_BOOKING.END_STATION"]')
      .click();
    await page
      .locator('.dropdown-menu.show .dropdown-option', { hasText: 'Bangkok' })
      .click();

    // Click Search
    await page.locator('.btn-search').click();

    // Should navigate to /schedule-booking
    await page.waitForURL('**/schedule-booking', { timeout: 10_000 });
  });
});
