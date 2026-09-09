import { test, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * OBRS-1787 AC-4 — evidence for stating the OPEN-seating seat ONCE in the
 * booking summary on the public /find-booking screen, instead of dropping the
 * seat row entirely.
 *
 * Hermetic on the gate lane's terms (playwright.gate.config.ts, rule 1): the one
 * endpoint this screen calls is fulfilled in-browser, so there is no backend, no
 * database and no SIT. The page, its SCSS and its i18n are the real ones — only
 * the lookup answer is a fixture. No session is seeded either: /find-booking is
 * the public, unauthenticated way back to a ticket (OBRS-857).
 *
 * THREE tickets, because "the row that was not there" is easiest to see against
 * a list long enough to look like a real family booking.
 *
 * The BEFORE folder is taken by reverting the template and re-running with
 * OBRS1787_OUT pointed elsewhere — same fixture, same screen, one change.
 */
const OUT_DIR = process.env['OBRS1787_OUT'] ?? 'captures/obrs-1787';

/**
 * Bare names. The honorific is a separate CODE on the wire (OBRS-1232) and the
 * screen prints it through the `titleLabel` pipe, so carrying "นาย" in the name
 * as well renders "นายนาย สมชาย ใจดี" — a fixture defect that would read, in the
 * evidence, as a defect of the screen.
 */
const PASSENGERS = ['สมชาย ใจดี', 'มาลี ศรีสุข', 'ประยุทธ์ มั่นคง'];

const OUTBOUND = {
  fromStop: { code: 'nong_chak', label: 'หนองชาก' },
  toStop: { code: 'bts_mo_chit', label: 'BTS หมอชิต' },
  departureDateTime: '2026-09-10 09:30:00',
  arrivalDateTime: '2026-09-10 12:10:00',
};

/**
 * `seatNumber: null` is the only shape production can reach on an OPEN schedule:
 * no request DTO carries `seatingMode`, so every schedule created through the app
 * keeps the V10 column default 'OPEN', and on an OPEN schedule
 * `BookingService:713` forces `p.setSeatNumber(null)` over whatever the client
 * sent. The ASSIGNED arm photographs the branch that is still in the code, to
 * prove this card did not disturb it (AC-2).
 */
function lookupResponse(seats: (string | null)[]) {
  return {
    code: 200,
    message: 'OK',
    data: {
      bookingNumber: 'BK-260909-0042',
      status: 'confirmed',
      contactTitle: 'MR',
      contactName: 'สมชาย ใจดี',
      contactPhoneMasked: '••••5678',
      bookedAt: '2026-09-09 09:12:00',
      netAmount: '480.00',
      tickets: seats.map((seatNumber, i) => ({
        ticketNumber: `T-260909-0042-${i + 1}`,
        passengerTitle: i === 1 ? 'MISS' : 'MR',
        passengerName: PASSENGERS[i],
        seatNumber,
        status: 'confirmed',
        ...OUTBOUND,
        vehicle: { vehicleType: { code: 'van', label: 'รถตู้' }, numberPlate: 'PBL-1234' },
      })),
    },
  };
}

const OPEN_BOOKING = lookupResponse([null, null, null]);
const ASSIGNED_BOOKING = lookupResponse(['12', '13', '14']);

/** Fulfils the single endpoint the screen calls, then drives the real form. */
async function lookUpBooking(page: Page, body: object) {
  await page.addInitScript(() => localStorage.setItem('app_language', 'th'));
  await page.route('**/api/bookings/lookup', (route) => route.fulfill({ json: body }));

  await page.goto('/find-booking', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('find-booking-number').fill('BK-260909-0042');
  await page.getByTestId('find-booking-phone').fill('0812345678');
  await page.getByTestId('find-booking-submit').click();

  const result = page.getByTestId('find-booking-result');
  // Wait for the LAST ticket, not the first: the card is about what the list does
  // as a whole, and a shot taken mid-render would not show it.
  await result.locator('.find-booking-ticket').nth(PASSENGERS.length - 1).waitFor();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  return result;
}

test('OBRS-1787: an OPEN booking states the seat once, in the summary', async ({ page }) => {
  const result = await lookUpBooking(page, OPEN_BOOKING);
  await result.screenshot({ path: path.join(OUT_DIR, 'find-booking-open.png') });
});

/** AC-2: the ASSIGNED branch must look exactly as it did before this card —
 *  no summary line, one seat number under each ticket. */
test('OBRS-1787 AC-2: an ASSIGNED booking still prints a seat under every ticket', async ({
  page,
}) => {
  const result = await lookUpBooking(page, ASSIGNED_BOOKING);
  await result.screenshot({ path: path.join(OUT_DIR, 'find-booking-assigned.png') });
});

/**
 * AC-3: outbound OPEN, return ASSIGNED. The summary line must stay away and every
 * ticket must keep its own row — the case that decides whether the two guards are
 * really complements or merely look like it.
 */
test('OBRS-1787 AC-3: a mixed booking shows a row on every ticket', async ({ page }) => {
  const mixed = lookupResponse([null, null, '3']);
  mixed.data.tickets[2] = {
    ...mixed.data.tickets[2],
    fromStop: OUTBOUND.toStop,
    toStop: OUTBOUND.fromStop,
    departureDateTime: '2026-09-12 18:00:00',
    arrivalDateTime: '2026-09-12 20:40:00',
  };

  const result = await lookUpBooking(page, mixed);
  await result.screenshot({ path: path.join(OUT_DIR, 'find-booking-mixed.png') });
});
