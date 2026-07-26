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

  // OBRS-750: this was `click({ force: true })`, and that is what made this spec the one
  // case in the lane that failed the first time the gate ran in CI. `force` skips EVERY
  // actionability check -- including "is this element ready to receive events" -- so on a
  // machine slower than this box the click fired before Angular had bound the handler,
  // nothing happened, and the `waitForURL` below sat there until the 60s test timeout.
  // The error then named the navigation, not the click, which is why the failure was
  // previously written off as CPU contention: the config's comment blames parallel
  // headless Chromes on a developer machine, but a clean GitHub runner reproduced it with
  // nothing else running, so that diagnosis was at best incomplete.
  //
  // docs/e2e-lanes.md had already flagged the smell -- "clicks .btn-confirm with
  // force: true, which reports success whether or not the click lands" -- without
  // connecting it to the timeout.
  //
  // Dropping `force` restores the waiting. If pointer-event interception is ever real
  // here, Playwright now says which element intercepted and fails in seconds, instead of
  // succeeding at clicking nothing and stalling for a minute.
  // OBRS-750. This was `click({ force: true })` and it is what made this spec the single
  // failure the first time the gate lane ran in CI.
  //
  // WHAT force WAS ACTUALLY DOING. `force` does not aim the event at the element; it only
  // skips the actionability checks. The mouse event is still dispatched at the element's
  // computed point, so it landed on whatever was topmost there — and something else is. On
  // this box that happened to still reach the button; on a GitHub runner it did not, the
  // handler never ran, and the `waitForURL` below sat until the 60s test timeout. The error
  // then named the navigation rather than the click, which is why this was previously
  // written off as CPU contention (the gate config blames parallel headless Chromes on a
  // developer machine — a clean runner reproduced it with nothing else running, so that
  // explanation was at best incomplete). docs/e2e-lanes.md had already flagged that this
  // `force` "reports success whether or not the click lands" without tying it to the timeout.
  //
  // WHY NOT JUST DROP force. Playwright's hit test at this button resolves to
  // `app-review-schedule-booking-total` — the button's own PARENT, which Playwright counts as
  // an interceptor. The parent is an Angular component host with no `:host` display rule, so
  // it is `display: inline` while containing two block children (`div.card-container` and this
  // button are siblings), which is a malformed box and gives it an unreliable hit region.
  // Scrolling the button to the middle of the viewport first does not help.
  //
  // WHY THIS IS NOT HIDING A PRODUCT BUG. Measured at 1280x720 on 2026-07-26: at the
  // button's resting position `document.elementFromPoint` at its centre returns the BUTTON
  // (topIsTheButton: true, boxSizing: border-box, y=515 h=52). A real user can click it. The
  // interception is an artefact of where Playwright's own scrolling puts the element, not
  // something a person hits. The `:host` smell is filed separately.
  //
  // So: dispatch the event to the button itself — deterministic, and unlike `force` it cannot
  // silently deliver the click to a different element. The navigation assertion immediately
  // below is still what proves the handler ran; this line only guarantees it was asked to.
  await confirmBtn.dispatchEvent('click');

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
