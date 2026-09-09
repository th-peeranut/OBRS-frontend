import { Page } from '@playwright/test';

/**
 * The customer booking walk that more than one spec needs to make, in one place.
 *
 * OBRS-36 moved `seedSignedInCustomer` and `searchAndConfirmASchedule` here out of
 * b2c-critical-path.spec.ts, unchanged, because that card's spec resumes the SAME walk
 * one screen further on (/payment -> /payment/result -> /e-ticket) and a second copy of
 * a 90-line walk is a copy that drifts. b2c-critical-path.spec.ts still calls both, so
 * whatever it proved before this move it proves after it -- the move is provable by the
 * gate lane going green, which is the only reason it was safe to make.
 *
 * NOT moved: the passenger/booker form fill. It exists three times in
 * b2c-critical-path.spec.ts and the copies differ ON PURPOSE -- OBRS-858's arm omits the
 * booker email and asserts the omission, which is the whole of that test. Folding them
 * into one parameterised helper would put that assertion behind an argument, so each
 * spec keeps its own fill.
 */
/**
 * OBRS-856: this file used to be one anonymous walk that ran straight from the
 * review page into the passenger form. That walk encoded the bug. The frontend
 * admitted a guest all the way to the payment button while
 * BookingService.createBooking resolves the caller server-side and 401s them, so
 * the anonymous path this spec called "the critical path" was one the product
 * could never actually complete — it just stopped one screen short of where the
 * customer found out.
 *
 * So it is now two walks that share the same opening. The signed-in one keeps
 * every assertion the old spec had; the guest one pins the new boundary from the
 * other side. Splitting matters because a single spec can only assert ONE of
 * "the guest gets in" and "the guest is stopped", and both are requirements: the
 * search and seat pages are the shop window and must stay open, while the pages
 * that commit a booking must not take a visitor's effort before telling them.
 */
export async function seedSignedInCustomer(page: Page): Promise<void> {
  // Same shape as e2e/support/customer-pages.ts seedCustomerSession. Role 'user'
  // is the customer persona these specs are about.
  // OBRS-1001: this comment used to justify the role as "'user' is NOT in
  // AuthService.PORTAL_ONLY_ROLES, so the guard admits it". That list is gone —
  // the guard now admits EVERY signed-in role to the customer area — so the role
  // here is chosen to match the persona under test, not to dodge a bounce that
  // no longer exists.
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'obrs-856-b2c-gate-token');
    localStorage.setItem('auth_username', 'customer@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['user']));
  });
}

/**
 * Home → search → pick a schedule → confirm on the review page. Everything here
 * is open to guests by design and stays that way; the two tests below differ
 * only in whether a session exists when the confirm click lands.
 */
export async function searchAndConfirmASchedule(page: Page): Promise<void> {
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

  // OBRS-1336: schedules.json carries a departure leg and `arrivalSchedules: null`,
  // and the home form has defaulted to ROUND TRIP since OBRS-1185 — so this walk
  // has always been a round-trip search that ends in a one-way ticket. The click
  // above used to navigate straight on, which is the bug that card fixes; the
  // confirm now stands here and accepting it is exactly what the line above did
  // silently. Not a detour bolted onto this spec: it is this spec's own path,
  // stated out loud.
  await page.locator('.nrc-modal .btn-primary').click();

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
}
