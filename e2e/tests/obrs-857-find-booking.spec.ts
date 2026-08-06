import { expect, Page, test } from '@playwright/test';
import { seedAnalyticsConsent } from '../support/analytics-consent';

/**
 * OBRS-857 — the guest booking lookup, in a real browser.
 *
 * WHY THIS NEEDS A BROWSER, given the component has its own unit suite and the endpoint has
 * `PublicBookingLookupIT`. Those two prove the ends. Neither can see the middle, and the middle
 * is where this card's acceptance criteria live:
 *
 *   - "หน้า FE เข้าถึงได้จากหน้าแรกโดยไม่ต้องล็อกอิน" — reachable FROM THE HOME PAGE without
 *     signing in. A route entry and a `routerLink` attribute are two independent facts; a unit
 *     test sees the attribute, and `/track-parcel` shipped complete under OBRS-305 with no nav
 *     entry at all, which is the same defect this assertion exists to refuse.
 *   - The lookup must be reachable with NO session. A TestBed has no AuthGuard, so it cannot
 *     tell an open route from one that silently bounces to /login.
 *   - The phone must not reach the URL. That is a property of the assembled HttpClient stack —
 *     interceptors included — not of the service class in isolation.
 *
 * Hermetic on the gate lane's terms: every `/api/**` call is fulfilled here and nothing is
 * listening on :8080, so an unmocked call is ECONNREFUSED rather than a silent pass.
 */

const ok = <T>(data: T) => ({ code: 200, message: 'OK', data });

/**
 * Deliberately NOT a plausible-looking Thai stop name for `label`, and a DIFFERENT string for
 * `code`: if the page rendered the slug (which is what the backend used to return before this
 * card added `PublicBookingStopRespDto`), a fixture whose two fields agreed could not tell.
 */
const BOOKING = {
  bookingNumber: 'B-ABC234',
  status: 'confirmed',
  contactName: 'สมชาย ใจดี',
  contactPhoneMasked: '••••5678',
  netAmount: 250,
  tickets: [
    {
      ticketNumber: 'T-ABCDE23456',
      passengerName: 'สมชาย ใจดี',
      seatNumber: '1',
      status: 'confirmed',
      fromStop: { code: 'wire_from_slug', label: 'WIRE-FROM-LABEL' },
      toStop: { code: 'wire_to_slug', label: 'WIRE-TO-LABEL' },
      vehicle: { numberPlate: 'WIRE-1234' },
    },
  ],
};

type Captured = { url: string; body: string };

/**
 * Fulfils the lookup with `respond` and records what was actually sent. Everything else the
 * shell reaches for gets an empty OK rather than an ECONNREFUSED that would raise a global alert.
 */
async function stubLookup(
  page: Page,
  respond: { status: number; body: unknown },
  captured: Captured[]
): Promise<void> {
  await page.route('**/api/bookings/lookup', (route) => {
    captured.push({
      url: route.request().url(),
      body: route.request().postData() ?? '',
    });
    return route.fulfill({
      status: respond.status,
      contentType: 'application/json',
      body: JSON.stringify(respond.body),
    });
  });
  await page.route('**/api/**', (route) =>
    route.request().url().includes('/api/bookings/lookup')
      ? route.fallback()
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) })
  );
}

async function submitPair(page: Page, bookingNumber: string, phone: string): Promise<void> {
  await page.getByTestId('find-booking-number').fill(bookingNumber);
  await page.getByTestId('find-booking-phone').fill(phone);
  await page.getByTestId('find-booking-submit').click();
}

test.beforeEach(async ({ page }) => {
  await seedAnalyticsConsent(page);
});

test('a signed-OUT visitor reaches the lookup from the home page and gets their ticket', async ({
  page,
}) => {
  const captured: Captured[] = [];
  await stubLookup(page, { status: 200, body: ok(BOOKING) }, captured);

  // No session is seeded anywhere in this spec. That is the assertion, not a shortcut: a guest
  // is precisely who this page is for.
  await page.goto('/');
  await page.getByRole('link', { name: /ค้นหาการจอง|Find booking|查询订单/ }).first().click();

  await expect(page).toHaveURL(/\/find-booking$/);
  await expect(page.getByTestId('find-booking-form')).toBeVisible();

  await submitPair(page, 'b-abc234', '0812345678');

  await expect(page.getByTestId('find-booking-result')).toBeVisible();
  const text = (await page.getByTestId('find-booking-result').innerText()).replace(/\s+/g, ' ');

  expect(text).toContain('B-ABC234');
  expect(text).toContain('••••5678');
  expect(text).toContain('WIRE-1234');
  // The LABEL, never the slug. Before this card the backend returned the slug and the page had
  // nothing else to render.
  expect(text).toContain('WIRE-FROM-LABEL');
  expect(text).not.toContain('wire_from_slug');
  // A placeholder that reached a user is the failure a unit test never sees.
  expect(text).not.toContain('{{');
  expect(text).not.toContain('MY_BOOKINGS.STATUS');
});

test('the phone number is in the request BODY and never in the URL', async ({ page }) => {
  const captured: Captured[] = [];
  await stubLookup(page, { status: 200, body: ok(BOOKING) }, captured);

  await page.goto('/find-booking');
  await submitPair(page, 'B-ABC234', '0812345678');
  await expect(page.getByTestId('find-booking-result')).toBeVisible();

  expect(captured).toHaveLength(1);
  // A query-string phone number lands in every proxy's access log and in browser history, and
  // nothing downstream can take it back. This is why the endpoint is a POST.
  expect(captured[0].url).not.toContain('0812345678');
  expect(JSON.parse(captured[0].body)).toEqual({
    bookingNumber: 'B-ABC234',
    phoneNumber: '0812345678',
  });
});

test('a wrong pair renders ONE neutral refusal that names neither half', async ({ page }) => {
  const captured: Captured[] = [];
  await stubLookup(
    page,
    { status: 404, body: { timestamp: 'x', status: 404, message: 'not found', errorCode: 'NOT_FOUND' } },
    captured
  );

  await page.goto('/find-booking');
  await submitPair(page, 'B-ZZZZZZ', '0899999999');

  const refusal = page.getByTestId('find-booking-not-found');
  await expect(refusal).toBeVisible();
  await expect(page.getByTestId('find-booking-result')).toHaveCount(0);

  // The backend collapses "no such booking", "wrong phone" and "that is a parcel booking" into
  // one byte-identical 404 so this endpoint cannot confirm which booking numbers exist. A screen
  // that echoed back what was typed, or that hinted which field was wrong, would hand that
  // oracle straight back.
  const text = await refusal.innerText();
  expect(text).not.toContain('B-ZZZZZZ');
  expect(text).not.toContain('0899999999');
});

test('a throttled caller is told to WAIT, not to retype', async ({ page }) => {
  const captured: Captured[] = [];
  await stubLookup(
    page,
    { status: 429, body: { timestamp: 'x', status: 429, message: 'rate limited', errorCode: 'RATE_LIMIT' } },
    captured
  );

  await page.goto('/find-booking');
  await submitPair(page, 'B-ABC234', '0812345678');

  // Folding 429 into the not-found message would tell someone who is already rate-limited to
  // try again immediately — the one piece of advice that cannot work.
  await expect(page.getByTestId('find-booking-throttled')).toBeVisible();
  await expect(page.getByTestId('find-booking-not-found')).toHaveCount(0);
});
