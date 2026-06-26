/**
 * Focus-retention test — QA scrutinize check
 * Confirms the filter input does NOT lose focus while typing character by character.
 * Angular's change detection may re-render the *ngFor list on each keystroke,
 * but the input itself is outside the loop and must remain focused.
 */

import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.resolve(__dirname, '../fixtures/admin-auth.json');
const WALK_IN_SCHEDULES_ENDPOINT = '**/api/private/schedules/walk-in**';
const SEGMENTS_ENDPOINT = '**/api/private/segments/**';

const WALK_IN_SCHEDULES_RESP = {
  code: 200, message: 'OK',
  data: [{ routeSlug: 'bkk-cnx', routeLabel: 'Bangkok - Chiang Mai', trips: [{
    scheduleId: 201, vehicleType: 'bus', licensePlate: 'TH-8888', driverName: 'Somchai Driver',
    departureDateTime: '2026-09-01T08:00:00Z', arrivalDateTime: '2026-09-01T13:00:00Z',
    pricePerSeat: '350.00', capacity: 21, availableCount: 18, reservedUnpaidCount: 1, soldPaidCount: 2,
    availableSeatNumbers: ['1','2','4','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21']
  }]}]
};

const MULTI_STOP_SEGMENTS_RESP = {
  code: 200, message: 'OK',
  data: { route: { slug: 'route', name: 'Route' }, stopPairs: [
    { segmentId: 1, fromStop: { slug: 'a', name: 'Stop A' }, toStop: { slug: 'b', name: 'Stop B' }, vehicleType: { slug: 'bus', name: 'Bus' }, fare: '50.00', estimatedDurationMinutes: 15 },
    { segmentId: 2, fromStop: { slug: 'b', name: 'Stop B' }, toStop: { slug: 'c', name: 'Stop C' }, vehicleType: { slug: 'bus', name: 'Bus' }, fare: '200.00', estimatedDurationMinutes: 90 },
    { segmentId: 3, fromStop: { slug: 'c', name: 'Stop C' }, toStop: { slug: 'd', name: 'Stop D' }, vehicleType: { slug: 'bus', name: 'Bus' }, fare: '30.00', estimatedDurationMinutes: 14 },
    { segmentId: 4, fromStop: { slug: 'a', name: 'Stop A' }, toStop: { slug: 'c', name: 'Stop C' }, vehicleType: { slug: 'bus', name: 'Bus' }, fare: '250.00', estimatedDurationMinutes: 105 },
    { segmentId: 5, fromStop: { slug: 'a', name: 'Stop A' }, toStop: { slug: 'd', name: 'Stop D' }, vehicleType: { slug: 'bus', name: 'Bus' }, fare: '280.00', estimatedDurationMinutes: 120 },
    { segmentId: 6, fromStop: { slug: 'b', name: 'Stop B' }, toStop: { slug: 'd', name: 'Stop D' }, vehicleType: { slug: 'bus', name: 'Bus' }, fare: '230.00', estimatedDurationMinutes: 104 }
  ]}
};

test.describe('Scrutinize: filter input focus retention during typing', () => {
  test.use({ storageState: ADMIN_AUTH });

  test.beforeEach(async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, route => route.fulfill({ json: WALK_IN_SCHEDULES_RESP }));
    await page.route(SEGMENTS_ENDPOINT, route => route.fulfill({ json: MULTI_STOP_SEGMENTS_RESP }));
  });

  test('filter input keeps focus when typing character by character (no *ngFor re-render focus loss)', async ({ page }) => {
    await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
    await page.locator('app-walk-in-trip-browser').waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('.trip-row').first().waitFor({ timeout: 10_000 });
    await page.locator('.trip-row').first().click();

    const fromList = page.locator('app-walk-in-center-panel .stop-list').nth(0);
    await fromList.locator('button').first().waitFor({ timeout: 15_000 });

    const fromFilter = page.locator('app-walk-in-center-panel .input-group').nth(0).locator('input');

    // Click to focus
    await fromFilter.click();
    const focusedBefore = await fromFilter.evaluate(el => el === document.activeElement);
    expect(focusedBefore, 'input should be focused after click').toBe(true);

    // Type character by character with a delay to let change detection fire
    await fromFilter.pressSequentially('Stop', { delay: 80 });

    // Focus must be retained after 4 keystrokes
    const focusedAfter = await fromFilter.evaluate(el => el === document.activeElement);
    expect(focusedAfter, 'input must keep focus after each keystroke — no *ngFor re-render focus loss').toBe(true);

    // List should be filtered
    const countAfterTyping = await fromList.locator('button').count();
    expect(countAfterTyping, 'some stops should match "Stop"').toBeGreaterThan(0);
  });
});
