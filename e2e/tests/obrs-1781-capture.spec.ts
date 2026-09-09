import { test, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { seedCustomerSession } from '../support/customer-pages';

/**
 * OBRS-1781 AC-7 — AFTER evidence for moving the boarding-scan note above the
 * passenger list on the 80mm walk-in slip.
 *
 * Hermetic on the gate lane's terms (playwright.gate.config.ts, rule 1): this
 * spec fulfils every `/api/**` call it makes and seeds its own salesperson
 * session, so it needs no backend, no database and no SIT. The page, its SCSS
 * and its print rules are the real ones — only the booking behind them is a
 * fixture.
 *
 * THREE passengers, not the two in the owner's screenshot: the note's distance
 * from the first QR is what the card is about, and it only becomes visible
 * once the list is longer than one screenshot's worth of paper.
 */
const OUT_DIR = process.env['OBRS1781_OUT'] ?? 'captures/obrs-1781';

// Every seat is null because that is the only shape production can reach: no
// request DTO carries `seatingMode` (only `seatingCapacity`), so every schedule
// created through the app keeps the V10 column default 'OPEN', and on an OPEN
// schedule BookingService forces `p.setSeatNumber(null)` regardless of what the
// client sent. A fixture with real seat numbers photographs a state this fleet
// cannot produce -- the first reader of that screenshot asked whether the slip
// had started printing reserved seats.
const PASSENGERS = [
  { id: 1, ticketNumber: 'T-260909-0042-1', passengerName: 'นาย สมชาย ใจดี', seatNumber: null },
  { id: 2, ticketNumber: 'T-260909-0042-2', passengerName: 'นางสาว มาลี ศรีสุข', seatNumber: null },
  { id: 3, ticketNumber: 'T-260909-0042-3', passengerName: 'นาย ประยุทธ์ มั่นคง', seatNumber: null },
];

const TICKETS_RESP = {
  code: 200,
  message: 'OK',
  data: {
    bookingId: 1,
    bookingNumber: 'BK-260909-0042',
    bookingStatus: 'confirmed',
    totalTickets: PASSENGERS.length,
    journeys: [
      {
        legType: { code: 'outbound', label: 'ขาไป' },
        fromStop: { code: 'nong_chak', label: 'หนองชาก' },
        toStop: { code: 'bts_mo_chit', label: 'BTS หมอชิต' },
        departureDateTime: '2026-09-10 09:30:00',
        arrivalDateTime: '2026-09-10 12:10:00',
        vehicle: { vehicleType: { code: 'van', label: 'รถตู้' } },
        tickets: PASSENGERS.map((p) => ({
          id: p.id,
          ticketNumber: p.ticketNumber,
          passengerName: p.passengerName,
          seatNumber: p.seatNumber,
          status: { code: 'confirmed', label: 'ยืนยันแล้ว' },
        })),
      },
    ],
  },
};

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

/** The walk-in slip's own fixture. The e-ticket case below seeds a customer
 * session instead, so this is per-test rather than a beforeEach. */
async function setUpSlip(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'e2e-fake-token');
    localStorage.setItem('auth_username', 'salesperson@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['salesperson']));
    localStorage.setItem('app_language', 'th');
  });

  await page.route('**/api/private/bookings/1/tickets', (route) =>
    route.fulfill({ json: TICKETS_RESP })
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

test('OBRS-1781 AFTER: the boarding-scan note heads the passenger list on the 80mm slip', async ({
  page,
}) => {
  await setUpSlip(page);
  await page.goto('/staff/sell/receipt/1', { waitUntil: 'domcontentloaded' });

  const paper = page.locator('.receipt-paper');
  await paper.locator('.qr-hint').waitFor();
  // Every QR resolved — otherwise the shot is of placeholders, not the slip.
  await paper.locator('.receipt-ticket-qr img.qr-code').nth(PASSENGERS.length - 1).waitFor();

  fs.mkdirSync(OUT_DIR, { recursive: true });

  await page.emulateMedia({ media: 'print' });
  await paper.screenshot({ path: path.join(OUT_DIR, 'after-slip-print.png') });

  await page.emulateMedia({ media: 'screen' });
  await paper.screenshot({ path: path.join(OUT_DIR, 'after-slip-screen.png') });
});

/**
 * The customer e-ticket carries the same block, and the owner asked for both
 * surfaces to agree.
 *
 * Reached through `/my-bookings` rather than `/e-ticket`: measured on this
 * branch, `/e-ticket` fed only by `seedStore` renders the OBRS-1252 TRIP
 * SUMMARY — "นี่ไม่ใช่ตั๋วฉบับสมบูรณ์ … ไม่มีรหัสจอง ที่นั่ง และคิวอาร์โค้ด" —
 * which has no passenger block and therefore no `.qr-hint` to photograph. The
 * bookings list hands the same `<app-e-ticket-card>` its real ticket data from
 * the `/bookings/:id/tickets` fixture that `seedCustomerSession` already mocks,
 * so this needs no fixture of its own.
 */
test('OBRS-1781 AFTER: the boarding-scan note heads the passenger list on the customer e-ticket', async ({
  page,
}) => {
  await seedCustomerSession(page, false);
  // seedCustomerSession pins 'en'; the owner reads these tickets in Thai.
  await page.addInitScript(() => localStorage.setItem('app_language', 'th'));
  // Its own /bookings/:id/tickets fixture answers the contrast sweep, which only
  // needs the page AT REST: measured, every field on the card came back "-" and
  // no passenger row rendered. Registered after it so this handler wins.
  await page.route('**/api/private/bookings/*/tickets', (route) =>
    route.fulfill({ json: TICKETS_RESP })
  );

  await page.goto('/my-bookings', { waitUntil: 'domcontentloaded' });
  await page.locator('.actions-menu-btn').first().click();
  await page.locator('.action-menu-item', { hasText: 'ดูตั๋ว' }).first().click();

  const paper = page.locator('.ticket-paper');
  await paper.locator('.qr-hint').waitFor();
  await paper.locator('.passenger-list').first().waitFor();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  await paper.screenshot({ path: path.join(OUT_DIR, 'after-eticket.png') });
});
