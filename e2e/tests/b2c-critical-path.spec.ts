import { test, expect } from '@playwright/test';
import stationsFixture from '../fixtures/stations.json';
import schedulesFixture from '../fixtures/schedules.json';

test.beforeEach(async ({ page }) => {
  // Force English locale before Angular boots
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
  });

  // Mock station list
  await page.route('**/api/stops', (route) =>
    route.fulfill({ json: stationsFixture })
  );

  // Mock schedule search
  await page.route('**/api/schedules/search', (route) =>
    route.fulfill({ json: schedulesFixture })
  );
});

test('B2C happy path: search → schedule → review → passenger info ready to pay', async ({
  page,
}) => {
  // ── Step 1: Home page ────────────────────────────────────────────────────

  await page.goto('/home');

  // Wait for station dropdowns to render (stations loaded from mocked API)
  await page
    .locator('[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]')
    .waitFor();

  // Open passenger dropdown and add 1 adult
  await page.locator('#dropdownObrsPassenger').click();
  await page.getByAltText('Passenger Add Icon').first().click();
  // Click outside to close the passenger dropdown
  await page.locator('body').click({ position: { x: 10, y: 10 } });

  // Select source station (Nong Sak)
  await page
    .locator('[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]')
    .click();
  await page
    .locator('.dropdown-menu.show .dropdown-option', { hasText: 'Nong Sak' })
    .click();

  // Select destination station (Bangkok)
  await page
    .locator('[id="dropdownObrsHOME.HOME_BOOKING.END_STATION"]')
    .click();
  await page
    .locator('.dropdown-menu.show .dropdown-option', { hasText: 'Bangkok' })
    .click();

  // Click Search
  await page.locator('.btn-search').click();

  // ── Step 2: Schedule booking ─────────────────────────────────────────────

  await page.waitForURL('**/schedule-booking');

  // Wait for the mocked schedule to render
  const selectBtn = page.locator('.select-btn').first();
  await selectBtn.waitFor();

  // Select the first available schedule
  await selectBtn.click();

  // ── Step 3: Review page ──────────────────────────────────────────────────

  await page.waitForURL('**/review-schedule-booking');

  // The review page uses .btn-confirm ("Confirm information"), not .btn-next
  const confirmBtn = page.locator('.btn-confirm');
  await confirmBtn.waitFor();
  // force: true bypasses pointer-event interception from the host element's CSS layout
  await confirmBtn.click({ force: true });

  // ── Step 4: Passenger info ───────────────────────────────────────────────

  await page.waitForURL('**/passenger-info');

  // Fill booker form
  await page.locator('#booker-title .dropdown-btn').click();
  await page.locator('#booker-title .dropdown-option').first().click();
  await page.fill('#booker-firstName', 'John');
  await page.fill('#booker-lastName', 'Doe');
  await page.fill('#booker-phoneNumber', '0812345678');
  await page.locator('#booker-gender_male').click();

  // Fill passenger 0 form
  await page.locator('#title-0 .dropdown-btn').click();
  await page.locator('#title-0 .dropdown-option').first().click();
  await page.fill('#firstName-0', 'John');
  await page.fill('#lastName-0', 'Doe');
  await page.locator('#gender_male-0').click();

  // ── Assertion: Next (proceed to payment) button is enabled ───────────────

  await expect(page.locator('.btn-next')).not.toBeDisabled();
});
