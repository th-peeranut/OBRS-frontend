import { test, expect } from '@playwright/test';
import { mockPublicPageApis } from '../fixtures/public-page-mocks';
// OBRS-36 moved these two out of this file, unchanged, so the spec that resumes the same
// walk at /payment can call them instead of copying them. See the module's own header.
import {
  seedSignedInCustomer,
  searchAndConfirmASchedule,
} from '../support/b2c-booking-walk';

test.beforeEach(async ({ page }) => {
  // OBRS-602: this spec used to stub only stops + schedule search. The three calls the
  // shared set adds — route list, booking policy, seat map — were all being answered by
  // SIT without anyone noticing, which is what "fully mocked" turned out to mean here.
  await mockPublicPageApis(page);
});

test('B2C happy path: search → schedule → review → passenger info ready to pay', async ({
  page,
}) => {
  await seedSignedInCustomer(page);
  await searchAndConfirmASchedule(page);

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

/**
 * OBRS-858 SUPERSEDES OBRS-856 HERE, and this test is the same assertion turned around.
 *
 * OBRS-856 put the login wall at /passenger-info because BookingService.createBooking had no
 * way to resolve an anonymous caller — the backend 401'd, so admitting a guest to the form only
 * moved the disappointment one screen later. This test pinned that wall from the guest's side.
 *
 * OBRS-858 removed the reason. A guest now creates a booking against a phone-keyed shadow user
 * (ADR-0123) and pays with a booking-scoped signed token (Decision 6), so the flow completes
 * without an account and the wall became the bug. The old assertions are not deleted — every one
 * of them is inverted below, so this test still fails if the wall comes back, which is exactly
 * what OBRS-856 wanted it to do, in the direction the product now runs.
 */
test('OBRS-858: a guest walks past the passenger form with no login redirect, and reaches the pay button without giving an email', async ({
  page,
}) => {
  // No seedSignedInCustomer() — this is the visitor who never registered, and
  // the absence of that call IS the test condition.
  await searchAndConfirmASchedule(page);

  // The shop window stayed open: reaching the confirm click at all means the
  // guest cleared /schedule-booking and /review-schedule-booking. If a later
  // change gates those too, searchAndConfirmASchedule() cannot complete and
  // this test fails there rather than here — which is the point.
  await page.waitForURL('**/passenger-info');
  expect(new URL(page.url()).pathname).toBe('/passenger-info');

  // Assert the form RENDERED, not merely that the URL is right — the inverse of
  // OBRS-856's "landed on a blank shell would satisfy the pathname alone".
  await expect(page.locator('#booker-firstName')).toBeVisible();

  // Same fills as the signed-in walk above, with ONE deliberate omission: the
  // booker email. OBRS-238 had made it required for ONLINE bookings; OBRS-858
  // made it optional (a guest who has no account is not always going to have an
  // inbox to hand, and the e-ticket is retrievable, not merely mailed). Leaving
  // it empty here is what proves the field is optional in the shipped bundle,
  // not just in the reactive-form unit test.
  await page.locator('#booker-title .dropdown-btn').click();
  await page.locator('#booker-title .dropdown-option').first().click();
  await page.fill('#booker-firstName', 'Guest');
  await page.fill('#booker-lastName', 'Walker');
  await page.fill('#booker-phoneNumber', '0812345678');
  await page.locator('#booker-gender_male').click();

  await page.locator('#title-0 .dropdown-btn').click();
  await page.locator('#title-0 .dropdown-option').first().click();
  await page.fill('#firstName-0', 'Guest');
  await page.fill('#lastName-0', 'Walker');
  await page.locator('#gender_male-0').click();

  // Assert the omission is real before drawing a conclusion from it: a stray
  // autofill or a prefill from a previous step would make the next assertion
  // pass while proving nothing about whether email is optional.
  await expect(page.locator('#booker-email')).toHaveValue('');
  await expect(page.locator('.btn-next')).not.toBeDisabled();

  // No guard fired. OBRS-856 asserted that AuthService.setPostLoginRedirectUrl()
  // had recorded '/passenger-info' so signing in would return the guest to their
  // effort; with no redirect there is nothing to return to, and BOTH homes must
  // stay empty. OBRS-903's TTL'd localStorage envelope and the pre-903 per-tab
  // key are both checked, so restoring the wall through either one goes red.
  const stored = await page.evaluate(() => ({
    envelope: localStorage.getItem('auth_return_url'),
    perTab: sessionStorage.getItem('auth_return_url'),
  }));
  expect(stored.perTab).toBeNull();
  expect(stored.envelope).toBeNull();
});

/**
 * OBRS-855: the card's story, end to end, on the one call it actually happens on.
 *
 * `passenger-info.component.ts#onSubmitPassengerInfo` POSTs /api/private/bookings when the
 * customer presses Next, and the access JWT it carries lives one hour from SIGN-IN — not from the
 * start of the booking. Someone who logged in that morning and then spent a while over a group
 * booking presses that button with a token the backend has already stopped honouring. Before this
 * card there was nothing to renew it with: the interceptor cleared the session, the component's
 * own `error.status === 401` branch returned silently, and the effort was gone.
 *
 * This test makes that exact 401 happen once and asserts the customer finishes anyway. It also
 * settles a claim the card made that the code did NOT support — that the entered data is lost.
 * It is not: everything lives in NgRx feature stores and login navigates with the router, so the
 * data survives. Rather than write that down and trust it, the assertions below measure it.
 */
test('OBRS-855: the access token dies mid-booking — the request is retried on a fresh one and the customer reaches payment, not /login', async ({
  page,
}) => {
  await seedSignedInCustomer(page);
  await page.addInitScript(() => {
    // The half that did not exist before this card. Without it the interceptor has nothing to
    // try and this test would land on /login — which is exactly what the old behaviour was.
    localStorage.setItem('auth_refresh_token', 'obrs-855-live-refresh-token');
  });

  let refreshCalls = 0;
  let bookingAttempts = 0;
  const bearersSeen: string[] = [];

  await page.route('**/api/auth/refresh', async (route) => {
    refreshCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        data: {
          accessToken: 'obrs-855-fresh-access-token',
          tokenType: 'Bearer',
          expiresIn: 3600,
          // Rotated, as the real endpoint does.
          refreshToken: 'obrs-855-rotated-refresh-token',
          refreshExpiresIn: 604800,
          user: {
            id: 1,
            fullName: 'John Doe',
            email: 'customer@system.local',
            preferredLocale: 'en',
            status: 'ACTIVE',
            roles: ['user'],
          },
        },
      }),
    });
  });

  await page.route('**/api/private/bookings', async (route) => {
    bookingAttempts += 1;
    bearersSeen.push(route.request().headers()['authorization'] ?? '');

    if (bookingAttempts === 1) {
      // The expired access token, refused. Everything the customer typed is already on screen.
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ status: 401, message: 'Unauthorized' }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        data: { bookingId: 9001, bookingNumber: 'BK9001' },
      }),
    });
  });

  await searchAndConfirmASchedule(page);
  await page.waitForURL('**/passenger-info');

  await page.locator('#booker-title .dropdown-btn').click();
  await page.locator('#booker-title .dropdown-option').first().click();
  await page.fill('#booker-firstName', 'John');
  await page.fill('#booker-lastName', 'Doe');
  await page.fill('#booker-phoneNumber', '0812345678');
  await page.fill('#booker-email', 'john.doe@example.com');
  await page.locator('#booker-gender_male').click();

  await page.locator('#title-0 .dropdown-btn').click();
  await page.locator('#title-0 .dropdown-option').first().click();
  await page.fill('#firstName-0', 'John');
  await page.fill('#lastName-0', 'Doe');
  await page.locator('#gender_male-0').click();

  await page.locator('.btn-next').click();

  // The verdict. Reaching /payment means the booking was created, which means the 401 was
  // recovered from rather than surfaced — and that the customer never saw a sign-in screen.
  await page.waitForURL('**/payment');
  expect(new URL(page.url()).pathname).toBe('/payment');

  // Two attempts on the SAME booking call, and the second one carried the token the refresh
  // minted. Asserting the bearer is what separates "it retried" from "it happened to succeed".
  expect(bookingAttempts).toBe(2);
  expect(bearersSeen[0]).toBe('Bearer obrs-856-b2c-gate-token');
  expect(bearersSeen[1]).toBe('Bearer obrs-855-fresh-access-token');

  // Exactly one exchange. More than one would mean the single-flight guard is not holding, and
  // against the real backend each extra one presents an already-rotated token — which is read as
  // replay and revokes the whole session.
  expect(refreshCalls).toBe(1);

  // The rotated token replaced the spent one. Keeping the old value is what would make the NEXT
  // refresh look like a replay.
  const stored = await page.evaluate(() => ({
    access: localStorage.getItem('auth_token'),
    refresh: localStorage.getItem('auth_refresh_token'),
    // OBRS-903 moved this key to localStorage. Reading sessionStorage here would
    // still pass and would mean nothing — the key can no longer appear there at
    // all, so the assertion below would stop being able to fail.
    returnUrl: localStorage.getItem('auth_return_url'),
  }));
  expect(stored.access).toBe('obrs-855-fresh-access-token');
  expect(stored.refresh).toBe('obrs-855-rotated-refresh-token');
  // Nothing ever staged a post-login return, because nothing ever decided to send them to login.
  expect(stored.returnUrl).toBeNull();
});
