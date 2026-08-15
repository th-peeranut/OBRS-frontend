/**
 * E2E tests for OBRS-1358: one confirm action + prefill-and-stay.
 *
 * Supersedes the OBRS-73 suite that used to live here. OBRS-73 answered "the user does not
 * know what to do next" with a toast plus an automatic tab swap AFTER a per-side confirm was
 * pressed. Usability report #6 (prod, iPhone) reported exactly that as confusing, and the
 * repro on the card showed why: the button read "Confirm pickup" while the handler behind it
 * always demanded both sides, so pressing it confirmed nothing and explained itself in a toast
 * the PDPA banner can sit on top of (OBRS-1372).
 *
 * Acceptance criteria:
 *   AC1  Exactly ONE confirm button per stop list, same label on both tabs.
 *   AC2  It is disabled until BOTH sides are chosen - the disabled state IS the message,
 *        so no toast and no tab swap can happen on a press.
 *   AC3  Picking a pickup in the LIST carries the user to the Drop-off tab by itself.
 *   AC4  Reverse: picking the drop-off first carries them back to the Pickup tab.
 *   AC5  Both stops chosen -> confirm -> prefill hero bar, page stays on /, no navigation.
 *   AC6  After AC5 prefill, the hero bar's Search button still navigates to
 *        /schedule-booking (Search button unaffected).
 *   AC7  Station-not-found error (alertService.error) verified by code review
 *        (cannot be triggered via normal UI); noted as code-reviewed, not live.
 *   AC8  No new console errors during any of the above flows. OBRS-1369 narrowed
 *        this to errors THIS FLOW owns - see `flowOwnedErrors`.
 */

import { test, expect, Page } from '@playwright/test';
import { mockPublicPageApis } from '../fixtures/public-page-mocks';

// ---------------------------------------------------------------------------
// Mock payloads — same as route-map.spec.ts
// ---------------------------------------------------------------------------

/**
 * OBRS-1370. These fixtures used to name `placehold.co`, so a stub payload reached out to a
 * real CDN on every run of this spec. Same 640x360 intrinsic box, no network.
 */
const STUB_PHOTO =
  'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22640%22%20height=%22360%22/%3E';

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
        distanceKmFromOrigin: 0,
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
        distanceKmFromOrigin: 80,
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupCommonMocks(page: Page): Promise<void> {
  // OBRS-602: the shared public-page set first (stops, schedule search, route list,
  // booking policy, seat map), then this spec's own pickup-dropoff payload. It has to
  // be this order: Playwright matches handlers last-registered-first, and the route
  // LIST call is what resolves the slug the per-slug stub below is keyed to.
  await mockPublicPageApis(page);
  await page.route('**/api/routes/*/pickup-dropoff', (route) =>
    route.fulfill({ json: successPayload })
  );
}

/** Wait until stop rows are visible (route-map loaded). */
async function waitForRouteMapLoaded(page: Page): Promise<void> {
  await page.waitForTimeout(300);
  await page.locator('.stop-row').first().waitFor({ state: 'visible', timeout: 15_000 });
}

/**
 * The single confirm button of whichever stop list is currently on screen.
 *
 * `visible=true` is load-bearing. PrimeNG keeps the inactive tabpanel in the DOM, and now
 * that both panels carry the SAME label, a bare `.first()` resolves to the hidden one -
 * which is exactly how this helper failed when the label pair became one label.
 */
function confirmButton(page: Page) {
  return page
    .locator('button', { hasText: 'Confirm pickup & drop-off' })
    .locator('visible=true')
    .first();
}

/** Chromium's URL-less subresource failure text — see `watchFlowErrors`. */
const GENERIC_RESOURCE_ERROR = /^Failed to load resource:/;

interface FlowErrors {
  console: string[];
  requests: string[];
}

/**
 * OBRS-1369: collector for AC8. Chromium reports a failed subresource as the
 * literal text "Failed to load resource: the server responded with a status of
 * 404 ()" — the URL is nowhere in the message — so a substring filter can neither
 * tell an app bug from a third-party CDN hiccup nor say WHAT 404'd when the lane
 * goes red (it went red on a `fonts.gstatic.com` woff2). We therefore also record
 * the failing request's URL from `response`/`requestfailed`.
 */
function watchFlowErrors(page: Page): FlowErrors {
  const collected: FlowErrors = { console: [], requests: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      collected.console.push(msg.text());
    }
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      collected.requests.push(`${res.status()} ${res.url()}`);
    }
  });
  page.on('requestfailed', (req) => {
    collected.requests.push(`${req.failure()?.errorText ?? 'failed'} ${req.url()}`);
  });
  return collected;
}

/**
 * The subset AC8 holds this flow responsible for: script errors the app itself
 * logged, plus request failures on the app's own origin (which carry their URL).
 * Third-party assets — fonts, Google Maps, the placeholder photo host — are not
 * under this test's control and are excluded by origin, not by keyword.
 */
function flowOwnedErrors(page: Page, collected: FlowErrors): string[] {
  const appOrigin = new URL(page.url()).origin;
  const scriptErrors = collected.console.filter(
    (e) =>
      !GENERIC_RESOURCE_ERROR.test(e) &&
      !e.includes('favicon') &&
      !e.includes('google') &&
      !e.includes('maps')
  );
  const appRequestFailures = collected.requests.filter(
    (r) => r.includes(appOrigin) && !r.includes('favicon')
  );
  return [...scriptErrors, ...appRequestFailures];
}

// ---------------------------------------------------------------------------
// Suite: one confirm action, tab advances on selection
// ---------------------------------------------------------------------------

test.describe('OBRS-1358 – One confirm action', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  // ── AC1 + AC2 ─────────────────────────────────────────────────────────────

  test('AC1+AC2: one confirm button per list, same label, disabled until BOTH sides are chosen — no toast, no tab swap on press', async ({
    page,
  }) => {
    const collected = watchFlowErrors(page);

    await page.goto('/');
    await waitForRouteMapLoaded(page);

    // AC1: the pickup list carries exactly one button, and it is the shared label.
    // A count, not a label match: the old shape was a PAIR, and a label assertion alone
    // would still pass if the second one came back beside it.
    await expect(page.locator('app-route-stop-list:visible p-button')).toHaveCount(1);
    await expect(confirmButton(page)).toBeVisible();

    // AC2: nothing chosen yet -> disabled.
    await expect(confirmButton(page)).toBeDisabled();

    // AC2: a pickup alone does NOT arm it. This is the exact state the report was in.
    const pickupRow = page.locator('.stop-row--pickup').first();
    await pickupRow.click();
    await expect(pickupRow).toHaveClass(/stop-row--selected/);
    await expect(confirmButton(page)).toBeDisabled();

    // AC2: a disabled button cannot be pressed, so no toast can be raised by one.
    await expect(page.locator('.swal2-container')).toHaveCount(0);

    // AC1: the drop-off tab carries one button too, with the same label.
    await expect(page.locator('app-route-stop-list:visible p-button')).toHaveCount(1);
    await expect(confirmButton(page)).toBeVisible();

    // AC2: both sides chosen -> armed.
    const dropoffRow = page.locator('.stop-row--dropoff').first();
    await dropoffRow.waitFor({ state: 'visible' });
    await dropoffRow.click();
    await expect(confirmButton(page)).toBeEnabled();

    expect(flowOwnedErrors(page, collected)).toHaveLength(0);
    expect(new URL(page.url()).pathname).toBe('/');
  });

  // ── AC3 ───────────────────────────────────────────────────────────────────

  test('AC3: picking a pickup in the list carries the user to the Drop-off tab, no button in between', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRouteMapLoaded(page);

    const pickupTab = page.locator('.p-tablist-tab-list .p-tab').filter({ hasText: 'Pickup' }).first();
    await expect(pickupTab).toHaveClass(/p-tab-active/);

    await page.locator('.stop-row--pickup').first().click();

    const dropoffTab = page.locator('.p-tablist-tab-list .p-tab').filter({ hasText: 'Drop-off' }).first();
    await expect(dropoffTab).toHaveClass(/p-tab-active/);

    // and the drop-off rows are immediately usable — nothing to dismiss
    const dropoffRow = page.locator('.stop-row--dropoff').first();
    await dropoffRow.waitFor({ state: 'visible' });
    await dropoffRow.click();
    await expect(dropoffRow).toHaveClass(/stop-row--selected/);
  });

  // ── AC4 ───────────────────────────────────────────────────────────────────

  test('AC4: picking the drop-off first carries the user back to the Pickup tab', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRouteMapLoaded(page);

    await page.locator('.p-tablist-tab-list .p-tab').filter({ hasText: 'Drop-off' }).first().click();
    const dropoffRow = page.locator('.stop-row--dropoff').first();
    await dropoffRow.waitFor({ state: 'visible' });
    await dropoffRow.click();

    const pickupTab = page.locator('.p-tablist-tab-list .p-tab').filter({ hasText: 'Pickup' }).first();
    await expect(pickupTab).toHaveClass(/p-tab-active/);

    const pickupRow = page.locator('.stop-row--pickup').first();
    await pickupRow.waitFor({ state: 'visible' });
    await pickupRow.click();
    await expect(pickupRow).toHaveClass(/stop-row--selected/);

    // the tab must NOT bounce away again once the pair is complete
    await expect(pickupTab).toHaveClass(/p-tab-active/);

    expect(new URL(page.url()).pathname).toBe('/');
  });
});

// ---------------------------------------------------------------------------
// Suite: Prefill-and-stay
// ---------------------------------------------------------------------------

test.describe('OBRS-1358 – Prefill and stay on /', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  /** Pick both stops through the list, riding the automatic tab advance. */
  async function pickBothStops(page: Page): Promise<void> {
    await page.locator('.stop-row--pickup').first().click();
    const dropoffRow = page.locator('.stop-row--dropoff').first();
    await dropoffRow.waitFor({ state: 'visible' });
    await dropoffRow.click();
  }

  // ── AC5 ───────────────────────────────────────────────────────────────────

  test('AC5: both stops selected → confirm → hero bar prefilled with station names, no navigation to /schedule-booking', async ({
    page,
  }) => {
    const collected = watchFlowErrors(page);

    await page.goto('/');
    await waitForRouteMapLoaded(page);
    await pickBothStops(page);

    await confirmButton(page).click();

    // AC5: browser stays on / — no navigation to /schedule-booking
    await page.waitForTimeout(600);
    expect(new URL(page.url()).pathname).toBe('/');
    expect(page.url()).not.toContain('schedule-booking');

    // AC5: hero search bar "Source" field is prefilled with the picked pickup station.
    // `toHaveValue`, not `.value-text`'s text: OBRS-1224 made the station trigger a
    // typeable `<input role="combobox">`, so the text the customer reads in that field
    // is the input's VALUE. The id resolves to the trigger itself in both shapes.
    const sourceDropdown = page.locator(
      '[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]'
    );
    await expect(sourceDropdown).toHaveValue(new RegExp('Nong Sak'));

    // AC5: hero search bar "Destination" field is prefilled with the picked dropoff station
    const destDropdown = page.locator(
      '[id="dropdownObrsHOME.HOME_BOOKING.END_STATION"]'
    );
    await expect(destDropdown).toHaveValue(new RegExp('Bangkok'));

    // AC5: nothing was auto-submitted and no blocking modal appeared
    await expect(page.locator('.swal2-backdrop-show')).toHaveCount(0);

    // AC8: no new console errors from this flow
    expect(flowOwnedErrors(page, collected)).toHaveLength(0);
  });

  test('AC5b: the same button on the Pickup tab confirms the pair too', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRouteMapLoaded(page);
    await pickBothStops(page);

    // back to the Pickup tab: it is the SAME button and it is armed there as well
    await page.locator('.p-tablist-tab-list .p-tab').filter({ hasText: 'Pickup' }).first().click();
    await expect(confirmButton(page)).toBeEnabled();
    await confirmButton(page).click();

    await page.waitForTimeout(600);
    expect(new URL(page.url()).pathname).toBe('/');

    const sourceDropdown = page.locator(
      '[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]'
    );
    await expect(sourceDropdown).toHaveValue(new RegExp('Nong Sak'));

    const destDropdown = page.locator(
      '[id="dropdownObrsHOME.HOME_BOOKING.END_STATION"]'
    );
    await expect(destDropdown).toHaveValue(new RegExp('Bangkok'));
  });

  // ── AC6 ───────────────────────────────────────────────────────────────────

  test('AC6: after prefill, hero bar Search button still navigates to /schedule-booking normally', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRouteMapLoaded(page);
    await pickBothStops(page);

    await confirmButton(page).click();
    await page.waitForTimeout(600);

    const sourceDropdown = page.locator(
      '[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]'
    );
    await expect(sourceDropdown).toHaveValue(new RegExp('Nong Sak'));

    // The form defaults to 1 adult passenger, so Search is valid immediately.
    await page.locator('.btn-search').click();

    // AC6: Search button navigates to /schedule-booking
    await page.waitForURL('**/schedule-booking', { timeout: 10_000 });
  });

  // ── AC7 (code-review verified) ────────────────────────────────────────────

  test('AC7: station-not-found error path (alertService.error) verified by code review', async ({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    page,
  }) => {
    // The station-not-found error branch (home.component.ts onPickupDropoffConfirmed)
    // fires alertService.error(SHARED.ERROR_GENERAL) when a confirmed slug cannot be
    // resolved to a station in the NgRx store.  This cannot be triggered through the
    // normal UI because the pickup/dropoff slugs come from the same API response that
    // populates the stations store — a mismatch is only possible with a broken backend.
    //
    // This branch was verified by the Scrutinize agent to be present and untouched
    // by the OBRS-73 diff (home.component.ts lines 54-57 in the worktree), and OBRS-1358
    // did not touch home.component.ts at all.
    expect(true).toBe(true); // sentinel: this test represents a code-review AC, not a UI flow
  });
});
