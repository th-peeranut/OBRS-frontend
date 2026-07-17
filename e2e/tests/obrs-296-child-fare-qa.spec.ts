import { test, expect } from '@playwright/test';

// OBRS-296 QA (Tier 2 — FE served against a stubbed booking-tickets response;
// live local BE+PG was unavailable in-box due to a Docker Desktop crash mid-run).
// Proves the e-ticket UI surface: fare-category badge + child-fare boarding note
// (acceptance criterion #4). Money/flag correctness (criteria #1-3) is proven by
// ChildFareBookingIT (6/6) and ChildFareFlagIT (7/7) — see QA report.

const adultOnlyTickets = {
  code: 200,
  data: {
    bookingId: 5001,
    bookingNumber: 'CF-BEFORE-5001',
    bookingStatus: 'confirmed',
    totalTickets: 1,
    contactPhoneNumber: '0812345678',
    totalAmount: 300,
    journeys: [
      {
        legType: { code: 'outbound', label: 'Outbound' },
        fromStop: { code: 'a', label: 'Nong Sak' },
        toStop: { code: 'b', label: 'Bangkok' },
        departureDateTime: '2030-03-01T08:00:00+07:00',
        arrivalDateTime: '2030-03-01T08:30:00+07:00',
        vehicle: {
          vehicleType: { code: 'minibus', label: 'Minibus' },
          numberPlate: '1กก1234',
          vehicleNumber: 'MB-01',
        },
        tickets: [
          {
            id: 1,
            ticketNumber: 'TCK-0001',
            passengerName: 'Mr. Somchai Jaidee',
            seatNumber: 'A1',
            status: { code: 'confirmed', label: 'Confirmed' },
            fareCategory: 'adult',
          },
        ],
      },
    ],
  },
};

const adultPlusChildTickets = {
  code: 200,
  data: {
    bookingId: 5002,
    bookingNumber: 'CF-AFTER-5002',
    bookingStatus: 'confirmed',
    totalTickets: 2,
    contactPhoneNumber: '0812345678',
    totalAmount: 450, // gross: 300 (adult) + 150 (child snapshot-priced at adult fare 300, discount 150) — server sends gross total per SA contract
    journeys: [
      {
        legType: { code: 'outbound', label: 'Outbound' },
        fromStop: { code: 'a', label: 'Nong Sak' },
        toStop: { code: 'b', label: 'Bangkok' },
        departureDateTime: '2030-03-01T08:00:00+07:00',
        arrivalDateTime: '2030-03-01T08:30:00+07:00',
        vehicle: {
          vehicleType: { code: 'minibus', label: 'Minibus' },
          numberPlate: '1กก1234',
          vehicleNumber: 'MB-01',
        },
        tickets: [
          {
            id: 1,
            ticketNumber: 'TCK-0001',
            passengerName: 'Mr. Somchai Jaidee',
            seatNumber: 'A1',
            status: { code: 'confirmed', label: 'Confirmed' },
            fareCategory: 'adult',
          },
          {
            id: 2,
            ticketNumber: 'TCK-0002',
            passengerName: 'Master Nong Jaidee',
            seatNumber: 'A2',
            status: { code: 'confirmed', label: 'Confirmed' },
            fareCategory: 'child',
          },
        ],
      },
    ],
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
  });
  // /e-ticket has customerArea:true with no requireAuth — guests may view it,
  // so no auth_token is needed. Only the active booking id is required for
  // ETicketComponent.getBookingId() to fall back correctly.
  await page.route('**/api/private/rest/province-station*', (route) =>
    route.fulfill({ json: { code: 200, data: [] } })
  );
  await page.route('**/api/**/province*', (route) =>
    route.fulfill({ json: { code: 200, data: [] } })
  );
  await page.route('**/boarding-token**', (route) =>
    route.fulfill({ json: { code: 200, data: { qrDataUrl: '' } } })
  );
});

test('BEFORE: adult-only e-ticket baseline (no child, no fare-category note)', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('active_booking_id', '5001');
  });
  await page.route('**/api/private/bookings/5001/tickets', (route) =>
    route.fulfill({ json: adultOnlyTickets })
  );

  await page.goto('/e-ticket');
  await expect(page.locator('.ticket-card-number')).toHaveText('TCK-0001');
  await expect(page.locator('.ticket-card')).toHaveCount(1);
  // No child-fare-note should render for an adult-only booking.
  await expect(page.locator('.child-fare-note')).toHaveCount(0);

  await page.screenshot({
    path: 'C:/Users/thpee/Desktop/workshop/obrs-agent-office/docs/manual-tests/assets/OBRS-296/before-adult-booking.png',
    fullPage: true,
  });
});

test('AFTER: adult + child e-ticket shows child fare-category badge and boarding note', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('active_booking_id', '5002');
  });
  await page.route('**/api/private/bookings/5002/tickets', (route) =>
    route.fulfill({ json: adultPlusChildTickets })
  );

  await page.goto('/e-ticket');
  await expect(page.locator('.ticket-card')).toHaveCount(2);

  const childCard = page.locator('.ticket-card').nth(1);
  await expect(childCard.locator('.ticket-card-number')).toHaveText('TCK-0002');
  // Child fare-category badge value renders in the passenger-field.
  await expect(childCard).toContainText('Child');
  // OBRS-296 boarding-check note only renders for fareCategory === 'child'.
  await expect(childCard.locator('.child-fare-note')).toHaveCount(1);

  const adultCard = page.locator('.ticket-card').nth(0);
  await expect(adultCard.locator('.child-fare-note')).toHaveCount(0);
  await expect(adultCard).toContainText('Adult');

  await page.screenshot({
    path: 'C:/Users/thpee/Desktop/workshop/obrs-agent-office/docs/manual-tests/assets/OBRS-296/after-child-discount.png',
    fullPage: true,
  });
});
