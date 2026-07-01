/**
 * E2E tests for the two-direction selector on /home.
 *
 * Runs against the LIVE SIT backend (https://sit-obrs-backend.koyeb.app) via
 * the Angular dev server on port 4201.  The browser is launched with
 * --disable-web-security so CORS is not enforced (SIT CORS is pinned to :4200).
 *
 * Live SIT data as of 2026-06-30:
 *   Routes:
 *     chonburi_bangkok  - EN "Chonburi-bangkok", TH Chonburi-Bangkok, no zh
 *     bangkok_chonburi  - EN "Bangkok-chonburi",  TH Bangkok-Chonburi, no zh
 *   chonburi_bangkok pickup-dropoff:
 *     19 pickup stops – first "Nong chak"
 *      6 dropoff stops – first "Airport link lat krabang"
 *   bangkok_chonburi pickup-dropoff:
 *     5 pickup stops – first "Mo chit 2 bus terminal"
 *     3 dropoff stops – first "Ban bueng wisitchai market"
 *
 * Acceptance criteria covered: AC1 – AC9.
 */

import { test, expect, Page } from '@playwright/test';
import stationsFixture from '../fixtures/stations.json';
import schedulesFixture from '../fixtures/schedules.json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stub the home-booking support endpoints that are unrelated to the direction
 *  selector.  We leave /api/routes* untouched so they hit the real SIT backend. */
async function stubSupportEndpoints(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
  });
  // Mock station list (for the existing home-booking dropdown; unrelated to route-map)
  await page.route('**/api/stops', (route) =>
    route.fulfill({ json: stationsFixture })
  );
  // Mock schedule search (only needed if regression step triggers a booking search)
  await page.route('**/api/schedules/search', (route) =>
    route.fulfill({ json: schedulesFixture })
  );
}

/** Wait until the route-map section has left the loading state.
 *  Works for both success (stop rows appear) and error/empty (inline alert). */
async function waitForRouteMapReady(page: Page): Promise<void> {
  await page.waitForTimeout(400);
  await Promise.race([
    page.locator('.stop-row').first().waitFor({ state: 'visible', timeout: 20_000 }),
    page.locator('.route-map-section .alert-danger').waitFor({ state: 'visible', timeout: 20_000 }),
    page.locator('.route-map-section .text-center.py-5').waitFor({ state: 'visible', timeout: 20_000 }),
  ]);
}

/** Return all p-selectbutton option buttons */
const directionButtons = (page: Page) =>
  page.locator('.p-selectbutton .p-button');

/** Return the currently highlighted (active) direction button */
const activeDirectionButton = (page: Page) =>
  page.locator('.p-selectbutton .p-button.p-highlight');

// ---------------------------------------------------------------------------
// AC1 + AC8: Default state and map degradation for Chonburi→Bangkok
// ---------------------------------------------------------------------------

test.describe('AC1 + AC8: Default Chonburi→Bangkok, map degradation', () => {
  test.beforeEach(async ({ page }) => {
    await stubSupportEndpoints(page);
  });

  test('AC1: first load defaults to Chonburi→Bangkok; pickup list shows Chonburi stops, dropoff shows Bangkok stops', async ({ page }) => {
    await page.goto('/');
    await waitForRouteMapReady(page);

    // Direction selector must exist and default to Chonburi→Bangkok
    const activeBtnText = await activeDirectionButton(page).innerText();
    expect(activeBtnText.toLowerCase()).toContain('chonburi');

    // Pickup tab is active by default; first stop is Chonburi-side
    const firstPickupRow = page.locator('.stop-row--pickup').first();
    await firstPickupRow.waitFor({ state: 'visible', timeout: 10_000 });
    const firstPickupName = await firstPickupRow.locator('.stop-name').innerText();
    expect(firstPickupName.toLowerCase()).toContain('nong chak');

    // Switch to the drop-off tab and verify Bangkok-side stops
    await page.locator('.p-tabview-nav li').filter({ hasText: 'Drop-off' }).first().click();
    const firstDropoffRow = page.locator('.stop-row--dropoff').first();
    await firstDropoffRow.waitFor({ state: 'visible', timeout: 10_000 });
    const firstDropoffName = await firstDropoffRow.locator('.stop-name').innerText();
    expect(firstDropoffName.toLowerCase()).toContain('airport link lat krabang');

    // Trip summary renders (at least one of the summary key strings is present)
    const summary = page.locator('app-route-travel-summary');
    await expect(summary).toBeVisible();
    // Summary should mention both provinces
    const summaryText = await summary.innerText();
    expect(summaryText).toMatch(/Chonburi|Bangkok/i);
  });

  test('AC8: map degrades gracefully for Chonburi→Bangkok — "Map unavailable" visible, no Google Maps errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await waitForRouteMapReady(page);

    // Map placeholder must be visible (mapsApiKey is blank in environment.sit.ts)
    const placeholder = page.locator('.route-map-placeholder');
    await expect(placeholder).toBeVisible();
    await expect(placeholder).toContainText('Map unavailable');

    await page.waitForTimeout(1_000);

    const gmapsErrors = consoleErrors.filter((e) =>
      e.toLowerCase().includes('google') ||
      e.toLowerCase().includes('maps') ||
      e.toLowerCase().includes('gm_authfailure')
    );
    expect(gmapsErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC2: Both direction options present with API-sourced labels
// ---------------------------------------------------------------------------

test.describe('AC2: Both direction options present, labels from API', () => {
  test.beforeEach(async ({ page }) => {
    await stubSupportEndpoints(page);
  });

  test('AC2: selector shows exactly 2 options; labels are human-readable EN strings from API translations (not raw slugs)', async ({ page }) => {
    await page.goto('/');
    await waitForRouteMapReady(page);

    const buttons = directionButtons(page);
    await expect(buttons).toHaveCount(2);

    const label0 = await buttons.nth(0).innerText();
    const label1 = await buttons.nth(1).innerText();

    // Labels must NOT be the raw slugs
    expect(label0).not.toContain('_');
    expect(label1).not.toContain('_');

    // Labels must contain recognizable direction text (from API EN translations)
    expect(label0.toLowerCase()).toMatch(/chonburi|bangkok/i);
    expect(label1.toLowerCase()).toMatch(/chonburi|bangkok/i);

    // The two labels must be different (opposite directions)
    expect(label0.toLowerCase()).not.toBe(label1.toLowerCase());
  });
});

// ---------------------------------------------------------------------------
// AC3: Switch to Bangkok→Chonburi reloads correct stops
// ---------------------------------------------------------------------------

test.describe('AC3: Switch direction reloads correct stops from live API', () => {
  test.beforeEach(async ({ page }) => {
    await stubSupportEndpoints(page);
  });

  test('AC3: switching to Bangkok→Chonburi reloads pickup to Bangkok stops and dropoff to Chonburi stops', async ({ page }) => {
    await page.goto('/');
    await waitForRouteMapReady(page);

    // Find the Bangkok→Chonburi button (second option)
    const bkkBtn = directionButtons(page).nth(1);
    await bkkBtn.waitFor({ state: 'visible' });
    const bkkLabel = await bkkBtn.innerText();
    // Confirm it's the Bangkok→Chonburi direction
    expect(bkkLabel.toLowerCase()).toMatch(/bangkok/i);

    // Click it
    await bkkBtn.click();

    // Loading state should appear briefly (the component sets loadState='loading' on switch)
    // Then wait for data to load
    await waitForRouteMapReady(page);

    // Active button should now be Bangkok→Chonburi
    const activeBtnText = await activeDirectionButton(page).innerText();
    expect(activeBtnText.toLowerCase()).toContain('bangkok');

    // Pickup tab should now show Bangkok-side stops
    const firstPickupRow = page.locator('.stop-row--pickup').first();
    await firstPickupRow.waitFor({ state: 'visible', timeout: 15_000 });
    const firstPickupName = await firstPickupRow.locator('.stop-name').innerText();
    expect(firstPickupName.toLowerCase()).toContain('mo chit 2 bus terminal');

    // Switch to dropoff tab and verify Chonburi-side stops
    await page.locator('.p-tabview-nav li').filter({ hasText: 'Drop-off' }).first().click();
    const firstDropoffRow = page.locator('.stop-row--dropoff').first();
    await firstDropoffRow.waitFor({ state: 'visible', timeout: 10_000 });
    const firstDropoffName = await firstDropoffRow.locator('.stop-name').innerText();
    expect(firstDropoffName.toLowerCase()).toContain('ban bueng wisitchai market');

    // Trip summary should update (route now Bangkok→Chonburi)
    const summary = page.locator('app-route-travel-summary');
    await expect(summary).toBeVisible();
  });

  test('AC8 (continued): map also degrades gracefully for Bangkok→Chonburi direction', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await waitForRouteMapReady(page);

    // Switch to Bangkok→Chonburi
    await directionButtons(page).nth(1).click();
    await waitForRouteMapReady(page);

    // Placeholder must still be visible
    const placeholder = page.locator('.route-map-placeholder');
    await expect(placeholder).toBeVisible();
    await expect(placeholder).toContainText('Map unavailable');

    await page.waitForTimeout(1_000);

    const gmapsErrors = consoleErrors.filter((e) =>
      e.toLowerCase().includes('google') ||
      e.toLowerCase().includes('maps') ||
      e.toLowerCase().includes('gm_authfailure')
    );
    expect(gmapsErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC4: Reset on switch — selection cleared when direction changes
// ---------------------------------------------------------------------------

test.describe('AC4: Selections cleared on direction switch', () => {
  test.beforeEach(async ({ page }) => {
    await stubSupportEndpoints(page);
  });

  test('AC4: selecting pickup + dropoff then switching direction clears both selections', async ({ page }) => {
    await page.goto('/');
    await waitForRouteMapReady(page);

    // Select first pickup stop
    const firstPickupRow = page.locator('.stop-row--pickup').first();
    await firstPickupRow.click();
    await expect(firstPickupRow).toHaveClass(/stop-row--selected/);

    // Switch to dropoff tab and select first dropoff stop
    await page.locator('.p-tabview-nav li').filter({ hasText: 'Drop-off' }).first().click();
    const firstDropoffRow = page.locator('.stop-row--dropoff').first();
    await firstDropoffRow.waitFor({ state: 'visible' });
    await firstDropoffRow.click();
    await expect(firstDropoffRow).toHaveClass(/stop-row--selected/);

    // Switch direction to Bangkok→Chonburi
    await directionButtons(page).nth(1).click();
    await waitForRouteMapReady(page);

    // No stop rows should be selected
    const selectedRows = page.locator('.stop-row--selected');
    await expect(selectedRows).toHaveCount(0);

    // Detail cards should show no selection (not showing stop names from the previous direction)
    const detailCards = page.locator('app-route-stop-detail-card');
    if (await detailCards.count() > 0) {
      const cardText = await detailCards.first().innerText();
      expect(cardText).not.toContain('Nong chak');
      expect(cardText).not.toContain('Airport link lat krabang');
    }
  });
});

// ---------------------------------------------------------------------------
// AC5: Active-click no-op
// ---------------------------------------------------------------------------

test.describe('AC5: Clicking already-selected direction is a no-op', () => {
  test.beforeEach(async ({ page }) => {
    await stubSupportEndpoints(page);
  });

  test('AC5: clicking already-selected Chonburi→Bangkok again does not trigger refetch or change selection', async ({ page }) => {
    let pickupDropoffRequestCount = 0;

    // Count pickup-dropoff API calls
    await page.route('**/api/routes/*/pickup-dropoff', async (route) => {
      pickupDropoffRequestCount++;
      await route.continue();
    });

    await page.goto('/');
    await waitForRouteMapReady(page);

    const countAfterLoad = pickupDropoffRequestCount;
    expect(countAfterLoad).toBeGreaterThanOrEqual(1); // initial load happened

    const activeBtn = activeDirectionButton(page);
    await activeBtn.click();

    // Allow 1s for any spurious request to fire
    await page.waitForTimeout(1_000);

    // No new request should have been triggered
    expect(pickupDropoffRequestCount).toBe(countAfterLoad);

    // Selection (active button) must still be Chonburi→Bangkok
    const activeBtnTextAfter = await activeDirectionButton(page).innerText();
    expect(activeBtnTextAfter.toLowerCase()).toContain('chonburi');
  });
});

// ---------------------------------------------------------------------------
// AC6: i18n — direction group label and direction labels localize correctly
// ---------------------------------------------------------------------------

test.describe('AC6: i18n — labels localize live, zh falls back to EN, no raw key leakage', () => {
  test.beforeEach(async ({ page }) => {
    await stubSupportEndpoints(page);
  });

  test('AC6-TH: Thai locale shows correct DIRECTION_GROUP_LABEL and direction labels; no raw keys', async ({ page }) => {
    await page.goto('/');
    await waitForRouteMapReady(page);

    // Switch to Thai
    await page.locator('.navbar-lang-trigger').first().click();
    await page.locator('button', { hasText: 'ไทย' }).click();
    await page.waitForTimeout(1_000);

    // Group aria-label should be Thai
    const groupEl = page.locator('div[role="group"]').first();
    await expect(groupEl).toHaveAttribute('aria-label', 'ทิศทางการเดินทาง');

    // Direction button labels should be Thai translations from API
    const buttons = directionButtons(page);
    const label0 = await buttons.nth(0).innerText();
    const label1 = await buttons.nth(1).innerText();
    expect(label0).toContain('ชลบุรี');
    expect(label1).toContain('กรุงเทพ');

    // No raw HOME.ROUTE_MAP.* keys
    const sectionText = await page.locator('app-route-map-home').innerText();
    expect(sectionText).not.toContain('HOME.ROUTE_MAP.');

    // Switch back to EN for cleanup
    await page.locator('.navbar-lang-trigger').first().click();
    await page.locator('button', { hasText: 'English' }).click();
    await page.waitForTimeout(500);
  });

  test('AC6-ZH: Chinese locale shows correct DIRECTION_GROUP_LABEL, direction labels fall back to EN (not blank, not raw slug)', async ({ page }) => {
    await page.goto('/');
    await waitForRouteMapReady(page);

    // Switch to Chinese
    await page.locator('.navbar-lang-trigger').first().click();
    await page.locator('button', { hasText: '中文' }).click();
    await page.waitForTimeout(1_000);

    // Group aria-label should be Chinese
    const groupEl = page.locator('div[role="group"]').first();
    await expect(groupEl).toHaveAttribute('aria-label', '出行方向');

    // Direction button labels — API has NO zh translation for these routes,
    // so must fall back to EN label (not blank, not raw slug like "chonburi_bangkok")
    const buttons = directionButtons(page);
    const label0 = await buttons.nth(0).innerText();
    const label1 = await buttons.nth(1).innerText();

    // Must not be blank
    expect(label0.trim()).not.toBe('');
    expect(label1.trim()).not.toBe('');

    // Must not be raw slug (no underscore as slug separator)
    expect(label0).not.toContain('chonburi_bangkok');
    expect(label0).not.toContain('bangkok_chonburi');
    expect(label1).not.toContain('chonburi_bangkok');
    expect(label1).not.toContain('bangkok_chonburi');

    // Must be the EN fallback labels from the API
    expect(label0).toMatch(/Chonburi|Bangkok/i);
    expect(label1).toMatch(/Chonburi|Bangkok/i);

    // No raw HOME.ROUTE_MAP.* keys
    const sectionText = await page.locator('app-route-map-home').innerText();
    expect(sectionText).not.toContain('HOME.ROUTE_MAP.');

    // Switch back to EN for cleanup
    await page.locator('.navbar-lang-trigger').first().click();
    await page.locator('button', { hasText: 'English' }).click();
    await page.waitForTimeout(500);
  });

  test('AC6-EN: English locale shows DIRECTION_GROUP_LABEL correctly, no raw keys', async ({ page }) => {
    await page.goto('/');
    await waitForRouteMapReady(page);

    // Group aria-label should be English
    const groupEl = page.locator('div[role="group"]').first();
    await expect(groupEl).toHaveAttribute('aria-label', 'Travel direction');

    // No raw HOME.ROUTE_MAP.* keys
    const sectionText = await page.locator('app-route-map-home').innerText();
    expect(sectionText).not.toContain('HOME.ROUTE_MAP.');
  });
});

// ---------------------------------------------------------------------------
// AC7: Loading and error states work for the selected direction
// ---------------------------------------------------------------------------

test.describe('AC7: Loading and error states function per direction', () => {
  test('AC7a: loading spinner appears while fetching pickup-dropoff for Chonburi→Bangkok', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('app_language', 'en');
    });
    await page.route('**/api/stops', (route) => route.fulfill({ json: stationsFixture }));

    // Delay the pickup-dropoff response by 2s so we can catch the spinner
    await page.route('**/api/routes/*/pickup-dropoff', async (route) => {
      await new Promise((r) => setTimeout(r, 2_000));
      await route.continue();
    });
    // Also delay routes list
    await page.route('**/api/routes', async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.continue();
    });

    await page.goto('/');

    // Loading spinner should appear before data arrives
    const spinner = page.locator('.route-map-section p-progressspinner');
    await expect(spinner).toBeVisible({ timeout: 5_000 });
  });

  test('AC7b: 500 error on pickup-dropoff for Chonburi→Bangkok shows inline error state', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('app_language', 'en');
    });
    await page.route('**/api/stops', (route) => route.fulfill({ json: stationsFixture }));
    await page.route('**/api/routes/*/pickup-dropoff', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' })
    );

    await page.goto('/');

    const errorAlert = page.locator('.route-map-section .alert-danger');
    await errorAlert.waitFor({ state: 'visible', timeout: 20_000 });
    await expect(errorAlert).toContainText('Unable to load stop data');
    await expect(errorAlert.locator('button', { hasText: 'Retry' })).toBeVisible();

    // No global SweetAlert should block the page
    await expect(page.locator('.swal2-backdrop-show')).toHaveCount(0);
  });

  test('AC7c: switching to Bangkok→Chonburi and getting a 500 shows error state for that direction', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('app_language', 'en');
    });
    await page.route('**/api/stops', (route) => route.fulfill({ json: stationsFixture }));

    let callCount = 0;
    await page.route('**/api/routes/*/pickup-dropoff', async (route) => {
      callCount++;
      if (callCount === 1) {
        // First call (chonburi_bangkok) succeeds
        await route.continue();
      } else {
        // Second call (bangkok_chonburi) fails
        await route.fulfill({ status: 500, body: 'Internal Server Error' });
      }
    });

    await page.goto('/');
    await waitForRouteMapReady(page);

    // Switch to Bangkok→Chonburi
    await directionButtons(page).nth(1).click();

    const errorAlert = page.locator('.route-map-section .alert-danger');
    await errorAlert.waitFor({ state: 'visible', timeout: 20_000 });
    await expect(errorAlert).toContainText('Unable to load stop data');

    // No global SweetAlert
    await expect(page.locator('.swal2-backdrop-show')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// AC9: Regression — existing Chonburi→Bangkok confirm path still works
// ---------------------------------------------------------------------------

test.describe('AC9: Regression — existing pickup/dropoff confirm path', () => {
  test.beforeEach(async ({ page }) => {
    await stubSupportEndpoints(page);
  });

  test('AC9: selecting pickup + dropoff in Chonburi→Bangkok then confirming emits correctly (warning when 0 passengers)', async ({ page }) => {
    await page.goto('/');
    await waitForRouteMapReady(page);

    // Confirm we are on Chonburi→Bangkok (default direction, unchanged)
    const activeBtnText = await activeDirectionButton(page).innerText();
    expect(activeBtnText.toLowerCase()).toContain('chonburi');

    // Select first pickup stop
    const pickupRow = page.locator('.stop-row--pickup').first();
    await pickupRow.click();
    await expect(pickupRow).toHaveClass(/stop-row--selected/);

    // Switch to dropoff tab and select first dropoff stop
    await page.locator('.p-tabview-nav li').filter({ hasText: 'Drop-off' }).first().click();
    const dropoffRow = page.locator('.stop-row--dropoff').first();
    await dropoffRow.waitFor({ state: 'visible' });
    await dropoffRow.click();
    await expect(dropoffRow).toHaveClass(/stop-row--selected/);

    // Click "Confirm drop-off"
    const confirmDropoffBtn = page.locator('button', { hasText: 'Confirm drop-off' }).first();
    await confirmDropoffBtn.waitFor({ state: 'visible' });
    await confirmDropoffBtn.click();

    // Without passengers set, the home-booking form should show SEARCH_VALIDATION warning
    // (this is the existing confirm guard that should still work)
    await page.locator('.swal2-container').waitFor({ state: 'visible', timeout: 8_000 });

    // Must still be on the home page (no navigation without passengers)
    expect(new URL(page.url()).pathname).toBe('/');

    await page.locator('.swal2-confirm').click();
    await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 5_000 });
  });
});
