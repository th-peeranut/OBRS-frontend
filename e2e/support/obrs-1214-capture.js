/**
 * OBRS-1214 — one-off manual evidence capture script (NOT a Playwright test file;
 * not wired into any testMatch, so `npm run e2e:gate` / `npm run e2e` never pick
 * it up). Run directly with `node`, once against each of the BEFORE and AFTER
 * trees, against a `ng serve --configuration gate` dev server for that tree.
 *
 * Reuses the SAME mocks the dev wrote in e2e/tests/route-map.spec.ts
 * (setupCommonMocks -> mockPublicPageApis, waitForRouteMapLoaded, and the
 * locateMePayload shape with one far pickup + one pickup exactly on the
 * stubbed geolocation fix) rather than inventing new fixtures.
 *
 * Usage:
 *   node e2e/support/obrs-1214-capture.js <before|after> <baseURL> <outDir>
 *
 * Example:
 *   node e2e/support/obrs-1214-capture.js after http://localhost:4230 C:/path/to/jira-attachments/OBRS-1214
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const [, , mode, baseURL, outDir] = process.argv;
if (!mode || !baseURL || !outDir) {
  console.error('Usage: node obrs-1214-capture.js <before|after> <baseURL> <outDir>');
  process.exit(1);
}
if (mode !== 'before' && mode !== 'after') {
  console.error(`mode must be "before" or "after", got: ${mode}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

// Same payload shape as route-map.spec.ts's locateMePayload: two pickups, one
// far, one exactly on the stubbed geolocation fix, so "nearest" is a real
// distinction.
const STUB_PHOTO =
  'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22640%22%20height=%22360%22/%3E';
const locateMePayload = {
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
        slug: 'pickup-far',
        name: 'Pickup Far',
        address: 'Far Road',
        approxTime: '05:00',
        latitude: 20.0,
        longitude: 100.0,
        primaryPhotoUrl: STUB_PHOTO,
        googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=20.0,100.0',
      },
      {
        order: 2,
        slug: 'pickup-near',
        name: 'Pickup Near',
        address: 'Near Road',
        approxTime: '05:30',
        latitude: 13.1,
        longitude: 100.1,
        primaryPhotoUrl: STUB_PHOTO,
        googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=13.1,100.1',
      },
    ],
    dropoff: [
      {
        order: 3,
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

/** Same set of stubs as e2e/fixtures/public-page-mocks.ts's mockPublicPageApis(). */
async function setupCommonMocks(page) {
  const stationsFixture = require('../fixtures/stations.json');
  const schedulesFixture = require('../fixtures/schedules.json');
  const routesFixture = require('../fixtures/routes.json');
  const provincesWithStopsFixture = require('../fixtures/provinces-with-stops.json');

  // mockPublicPageApis() forces 'en'; override to 'th' afterward (registration
  // order = execution order, so this one wins) per the card's locale ask.
  await page.addInitScript(() => localStorage.setItem('app_language', 'en'));
  await page.addInitScript(() => localStorage.setItem('app_language', 'th'));

  // Same seed as e2e/support/analytics-consent.ts's seedAnalyticsConsent(page, 'denied')
  // (OBRS-882). Without it <app-analytics-consent-banner> renders `position: fixed;
  // bottom: 0` and, on a full-page screenshot, visually overlaps whatever content sits
  // in that same screen-height band -- found while capturing this card's own BEFORE
  // shot, where it sat directly on top of the MAP_UNAVAILABLE placeholder text.
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: 'obrs_analytics_consent_v1', value: 'denied' }
  );

  await page.route('**/api/stops', (route) => route.fulfill({ json: stationsFixture }));
  await page.route('**/api/schedules/search', (route) => route.fulfill({ json: schedulesFixture }));
  await page.route('**/api/routes', (route) => route.fulfill({ json: routesFixture }));
  await page.route('**/api/provinces/stops', (route) =>
    route.fulfill({ json: provincesWithStopsFixture })
  );
  await page.route('**/api/booking-policy', (route) =>
    route.fulfill({ json: { code: 200, message: 'OK', data: { maxAdvanceDays: 30, cutoffMinutes: 240 } } })
  );
  await page.route('**/api/routes/*/pickup-dropoff', (route) => route.fulfill({ json: locateMePayload }));
}

/** Same wait strategy as route-map.spec.ts's waitForRouteMapLoaded(). */
async function waitForRouteMapLoaded(page) {
  await page.waitForTimeout(300);
  await Promise.race([
    page.locator('.stop-row').first().waitFor({ state: 'visible', timeout: 15000 }),
    page.locator('.route-map-section .alert-danger').waitFor({ state: 'visible', timeout: 15000 }),
    page.locator('.route-map-section .text-center.py-5').waitFor({ state: 'visible', timeout: 15000 }),
  ]);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  await setupCommonMocks(context);
  const page = await context.newPage();

  if (mode === 'before') {
    // Shot 1: pickup tab (default tab), no locate-me button anywhere.
    await page.goto('/');
    await waitForRouteMapLoaded(page);
    const btnCountBefore = await page.locator('.locate-me-inline-btn').count();
    console.log(`[before] .locate-me-inline-btn count on pickup tab: ${btnCountBefore} (expect 0)`);
    await page.screenshot({
      path: path.join(outDir, 'OBRS-1214-BEFORE-pickup-tab-no-locate-button.png'),
      fullPage: true,
    });

    // Shot 2: tap the map tab (index 1 in the 3-tab mobile strip).
    //
    // CORRECTION (found while writing this script, not assumed from the card):
    // route-map-home.component.ts's onTabsValueChange() sets mapRevealed=true
    // the instant this tab is tapped on mobile -- there is no second "view
    // map" button press in the common path (that placeholder/button only
    // exists for a desktop->mobile resize edge case). What actually gates the
    // old `.locate-me-btn` here is a DIFFERENT, still-real wall: it sits
    // inside route-map-panel.component.html's `@if (showMap)` block, and
    // showMap is false whenever mapsApiKey is blank (true on this gate lane
    // per environment.base.ts) -- so <app-route-map-panel> mounts but falls
    // to its own `@else` "MAP_UNAVAILABLE" placeholder, and the old button
    // inside `showMap` never renders regardless of tab state.
    const mapTab = page.locator('.p-tablist-tab-list .p-tab').nth(1);
    await mapTab.click();
    const unavailablePlaceholder = page.locator('.route-map-placeholder');
    await unavailablePlaceholder.waitFor({ state: 'visible', timeout: 10000 });
    const oldLocateBtnCount = await page.locator('.locate-me-btn').count();
    console.log(
      `[before] .route-map-placeholder (MAP_UNAVAILABLE) visible after tapping map tab: true; old .locate-me-btn count: ${oldLocateBtnCount} (expect 0)`
    );
    await page.screenshot({
      path: path.join(outDir, 'OBRS-1214-BEFORE-map-tab-gated.png'),
      fullPage: true,
    });
  } else {
    // Shot 3: pickup tab, before pressing locate-me.
    await page.goto('/');
    await waitForRouteMapLoaded(page);
    const pickupTab = page.locator('.p-tablist-tab-list .p-tab').filter({ hasText: /จุดรับ|Pickup/ }).first();
    const pickupTabActive = await pickupTab.evaluate((el) => el.className.includes('p-tab-active'));
    const locateBtn = page.locator('.locate-me-inline-btn');
    await locateBtn.waitFor({ state: 'visible', timeout: 10000 });
    console.log(`[after] pickup tab active before click: ${pickupTabActive}; locate-me button visible: true`);
    await page.screenshot({
      path: path.join(outDir, 'OBRS-1214-AFTER-pickup-tab-locate-button.png'),
      fullPage: true,
    });

    // Shot 4: grant geolocation, click locate-me, nearest pickup selected +
    // distance badge shown, pickup tab still active (map never opened).
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 13.1, longitude: 100.1 });
    await locateBtn.click();

    const nearRow = page.locator('.stop-row', { hasText: 'Pickup Near' });
    await nearRow.locator('.stop-distance').waitFor({ state: 'visible', timeout: 10000 });
    const nearSelected = await nearRow.evaluate((el) => el.className.includes('stop-row--selected'));
    const mapPanelCount = await page.locator('app-route-map-panel').count();
    const pickupTabStillActive = await pickupTab.evaluate((el) => el.className.includes('p-tab-active'));
    console.log(
      `[after] nearest pickup selected: ${nearSelected}; app-route-map-panel mounted: ${mapPanelCount} (expect 0); pickup tab still active: ${pickupTabStillActive}`
    );
    await page.screenshot({
      path: path.join(outDir, 'OBRS-1214-AFTER-nearest-selected-with-distance.png'),
      fullPage: true,
    });
  }

  await browser.close();
  console.log(`[${mode}] done. Screenshots written to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
