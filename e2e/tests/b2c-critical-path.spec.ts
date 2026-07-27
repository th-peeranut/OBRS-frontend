import { test, expect } from '@playwright/test';
import { mockPublicPageApis } from '../fixtures/public-page-mocks';

test.beforeEach(async ({ page }) => {
  // OBRS-602: this spec used to stub only stops + schedule search. The three calls the
  // shared set adds — route list, booking policy, seat map — were all being answered by
  // SIT without anyone noticing, which is what "fully mocked" turned out to mean here.
  await mockPublicPageApis(page);
});

test('B2C happy path: search → schedule → review → passenger info ready to pay', async ({
  page,
}) => {
  // ── Step 1: Home page ────────────────────────────────────────────────────

  await page.goto('/');

  // Wait for station dropdowns to render (stations loaded from mocked API)
  await page
    .locator('[id="dropdownObrsHOME.HOME_BOOKING.START_STATION"]')
    .waitFor();

  // The home-booking form now defaults passengerInfo to 1 adult already
  // (commit 33ee1b0, already on origin/dev, unrelated to the reschedule
  // branch under QA — "so a fresh search is immediately valid"). Clicking
  // Add here on top of that default silently produced a 2nd, unfilled
  // passenger form later on /passenger-info, which is what was tripping
  // .btn-next (disabled because passenger index 1's required fields were
  // never filled) — a pre-existing test/product drift, not a regression.
  // Just open+close the dropdown to keep the UI-interaction coverage without
  // double-counting.
  await page.locator('#dropdownObrsPassenger').click();
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

  // A PLAIN CLICK, and it took two cards to get back to one.
  //
  // OBRS-750: this line was `click({ force: true })`, and it is what made this spec the
  // single failure the first time the gate lane ran in CI. `force` does not aim the event
  // at the element -- it only skips the actionability checks -- so the mouse event still
  // went to whatever was topmost at that point, and something else was. On this box it
  // still happened to reach the button; on a clean GitHub runner it did not, the handler
  // never ran, and the `waitForURL` below burned the full 60s timeout. The error named the
  // navigation rather than the click, which is why this was written off as CPU contention
  // for months. docs/e2e-lanes.md had already flagged that the `force` "reports success
  // whether or not the click lands" without ever tying it to the timeout.
  //
  // Dropping `force` then exposed the real obstruction: Playwright's hit test resolved to
  // `app-review-schedule-booking-total`, the button's own PARENT, because that component
  // set no `:host` display and was therefore `display: inline` around two block-level
  // children -- a malformed box with an unreliable hit region. OBRS-750 could not fix that
  // from a spec file, so it used `dispatchEvent('click')`: deterministic, and unlike
  // `force` it cannot deliver the event elsewhere, but it also asserts nothing about
  // whether a user could reach the button.
  //
  // OBRS-753 added `:host { display: block }` and the interception is gone -- measured,
  // not assumed: `review-total-host-box.spec.ts` runs `click({ trial: true })` on this
  // same button in this same lane, and it failed with "intercepts pointer events" before
  // that change and passes after. So the click comes back, and with it the coverage
  // `dispatchEvent` never had: this line now also asserts the button is visible, stable,
  // enabled and actually hittable.
  //
  // Do not reintroduce `force` here. It would make this line pass whether or not any of
  // that is true, which is the whole of OBRS-750.
  await confirmBtn.click();

  // ── Step 4: Passenger info ───────────────────────────────────────────────

  await page.waitForURL('**/passenger-info');

  // Fill booker form
  await page.locator('#booker-title .dropdown-btn').click();
  await page.locator('#booker-title .dropdown-option').first().click();
  await page.fill('#booker-firstName', 'John');
  await page.fill('#booker-lastName', 'Doe');
  await page.fill('#booker-phoneNumber', '0812345678');
  // OBRS-602: OBRS-238 made the booker email required + format-checked for ONLINE
  // bookings (e-ticket delivery; BookingReqDtoValidator 400s without one). This spec
  // was never updated, so `.btn-next` had been correctly disabled — and this test
  // correctly failing — ever since, on SIT as much as anywhere. Nobody read it as a
  // real failure because the suite it lived in was red as a matter of routine.
  await page.fill('#booker-email', 'john.doe@example.com');
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
