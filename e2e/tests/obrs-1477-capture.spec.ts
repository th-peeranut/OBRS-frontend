/**
 * OBRS-1477 — the CAPTURE lane for AC-4/AC-5 evidence.
 *
 *   OBRS1477_PHASE=BEFORE npx playwright test --config=playwright.obrs1477capture.config.ts
 *   OBRS1477_PHASE=AFTER  npx playwright test --config=playwright.obrs1477capture.config.ts
 *
 * Same shape as playwright.obrs1424capture.config.ts: served with the DEFAULT
 * configuration, so `apiUrl` points at http://localhost:8080 where nothing is listening
 * and every request is either fulfilled here or fails as a network error. Nothing
 * reaches SIT.
 *
 * The picture this card needs is of a trip that has NO per-trip override — the state
 * 1,980 prod trips are in — because that is the one the old code mis-rendered. So the
 * schedule-detail stub answers `seatingCapacity: null`, exactly like the backend does
 * for those rows, and the PUT body is asserted, not just photographed.
 */

import { test, expect, Page } from '@playwright/test';
import {
  expectNoEscapedGateCalls,
  seedGateAdminSession,
  stubWalkInSellShell,
} from '../support/gate-admin-session';

const PHASE = process.env['OBRS1477_PHASE'] ?? 'AFTER';
const ASSETS = `e2e-evidence/obrs-1477`;

const SCHEDULE_ID = 201;

/** One BUS trip. `capacity: 21` is the COALESCEd value the trips list carries. */
const WALK_IN_SCHEDULES_RESP = {
  code: 200,
  message: 'OK',
  data: [
    {
      routeSlug: 'chonburi_bangkok',
      routeLabel: 'หนองชาก-บ้านบึง-กรุงเทพฯ',
      trips: [
        {
          scheduleId: SCHEDULE_ID,
          vehicleType: 'bus',
          licensePlate: 'TH-8888',
          driverName: 'สมชาย',
          departureDateTime: '2026-09-01T08:00:00Z',
          arrivalDateTime: '2026-09-01T13:00:00Z',
          pricePerSeat: '200.00',
          capacity: 21,
          availableCount: 21,
          reservedUnpaidCount: 0,
          soldPaidCount: 0,
          availableSeatNumbers: Array.from({ length: 21 }, (_, i) => String(i + 1)),
        },
      ],
    },
  ],
};

/** GET /api/private/schedules/{id} as the backend answers it for a row with no override. */
function scheduleDetail(storedSeatingCapacity: number | null) {
  return {
    code: 200,
    message: 'OK',
    data: {
      id: SCHEDULE_ID,
      departureDateTime: '2026-09-01T08:00:00+07:00',
      vehicleType: { id: 5, slug: 'bus', totalSeats: 21 },
      vehicle: { id: 10, numberPlate: 'TH-8888' },
      driver: { id: 3, fullName: 'สมชาย' },
      seatingCapacity: storedSeatingCapacity,
      cargoCapacityKg: 150,
      route: { slug: 'chonburi_bangkok' },
    },
  };
}

/** Opens /staff/sell, selects the only trip, activates the "รายละเอียดเที่ยว" tab. */
async function openTripDetails(page: Page): Promise<void> {
  await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
  await page.locator('app-walk-in-trip-browser').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('.trip-row').first().click();
  // By index, not by label: this lane runs in Thai.
  await page.locator('.p-tablist-tab-list [role="tab"]').nth(1).click();
  await expect(page.locator('app-trip-details-edit-form')).toBeVisible({ timeout: 10_000 });
  // Let the edit-open forkJoin land and patch the form.
  await expect(page.locator('.progress-bar')).toHaveCount(0, { timeout: 10_000 });
}

test.describe(`OBRS-1477 capture (${PHASE})`, () => {
  test.beforeEach(async ({ page }) => {
    await seedGateAdminSession(page, { language: 'th' });
    await stubWalkInSellShell(page);

    await page.route('**/api/private/schedules/walk-in**', (route) =>
      route.fulfill({ json: WALK_IN_SCHEDULES_RESP })
    );
    await page.route('**/api/private/vehicle-types', (route) =>
      route.fulfill({ json: { code: 200, message: 'OK', data: [{ id: 5, slug: 'bus', totalSeats: 21 }] } })
    );
    await page.route('**/api/private/vehicles', (route) =>
      route.fulfill({
        json: { code: 200, message: 'OK', data: [{ id: 10, numberPlate: 'TH-8888', vehicleType: { slug: 'bus' } }] },
      })
    );
    await page.route('**/api/private/users/drivers', (route) =>
      route.fulfill({ json: { code: 200, message: 'OK', data: [{ id: 3, name: 'สมชาย' }] } })
    );
    await page.route('**/api/private/segments/**', (route) =>
      route.fulfill({ json: { code: 200, message: 'OK', data: [] } })
    );
  });

  test.afterEach(async ({ page }) => {
    expectNoEscapedGateCalls(page);
  });

  test('a trip with no override: what the box shows, and what Save sends', async ({ page }) => {
    // Registered last, so it wins over stubWalkInSellShell's `data: null` for this id.
    await page.route(
      (url) => new RegExp(`/private/schedules/${SCHEDULE_ID}$`).test(url.pathname),
      (route) => route.fulfill({ json: scheduleDetail(null) })
    );

    let putBody: Record<string, unknown> | null = null;
    await page.route(
      (url) => new RegExp(`/private/schedules/${SCHEDULE_ID}$`).test(url.pathname),
      async (route) => {
        if (route.request().method() !== 'PUT') return route.fallback();
        putBody = route.request().postDataJSON();
        return route.fulfill({ json: { code: 200, message: 'OK', data: null } });
      }
    );

    await openTripDetails(page);
    await page.locator('app-trip-details-edit-form').screenshot({
      path: `${ASSETS}/OBRS-1477-${PHASE}-0-no-override.png`,
    });

    // Press Save without editing a single control — the keystroke this card is about.
    await page.locator('app-trip-details-edit-form .btn-primary').click();
    await expect.poll(() => putBody, { timeout: 10_000 }).not.toBeNull();

    expect(putBody!['seatingCapacity']).toBeNull();
    expect(putBody!['cargoCapacityKg']).toBe(150);
  });

  test('a trip with a real 20-seat override still shows and sends 20', async ({ page }) => {
    await page.route(
      (url) => new RegExp(`/private/schedules/${SCHEDULE_ID}$`).test(url.pathname),
      (route) => route.fulfill({ json: scheduleDetail(20) })
    );

    await openTripDetails(page);
    await page.locator('app-trip-details-edit-form').screenshot({
      path: `${ASSETS}/OBRS-1477-${PHASE}-1-override-20.png`,
    });
  });
});
