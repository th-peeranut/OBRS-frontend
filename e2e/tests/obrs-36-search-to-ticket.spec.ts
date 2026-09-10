import { test, expect, Page } from '@playwright/test';
import { mockPublicPageApis } from '../fixtures/public-page-mocks';
import { seedAnalyticsConsent } from '../support/analytics-consent';
import {
  seedSignedInCustomer,
  searchAndConfirmASchedule,
} from '../support/b2c-booking-walk';

/**
 * OBRS-36 — one customer, one walk: search -> reserve -> payment -> ticket issuance.
 *
 * WHAT WAS ALREADY COVERED, AND WHAT WAS NOT. The card was opened before any of the
 * Playwright harness existed and asks for the whole chain, so the first question was how
 * much of it is already held somewhere. Measured against `origin/dev` at
 * 7e85702e (`git ls-tree -r --name-only origin/dev -- e2e | grep -c '\.spec\.ts$'` = 106
 * specs):
 *
 *   search -> reserve   ALREADY HELD. `b2c-critical-path.spec.ts` walks home -> search ->
 *                       schedule -> review -> passenger info; its OBRS-855 arm POSTs the
 *                       booking and lands on /payment. This spec does not re-prove that
 *                       leg, it REUSES it -- literally, via `searchAndConfirmASchedule`.
 *   payment -> ticket   NOT HELD BY ANYTHING. No spec in the lane goes past /payment: the
 *                       b2c happy path's last assertion is that `.btn-next` is enabled,
 *                       and `e2e/fixtures/public-page-mocks.ts` stubs seven endpoints,
 *                       none of them the create-booking, create-payment, payments-by-
 *                       booking or tickets call. `/payment/result` and `/e-ticket` had no
 *                       automated visitor at all, on any lane.
 *
 * So this spec's own contribution is the second half, and the first half is here because
 * a chain assertion that starts halfway is not a chain assertion: the point below is that
 * the id the server issued at RESERVE is the id the payment is created for and the id the
 * ticket is issued against. Three screens agreeing about one number is the thing no
 * per-screen test can see.
 *
 * THE MOCKED PAYMENT IS THE CARD'S OWN ALLOWANCE ("can mock external payment"), and it is
 * also the only honest option on this lane -- Chromium here resolves nothing but
 * localhost. Every call is answered in-spec against the app's real client code.
 *
 * ⛔ SCOPE BOUNDARY, deliberate, and it is where two other cards live:
 *
 *   - The leg the browser spends OFF our origin -- pay button -> gateway -> back to the
 *     `return_uri` -- is not walked here and cannot be: it is a cross-origin navigation.
 *     `obrs-732-3ds.spec.ts` owns it with a real Omise charge on the OWN-DB lane. This
 *     walk therefore resumes at /payment/result, which is where the gateway returns the
 *     customer, exactly as it would.
 *   - This proves the FRONTEND settles when the server says the payment settled. It does
 *     NOT prove the server ever says so after a real 3-D Secure charge -- that needs
 *     Omise's inbound webhook to reach us, which is OBRS-739. A green run here is not
 *     evidence for that card and must not be read as any.
 */

/** The booking the reserve step creates. Every later screen must name this same id. */
const BOOKING_ID = 36001;
const BOOKING_NUMBER = 'BK36001';
const PAYMENT_ID = 36901;
const TICKET_ID = 36101;
const TICKET_NUMBER = 'T-036101';
/** OBRS-1379: the QR is served from OUR origin and bound as a blob:, never a gateway URL. */
const QR_PATH = `/api/private/payments/${PAYMENT_ID}/qr`;
/** The passenger typed on /passenger-info, asserted again on the ticket at the far end. */
const PASSENGER_FIRST = 'Somchai';
const PASSENGER_LAST = 'Jaidee';

/** AlertService raises SweetAlert2 into document.body, outside every component's DOM. */
const ALERT_CONFIRM = '.swal2-confirm';

/**
 * A real 4x4 PNG. `loadQrImage()` turns whatever this endpoint returns into a blob: and
 * binds it, and the assertion downstream reads `naturalWidth` -- which a zero-byte body
 * would fail, correctly, but confusingly.
 */
const QR_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mNk+M9QzwAFjKMCoxQAAOxTA/2q1' +
    'i7yAAAAAElFTkSuQmCC',
  'base64'
);

const json = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'OK', data }),
});

/** `GET /api/private/bookings/{id}/payments` while the charge is still outstanding. */
const PAYMENT_PENDING = {
  bookingId: BOOKING_ID,
  paymentSummary: {
    totalAmount: '200.00',
    paidAmount: '0.00',
    outstandingAmount: '200.00',
    currency: 'THB',
    status: 'pending',
  },
  transactions: [
    {
      transactionId: 'chrg_test_obrs36',
      paymentMethod: 'qr_promptpay',
      amount: '200.00',
      currency: 'THB',
      status: 'pending',
    },
  ],
};

/** The same call once the gateway has settled it. */
const PAYMENT_PAID = {
  ...PAYMENT_PENDING,
  paymentSummary: {
    ...PAYMENT_PENDING.paymentSummary,
    paidAmount: '200.00',
    outstandingAmount: '0.00',
    status: 'paid',
  },
  transactions: [
    {
      ...PAYMENT_PENDING.transactions[0],
      status: 'paid',
      paidAt: '2026-09-09T10:15:00+07:00',
    },
  ],
};

const TICKETS = {
  bookingId: BOOKING_ID,
  bookingNumber: BOOKING_NUMBER,
  bookingStatus: 'CONFIRMED',
  totalTickets: 1,
  totalAmount: '200.00',
  contactPhoneNumber: '0812345678',
  journeys: [
    {
      legType: { code: 'OUTBOUND', label: 'Outbound' },
      routeLabel: 'Nong Sak - Bangkok',
      fromStop: { code: 'nong_sak', label: 'Nong Sak' },
      toStop: { code: 'bangkok', label: 'Bangkok' },
      departureDateTime: '2026-09-10T08:00:00+07:00',
      arrivalDateTime: '2026-09-10T11:30:00+07:00',
      seatingMode: 'ASSIGNED' as const,
      vehicle: {
        vehicleType: { code: 'VAN', label: 'Van' },
        numberPlate: '1กก 1234',
      },
      tickets: [
        {
          id: TICKET_ID,
          ticketNumber: TICKET_NUMBER,
          passengerTitle: 'MR',
          passengerName: `${PASSENGER_FIRST} ${PASSENGER_LAST}`,
          seatNumber: '1',
          status: { code: 'CONFIRMED', label: 'Confirmed' },
        },
      ],
    },
  ],
};

test.beforeEach(async ({ page }) => {
  // Every public call the walk's first half issues. Registered FIRST so the spec-specific
  // stubs below win -- Playwright matches handlers in reverse registration order.
  await mockPublicPageApis(page);
  // The consent bar is `position: fixed` at the bottom of every customer page (OBRS-1372),
  // and the QR panel this walk has to reach sits below the fold at this lane's 1280x720.
  // A settled decision keeps the bar out of the walk rather than scrolling around it.
  await seedAnalyticsConsent(page);
  await seedSignedInCustomer(page);
});

/**
 * The booker/passenger form on /passenger-info.
 *
 * Local to this spec rather than shared with `b2c-critical-path.spec.ts`, which fills the
 * same form three times: those copies differ on purpose (OBRS-858's arm leaves the booker
 * email empty and asserts the emptiness -- that omission IS the test), so folding them
 * together would put an assertion behind an argument.
 */
async function fillPassengerAndBooker(page: Page): Promise<void> {
  await page.locator('#booker-title .dropdown-btn').click();
  await page.locator('#booker-title .dropdown-option').first().click();
  await page.fill('#booker-firstName', PASSENGER_FIRST);
  await page.fill('#booker-lastName', PASSENGER_LAST);
  await page.fill('#booker-phoneNumber', '0812345678');
  // OBRS-238: required and format-checked for ONLINE bookings, so `.btn-next` stays
  // disabled without it and the click below would silently do nothing.
  await page.fill('#booker-email', 'somchai.jaidee@example.com');
  await page.locator('#booker-gender_male').click();

  await page.locator('#title-0 .dropdown-btn').click();
  await page.locator('#title-0 .dropdown-option').first().click();
  await page.fill('#firstName-0', PASSENGER_FIRST);
  await page.fill('#lastName-0', PASSENGER_LAST);
  await page.locator('#gender_male-0').click();
}

/**
 * Dismiss the SweetAlert the app raises on a success, and prove it was the success one.
 *
 * `.swal2-popup` alone is not safe to wait on: AlertService renders the global loading
 * spinner into the same element, and OBRS-732 wrote three assertions that raced it and
 * reported a working charge as a failure. `.swal2-confirm` only exists on a dialog with a
 * button, and the icon says which dialog it is.
 */
/**
 * Card evidence, off by default:
 * `OBRS_CAPTURE=1 npm run e2e:gate -- obrs-36-search-to-ticket` writes into `e2e-evidence/`
 * (gitignored). Same switch obrs-1301-qr-img-src uses, for the same reason: the image has
 * to come out of the run that made the assertion, not a re-enactment of it.
 */
async function captureIfAsked(page: Page, name: string): Promise<void> {
  if (!process.env['OBRS_CAPTURE']) return;
  await page.screenshot({ path: `e2e-evidence/OBRS-36-AFTER-${name}.png`, fullPage: true });
}

async function dismissSuccessAlert(page: Page): Promise<void> {
  const confirm = page.locator(ALERT_CONFIRM);
  await confirm.waitFor();
  await expect(
    page.locator('.swal2-popup .swal2-icon.swal2-success'),
    'An alert came up that was not the success one -- read its text before assuming the ' +
      'step worked. An error alert also has a confirm button.'
  ).toBeVisible();
  await confirm.click();
  await expect(confirm).toHaveCount(0);
}

test('OBRS-36: search -> reserve -> payment -> ticket issuance, on one booking id the whole way', async ({
  page,
}) => {
  /** Every wire fact the assertions at the end are drawn from, recorded as it happens. */
  const wire = {
    createBookingBodies: [] as Record<string, unknown>[],
    createPaymentBodies: [] as Record<string, unknown>[],
    paymentStatusPolls: [] as string[],
    ticketsFetches: [] as string[],
  };

  // ── Reserve: POST the booking the customer just described ────────────────────
  await page.route('**/api/private/bookings', async (route) => {
    wire.createBookingBodies.push(route.request().postDataJSON());
    await route.fulfill(
      json({
        bookingId: BOOKING_ID,
        bookingNumber: BOOKING_NUMBER,
        totalAmount: 200,
        netAmount: 200,
      })
    );
  });

  // ── Payment: the PromptPay charge, in the shape the backend sends today ──────
  await page.route('**/api/private/payments', async (route) => {
    wire.createPaymentBodies.push(route.request().postDataJSON());
    await route.fulfill(
      json({
        id: PAYMENT_ID,
        bookingId: BOOKING_ID,
        status: 'pending',
        paymentMethod: 'qr_promptpay',
        amount: 200,
        currency: 'THB',
        transactionId: 'chrg_test_obrs36',
        // Data the app renders/hands off, never a request this spec issues. The walk
        // stops at our own origin -- see the scope boundary in the header.
        authorizeUri: 'https://pay.omise.co/offsites/ofsp_test_obrs36/pay',
        qrImageUrl: QR_PATH,
      })
    );
  });

  await page.route(`**${QR_PATH}`, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: QR_PNG })
  );

  // ── Settlement: what /payment/result polls. Pending first, then paid ─────────
  // Two different answers on purpose. A stub that says "paid" from the first call would
  // pass just as well against a component that read the endpoint ONCE and never polled,
  // which is the half of this screen worth having a test for.
  await page.route('**/api/private/bookings/*/payments', async (route) => {
    wire.paymentStatusPolls.push(new URL(route.request().url()).pathname);
    await route.fulfill(
      json(wire.paymentStatusPolls.length === 1 ? PAYMENT_PENDING : PAYMENT_PAID)
    );
  });

  // ── Ticket issuance ─────────────────────────────────────────────────────────
  await page.route('**/api/private/bookings/*/tickets', async (route) => {
    wire.ticketsFetches.push(new URL(route.request().url()).pathname);
    await route.fulfill(json(TICKETS));
  });

  // Each ticket's boarding QR (OBRS-96). Without it every ticket renders the red
  // 'qrUnavailable' placeholder and the e-ticket assertions would measure an error state.
  await page.route('**/api/private/tickets/*/boarding-token', (route) =>
    route.fulfill(
      json({
        ticketId: TICKET_ID,
        ticketNumber: TICKET_NUMBER,
        boardingToken: 'obrs-36-boarding-token',
        expiresAt: '2030-06-17T09:00:00+07:00',
      })
    )
  );

  // ── 1. Search, pick a schedule, confirm the review page ─────────────────────
  await searchAndConfirmASchedule(page);

  // ── 2. Reserve ──────────────────────────────────────────────────────────────
  await page.waitForURL('**/passenger-info');
  await fillPassengerAndBooker(page);
  await expect(page.locator('.btn-next')).not.toBeDisabled();
  await page.locator('.btn-next').click();

  await dismissSuccessAlert(page);
  await page.waitForURL('**/payment');

  // The booking really was created from what was typed, not from a default the store
  // carried in. Without this the walk could reach /payment on an empty payload.
  expect(wire.createBookingBodies).toHaveLength(1);
  expect(JSON.stringify(wire.createBookingBodies[0])).toContain(PASSENGER_LAST);

  // ── 3. Payment: ask for the PromptPay QR ────────────────────────────────────
  // `activePaymentTab` starts at 'creditcard', so app-payment-qrcode is not in the DOM
  // until this click -- its ngOnInit is what issues the create-payment call. Clicking
  // beats setting the field: this is the door the customer uses. The card flow is the
  // other door and it leaves our origin at the Omise iframe, so it is not this lane's.
  await page.getByRole('button', { name: /QR Payment/i }).click();

  const qr = page.locator('.qr-image');
  await expect(qr).toBeVisible();
  await expect
    .poll(
      () => qr.evaluate((el: HTMLImageElement) => el.naturalWidth),
      {
        message:
          'The QR <img> is bound but decoded to nothing. A src attribute is not a rendered ' +
          'image -- this is the shape OBRS-1301 exists for.',
      }
    )
    .toBeGreaterThan(0);

  // The number under the QR is the SERVER's (OBRS-1384), not a product of two NgRx stores.
  await expect(page.locator('.qr-amount')).toContainText('200');

  // THE JOIN. The payment was created for the booking the reserve step returned -- not for
  // whatever id happened to be in localStorage from an earlier walk.
  expect(wire.createPaymentBodies).toHaveLength(1);
  expect(wire.createPaymentBodies[0]).toMatchObject({
    bookingId: BOOKING_ID,
    paymentMethod: 'qr_promptpay',
  });

  await captureIfAsked(page, '1-promptpay-qr-issued-for-the-reserved-booking');

  // ── 4. The return from the gateway ──────────────────────────────────────────
  // Where the gateway's `return_uri` puts the customer after they have paid in their bank
  // app. The hop through the bank is off our origin and belongs to obrs-732-3ds.spec.ts
  // (real charge, OWN-DB lane); this walk rejoins the customer where they come back.
  await page.goto('/payment/result');

  // ── 5. Ticket issuance ──────────────────────────────────────────────────────
  // The page polls until the payment settles and then issues the ticket itself. Reaching
  // /e-ticket at all is the assertion; it cannot happen off the first (pending) answer.
  await page.waitForURL('**/e-ticket');

  // No alert assertion here, deliberately. `completePayment()` raises the success dialog
  // and navigates in the same tick, and the e-ticket page's own calls then run through
  // AlertService — whose `resetLoadingState()` closes whatever is open, because the global
  // loading spinner is the SAME SweetAlert element. Measured: the confirm button is
  // present but hidden by the time this line runs. Waiting on it is racing the spinner,
  // which is precisely the mistake OBRS-732 made three times in one file. Arriving on
  // /e-ticket is the assertion; the ticket below is the evidence.

  expect(
    wire.paymentStatusPolls.length,
    'The result page settled off a single read. It is a POLLER -- one answer cannot have ' +
      'been "pending" and have moved the customer on.'
  ).toBeGreaterThanOrEqual(2);
  for (const path of wire.paymentStatusPolls) {
    expect(path).toBe(`/api/private/bookings/${BOOKING_ID}/payments`);
  }

  const ticket = page.locator('.ticket-paper');
  await expect(ticket).toBeVisible();
  await expect(ticket).toContainText(BOOKING_NUMBER);
  await expect(ticket).toContainText(TICKET_NUMBER);
  await expect(ticket).toContainText(PASSENGER_LAST);

  // The degraded render is a real branch of this page (OBRS-1252): with no booking number
  // it draws a banner instead of a ticket, and every assertion above except this one can
  // pass beside it.
  await expect(page.locator('[data-testid="eticket-unavailable"]')).toHaveCount(0);

  await captureIfAsked(page, '2-ticket-issued');

  // THE OTHER END OF THE JOIN, and it is asserted here rather than straight after the
  // navigation on purpose: the page issues this call after it has rendered, so a plain
  // `expect` at the seam reads an empty array and fails on timing rather than on truth.
  // The ticket above is what the customer holds; this is which booking it was issued for.
  expect(wire.ticketsFetches).toContain(`/api/private/bookings/${BOOKING_ID}/tickets`);
});
