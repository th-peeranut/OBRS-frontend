/**
 * Criterion 5 (route-pair regression) — targeted spec.
 * With a drop-off filter active, changing the pickup selection must:
 *  - Re-compute dropoffOptions based on the new pickup (via valid route pairs)
 *  - Re-apply the text filter on top of the new options
 *  - Produce no stale list or error
 */

import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.resolve(__dirname, '../fixtures/admin-auth.json');

const SEGMENTS_RESP = {
  code: 200, message: 'OK',
  data: { route: { slug: 'route', name: 'Route' }, stopPairs: [
    // Linear A→B→C→D with every downstream pair
    { segmentId: 1, fromStop: { slug: 'a', name: 'Alpha' }, toStop: { slug: 'b', name: 'Beta' }, vehicleType: { slug: 'bus', name: 'Bus' }, fare: '50.00', estimatedDurationMinutes: 15 },
    { segmentId: 2, fromStop: { slug: 'b', name: 'Beta' }, toStop: { slug: 'c', name: 'Gamma' }, vehicleType: { slug: 'bus', name: 'Bus' }, fare: '200.00', estimatedDurationMinutes: 90 },
    { segmentId: 3, fromStop: { slug: 'c', name: 'Gamma' }, toStop: { slug: 'd', name: 'Delta' }, vehicleType: { slug: 'bus', name: 'Bus' }, fare: '30.00', estimatedDurationMinutes: 14 },
    { segmentId: 4, fromStop: { slug: 'a', name: 'Alpha' }, toStop: { slug: 'c', name: 'Gamma' }, vehicleType: { slug: 'bus', name: 'Bus' }, fare: '250.00', estimatedDurationMinutes: 105 },
    { segmentId: 5, fromStop: { slug: 'a', name: 'Alpha' }, toStop: { slug: 'd', name: 'Delta' }, vehicleType: { slug: 'bus', name: 'Bus' }, fare: '280.00', estimatedDurationMinutes: 120 },
    { segmentId: 6, fromStop: { slug: 'b', name: 'Beta' }, toStop: { slug: 'd', name: 'Delta' }, vehicleType: { slug: 'bus', name: 'Bus' }, fare: '230.00', estimatedDurationMinutes: 104 },
  ]}
};

const WALK_IN_SCHEDULES_RESP = {
  code: 200, message: 'OK',
  data: [{ routeSlug: 'test', routeLabel: 'Test Route', trips: [{
    scheduleId: 201, vehicleType: 'bus', licensePlate: 'TH-0001', driverName: 'Driver A',
    departureDateTime: '2026-09-01T08:00:00Z', arrivalDateTime: '2026-09-01T12:00:00Z',
    pricePerSeat: '280.00', capacity: 21, availableCount: 18, reservedUnpaidCount: 1, soldPaidCount: 2,
    availableSeatNumbers: ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18']
  }]}]
};

test.describe('Criterion 5: route-pair regression with active dropoff filter', () => {
  test.use({ storageState: ADMIN_AUTH });

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/private/schedules/walk-in**', route => route.fulfill({ json: WALK_IN_SCHEDULES_RESP }));
    await page.route('**/api/private/segments/**', route => route.fulfill({ json: SEGMENTS_RESP }));
  });

  test('changing pickup with dropoff filter active: list re-filters by route-pair AND text filter', async ({ page }) => {
    await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
    await page.locator('app-walk-in-trip-browser').waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('.trip-row').first().waitFor({ timeout: 10_000 });
    await page.locator('.trip-row').first().click();

    const fromList  = page.locator('app-walk-in-center-panel .stop-list').nth(0);
    const toList    = page.locator('app-walk-in-center-panel .stop-list').nth(1);
    const toFilter  = page.locator('app-walk-in-center-panel .input-group').nth(1).locator('input');

    // Wait for stop lists to render
    await fromList.locator('button').first().waitFor({ timeout: 15_000 });

    // Step 1: Default pickup is Alpha (first stop).
    // Dropoff options from Alpha: Beta, Gamma, Delta (all have fares from Alpha)
    const toCountFromAlpha = await toList.locator('button').count();
    expect(toCountFromAlpha, 'from Alpha, dropoff list should have 3 options').toBe(3);

    // Step 2: Set a text filter on the dropoff that matches only "Delta"
    await toFilter.fill('Delta');
    await expect(toList.locator('button')).toHaveCount(1, { timeout: 3_000 });
    await expect(toList.locator('button').first()).toContainText('Delta');

    // Step 3: Change pickup to "Beta" — click Beta in the From list
    const betaBtn = fromList.locator('button', { hasText: 'Beta' });
    await betaBtn.click();

    // Dropoff re-filters: valid from Beta = Gamma, Delta (not Beta itself, not Alpha)
    // Text filter "Delta" should still be active → only Delta should show
    // Allow a moment for Angular to re-evaluate
    await page.waitForTimeout(200);
    const toCountAfterChange = await toList.locator('button').count();

    // "Delta" is valid from Beta (there's a Beta→Delta pair) AND matches the filter
    expect(toCountAfterChange, 'after changing pickup to Beta, dropoff filter "Delta" should show Delta').toBe(1);
    await expect(toList.locator('button').first()).toContainText('Delta');

    // Step 4: Clear the filter — dropoff list should show only options valid from Beta
    const toFilterClearBtn = page.locator('app-walk-in-center-panel .input-group').nth(1).locator('button');
    await toFilterClearBtn.click();

    // From Beta: Gamma and Delta are valid. Alpha and Beta are not (no Beta→Alpha, no Beta→Beta).
    // The component's dropoffOptions getter: orderedStops after Beta = [Gamma, Delta] with fares
    await expect(toList.locator('button')).toHaveCount(2, { timeout: 3_000 });
  });
});
