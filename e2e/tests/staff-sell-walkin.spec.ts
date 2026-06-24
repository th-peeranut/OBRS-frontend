/**
 * E2E spec — Walk-in ticket sale flow (SellPageComponent)
 *
 * All four risk areas from the QA mandate:
 *   RA-1  Idempotent cash settlement (same Idempotency-Key on pay→error→retry)
 *   RA-2  BUS seat double-booking guard (taken seat is not clickable; SEAT_COUNT_MISMATCH)
 *   RA-3  Role boundaries (salesperson/admin allowed; driver + plain user blocked)
 *   RA-4  409 seat-conflict surfaces a usable alert, stepper does not die
 *
 * Auth strategy:
 *   - Tests that navigate to /staff/sell and interact with the page use
 *     storageState: admin-auth.json (real SIT token).  The admin role passes
 *     every AuthGuard check (AuthService.hasAnyRole returns true for admin).
 *   - Role-boundary redirect tests (driver/user) inject via addInitScript because
 *     those tests never reach a page that makes backend calls — AuthGuard fires
 *     before any HTTP request is issued.
 *
 * Network strategy:
 *   All /api/* calls in the walk-in flow are intercepted and fulfilled with
 *   fixture data. The SIT backend is never touched by these tests.
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.resolve(__dirname, '../fixtures/admin-auth.json');

// ── Endpoint matchers ─────────────────────────────────────────────────────────

const SEARCH_ENDPOINT  = '**/api/public/schedules/search';
const SEATS_ENDPOINT   = '**/api/public/schedules/*/seats';
const BOOKINGS_ENDPOINT = '**/api/private/bookings';
const PAYMENT_ENDPOINT  = '**/api/private/payments/walk-in';

// ── Fixture responses ─────────────────────────────────────────────────────────

/**
 * BUS schedule where B3 is taken (numeric "3" absent from availableSeatNumbers).
 * The component's getTakenSeats() converts availableSeatNumbers to digit-only
 * strings and returns the complement over B1..B21, so "3" absent → B3 disabled.
 */
const BUS_SEARCH_RESP = {
  code: 200, message: 'OK',
  data: {
    departureSchedules: [{
      id: 201, vehicleType: 'BUS',
      departureDateTime: '2026-09-01T08:00:00',
      arrivalDateTime:   '2026-09-01T13:00:00',
      pricePerSeat: '300',
      availableSeats: 20,
      // numeric "3" absent → B3 is taken; all other 1..21 are available
      availableSeatNumbers: [
        '1','2','4','5','6','7','8','9','10',
        '11','12','13','14','15','16','17','18','19','20','21',
      ],
    }],
    arrivalSchedules: null,
  },
};

/** VAN schedule where seats 1,2,3 are available (A1,A2,A3 labels in the van component). */
const VAN_SEARCH_RESP = {
  code: 200, message: 'OK',
  data: {
    departureSchedules: [{
      id: 202, vehicleType: 'van',
      departureDateTime: '2026-09-02T09:00:00',
      arrivalDateTime:   '2026-09-02T14:00:00',
      pricePerSeat: '200',
      availableSeats: 3,
      availableSeatNumbers: ['1','2','3'],
    }],
    arrivalSchedules: null,
  },
};

const SEATS_RESP = {
  code: 200, message: 'OK',
  data: [
    { seatNumber: 'B1', rowIndex: 0, columnIndex: 0 },
    { seatNumber: 'B2', rowIndex: 1, columnIndex: 2 },
  ],
};

/**
 * Round-trip search: a departure (08:00) AND an arrival/return (15:00) BUS
 * schedule, all seats available. Distinct times let the test target each card.
 */
const ALL_BUS_SEATS = ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21'];
const RETURN_SEARCH_RESP = {
  code: 200, message: 'OK',
  data: {
    departureSchedules: [{
      id: 301, vehicleType: 'BUS',
      departureDateTime: '2026-09-01T08:00:00', arrivalDateTime: '2026-09-01T13:00:00',
      pricePerSeat: '300', availableSeats: 21, availableSeatNumbers: ALL_BUS_SEATS,
    }],
    arrivalSchedules: [{
      id: 302, vehicleType: 'BUS',
      departureDateTime: '2026-09-05T15:00:00', arrivalDateTime: '2026-09-05T20:00:00',
      pricePerSeat: '300', availableSeats: 21, availableSeatNumbers: ALL_BUS_SEATS,
    }],
  },
};

const BOOKING_RESP = {
  code: 201, message: 'Created',
  data: { bookingId: 9999, bookingNumber: 'BK-20260901-E2E' },
};

const PAYMENT_RESP = {
  code: 200, message: 'OK',
  data: { id: 555, bookingId: 9999, status: 'paid', paymentMethod: 'cash', amount: 300 },
};

/** Stops backing the searchable From/To dropdowns (slug = the value the search API receives). */
const STOPS_RESP = {
  code: 200, message: 'OK',
  data: [
    { id: 1, slug: 'nong-sak', status: 'active', stopType: 'stop', createdAt: '', updatedAt: '',
      translations: [{ locale: 'en', label: 'Nong Sak' }, { locale: 'th', label: 'หนองศักดิ์' }] },
    { id: 2, slug: 'bangkok', status: 'active', stopType: 'station', createdAt: '', updatedAt: '',
      translations: [{ locale: 'en', label: 'Bangkok' }, { locale: 'th', label: 'กรุงเทพ' }] },
  ],
};

const STOPS_ENDPOINT = '**/api/stops';

// ── Auth helpers ──────────────────────────────────────────────────────────────

/**
 * Inject role-based fake auth into localStorage BEFORE Angular boots.
 * Used only for redirect tests where the guard fires before any HTTP call.
 */
function injectFakeAuth(page: Page, roles: string[]): Promise<void> {
  return page.addInitScript((rolesArg: string[]) => {
    localStorage.setItem('auth_token', 'e2e-fake-token');
    localStorage.setItem('auth_username', 'test@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(rolesArg));
    localStorage.setItem('app_language', 'en');
  }, roles);
}

// ── Step helpers ──────────────────────────────────────────────────────────────

/** Open a searchable PrimeNG stop dropdown and pick the option by its visible label. */
async function selectStop(page: Page, formControlName: string, label: string): Promise<void> {
  await page.locator(`p-dropdown[formControlName="${formControlName}"]`).click();
  const panel = page.locator('.p-dropdown-panel');
  await panel.waitFor({ state: 'visible', timeout: 10_000 });
  await panel.getByText(label, { exact: true }).click();
  await panel.waitFor({ state: 'hidden', timeout: 10_000 });
}

/**
 * Type a date into a PrimeNG p-calendar.  `iso` is YYYY-MM-DD; the picker's
 * dateFormat is dd/mm/yy (4-digit year), so convert before typing.
 * Use pressSequentially (not fill): p-calendar parses typed input on real
 * keystrokes/Enter — a bulk fill() sets the input text but never updates the
 * form model.  Enter commits, Escape closes the overlay off the submit button.
 */
async function pickDate(page: Page, formControlName: string, iso: string): Promise<void> {
  const [y, m, d] = iso.split('-');
  const input = page.locator(`p-calendar[formControlName="${formControlName}"] input`);
  await input.click();
  await input.pressSequentially(`${d}/${m}/${y}`, { delay: 20 });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
}

/** Fill and submit the search form.  Assumes the page is already on /staff/sell step=search. */
async function fillSearchForm(
  page: Page,
  opts: { vehicleType?: 'bus' | 'van'; date?: string } = {}
): Promise<void> {
  const date = opts.date ?? '2026-09-01';
  await page.locator('select[formControlName="bookingType"]').selectOption('one_way');
  await selectStop(page, 'fromStop', 'Nong Sak');
  await selectStop(page, 'toStop', 'Bangkok');
  await pickDate(page, 'departureDate', date);
  await page.locator('input[formControlName="numberOfPassengers"]').fill('1');
  await page.locator('form button.btn-primary').click();
}

/** Fill the passenger + contact forms and click Confirm booking. */
async function fillPassengersAndConfirm(page: Page): Promise<void> {
  await page.locator('[formArrayName="passengers"] select[formControlName="title"]')
    .first().waitFor({ timeout: 12_000 });
  await page.locator('[formArrayName="passengers"] select[formControlName="title"]').first().selectOption('Mr.');
  await page.locator('[formArrayName="passengers"] input[formControlName="firstName"]').first().fill('Test');
  await page.locator('[formArrayName="passengers"] input[formControlName="lastName"]').first().fill('Passenger');
  await page.locator('[formArrayName="passengers"] input[formControlName="identityCardNumber"]').first().fill('1234567890123');
  await page.locator('[formArrayName="passengers"] input[formControlName="phoneNumber"]').first().fill('0812345678');
  await page.locator('[formArrayName="passengers"] select[formControlName="gender"]').first().selectOption('MALE');

  await page.locator('[formGroupName="contact"] select[formControlName="title"]').selectOption('Mrs.');
  await page.locator('[formGroupName="contact"] input[formControlName="firstName"]').fill('Contact');
  await page.locator('[formGroupName="contact"] input[formControlName="lastName"]').fill('Person');
  await page.locator('[formGroupName="contact"] input[formControlName="phoneNumber"]').fill('0891234567');
  await page.locator('[formGroupName="contact"] input[formControlName="email"]').fill('contact@example.com');
  await page.locator('[formGroupName="contact"] input[formControlName="identityCardNumber"]').fill('9876543210987');

  await page.locator('button.btn-primary:has-text("Confirm")').click();
}

/** Dismiss a SweetAlert modal via JS click (avoids Playwright pointer-event interception). */
async function dismissAlert(page: Page): Promise<void> {
  await page.locator('.swal2-container').waitFor({ state: 'visible', timeout: 15_000 });
  await page.evaluate(() => {
    (document.querySelector('.swal2-confirm') as HTMLButtonElement | null)?.click();
  });
  await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 10_000 });
}

// =============================================================================
// RA-3  Role boundaries — unauthenticated / wrong-role tests
// (These use fake tokens; the guard fires before any HTTP call is made.)
// =============================================================================

test.describe('RA-3: Role boundaries — redirect behaviour', () => {
  test('driver is redirected away from /staff/sell (canActivate blocks it)', async ({ page }) => {
    await injectFakeAuth(page, ['driver']);
    await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });

    // AuthGuard blocks driver from the salesperson-only route
    await page.waitForURL((url) => !url.pathname.startsWith('/staff/sell'), { timeout: 15_000 });
    expect(page.url()).not.toContain('/staff/sell');
  });

  test('plain user is redirected away from /staff/sell', async ({ page }) => {
    await injectFakeAuth(page, ['user']);
    await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });

    await page.waitForURL((url) => !url.pathname.startsWith('/staff/sell'), { timeout: 15_000 });
    expect(page.url()).not.toContain('/staff/sell');
  });

  test('unauthenticated visitor is redirected to /login', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('app_language', 'en');
      // No auth_token set → isAuthenticated() returns false
    });
    await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });

    await page.waitForURL('**/login**', { timeout: 15_000 });
    expect(page.url()).toContain('/login');
  });
});

// =============================================================================
// Authenticated suites — use stored admin auth so page.goto doesn't hang.
// Admin role satisfies every canActivate check (AuthService.hasAnyRole → true).
// =============================================================================

test.describe('Authenticated walk-in flow tests', () => {
  test.use({ storageState: ADMIN_AUTH });

  // The sell page loads the stop list on init to populate the From/To dropdowns.
  // Register the mock before each navigation so the request never hits SIT.
  test.beforeEach(async ({ page }) => {
    await page.route(STOPS_ENDPOINT, (route) => route.fulfill({ json: STOPS_RESP }));
  });

  // ── RA-3 positive case: admin (which passes all role checks) can reach /staff/sell ─

  test('RA-3: admin can reach /staff/sell — search form renders', async ({ page }) => {
    await page.route('**/api/private/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, message: 'OK', data: [] }) })
    );
    await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('select[formControlName="bookingType"]')).toBeVisible({ timeout: 20_000 });
  });

  // ── RA-2  BUS seat double-booking guard ──────────────────────────────────

  test.describe('RA-2: BUS seat availability — takenSeats complement logic', () => {
    test('B3 (taken) renders with disabled class; B1 (available) does not', async ({ page }) => {
      await page.route(SEARCH_ENDPOINT, (route) =>
        route.fulfill({ json: BUS_SEARCH_RESP })
      );
      await page.route(SEATS_ENDPOINT, (route) =>
        route.fulfill({ json: SEATS_RESP })
      );
      await page.route('**/api/private/**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, message: 'OK', data: [] }) })
      );

      await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });

      // Wait for search form
      await page.locator('select[formControlName="bookingType"]').waitFor({ timeout: 20_000 });

      // Submit search → moves to seats step
      await fillSearchForm(page);

      // Select the schedule card to render the seat map
      const scheduleCard = page.locator('.card.mb-2.border').first();
      await scheduleCard.waitFor({ timeout: 15_000 });
      await scheduleCard.click();

      // Wait for seat map
      const seatB1 = page.getByText('B1', { exact: true });
      await seatB1.waitFor({ timeout: 12_000 });

      const seatB3 = page.getByText('B3', { exact: true });

      // B3 is NOT in availableSeatNumbers → getTakenSeats() includes it → .disabled class
      await expect(seatB3).toHaveClass(/disabled/, { timeout: 5_000 });

      // B1 IS available → no disabled class
      await expect(seatB1).not.toHaveClass(/disabled/);
    });

    test('clicking a taken BUS seat (B3) does not change the selection count', async ({ page }) => {
      await page.route(SEARCH_ENDPOINT, (route) =>
        route.fulfill({ json: BUS_SEARCH_RESP })
      );
      await page.route(SEATS_ENDPOINT, (route) =>
        route.fulfill({ json: SEATS_RESP })
      );
      await page.route('**/api/private/**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, message: 'OK', data: [] }) })
      );

      await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
      await page.locator('select[formControlName="bookingType"]').waitFor({ timeout: 20_000 });

      await fillSearchForm(page);

      const scheduleCard = page.locator('.card.mb-2.border').first();
      await scheduleCard.waitFor({ timeout: 15_000 });
      await scheduleCard.click();

      const seatB3 = page.getByText('B3', { exact: true });
      await seatB3.waitFor({ timeout: 12_000 });

      // Click the disabled seat — the bus component's setPassengerSeatPosition
      // returns early when isSeatTakenByOther() is true
      await seatB3.click({ force: true });

      // Selection counter should still show 0 / 1 (no selection happened).
      // The template renders the count inside a <span class="badge seats-progress">.
      const counter = page.locator('.seats-progress', { hasText: /0\s*\/\s*1/ });
      await expect(counter).toBeVisible({ timeout: 5_000 });
    });

    test('SEAT_COUNT_MISMATCH alert fires when Next is clicked with no seat selected', async ({ page }) => {
      await page.route(SEARCH_ENDPOINT, (route) =>
        route.fulfill({ json: BUS_SEARCH_RESP })
      );
      await page.route(SEATS_ENDPOINT, (route) =>
        route.fulfill({ json: SEATS_RESP })
      );
      await page.route('**/api/private/**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, message: 'OK', data: [] }) })
      );

      await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
      await page.locator('select[formControlName="bookingType"]').waitFor({ timeout: 20_000 });

      await fillSearchForm(page);

      // Select schedule but do NOT pick any seat
      const scheduleCard = page.locator('.card.mb-2.border').first();
      await scheduleCard.waitFor({ timeout: 15_000 });
      await scheduleCard.click();
      await page.locator('.seat-box').first().waitFor({ timeout: 12_000 });

      // Click Next without a seat selected
      await page.locator('button.btn.btn-primary:has-text("Next")').click();

      // SEAT_COUNT_MISMATCH warning alert must appear
      await page.locator('.swal2-container').waitFor({ state: 'visible', timeout: 12_000 });

      // The English SEAT_COUNT_MISMATCH message ("Please select a seat for every
      // passenger") is rendered as the SweetAlert title (alertService.warning →
      // Swal.fire({ title }) ), not the html-container.
      const alertText = (await page.locator('.swal2-popup').textContent()) ?? '';
      expect(alertText.toLowerCase()).toMatch(/seat|passenger/);

      await dismissAlert(page);

      // Stepper did NOT advance — seat-box elements are still visible (we're still on seats step)
      await expect(page.locator('.seat-box').first()).toBeVisible();
    });
  });

  // ── RA-4  409 seat-conflict ───────────────────────────────────────────────

  test.describe('RA-4: 409 seat-conflict is surfaced as an alert', () => {
    test('booking 409 shows an alert and leaves stepper on passengers step', async ({ page }) => {
      // Catch-all FIRST so the specific routes below take precedence (Playwright
      // runs matching routes in reverse registration order — last registered wins).
      await page.route('**/api/private/**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, message: 'OK', data: [] }) })
      );
      await page.route(SEARCH_ENDPOINT, (route) =>
        route.fulfill({ json: BUS_SEARCH_RESP })
      );
      await page.route(SEATS_ENDPOINT, (route) =>
        route.fulfill({ json: SEATS_RESP })
      );
      // Booking endpoint returns 409
      await page.route(BOOKINGS_ENDPOINT, (route) =>
        route.fulfill({
          status: 409,
          json: { code: 409, message: 'SEAT_CONFLICT', data: null },
        })
      );

      await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
      await page.locator('select[formControlName="bookingType"]').waitFor({ timeout: 20_000 });

      // Step 1: search
      await fillSearchForm(page);

      // Step 2: select schedule, pick seat B1
      const scheduleCard = page.locator('.card.mb-2.border').first();
      await scheduleCard.waitFor({ timeout: 15_000 });
      await scheduleCard.click();
      const seatB1 = page.getByText('B1', { exact: true });
      await seatB1.waitFor({ timeout: 12_000 });
      await seatB1.click();
      await page.locator('button.btn.btn-primary:has-text("Next")').click();

      // Step 3: passengers → submit → 409
      await fillPassengersAndConfirm(page);

      // Error alert must appear
      await page.locator('.swal2-container').waitFor({ state: 'visible', timeout: 15_000 });
      await dismissAlert(page);

      // Stepper did NOT advance to payment — Confirm button still present and enabled
      const confirmBtn = page.locator('button.btn-primary:has-text("Confirm")');
      await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
      await expect(confirmBtn).not.toBeDisabled();
    });
  });

  // ── RA-1  Idempotent cash settlement ─────────────────────────────────────

  test.describe('RA-1: Idempotent cash settlement', () => {
    test('same Idempotency-Key is sent on pay → server error → retry', async ({ page }) => {
      const capturedKeys: string[] = [];
      let payCallCount = 0;

      // Catch-all FIRST so the specific routes below take precedence (Playwright
      // runs matching routes in reverse registration order — last registered wins).
      await page.route('**/api/private/**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, message: 'OK', data: [] }) })
      );
      await page.route(SEARCH_ENDPOINT, (route) =>
        route.fulfill({ json: BUS_SEARCH_RESP })
      );
      await page.route(SEATS_ENDPOINT, (route) =>
        route.fulfill({ json: SEATS_RESP })
      );
      await page.route(BOOKINGS_ENDPOINT, (route) =>
        route.fulfill({ status: 201, json: BOOKING_RESP })
      );
      await page.route(PAYMENT_ENDPOINT, (route) => {
        payCallCount++;
        const key = route.request().headers()['idempotency-key'];
        capturedKeys.push(key ?? '');
        if (payCallCount === 1) {
          return route.fulfill({
            status: 500,
            json: { code: 500, message: 'Internal Server Error' },
          });
        }
        return route.fulfill({ json: PAYMENT_RESP });
      });

      await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
      await page.locator('select[formControlName="bookingType"]').waitFor({ timeout: 20_000 });

      // Step 1: search
      await fillSearchForm(page);

      // Step 2: seats — select schedule card and click B1
      const scheduleCard = page.locator('.card.mb-2.border').first();
      await scheduleCard.waitFor({ timeout: 15_000 });
      await scheduleCard.click();
      const seatB1 = page.getByText('B1', { exact: true });
      await seatB1.waitFor({ timeout: 12_000 });
      await seatB1.click();
      await page.locator('button.btn.btn-primary:has-text("Next")').click();

      // Step 3: passengers
      await fillPassengersAndConfirm(page);

      // Step 4: payment — first attempt fails
      const payBtn = page.locator('button.btn-success');
      await payBtn.waitFor({ timeout: 12_000 });
      await payBtn.click();

      // Dismiss the error alert
      await dismissAlert(page);

      // Retry — button re-enabled
      await expect(payBtn).not.toBeDisabled({ timeout: 5_000 });
      await payBtn.click();

      // Step 5: ticket — booking number visible
      await expect(page.locator('text=BK-20260901-E2E')).toBeVisible({ timeout: 20_000 });

      // Idempotency assertions
      expect(payCallCount).toBe(2);
      expect(capturedKeys).toHaveLength(2);
      expect(capturedKeys[0]).toBeTruthy();
      // Both calls MUST use the same key
      expect(capturedKeys[0]).toBe(capturedKeys[1]);
      // Key must be a valid UUID v4
      expect(capturedKeys[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });
  });

  // ── Happy path — full flow (VAN schedule) ────────────────────────────────

  test.describe('Happy path: full walk-in sale (VAN schedule)', () => {
    test('Search → Seats → Passengers → Payment → E-ticket (bookingNumber visible)', async ({ page }) => {
      // Catch-all FIRST so the specific routes below take precedence (Playwright
      // runs matching routes in reverse registration order — last registered wins).
      await page.route('**/api/private/**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, message: 'OK', data: [] }) })
      );
      await page.route(SEARCH_ENDPOINT, (route) =>
        route.fulfill({ json: VAN_SEARCH_RESP })
      );
      await page.route(SEATS_ENDPOINT, (route) =>
        route.fulfill({ json: SEATS_RESP })
      );
      await page.route(BOOKINGS_ENDPOINT, (route) =>
        route.fulfill({ status: 201, json: BOOKING_RESP })
      );
      await page.route(PAYMENT_ENDPOINT, (route) =>
        route.fulfill({ json: PAYMENT_RESP })
      );

      await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
      await page.locator('select[formControlName="bookingType"]').waitFor({ timeout: 20_000 });

      // ── Step 1: Search ────────────────────────────────────────────────────
      await page.locator('select[formControlName="bookingType"]').selectOption('one_way');
      await selectStop(page, 'fromStop', 'Nong Sak');
      await selectStop(page, 'toStop', 'Bangkok');
      await pickDate(page, 'departureDate', '2026-09-02');
      await page.locator('input[formControlName="numberOfPassengers"]').fill('1');
      await page.locator('form button.btn-primary').click();

      // ── Step 2: Seats — VAN schedule ─────────────────────────────────────
      const scheduleCard = page.locator('.card.mb-2.border').first();
      await scheduleCard.waitFor({ timeout: 15_000 });
      await scheduleCard.click();

      // VAN uses A-prefixed labels (A1..A10). Seat A1 should be available.
      const seatA1 = page.getByText('A1', { exact: true });
      await seatA1.waitFor({ timeout: 12_000 });
      await seatA1.click();

      // Selection counter reflects 1 selected seat: "1 / 1 Seats Selected"
      await expect(page.locator('.seats-progress', { hasText: /1\s*\/\s*1/ })).toBeVisible({ timeout: 5_000 });

      // Proceed to passengers
      await page.locator('button.btn.btn-primary:has-text("Next")').click();

      // ── Step 3: Passengers ────────────────────────────────────────────────
      // The seat badge shows in the card header
      await page.locator('.card-header:has-text("Seat")').waitFor({ timeout: 10_000 });

      await fillPassengersAndConfirm(page);

      // ── Step 4: Payment ───────────────────────────────────────────────────
      const payBtn = page.locator('button.btn-success');
      await payBtn.waitFor({ timeout: 12_000 });

      // Cash-only badge must be visible; no payment method selector
      await expect(page.locator('.badge.bg-success')).toBeVisible();
      await expect(page.locator('select[formControlName="paymentMethod"]')).not.toBeVisible();

      await payBtn.click();

      // ── Step 5: E-ticket ──────────────────────────────────────────────────
      await expect(page.locator('text=BK-20260901-E2E')).toBeVisible({ timeout: 20_000 });

      // "View e-ticket" and "New sale" buttons present (target by stable class,
      // not by translated label which is "View E-Ticket" / "New Sale").
      await expect(page.locator('button.btn-outline-primary')).toBeVisible();
      await expect(page.locator('button.btn-primary:has-text("New Sale")')).toBeVisible();
    });

    test('New sale button resets the stepper back to the search step', async ({ page }) => {
      // Catch-all FIRST so the specific routes below take precedence (Playwright
      // runs matching routes in reverse registration order — last registered wins).
      await page.route('**/api/private/**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, message: 'OK', data: [] }) })
      );
      await page.route(SEARCH_ENDPOINT, (route) =>
        route.fulfill({ json: VAN_SEARCH_RESP })
      );
      await page.route(SEATS_ENDPOINT, (route) =>
        route.fulfill({ json: SEATS_RESP })
      );
      await page.route(BOOKINGS_ENDPOINT, (route) =>
        route.fulfill({ status: 201, json: BOOKING_RESP })
      );
      await page.route(PAYMENT_ENDPOINT, (route) =>
        route.fulfill({ json: PAYMENT_RESP })
      );

      await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
      await page.locator('select[formControlName="bookingType"]').waitFor({ timeout: 20_000 });

      // Complete the flow
      await page.locator('select[formControlName="bookingType"]').selectOption('one_way');
      await selectStop(page, 'fromStop', 'Nong Sak');
      await selectStop(page, 'toStop', 'Bangkok');
      await pickDate(page, 'departureDate', '2026-09-02');
      await page.locator('form button.btn-primary').click();

      const scheduleCard = page.locator('.card.mb-2.border').first();
      await scheduleCard.waitFor({ timeout: 15_000 });
      await scheduleCard.click();

      const seatA1 = page.getByText('A1', { exact: true });
      await seatA1.waitFor({ timeout: 12_000 });
      await seatA1.click();
      await page.locator('button.btn.btn-primary:has-text("Next")').click();

      await fillPassengersAndConfirm(page);

      const payBtn = page.locator('button.btn-success');
      await payBtn.waitFor({ timeout: 12_000 });
      await payBtn.click();

      await expect(page.locator('text=BK-20260901-E2E')).toBeVisible({ timeout: 20_000 });

      // Click New sale
      await page.locator('button:has-text("New sale"), button:has-text("New Sale")').click();

      // Stepper returns to search step
      await expect(page.locator('select[formControlName="bookingType"]')).toBeVisible({ timeout: 8_000 });
    });
  });

  // ── Passenger field validation ───────────────────────────────────────────
  test.describe('Passenger field validation', () => {
    test('invalid phone shows an inline error and Confirm is blocked', async ({ page }) => {
      await page.route('**/api/private/**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, message: 'OK', data: [] }) })
      );
      await page.route(SEARCH_ENDPOINT, (route) => route.fulfill({ json: VAN_SEARCH_RESP }));
      await page.route(SEATS_ENDPOINT, (route) => route.fulfill({ json: SEATS_RESP }));
      // Deliberately NO bookings route: if Confirm wrongly proceeded, the booking
      // POST would 404 and the flow would error — but it must never get that far.

      await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
      await page.locator('select[formControlName="bookingType"]').waitFor({ timeout: 20_000 });

      // Reach the passengers step (search → pick schedule → pick seat → Next)
      await fillSearchForm(page, { date: '2026-09-02' });
      const scheduleCard = page.locator('.card.mb-2.border').first();
      await scheduleCard.waitFor({ timeout: 15_000 });
      await scheduleCard.click();
      const seatA1 = page.getByText('A1', { exact: true });
      await seatA1.waitFor({ timeout: 12_000 });
      await seatA1.click();
      await page.locator('button.btn.btn-primary:has-text("Next")').click();
      await page.locator('.card-header:has-text("Seat")').waitFor({ timeout: 10_000 });

      // Enter an invalid (too-short) phone and ID on the first passenger
      const phone = page.locator('[formArrayName="passengers"] input[formControlName="phoneNumber"]').first();
      await phone.fill('123');
      await phone.blur();
      const idCard = page.locator('[formArrayName="passengers"] input[formControlName="identityCardNumber"]').first();
      await idCard.fill('99');
      await idCard.blur();

      // Field-specific inline errors are shown
      await expect(
        page.getByText('Enter a valid 10-digit phone number (e.g. 0812345678).')
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByText('Enter a valid 13-digit ID card number.')
      ).toBeVisible({ timeout: 5_000 });

      // Confirm is blocked: a validation alert fires and we stay on the passengers step
      await page.locator('button.btn-primary:has-text("Confirm")').click();
      await dismissAlert(page);
      await expect(page.locator('.card-header:has-text("Seat")')).toBeVisible();
    });
  });

  // ── Return-trip seat selection (regression for #38) ──────────────────────
  test.describe('Return trip seat selection', () => {
    test('return trip renders a separate arrival seat map and Next proceeds', async ({ page }) => {
      await page.route('**/api/private/**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, message: 'OK', data: [] }) })
      );
      await page.route(SEARCH_ENDPOINT, (route) => route.fulfill({ json: RETURN_SEARCH_RESP }));
      await page.route(SEATS_ENDPOINT, (route) => route.fulfill({ json: SEATS_RESP }));

      await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
      await page.locator('select[formControlName="bookingType"]').waitFor({ timeout: 20_000 });

      // Search a ROUND TRIP
      await page.locator('select[formControlName="bookingType"]').selectOption('return');
      await selectStop(page, 'fromStop', 'Nong Sak');
      await selectStop(page, 'toStop', 'Bangkok');
      await pickDate(page, 'departureDate', '2026-09-01');
      await pickDate(page, 'returnDate', '2026-09-05');
      await page.locator('input[formControlName="numberOfPassengers"]').fill('1');
      await page.locator('form button.btn-primary').click();

      // Pick the departure schedule (08:00) and a departure seat
      await page.locator('.card.mb-2.border', { hasText: '08:00' }).first().click();
      await page.locator('.seatmap-departure').getByText('B1', { exact: true }).click();

      // Before choosing a return trip, there is no return seat map yet
      await expect(page.locator('.seatmap-return')).toHaveCount(0);

      // Pick the return schedule (15:00) → the arrival seat map appears
      await page.locator('.card.mb-2.border', { hasText: '15:00' }).first().click();
      await expect(page.locator('.seatmap-return')).toBeVisible({ timeout: 5_000 });

      // Pick a return seat (scoped to the return map so it isn't confused with departure B1)
      await page.locator('.seatmap-return').getByText('B2', { exact: true }).click();

      // Both legs satisfied → Next advances to the passengers step (no SEAT_COUNT_MISMATCH)
      await page.locator('button.btn.btn-primary:has-text("Next")').click();
      await expect(page.locator('.card-header:has-text("Seat")').first()).toBeVisible({ timeout: 10_000 });
    });
  });
});
