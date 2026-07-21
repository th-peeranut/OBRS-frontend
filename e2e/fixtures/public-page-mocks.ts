import type { Page } from '@playwright/test';
import stationsFixture from './stations.json';
import schedulesFixture from './schedules.json';
import routesFixture from './routes.json';

/**
 * OBRS-602 — every call the anonymous public pages issue, in one place.
 *
 * Three specs (b2c-critical-path, confirm-guidance-flow, route-map) each built their
 * own list of `page.route` stubs for `/`, and each list was missing something different.
 * That was invisible for as long as the suite ran against SIT, which answered whatever
 * they forgot; it surfaced the moment the deterministic lane served the app with no
 * backend behind it (see playwright.gate.config.ts). The escapes were not subtle in
 * hindsight and were extremely unsubtle to debug:
 *
 *   GET /api/routes                  — resolves the slug that the per-slug
 *                                      pickup-dropoff stub is keyed to, so forgetting
 *                                      it made the STOP LIST look broken.
 *   GET /api/schedules/{id}/seats    — the passenger-info seat badges (OBRS-362). Its
 *                                      failure raised a global SweetAlert whose
 *                                      backdrop then ate every click for a full minute,
 *                                      reported as "cannot click the title dropdown".
 *   GET /api/booking-policy          — the advance-booking cap (OBRS-564). Silent
 *                                      except to confirm-guidance-flow's AC8, which
 *                                      asserts zero console errors and duly failed on
 *                                      ERR_CONNECTION_REFUSED.
 *
 * Keeping the list here rather than in each spec is the point: a fourth spec that
 * renders `/` inherits the complete set instead of rediscovering it one timeout at a
 * time, and a new public call added to the home page is fixed once.
 *
 * Call this FIRST in a beforeEach, then add spec-specific stubs after it — Playwright
 * matches handlers in reverse registration order, so anything registered later wins.
 */
export async function mockPublicPageApis(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
  });

  await page.route('**/api/stops', (route) => route.fulfill({ json: stationsFixture }));

  await page.route('**/api/schedules/search', (route) =>
    route.fulfill({ json: schedulesFixture })
  );

  await page.route('**/api/routes', (route) => route.fulfill({ json: routesFixture }));

  await page.route('**/api/booking-policy', (route) =>
    route.fulfill({
      json: {
        code: 200,
        message: 'OK',
        // 30 days is the seeded default; obrs-564-booking-policy.spec.ts is the spec
        // that exercises changing it, and it deliberately owns its own database.
        data: { maxAdvanceDays: 30, cutoffMinutes: 240 },
      },
    })
  );

  await page.route('**/api/schedules/*/seats', (route) =>
    route.fulfill({
      json: {
        code: 200,
        message: 'OK',
        // Mirrors availableSeatNumbers in schedules.json.
        data: ['1', '2', '3', '4', '5'].map((seatNumber, i) => ({
          seatNumber,
          rowIndex: Math.floor(i / 2),
          columnIndex: i % 2,
          isWheelchairAccessible: false,
          isExtraLegroom: false,
        })),
      },
    })
  );
}
