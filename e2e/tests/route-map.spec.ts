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
 *   3. CONFIRM GUARD (rewritten by OBRS-1358): the single confirm button stays disabled
 *      until BOTH sides are chosen, and the tab advances on selection, not on a press.
 *   4. A1 BLOCKER: 0 passengers → SEARCH_VALIDATION; set >= 1 → navigate to /schedule-booking.
 *   5. Empty-state (empty arrays → EMPTY_STATE); error-state (500 → LOAD_FAILED + retry).
 *   6. DEGRADED MAP: blank mapsApiKey → MAP_UNAVAILABLE placeholder, no Google Maps console errors.
 *   7. Tri-locale: EN/TH/ZH labels correct, no raw i18n keys visible.
 *   8. REGRESSION: existing home-booking search box navigates to /schedule-booking.
 */

import { test, expect, Page } from '@playwright/test';
import { mockPublicPageApis } from '../fixtures/public-page-mocks';

// ---------------------------------------------------------------------------
// Mock payloads
// ---------------------------------------------------------------------------

/**
 * OBRS-1370. These fixtures used to name `placehold.co`, so a stub payload reached out to a
 * real CDN on every run of this spec. Same 640x360 intrinsic box, no network.
 */
const STUB_PHOTO =
  'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22640%22%20height=%22360%22/%3E';

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
        primaryPhotoUrl: STUB_PHOTO,
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
        primaryPhotoUrl: STUB_PHOTO,
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
  // OBRS-602: this now includes GET /api/routes, the one call the spec used to leave
  // live — which is the only reason playwright-route-map.config.ts:20-21 ever had to
  // reason about CORS for it. Each describe still registers its own
  // `**/api/routes/*/pickup-dropoff` payload afterwards, which is what makes the
  // success / empty / error states differ.
  await mockPublicPageApis(page);
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

/** Dismiss a SweetAlert2 modal popup by clicking its confirm button. */
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
    const pickupTab = page.locator('.p-tablist-tab-list .p-tab').filter({ hasText: 'Pickup' }).first();
    await expect(pickupTab).toBeVisible();
    await expect(pickupTab.locator('.p-badge')).toContainText('1');

    // Switch to dropoff tab
    const dropoffTab = page.locator('.p-tablist-tab-list .p-tab').filter({ hasText: 'Drop-off' }).first();
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
    const dropoffTab = page.locator('.p-tablist-tab-list .p-tab').filter({ hasText: 'Drop-off' }).first();
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

  // OBRS-1358 rewrote criterion 3. The guard is no longer "press confirm and be told
  // what is missing" — it is "the button cannot be pressed until nothing is missing",
  // and the tab advances on SELECTION so the pair completes without a button in between.

  test('Criterion 3: confirm guard — the single confirm button stays disabled while only the pickup is chosen, and the tab advances by itself', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRouteMapLoaded(page);

    const confirmBtn = page.locator('button', { hasText: 'Confirm pickup & drop-off' }).locator('visible=true').first();
    await confirmBtn.waitFor({ state: 'visible' });
    await expect(confirmBtn).toBeDisabled();

    // Select only pickup (do NOT switch to dropoff tab or select dropoff)
    const pickupRow = page.locator('.stop-row').first();
    await pickupRow.click();

    // Still disabled — one side is not a confirmable pair
    await expect(confirmBtn).toBeDisabled();

    // Nothing was pressed, so nothing had to be explained in a toast
    await expect(page.locator('.swal2-container')).toHaveCount(0);

    // Must NOT navigate away from /home
    expect(new URL(page.url()).pathname).toBe('/');

    // The active tab advanced to Drop-off on the selection itself
    const dropoffTab = page.locator('.p-tablist-tab-list .p-tab').filter({ hasText: 'Drop-off' }).first();
    await expect(dropoffTab).toHaveClass(/p-tab-active/);

    const dropoffRow = page.locator('.stop-row--dropoff').first();
    await dropoffRow.waitFor({ state: 'visible' });
    await dropoffRow.click();
    await expect(dropoffRow).toHaveClass(/stop-row--selected/);

    // Pair complete — now, and only now, the button is armed
    await expect(confirmBtn).toBeEnabled();
  });

  test('Criterion 3b: confirm guard — choosing the drop-off first advances back to Pickup and leaves the button disabled', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRouteMapLoaded(page);

    // Switch to dropoff tab and select only dropoff (pickup stays unselected)
    await page.locator('.p-tablist-tab-list .p-tab').filter({ hasText: 'Drop-off' }).first().click();
    const dropoffRow = page.locator('.stop-row--dropoff').first();
    await dropoffRow.waitFor({ state: 'visible' });
    await dropoffRow.click();

    // The active tab moved back to Pickup on the selection, with nothing to dismiss
    const pickupTab = page.locator('.p-tablist-tab-list .p-tab').filter({ hasText: 'Pickup' }).first();
    await expect(pickupTab).toHaveClass(/p-tab-active/);

    const confirmBtn = page.locator('button', { hasText: 'Confirm pickup & drop-off' }).locator('visible=true').first();
    await confirmBtn.waitFor({ state: 'visible' });
    await expect(confirmBtn).toBeDisabled();

    await expect(page.locator('.swal2-container')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe('/');

    const pickupRow = page.locator('.stop-row--pickup').first();
    await pickupRow.waitFor({ state: 'visible' });
    await pickupRow.click();
    await expect(pickupRow).toHaveClass(/stop-row--selected/);
    await expect(confirmBtn).toBeEnabled();
  });

  // ── Criterion 4 (prefill-and-stay) ─────────────────────────────────────────
  //
  // Behavior changed in OBRS-73: confirming both stops no longer navigates to
  // /schedule-booking. Instead, it prefills the hero search bar and scrolls up.

  test('Criterion 4: both stops selected → prefills hero bar, stays on /home, no auto-navigate', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRouteMapLoaded(page);

    // Select pickup stop — this advances to the drop-off tab on its own (OBRS-1358)
    const pickupRow = page.locator('.stop-row').first();
    await pickupRow.click();

    const dropoffRow = page.locator('.stop-row--dropoff').first();
    await dropoffRow.waitFor({ state: 'visible' });
    await dropoffRow.click();

    // Click the single confirm button with both stops selected
    const confirmBtn = page.locator('button', { hasText: 'Confirm pickup & drop-off' }).locator('visible=true').first();
    await confirmBtn.waitFor({ state: 'visible' });
    await confirmBtn.click();

    // Must NOT navigate — page stays on /home
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname).toBe('/');
    expect(page.url()).not.toContain('schedule-booking');

    // Hero search bar source field should now show the picked pickup station ("Nong Sak")
    const sourceDropdown = page.locator('[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]');
    await expect(sourceDropdown).toHaveValue(new RegExp('Nong Sak'));

    // Hero search bar destination field should now show the picked dropoff station ("Bangkok")
    const destDropdown = page.locator('[id="dropdownObrsHOME.HOME_BOOKING.END_STATION"]');
    await expect(destDropdown).toHaveValue(new RegExp('Bangkok'));

    // No SweetAlert modal/blocking popup should appear
    await expect(page.locator('.swal2-backdrop-show')).toHaveCount(0);
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

    // OBRS-1211: <app-route-map-panel> — and with it the MAP_UNAVAILABLE
    // placeholder this criterion is about — is no longer rendered until the
    // visitor asks for the map, so the panel is absent here by design. The
    // count assertion is the gate itself: if a later card reintroduces an
    // on-load panel (and with it the paid Maps JS request), this fails.
    await expect(page.locator('.route-map-placeholder')).toHaveCount(0);
    await page.locator('.map-placeholder-cta').click();

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
    const pickupTabTh = page.locator('.p-tablist-tab-list .p-tab').filter({ hasText: 'จุดรับ' }).first();
    await expect(pickupTabTh).toBeVisible();

    // Confirm button in Thai (OBRS-1358: one shared label, not the per-side pair)
    await expect(page.locator('button', { hasText: 'ยืนยันจุดรับ-ส่ง' }).locator('visible=true').first()).toBeVisible();

    // No raw i18n key leak
    const pageText = await page.locator('app-route-map-home').innerText();
    expect(pageText).not.toContain('HOME.ROUTE_MAP.');

    // ── Switch to Chinese ───────────────────────────────────────────────────
    await page.locator('.navbar-lang-trigger').first().click();
    await page.locator('button', { hasText: '中文' }).click();

    await page.waitForTimeout(800);

    // Pickup tab label in Chinese: "上车 (Chonburi)"
    const pickupTabZh = page.locator('.p-tablist-tab-list .p-tab').filter({ hasText: '上车' }).first();
    await expect(pickupTabZh).toBeVisible();

    // Confirm button in Chinese (OBRS-1358: one shared label, not the per-side pair)
    await expect(
      page.locator('button', { hasText: '确认上下车点' }).locator('visible=true').first()
    ).toBeVisible();

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

    // Wait for error state (.route-error is the component's error div class)
    const errorAlert = page.locator('.route-map-section .route-error');
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
