import { test, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { seedCustomerSession } from '../support/customer-pages';

/**
 * OBRS-1783 AC-4 — evidence for stating the OPEN-seating seat ONCE per trip on
 * the 80mm walk-in slip instead of once per passenger.
 *
 * Hermetic on the gate lane's terms (playwright.gate.config.ts, rule 1): every
 * `/api/**` call is fulfilled in-browser and the session is seeded from
 * addInitScript, so there is no backend, no database and no SIT. The page, its
 * SCSS and its print rules are the real ones -- only the booking is a fixture.
 *
 * THREE passengers, because "the same sentence N times" is what the card is
 * about and two lines do not show it.
 *
 * The BEFORE folder is taken by reverting the template and re-running with
 * OBRS1783_OUT pointed elsewhere -- same fixture, same paper, one change.
 */
const OUT_DIR = process.env['OBRS1783_OUT'] ?? 'captures/obrs-1783';

const PASSENGER_NAMES = ['นาย สมชาย ใจดี', 'นางสาว มาลี ศรีสุข', 'นาย ประยุทธ์ มั่นคง'];

/**
 * `seatNumber: null` is the only shape production can reach: no request DTO
 * carries `seatingMode` (only `seatingCapacity`), so every schedule created
 * through the app keeps the V10 column default 'OPEN', and on an OPEN schedule
 * `BookingService:713` forces `p.setSeatNumber(null)` over whatever the client
 * sent. The ASSIGNED arm below photographs the branch that is still in the code
 * and in the IT fixtures, to prove this card did not disturb it (AC-2).
 */
function ticketsResponse(seats: (string | null)[]) {
  return {
    code: 200,
    message: 'OK',
    data: {
      bookingId: 1,
      bookingNumber: 'BK-260909-0042',
      bookingStatus: 'confirmed',
      totalTickets: seats.length,
      journeys: [
        {
          legType: { code: 'outbound', label: 'ขาไป' },
          fromStop: { code: 'nong_chak', label: 'หนองชาก' },
          toStop: { code: 'bts_mo_chit', label: 'BTS หมอชิต' },
          departureDateTime: '2026-09-10 09:30:00',
          arrivalDateTime: '2026-09-10 12:10:00',
          vehicle: { vehicleType: { code: 'van', label: 'รถตู้' } },
          tickets: seats.map((seatNumber, i) => ({
            id: i + 1,
            ticketNumber: `T-260909-0042-${i + 1}`,
            passengerName: PASSENGER_NAMES[i],
            seatNumber,
            status: { code: 'confirmed', label: 'ยืนยันแล้ว' },
          })),
        },
      ],
    },
  };
}

const OPEN_TICKETS = ticketsResponse([null, null, null]);
const ASSIGNED_TICKETS = ticketsResponse(['12', '13', '14']);

const PAYMENTS_RESP = {
  code: 200,
  message: 'OK',
  data: {
    bookingId: 1,
    paymentSummary: {
      totalAmount: '480.00',
      paidAmount: '480.00',
      outstandingAmount: '0.00',
      currency: 'THB',
      status: 'paid',
    },
    transactions: [
      {
        paymentMethod: 'cash',
        amount: '480.00',
        currency: 'THB',
        status: 'paid',
        paidAt: '2026-09-09 09:12:00',
      },
    ],
  },
};

async function setUpSlip(page: Page, tickets: object) {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'e2e-fake-token');
    localStorage.setItem('auth_username', 'salesperson@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['salesperson']));
    localStorage.setItem('app_language', 'th');
  });

  await page.route('**/api/private/bookings/1/tickets', (route) =>
    route.fulfill({ json: tickets })
  );
  await page.route('**/api/private/bookings/1/payments', (route) =>
    route.fulfill({ json: PAYMENTS_RESP })
  );
  await page.route('**/api/private/tickets/*/boarding-token', (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const ticketId = Number(parts[parts.length - 2]);
    return route.fulfill({
      json: {
        code: 200,
        message: 'OK',
        data: {
          ticketId,
          ticketNumber: `T-260909-0042-${ticketId}`,
          boardingToken: `BT-260909-0042-${ticketId}`,
          expiresAt: '2026-09-10 09:30:00',
        },
      },
    });
  });
}

/** Waits for the slip to be fully painted: the QRs must be real images, or the
 *  shot is of placeholders rather than of the slip. */
async function settledPaper(page: Page, passengerCount: number) {
  const paper = page.locator('.receipt-paper');
  await paper.locator('.receipt-ticket-qr img.qr-code').nth(passengerCount - 1).waitFor();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  return paper;
}

test('OBRS-1783: OPEN seating states the seat once, beside the trip (80mm print)', async ({
  page,
}) => {
  await setUpSlip(page, OPEN_TICKETS);
  await page.goto('/staff/sell/receipt/1', { waitUntil: 'domcontentloaded' });
  const paper = await settledPaper(page, 3);

  await page.emulateMedia({ media: 'print' });
  await paper.screenshot({ path: path.join(OUT_DIR, 'slip-open-print.png') });

  await page.emulateMedia({ media: 'screen' });
  await paper.screenshot({ path: path.join(OUT_DIR, 'slip-open-screen.png') });
});

/** AC-2: the ASSIGNED branch must look exactly as it did before this card --
 *  no trip-level line, one seat number under each name. */
test('OBRS-1783 AC-2: an ASSIGNED trip still prints a seat number per passenger', async ({
  page,
}) => {
  await setUpSlip(page, ASSIGNED_TICKETS);
  await page.goto('/staff/sell/receipt/1', { waitUntil: 'domcontentloaded' });
  const paper = await settledPaper(page, 3);

  await page.emulateMedia({ media: 'print' });
  await paper.screenshot({ path: path.join(OUT_DIR, 'slip-assigned-print.png') });
});

/**
 * The customer e-ticket is the surface the slip is being made to agree with --
 * it already prints the seat once per leg and hides the per-passenger row. It is
 * NOT changed by this card; it is photographed so the two can be held side by
 * side. Reached through /my-bookings rather than /e-ticket for the reason
 * measured on OBRS-1781: /e-ticket fed by seedStore alone renders the OBRS-1252
 * trip summary, which has no passenger block at all.
 */
test('OBRS-1783: the customer e-ticket, unchanged, for the side-by-side', async ({ page }) => {
  await seedCustomerSession(page, false);
  await page.addInitScript(() => localStorage.setItem('app_language', 'th'));
  await page.route('**/api/private/bookings/*/tickets', (route) =>
    route.fulfill({ json: OPEN_TICKETS })
  );

  await page.goto('/my-bookings', { waitUntil: 'domcontentloaded' });
  await page.locator('.actions-menu-btn').first().click();
  await page.locator('.action-menu-item', { hasText: 'ดูตั๋ว' }).first().click();

  const paper = page.locator('.ticket-paper');
  await paper.locator('.passenger-list').first().waitFor();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  await paper.screenshot({ path: path.join(OUT_DIR, 'eticket-open.png') });
});
