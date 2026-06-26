/**
 * E2E spec — Walk-in POS single-screen (SellPageComponent, feature/walkin-ticket-sales)
 *
 * Tests cover the NEW 3-column POS that replaced the old 5-step wizard:
 *   AC-1   Date picker loads trips grouped by route, no from/to needed
 *   AC-2   Zero-trip day → 200 + empty-state UI (not an error modal)
 *   AC-3   Trip row shows plate, driver, 3 badges; counts sum to capacity
 *   AC-4   BUS seat map: taken seats blocked; VAN edge: sold-out blocks selection
 *   AC-5   Customer form: title+first+last+phone required; no gender field;
 *           Sell disabled until 4 fields valid AND >=1 seat AND cash>=total
 *   AC-6   Booking payload has NO gender; one contact block; passengerType=male
 *          (the only gender-neutral lookup slug; 'ADULT' matched none and 404'd)
 *   AC-7   Cash tile active; PromptPay/credit tiles disabled ("Coming soon")
 *   AC-8   Change due = received − total live; Sell disabled when received < total
 *   AC-9   Success: payWalkIn called; badge counts refresh (trips reload)
 *   AC-10  Center panel has 3 tabs; Trip Details tab shows plate/driver
 *   AC-11  All 3 locales have STAFF.SELL keys (static check via mocked i18n)
 *   AC-12  Old wizard selectors absent (no bookingType dropdown, no fromStop)
 *
 * Watch items (scrutinize):
 *   WI-A   totalAmount > 0 in booking payload (self-fix guard)
 *   WI-G   Null pricePerSeat trip: Sell button stays disabled
 *
 * Role boundary tests (RA-3) are retained unchanged:
 *   driver / plain user → redirected away from /staff/sell
 *   unauthenticated → /login
 *   admin → reaches /staff/sell
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.resolve(__dirname, '../fixtures/admin-auth.json');

// ── Endpoint matchers ─────────────────────────────────────────────────────────

const WALK_IN_SCHEDULES_ENDPOINT = '**/api/private/schedules/walk-in**';
const BOOKINGS_ENDPOINT           = '**/api/private/bookings';
const PAYMENT_ENDPOINT            = '**/api/private/payments/walk-in';
const SEGMENTS_ENDPOINT           = '**/api/private/segments/**';

/**
 * Stop pairs for the walk-in checkout pickup/drop-off + segment pricing.
 * Single full-route pair per vehicle type → pickup/drop-off default to
 * origin→destination. Bus full-route fare = 350 (matches the bus trip fixtures'
 * totalAmount assertions); van = 200.
 */
const SEGMENTS_RESP = {
  code: 200,
  message: 'OK',
  data: {
    route: { slug: 'route', name: 'Route' },
    stopPairs: [
      { segmentId: 1, fromStop: { slug: 'origin', name: 'Origin' }, toStop: { slug: 'dest', name: 'Destination' }, vehicleType: { slug: 'bus', name: 'Bus' }, fare: '350.00', estimatedDurationMinutes: 300 },
      { segmentId: 2, fromStop: { slug: 'origin', name: 'Origin' }, toStop: { slug: 'dest', name: 'Destination' }, vehicleType: { slug: 'van', name: 'Van' }, fare: '200.00', estimatedDurationMinutes: 300 },
    ],
  },
};

/** A route with no stop pairs — pickup/drop-off cannot resolve, Sell stays disabled. */
const SEGMENTS_EMPTY_RESP = {
  code: 200,
  message: 'OK',
  data: { route: { slug: 'route', name: 'Route' }, stopPairs: [] },
};

// ── Fixture responses ─────────────────────────────────────────────────────────

/** A typical BUS trip: capacity=21, 1 reserved (B3), 2 sold (B4,B5), 18 available */
const BUS_TRIP_FIXTURE = {
  scheduleId: 201,
  vehicleType: 'bus',
  licensePlate: 'TH-8888',
  driverName: 'Somchai Driver',
  departureDateTime: '2026-09-01T08:00:00Z',
  arrivalDateTime: '2026-09-01T13:00:00Z',
  pricePerSeat: '350.00',
  capacity: 21,
  availableCount: 18,
  reservedUnpaidCount: 1,
  soldPaidCount: 2,
  // B3 reserved, B4 sold, B5 sold → absent from availableSeatNumbers
  availableSeatNumbers: [
    '1','2','4','6','7','8','9','10',
    '11','12','13','14','15','16','17','18','19','20','21',
  ],
};

const WALK_IN_SCHEDULES_RESP = {
  code: 200,
  message: 'OK',
  data: [
    {
      routeSlug: 'bkk-cnx',
      routeLabel: 'Bangkok - Chiang Mai',
      trips: [BUS_TRIP_FIXTURE],
    },
  ],
};

/** A VAN trip where ALL seats are sold out (availableSeatNumbers=[]) */
const SOLDOUT_VAN_TRIP_FIXTURE = {
  scheduleId: 202,
  vehicleType: 'van',
  licensePlate: 'TH-9999',
  driverName: 'Wirat Driver',
  departureDateTime: '2026-09-01T10:00:00Z',
  arrivalDateTime: '2026-09-01T15:00:00Z',
  pricePerSeat: '200.00',
  capacity: 10,
  availableCount: 0,
  reservedUnpaidCount: 0,
  soldPaidCount: 10,
  availableSeatNumbers: [],
};

const SOLDOUT_VAN_RESP = {
  code: 200,
  message: 'OK',
  data: [
    {
      routeSlug: 'cnx-phs',
      routeLabel: 'Chiang Mai - Phitsanulok',
      trips: [SOLDOUT_VAN_TRIP_FIXTURE],
    },
  ],
};

/** A BUS trip where pricePerSeat is null (WI-G: Sell button must stay disabled) */
const NULL_PRICE_TRIP_FIXTURE = {
  ...BUS_TRIP_FIXTURE,
  scheduleId: 203,
  pricePerSeat: null,
  availableSeatNumbers: ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21'],
  availableCount: 21,
  reservedUnpaidCount: 0,
  soldPaidCount: 0,
};

const NULL_PRICE_RESP = {
  code: 200,
  message: 'OK',
  data: [
    {
      routeSlug: 'bkk-cnx',
      routeLabel: 'Bangkok - Chiang Mai',
      trips: [NULL_PRICE_TRIP_FIXTURE],
    },
  ],
};

/** Two-route response for testing grouping */
const MULTI_ROUTE_RESP = {
  code: 200,
  message: 'OK',
  data: [
    {
      routeSlug: 'bkk-cnx',
      routeLabel: 'Bangkok - Chiang Mai',
      trips: [BUS_TRIP_FIXTURE],
    },
    {
      routeSlug: 'cnx-phs',
      routeLabel: 'Chiang Mai - Phitsanulok',
      trips: [
        {
          ...BUS_TRIP_FIXTURE,
          scheduleId: 210,
          departureDateTime: '2026-09-01T07:00:00Z',
          arrivalDateTime: '2026-09-01T12:00:00Z',
        },
      ],
    },
  ],
};

const EMPTY_RESP = {
  code: 200,
  message: 'OK',
  data: [],
};

const BOOKING_RESP = {
  code: 201,
  message: 'Created',
  data: { bookingId: 9001, bookingNumber: 'BK-20260901-POS' },
};

const PAYMENT_RESP = {
  code: 200,
  message: 'OK',
  data: { id: 777, bookingId: 9001, status: 'paid', paymentMethod: 'cash', amount: 350 },
};

// ── Auth helpers ──────────────────────────────────────────────────────────────

/** Inject role-based fake auth before Angular boots (for redirect tests only). */
function injectFakeAuth(page: Page, roles: string[]): Promise<void> {
  return page.addInitScript((rolesArg: string[]) => {
    localStorage.setItem('auth_token', 'e2e-fake-token');
    localStorage.setItem('auth_username', 'test@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(rolesArg));
    localStorage.setItem('app_language', 'en');
  }, roles);
}

/** Fill the checkout contact form with valid data (email is required for walk-in). */
async function fillContactForm(page: Page): Promise<void> {
  await page.locator('select[formControlName="title"]').selectOption({ index: 1 });
  await page.locator('input[formControlName="firstName"]').fill('Test');
  await page.locator('input[formControlName="lastName"]').fill('Passenger');
  await page.locator('input[formControlName="phoneNumber"]').fill('0812345678');
  await page.locator('input[formControlName="email"]').fill('walkin@example.com');
}

// ── Wait for the POS page to be ready ────────────────────────────────────────

/** Navigate to /staff/sell and wait for the trip-browser to be present. */
async function gotoSellPage(page: Page): Promise<void> {
  await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
  // The walk-in-trip-browser is always rendered (even empty-state)
  await page.locator('app-walk-in-trip-browser').waitFor({ state: 'visible', timeout: 20_000 });
}

// =============================================================================
// RA-3  Role boundaries — redirect behaviour (fake tokens, no backend calls)
// =============================================================================

test.describe('RA-3: Role boundaries — redirect behaviour', () => {
  test('driver is redirected away from /staff/sell (canActivate blocks it)', async ({ page }) => {
    await injectFakeAuth(page, ['driver']);
    await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
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
    });
    await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/login**', { timeout: 15_000 });
    expect(page.url()).toContain('/login');
  });
});

// =============================================================================
// Authenticated suite — all remaining tests use stored admin auth
// =============================================================================

test.describe('Walk-in POS single-screen (authenticated)', () => {
  test.use({ storageState: ADMIN_AUTH });

  // Every authenticated test gets the route stop pairs by default (selecting a
  // trip triggers a /segments fetch for pickup/drop-off + pricing). Tests that
  // need a different shape register their own /segments route in the body, which
  // takes precedence over this beforeEach handler.
  test.beforeEach(async ({ page }) => {
    await page.route(SEGMENTS_ENDPOINT, (route) => route.fulfill({ json: SEGMENTS_RESP }));
  });

  // ── AC-12  Old wizard selectors MUST NOT exist ───────────────────────────

  test('AC-12: old 5-step wizard selectors are absent from /staff/sell', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: EMPTY_RESP })
    );
    await gotoSellPage(page);

    // Old wizard had bookingType select, fromStop/toStop p-dropdown, numberOfPassengers
    await expect(page.locator('select[formControlName="bookingType"]')).toHaveCount(0);
    await expect(page.locator('p-dropdown[formControlName="fromStop"]')).toHaveCount(0);
    await expect(page.locator('p-dropdown[formControlName="toStop"]')).toHaveCount(0);
    await expect(page.locator('input[formControlName="numberOfPassengers"]')).toHaveCount(0);

    // New 3-column POS components are present
    await expect(page.locator('app-walk-in-trip-browser')).toBeVisible();
    await expect(page.locator('app-walk-in-center-panel')).toBeVisible();
    await expect(page.locator('app-walk-in-checkout')).toBeVisible();
  });

  test('RA-3: admin can reach /staff/sell — POS layout renders', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: EMPTY_RESP })
    );
    await gotoSellPage(page);
    await expect(page.locator('app-walk-in-trip-browser')).toBeVisible();
  });

  // ── AC-1  Date picker loads trips, grouped by route ──────────────────────

  test('AC-1: page loads current-day trips on init, grouped by route', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: MULTI_ROUTE_RESP })
    );
    await gotoSellPage(page);

    // Two route group headers visible
    await expect(page.locator('.route-group-header', { hasText: 'Bangkok - Chiang Mai' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.route-group-header', { hasText: 'Chiang Mai - Phitsanulok' })).toBeVisible({ timeout: 10_000 });

    // Trip rows rendered (at least 2 total for the two routes)
    await expect(page.locator('.trip-row')).toHaveCount(2, { timeout: 10_000 });
  });

  // ── AC-2  Empty day → 200 + empty-state (not error) ─────────────────────

  test('AC-2: zero-trip day shows empty-state UI, no error modal', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: EMPTY_RESP })
    );

    // Ensure no alert fires
    let alertFired = false;
    page.on('dialog', () => { alertFired = true; });

    await gotoSellPage(page);

    // Empty-state element in trip browser
    const emptyMsg = page.locator('text=No trips scheduled for this date.');
    await expect(emptyMsg).toBeVisible({ timeout: 10_000 });

    // No SweetAlert container
    await expect(page.locator('.swal2-container')).toHaveCount(0);
    expect(alertFired).toBe(false);
  });

  // ── AC-3  Trip row badges: plate, driver, 3 badges sum to capacity ────────

  test('AC-3: trip row shows plate, driver and 3 badge counts that sum to capacity', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: WALK_IN_SCHEDULES_RESP })
    );
    await gotoSellPage(page);

    const tripRow = page.locator('.trip-row').first();
    await tripRow.waitFor({ timeout: 10_000 });

    // License plate and driver name displayed
    await expect(tripRow).toContainText('TH-8888');
    await expect(tripRow).toContainText('Somchai Driver');

    // Three badge counts: 18 available, 1 reserved, 2 sold
    // availableCount=18, reservedUnpaidCount=1, soldPaidCount=2 → sum=21=capacity
    await expect(tripRow).toContainText('18');
    await expect(tripRow).toContainText('1');
    await expect(tripRow).toContainText('2');

    // Verify badge elements explicitly
    const badges = tripRow.locator('.badge');
    await expect(badges).toHaveCount(3, { timeout: 5_000 });
  });

  // ── AC-4  Seat map reflects trip; taken seats not selectable ─────────────

  test('AC-4: selecting a BUS trip shows seat map; seat absent from availableSeatNumbers is taken', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: WALK_IN_SCHEDULES_RESP })
    );
    await gotoSellPage(page);

    // Click the first trip row to select it
    const tripRow = page.locator('.trip-row').first();
    await tripRow.waitFor({ timeout: 10_000 });
    await tripRow.click();

    // Center panel shows seat map (bus: app-passenger-seat-bus)
    await expect(page.locator('app-passenger-seat-bus')).toBeVisible({ timeout: 15_000 });

    // B3 is absent from availableSeatNumbers (digits 1..21 minus {3,4,5})
    // The center panel's takenSeats complement logic maps absent digit → B-label
    // B3 (digit 3) should have .disabled class
    const seatB3 = page.getByText('B3', { exact: true });
    await seatB3.waitFor({ timeout: 10_000 });
    await expect(seatB3).toHaveClass(/disabled/, { timeout: 5_000 });

    // B1 is available (digit 1 present)
    const seatB1 = page.getByText('B1', { exact: true });
    await expect(seatB1).not.toHaveClass(/disabled/);
  });

  test('AC-4 VAN edge: sold-out VAN (availableSeatNumbers=[]) → all seats non-selectable', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: SOLDOUT_VAN_RESP })
    );
    await gotoSellPage(page);

    const tripRow = page.locator('.trip-row').first();
    await tripRow.waitFor({ timeout: 10_000 });
    await tripRow.click();

    // VAN seat map renders
    await expect(page.locator('app-passenger-seat-van')).toBeVisible({ timeout: 15_000 });

    // With availableSeatNumbers=[], the takenSeats complement for BUS would return
    // all bus labels. For VAN the isSeatAvailable uses availableSeatNumbers directly.
    // When the list is empty NO seat should be selectable → all seats have .taken or
    // .disabled class on the van component cells.
    // The Sell button must stay disabled because no seat can be selected.
    const sellBtn = page.locator('button.btn-success');
    await expect(sellBtn).toBeDisabled({ timeout: 5_000 });
  });

  // ── AC-5  Customer form: 4 required fields; no gender; Sell disabled until valid ─

  test('AC-5: Sell button disabled until all 4 required fields valid AND seat selected AND cash sufficient', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: WALK_IN_SCHEDULES_RESP })
    );
    await gotoSellPage(page);

    const sellBtn = page.locator('button.btn-success');

    // Initially disabled (no seat, no form data)
    await expect(sellBtn).toBeDisabled({ timeout: 10_000 });

    // Select trip and seat
    await page.locator('.trip-row').first().waitFor({ timeout: 10_000 });
    await page.locator('.trip-row').first().click();
    const seatB1 = page.getByText('B1', { exact: true });
    await seatB1.waitFor({ timeout: 12_000 });
    await seatB1.click();

    // Still disabled (no contact form filled)
    await expect(sellBtn).toBeDisabled();

    // Fill contact form
    await fillContactForm(page);

    // Still disabled (cash received = 0, total = 350)
    await expect(sellBtn).toBeDisabled();

    // Enter sufficient cash
    await page.locator('input[type="number"]').fill('400');

    // Now enabled
    await expect(sellBtn).not.toBeDisabled({ timeout: 5_000 });
  });

  test('AC-5: no gender field in checkout form', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: WALK_IN_SCHEDULES_RESP })
    );
    await gotoSellPage(page);

    // Gender field must not exist anywhere on the sell page
    await expect(page.locator('select[formControlName="gender"]')).toHaveCount(0);
    await expect(page.locator('input[formControlName="gender"]')).toHaveCount(0);
  });

  // ── AC-6  Booking payload: no gender, one contact block, valid passengerType ─

  test('AC-6: booking POST has no gender, one contact block, passengerType=male, totalAmount>0 (WI-A)', async ({ page }) => {
    let capturedBookingPayload: Record<string, unknown> | null = null;

    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: WALK_IN_SCHEDULES_RESP })
    );
    await page.route(BOOKINGS_ENDPOINT, async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      capturedBookingPayload = body;
      await route.fulfill({ status: 201, json: BOOKING_RESP });
    });
    await page.route(PAYMENT_ENDPOINT, (route) =>
      route.fulfill({ json: PAYMENT_RESP })
    );

    await gotoSellPage(page);

    // Select trip and seat B1
    await page.locator('.trip-row').first().waitFor({ timeout: 10_000 });
    await page.locator('.trip-row').first().click();
    const seatB1 = page.getByText('B1', { exact: true });
    await seatB1.waitFor({ timeout: 12_000 });
    await seatB1.click();

    // Fill contact form
    await fillContactForm(page);

    // Enter cash >= total (350)
    await page.locator('input[type="number"]').fill('400');

    // Click Sell
    await page.locator('button.btn-success').click();

    // Wait for navigation to e-ticket
    await page.waitForURL('**/e-ticket**', { timeout: 20_000 });

    // Verify captured payload
    expect(capturedBookingPayload).not.toBeNull();

    const payload = capturedBookingPayload!;

    // WI-A: totalAmount > 0
    expect(Number(payload['totalAmount'])).toBeGreaterThan(0);

    // AC-6: booking channel
    expect(payload['bookingChannel']).toBe('walk_in');

    // AC-6: no top-level gender
    expect(payload).not.toHaveProperty('gender');

    // AC-6: one contact block (not array)
    expect(payload['contact']).toBeDefined();
    expect(Array.isArray(payload['contact'])).toBe(false);

    // AC-6: a valid passenger_type lookup slug on each passenger (male); the old
    // 'ADULT' value resolved to no lookup and 404'd every walk-in sale.
    const depSchedule = payload['departureSchedule'] as { passengers: Array<Record<string, unknown>> };
    expect(depSchedule.passengers.length).toBeGreaterThanOrEqual(1);
    for (const p of depSchedule.passengers) {
      expect(p['passengerType']).toBe('male');
      expect(p).not.toHaveProperty('gender');
    }
  });

  // ── AC-7  Payment tiles: cash active; PromptPay/credit disabled ───────────

  test('AC-7: cash tile is active; PromptPay and credit tiles are disabled with "Coming Soon"', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: WALK_IN_SCHEDULES_RESP })
    );
    await gotoSellPage(page);

    // Cash tile: success styling
    const cashTile = page.locator('.payment-tile').filter({ hasText: 'Cash' });
    await expect(cashTile).toBeVisible({ timeout: 10_000 });
    await expect(cashTile).toHaveClass(/border-success/);

    // PromptPay tile: disabled, "Coming soon"
    const promptPayTile = page.locator('.payment-tile').filter({ hasText: 'PromptPay' });
    await expect(promptPayTile).toBeVisible();
    await expect(promptPayTile).toHaveAttribute('aria-disabled', 'true');
    await expect(promptPayTile.locator('.badge')).toContainText('Coming Soon', { ignoreCase: true });

    // Credit tile: disabled, "Coming soon"
    const creditTile = page.locator('.payment-tile').filter({ hasText: 'Credit Card' });
    await expect(creditTile).toBeVisible();
    await expect(creditTile).toHaveAttribute('aria-disabled', 'true');
    await expect(creditTile.locator('.badge')).toContainText('Coming Soon', { ignoreCase: true });
  });

  test('AC-7: no Omise-related DOM element exists on the sell page', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: EMPTY_RESP })
    );
    await gotoSellPage(page);

    // Omise checkout script or button class
    await expect(page.locator('[data-omise]')).toHaveCount(0);
    await expect(page.locator('.omise-checkout')).toHaveCount(0);
  });

  // ── AC-8  Change due = received − total; Sell disabled when received < total ─

  test('AC-8: change due reflects cash received minus total amount live', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: WALK_IN_SCHEDULES_RESP })
    );
    await gotoSellPage(page);

    // Select trip and seat to get a total > 0
    await page.locator('.trip-row').first().waitFor({ timeout: 10_000 });
    await page.locator('.trip-row').first().click();
    const seatB1 = page.getByText('B1', { exact: true });
    await seatB1.waitFor({ timeout: 12_000 });
    await seatB1.click();

    await fillContactForm(page);

    // Enter less than total (350): received=300
    const cashInput = page.locator('input[type="number"]');
    await cashInput.fill('300');

    // Change due should be negative (300 - 350 = -50)
    const changeDue = page.locator('[aria-live="polite"] .fw-semibold');
    await expect(changeDue).toHaveClass(/text-danger/, { timeout: 5_000 });

    // Sell still disabled
    await expect(page.locator('button.btn-success')).toBeDisabled();

    // Enter exact amount: change=0 → enabled
    await cashInput.fill('350');
    await expect(page.locator('button.btn-success')).not.toBeDisabled({ timeout: 3_000 });

    // Enter more: change positive
    await cashInput.fill('500');
    await expect(changeDue).toHaveClass(/text-success/, { timeout: 3_000 });
  });

  // ── AC-9  Successful sale → trips list refreshes ─────────────────────────

  test('AC-9: successful Sell calls payWalkIn and navigates to /e-ticket', async ({ page }) => {
    let walkInCallCount = 0;

    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) => {
      walkInCallCount++;
      route.fulfill({ json: WALK_IN_SCHEDULES_RESP });
    });
    await page.route(BOOKINGS_ENDPOINT, (route) =>
      route.fulfill({ status: 201, json: BOOKING_RESP })
    );
    await page.route(PAYMENT_ENDPOINT, (route) =>
      route.fulfill({ json: PAYMENT_RESP })
    );

    await gotoSellPage(page);
    const initialCallCount = walkInCallCount;

    // Select trip and seat
    await page.locator('.trip-row').first().waitFor({ timeout: 10_000 });
    await page.locator('.trip-row').first().click();
    const seatB1 = page.getByText('B1', { exact: true });
    await seatB1.waitFor({ timeout: 12_000 });
    await seatB1.click();

    await fillContactForm(page);
    await page.locator('input[type="number"]').fill('400');

    await page.locator('button.btn-success').click();

    // Navigates to e-ticket on success
    await page.waitForURL('**/e-ticket**', { timeout: 20_000 });

    // Walk-in schedules were reloaded after payment (badge refresh — AC-9)
    expect(walkInCallCount).toBeGreaterThan(initialCallCount);
  });

  // ── AC-10  Center panel: 3 tabs ───────────────────────────────────────────

  test('AC-10: center panel shows 3 tabs after trip selection', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: WALK_IN_SCHEDULES_RESP })
    );
    await gotoSellPage(page);

    // Select trip
    await page.locator('.trip-row').first().waitFor({ timeout: 10_000 });
    await page.locator('.trip-row').first().click();

    // p-tabView appears with 3 tabs
    await expect(page.locator('p-tabview')).toBeVisible({ timeout: 10_000 });

    // PrimeNG tabview: 3 li[role="presentation"] for real tabs + 1 ink-bar li[aria-hidden="true"].
    // The real tab anchors have role="tab" inside each presentation li.
    await expect(page.locator('.p-tabview-nav a[role="tab"]')).toHaveCount(3, { timeout: 5_000 });

    // Tab labels
    await expect(page.locator('.p-tabview-nav')).toContainText('Ticket Sales');
    await expect(page.locator('.p-tabview-nav')).toContainText('Trip Details');
    await expect(page.locator('.p-tabview-nav')).toContainText('Boarding');
  });

  test('AC-10: Trip Details tab shows license plate and driver name', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: WALK_IN_SCHEDULES_RESP })
    );
    await gotoSellPage(page);

    await page.locator('.trip-row').first().waitFor({ timeout: 10_000 });
    await page.locator('.trip-row').first().click();

    // Click Trip Details tab
    await page.locator('.p-tabview-nav').getByText('Trip Details').click();

    // Trip details show plate and driver
    await expect(page.locator('dd', { hasText: 'TH-8888' })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('dd', { hasText: 'Somchai Driver' })).toBeVisible({ timeout: 5_000 });
  });

  // ── AC-11  i18n keys exist in all 3 locales (static check via mocked API) ─

  test('AC-11: required STAFF.SELL i18n keys are present in all three locale files', async ({ page }) => {
    // This test statically loads each locale JSON and verifies key presence.
    // It does NOT navigate to /staff/sell — purely a file-level assertion.
    const requiredKeys = [
      'BADGE_AVAILABLE', 'BADGE_RESERVED', 'BADGE_SOLD',
      'TRIPS_EMPTY', 'CENTER_EMPTY',
      'TAB_TICKET_SALES', 'TAB_TRIP_DETAILS', 'TAB_BOARDING',
      'PAYMENT_CASH', 'PAYMENT_PROMPTPAY', 'PAYMENT_CREDIT', 'COMING_SOON',
      'CASH_RECEIVED', 'CHANGE_DUE', 'SELL_BTN', 'SELLING',
      'PASSENGER_TITLE', 'FIRST_NAME', 'LAST_NAME', 'PHONE', 'ID_CARD',
      'OPTIONAL', 'TOTAL_AMOUNT',
    ];

    const locales = ['en', 'th', 'zh'];

    for (const locale of locales) {
      const resp = await page.request.get(`http://localhost:4200/i18n/${locale}.json`);
      expect(resp.status()).toBe(200);
      const data = await resp.json() as { STAFF?: { SELL?: Record<string, string> } };
      const sellKeys = Object.keys(data?.STAFF?.SELL ?? {});

      for (const key of requiredKeys) {
        expect(sellKeys, `locale=${locale} missing STAFF.SELL.${key}`).toContain(key);
      }
    }
  });

  // ── WI-G  No resolvable segment fare → Sell stays disabled ────────────────
  // Price now comes from the chosen pickup→drop-off segment, not the trip's
  // full-route pricePerSeat. When the route exposes no stop pairs, pickup/
  // drop-off cannot resolve, the total is 0, and Sell must stay disabled —
  // guarding against a zero-amount sale (the spirit of the old null-price guard).

  test('WI-G: route with no stop pairs → pickup/drop-off empty, Sell stays disabled', async ({ page }) => {
    // Override the default segments mock with an empty stop-pair list.
    await page.route(SEGMENTS_ENDPOINT, (route) => route.fulfill({ json: SEGMENTS_EMPTY_RESP }));
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: NULL_PRICE_RESP })
    );
    await gotoSellPage(page);

    // Trip is shown in the list
    await expect(page.locator('.trip-row')).toBeVisible({ timeout: 10_000 });

    // Select trip and a seat
    await page.locator('.trip-row').first().click();
    const seatB1 = page.getByText('B1', { exact: true });
    await seatB1.waitFor({ timeout: 12_000 });
    await seatB1.click();

    // Fill contact form
    await fillContactForm(page);

    // Enter cash
    await page.locator('input[type="number"]').fill('999');

    // Sell must remain disabled because no segment fare resolves (totalAmount = 0)
    await expect(page.locator('button.btn-success')).toBeDisabled({ timeout: 3_000 });
  });

  // ── WI-A integration guard: idempotency key is sent with payment ──────────

  test('WI-A: Idempotency-Key header is sent with the walk-in payment request', async ({ page }) => {
    let capturedIdempotencyKey: string | null = null;

    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: WALK_IN_SCHEDULES_RESP })
    );
    await page.route(BOOKINGS_ENDPOINT, (route) =>
      route.fulfill({ status: 201, json: BOOKING_RESP })
    );
    await page.route(PAYMENT_ENDPOINT, (route) => {
      capturedIdempotencyKey = route.request().headers()['idempotency-key'] ?? null;
      route.fulfill({ json: PAYMENT_RESP });
    });

    await gotoSellPage(page);

    await page.locator('.trip-row').first().waitFor({ timeout: 10_000 });
    await page.locator('.trip-row').first().click();
    const seatB1 = page.getByText('B1', { exact: true });
    await seatB1.waitFor({ timeout: 12_000 });
    await seatB1.click();

    await fillContactForm(page);
    await page.locator('input[type="number"]').fill('400');
    await page.locator('button.btn-success').click();

    await page.waitForURL('**/e-ticket**', { timeout: 20_000 });

    // Idempotency key must be a valid UUID v4
    expect(capturedIdempotencyKey).toBeTruthy();
    expect(capturedIdempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  // ── Full happy-path flow ───────────────────────────────────────────────────

  test('Full happy path: select date → trip → seat → fill form → cash → Sell → /e-ticket', async ({ page }) => {
    let bookingPayload: Record<string, unknown> | null = null;

    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: WALK_IN_SCHEDULES_RESP })
    );
    await page.route(BOOKINGS_ENDPOINT, async (route) => {
      bookingPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 201, json: BOOKING_RESP });
    });
    await page.route(PAYMENT_ENDPOINT, (route) =>
      route.fulfill({ json: PAYMENT_RESP })
    );

    await gotoSellPage(page);

    // Trip browser shows route group and trip row
    await expect(page.locator('.route-group-header')).toBeVisible({ timeout: 10_000 });

    // Select the first trip
    await page.locator('.trip-row').first().click();

    // Seat map loads
    await expect(page.locator('app-passenger-seat-bus')).toBeVisible({ timeout: 15_000 });

    // Select B1
    const seatB1 = page.getByText('B1', { exact: true });
    await seatB1.waitFor({ timeout: 10_000 });
    await seatB1.click();

    // Fill checkout form
    await fillContactForm(page);

    // Enter cash
    await page.locator('input[type="number"]').fill('400');

    // Change due = 400 - 350 = 50 → positive, green
    await expect(page.locator('[aria-live="polite"] .fw-semibold')).toHaveClass(/text-success/, { timeout: 3_000 });

    // Sell
    await page.locator('button.btn-success').click();

    // Navigates to /e-ticket
    await page.waitForURL('**/e-ticket**', { timeout: 20_000 });

    // Verify booking payload correctness (WI-A, WI-B, AC-6)
    expect(bookingPayload).not.toBeNull();
    expect(bookingPayload!['totalAmount']).toBe(350);
    expect(bookingPayload!['bookingChannel']).toBe('walk_in');
    expect(bookingPayload!['bookingType']).toBe('one_way');
    const dep = bookingPayload!['departureSchedule'] as { scheduleId: number; passengers: Array<Record<string, unknown>> };
    expect(dep.scheduleId).toBe(201);
    expect(dep.passengers[0]['seatNumber']).toBeDefined();
    expect(dep.passengers[0]['passengerType']).toBe('male');
    expect(dep.passengers[0]).not.toHaveProperty('gender');
  });

  // ── Layout regression (issue #41): POS fits viewport, no full-page scroll ───
  // The 3-column POS is viewport-bound: only the columns scroll, never the page.
  // Regression for `.pos-layout { height: calc(100vh - 120px) }` undershooting the
  // real chrome (~212px), which pushed the layout past 100vh and scrolled the page.

  test('Layout: /staff/sell fits the viewport with no full-page vertical scroll at desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: WALK_IN_SCHEDULES_RESP })
    );
    await gotoSellPage(page);

    // Select a trip so the full seat map renders — this is the tall content that
    // used to overflow the page.
    await page.locator('.trip-row').first().click();
    await expect(page.locator('app-passenger-seat-bus')).toBeVisible({ timeout: 15_000 });

    // The document must not scroll: all chrome + the 3-column layout fits the viewport.
    const pageOverflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollHeight - doc.clientHeight;
    });
    expect(pageOverflow, 'page must not overflow the viewport (issue #41)').toBeLessThanOrEqual(1);

    // Control — the fix must PRESERVE independent per-column scrolling: the center
    // column (seat map) still scrolls inside its own card, not via the page.
    const centerBody = page.locator('.card-body:has(app-walk-in-center-panel)');
    const centerScrollable = await centerBody.evaluate(
      (el) => el.scrollHeight > el.clientHeight
    );
    expect(centerScrollable, 'center column should scroll internally, not the page').toBe(true);
  });

  // ── Header regression (issue #42): page title shown once, not duplicated ────
  // The staff layout topbar renders the per-route title; the in-page <h4> that
  // duplicated it has been removed. "Walk-in Sales" must appear as exactly one
  // heading (the topbar), not two.

  test('Layout: /staff/sell shows the page title only once (no duplicate in-page heading)', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: EMPTY_RESP })
    );
    await gotoSellPage(page);
    await expect(page.getByRole('heading', { name: 'Walk-in Sales' })).toHaveCount(1);
  });

  // ── Topbar subtitle is route-driven (mirrors admin) ─────────────────────────
  test('Layout: topbar shows the route-specific subtitle on /staff/sell', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: EMPTY_RESP })
    );
    await gotoSellPage(page);
    await expect(page.locator('.admin-topbar')).toContainText('Sell tickets to walk-in customers');
  });

  // ── Date picker matches the home booking calendar (issue #52) ───────────────
  // The picker now uses the home pattern: iconDisplay="input" renders the calendar
  // icon INSIDE the field (no separate trailing trigger button). Guards both the
  // in-input icon's presence and that the input still fills its container — the
  // latter is the original "not crushed into a sliver / blue strip" regression.
  test('Layout: date picker shows the in-input calendar icon and a full-width input', async ({ page }) => {
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: EMPTY_RESP })
    );
    await gotoSellPage(page);
    // Home-parity in-input calendar icon is rendered inside the field.
    await expect(page.locator('.trip-browser-calendar .calendar-icon')).toBeVisible();
    // The date input fills its container (not crushed into a sliver).
    const input = page.locator('.trip-browser-calendar input.p-inputtext');
    await expect(input).toBeVisible();
    const box = await input.boundingBox();
    expect(box!.width, 'calendar input should fill its container, not be crushed').toBeGreaterThan(120);
  });

  // ── Sell button reachable without scrolling the checkout card (sticky footer) ─
  test('Layout: Sell button is visible without scrolling the checkout card', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: EMPTY_RESP })
    );
    await gotoSellPage(page);
    const sell = page.locator('button.btn-success');
    await expect(sell).toBeVisible();
    // The checkout card scrolls; the action footer is sticky, so at scrollTop=0 the
    // Sell button must already sit within the card-body's visible rect.
    const inView = await sell.evaluate((btn) => {
      const body = btn.closest('.card-body');
      if (!body) return false;
      const b = btn.getBoundingClientRect();
      const c = body.getBoundingClientRect();
      return b.height > 0 && b.bottom <= c.bottom + 1 && b.top >= c.top - 1;
    });
    expect(inView, 'Sell button should be in view without scrolling').toBe(true);
  });

  // ── No dead seat-map fetch on trip selection (issue: 404 on /…/seats) ───────
  // Seat availability comes from the walk-in trip DTO; selecting a trip must NOT
  // fire the old GET /api/public/schedules/{id}/seats (which 404'd) and the seat
  // map must still render.
  test('Layout: selecting a trip renders the seat map without a separate seat fetch', async ({ page }) => {
    let seatsRequested = 0;
    await page.route('**/schedules/*/seats', (route) => {
      seatsRequested++;
      route.fulfill({ status: 404, json: {} });
    });
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) =>
      route.fulfill({ json: WALK_IN_SCHEDULES_RESP })
    );
    await gotoSellPage(page);
    await page.locator('.trip-row').first().click();
    await expect(page.locator('app-passenger-seat-bus')).toBeVisible({ timeout: 15_000 });
    expect(seatsRequested, 'no separate seat-map fetch should fire').toBe(0);
  });
});

// =============================================================================
// Multi-stop pickup/drop-off — the selected stop must be VISIBLY highlighted
// -----------------------------------------------------------------------------
// Regression: the From/To stop buttons use Bootstrap's .list-group-item/.active
// classes but were NOT wrapped in a .list-group. In Bootstrap 5.3 the active
// theme is driven by CSS custom properties (--bs-list-group-active-bg/-color)
// that are *declared on .list-group*; without that wrapper they are unset, so
// the .active stop rendered with a transparent background — no visible
// selection. Staff reported the pickup/drop-off points as unselectable
// ("can't choose"), even though the click logic worked. The lists are now
// .list-group, so .active paints the blue highlight and clicking moves it.
//
// The AC suite above only mocks a single-pair route (origin→dest, one option
// each), so multi-stop selection — and therefore this defect — was never
// exercised. This test uses a 4-stop route to guard it.
// =============================================================================

const MS = (slug: string, name: string) => ({ slug, name });
const [STOP_A, STOP_B, STOP_C, STOP_D] = [
  MS('a', 'Stop A'), MS('b', 'Stop B'), MS('c', 'Stop C'), MS('d', 'Stop D'),
];
const MS_BUS_VT = { slug: 'bus', name: 'Bus' };
const msPair = (
  fromStop: { slug: string; name: string },
  toStop: { slug: string; name: string },
  fare: string,
  estimatedDurationMinutes: number,
  segmentId: number
) => ({ segmentId, fromStop, toStop, vehicleType: MS_BUS_VT, fare, estimatedDurationMinutes });

/** A linear 4-stop bus route (A→B→C→D) with a fare for every downstream pair. */
const MULTI_STOP_SEGMENTS_RESP = {
  code: 200,
  message: 'OK',
  data: {
    route: { slug: 'route', name: 'Route' },
    stopPairs: [
      msPair(STOP_A, STOP_B, '50.00', 15, 1),
      msPair(STOP_B, STOP_C, '200.00', 90, 2),
      msPair(STOP_C, STOP_D, '30.00', 14, 3),
      msPair(STOP_A, STOP_C, '250.00', 105, 4),
      msPair(STOP_A, STOP_D, '280.00', 120, 5),
      msPair(STOP_B, STOP_D, '230.00', 104, 6),
    ],
  },
};

// =============================================================================
// Stop filter — AC per walkin-stop-search feature
// =============================================================================
// Criterion 10: typing narrows a list, no-match hint appears, clearing restores
// the list, and selecting a filtered stop still completes the walk-in flow.
// =============================================================================

test.describe('Stop filter — searchable input above จาก/ถึง lists', () => {
  test.use({ storageState: ADMIN_AUTH });

  test.beforeEach(async ({ page }) => {
    await page.route(SEGMENTS_ENDPOINT, (route) => route.fulfill({ json: MULTI_STOP_SEGMENTS_RESP }));
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) => route.fulfill({ json: WALK_IN_SCHEDULES_RESP }));
  });

  /** Helper: open the sell page and click the first trip to show the stop lists. */
  async function openWithStops(page: import('@playwright/test').Page): Promise<void> {
    await gotoSellPage(page);
    await page.locator('.trip-row').first().waitFor({ timeout: 10_000 });
    await page.locator('.trip-row').first().click();
    // Wait for the stop lists to appear (pickup list has at least one button).
    const fromList = page.locator('app-walk-in-center-panel .stop-list').nth(0);
    await fromList.locator('button').first().waitFor({ timeout: 15_000 });
  }

  test('typing in the From filter narrows the pickup list', async ({ page }) => {
    await openWithStops(page);

    const fromList = page.locator('app-walk-in-center-panel .stop-list').nth(0);
    const fromFilter = page.locator('app-walk-in-center-panel .input-group').nth(0).locator('input');

    // Before filtering, multiple options are visible.
    const countBefore = await fromList.locator('button').count();
    expect(countBefore).toBeGreaterThan(1);

    // Type a query that matches only "Stop B".
    await fromFilter.fill('Stop B');
    const countAfter = await fromList.locator('button').count();
    expect(countAfter).toBeLessThan(countBefore);
    expect(countAfter).toBeGreaterThanOrEqual(1);
    await expect(fromList.locator('button').first()).toContainText('Stop B');
  });

  test('no-match hint appears when the filter excludes every option', async ({ page }) => {
    await openWithStops(page);

    const fromFilter = page.locator('app-walk-in-center-panel .input-group').nth(0).locator('input');
    await fromFilter.fill('zzznomatch999');

    // No stop buttons remain.
    const fromList = page.locator('app-walk-in-center-panel .stop-list').nth(0);
    await expect(fromList.locator('button')).toHaveCount(0);

    // The no-match hint is visible somewhere inside the stop-list.
    // We match on a locator that is a div inside the list (not a button).
    await expect(fromList.locator('div')).toBeVisible({ timeout: 5_000 });
  });

  test('clearing the filter restores the full list', async ({ page }) => {
    await openWithStops(page);

    const fromList = page.locator('app-walk-in-center-panel .stop-list').nth(0);
    const fromFilter = page.locator('app-walk-in-center-panel .input-group').nth(0).locator('input');

    const countFull = await fromList.locator('button').count();

    await fromFilter.fill('zzznomatch999');
    await expect(fromList.locator('button')).toHaveCount(0);

    // Clear via the clear button (×).
    const clearBtn = page.locator('app-walk-in-center-panel .input-group').nth(0).locator('button');
    await clearBtn.click();

    // List is restored.
    await expect(fromList.locator('button')).toHaveCount(countFull, { timeout: 3_000 });
  });

  test('From and To filters are independent — filtering one does not affect the other', async ({ page }) => {
    await openWithStops(page);

    const fromList = page.locator('app-walk-in-center-panel .stop-list').nth(0);
    const toList = page.locator('app-walk-in-center-panel .stop-list').nth(1);
    const fromFilter = page.locator('app-walk-in-center-panel .input-group').nth(0).locator('input');

    const toCountBefore = await toList.locator('button').count();

    // Filter the From list down to nothing.
    await fromFilter.fill('zzznomatch999');
    await expect(fromList.locator('button')).toHaveCount(0);

    // To list is unaffected.
    await expect(toList.locator('button')).toHaveCount(toCountBefore);
  });

  test('selecting a filtered stop still emits the selection (AC-10 Criterion 7)', async ({ page }) => {
    await page.route(BOOKINGS_ENDPOINT, (route) =>
      route.fulfill({ status: 201, json: BOOKING_RESP })
    );
    await page.route(PAYMENT_ENDPOINT, (route) =>
      route.fulfill({ json: PAYMENT_RESP })
    );

    await openWithStops(page);

    const fromList = page.locator('app-walk-in-center-panel .stop-list').nth(0);
    const toList = page.locator('app-walk-in-center-panel .stop-list').nth(1);
    const fromFilter = page.locator('app-walk-in-center-panel .input-group').nth(0).locator('input');
    const toFilter = page.locator('app-walk-in-center-panel .input-group').nth(1).locator('input');

    // Filter From list to show only "Stop A" and click it.
    await fromFilter.fill('Stop A');
    await fromList.locator('button').first().click();
    await expect(fromList.locator('button.active')).toHaveCount(1);

    // Filter To list and click the first visible option.
    await toFilter.fill('Stop D');
    await toList.locator('button').first().waitFor({ timeout: 5_000 });
    await toList.locator('button').first().click();
    await expect(toList.locator('button.active')).toHaveCount(1);

    // The seat map and checkout flow still work — pick a seat and complete the sale.
    const seatB1 = page.getByText('B1', { exact: true });
    await seatB1.waitFor({ timeout: 12_000 });
    await seatB1.click();

    await fillContactForm(page);
    await page.locator('input[type="number"]').fill('400');

    const sellBtn = page.locator('button.btn-success');
    await expect(sellBtn).not.toBeDisabled({ timeout: 5_000 });
  });
});

/** A Bootstrap-transparent background means the .active highlight is invisible. */
function isVisibleHighlight(bg: string): boolean {
  return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
}

test.describe('Multi-stop pickup/drop-off — selected stop is visibly highlighted', () => {
  test('default + clicked From stop have a visible (non-transparent) highlight', async ({ page }) => {
    await injectFakeAuth(page, ['admin']);
    await page.route(SEGMENTS_ENDPOINT, (route) => route.fulfill({ json: MULTI_STOP_SEGMENTS_RESP }));
    await page.route(WALK_IN_SCHEDULES_ENDPOINT, (route) => route.fulfill({ json: WALK_IN_SCHEDULES_RESP }));

    await gotoSellPage(page);
    await page.locator('.trip-row').first().click();

    const fromList = page.locator('app-walk-in-center-panel .stop-list').nth(0);
    await fromList.locator('button').first().waitFor({ timeout: 15_000 });

    // Pickup options = every stop except the final destination → A, B, C.
    await expect(fromList.locator('button')).toHaveCount(3);

    // The default pickup (Stop A) is active AND visibly highlighted (the bug:
    // .active was applied but rendered transparent → looked unselected).
    const activeFrom = fromList.locator('button.active');
    await expect(activeFrom).toHaveCount(1);
    const defaultBg = await activeFrom.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(isVisibleHighlight(defaultBg), `active stop must be highlighted, got ${defaultBg}`).toBe(true);

    // Choosing a different pickup moves the visible highlight to it (and only it).
    const secondOption = fromList.locator('button').nth(1);
    await secondOption.click();
    await expect(secondOption).toHaveClass(/active/);
    const secondBg = await secondOption.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(isVisibleHighlight(secondBg), `clicked stop must be highlighted, got ${secondBg}`).toBe(true);
    await expect(fromList.locator('button.active')).toHaveCount(1);
  });
});
