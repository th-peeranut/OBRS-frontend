import { Page, expect, test } from '@playwright/test';

/**
 * OBRS-732 — the real 3-D Secure card journey, end to end.
 *
 * See playwright.obrs732.config.ts for how to run it and why the lane is not hermetic.
 *
 * <p>This is the one payment behaviour nothing else can observe: the browser leaves our
 * origin for the issuing bank's page and has to find its way back through `return_uri`.
 * After OBRS-391 it also crosses a second boundary first — the card token now comes out
 * of Omise's cross-origin iframe, so `page.fill('#creditCardNo')` is structurally
 * impossible and `frameLocator` is the only way in. That inability is the card's whole
 * point, not an obstacle to it.
 *
 * <p>Everything here is test mode. No money moves, and nothing needs approving in the
 * Omise dashboard: `OmiseChargeProcessor.processCard` never sets `capture=false`, so a
 * card charge is a real synchronous capture with no authorized-but-uncaptured state to
 * accept.
 */

const CUSTOMER_EMAIL = 'customer@system.local';
const CUSTOMER_PASSWORD = 'P@ssw0rd';

/** Seeded by obrs-732-3ds-fixture.sql: `pending`, unexpired, 200.00 outstanding. */
const BOOKING_NUMBER = 'Q3DS-PAYME';
/**
 * How Omise renders the fixture's 200.00 outstanding on its own submit button.
 *
 * <p>Two decimals on purpose: the OBRS-391 defect rendered "0.00 THB", and the whole
 * point of checking here is that the satang conversion (20000) arrived intact.
 */
const EXPECTED_TOTAL = '200.00';

/**
 * Omise test cards, from https://docs.omise.co/api-testing.
 *
 * <p>THERE IS NO "3DS CARD". An earlier revision of this file used `4111111111111140`
 * believing it triggered 3-D Secure; it is not a test card at all and not even
 * Luhn-valid, so Omise's own form refused it inline ("กรุณาระบุหมายเลขบัตรที่ถูกต้อง")
 * and the charge was never attempted. What actually triggers 3DS is TWO things, neither
 * of them the card number:
 *   1. the account has 3DS enabled — for a test account that is a request to
 *      support@omise.co, not a dashboard toggle (the dashboard has no such setting); and
 *   2. the charge carries `return_uri`, which ours does (APP_FRONTEND_URL/payment/result).
 * With both in place, ANY successful test card takes the 3DS route.
 */
const CARD_SUCCESS = '4242424242424242';
/** Maps to failure_code `payment_rejected` — the closest test card to a real decline. */
const CARD_DECLINED = '4111111111110014';

const OMISE_FRAME = '#omise-checkout-iframe-app';

/**
 * The backend's origin, spelled out in full.
 *
 * <p>NOT a relative '/api/...' path. There is no dev-server proxy in this repo —
 * `environment.e2e.ts` points the app straight at `http://localhost:8181` — so a relative
 * fetch from the page resolves against :4210 and ng-serve answers it with index.html,
 * which surfaces as `SyntaxError: Unexpected token '<'` from `res.json()` rather than
 * anything that names the real problem. Kept in step with the config through the same
 * env var it reads.
 *
 * <p>Cross-origin is fine: the backend boots with APP_FRONTEND_URL=http://localhost:4210,
 * which is exactly the origin these calls come from, so dev CORS admits them.
 */
const API_ORIGIN = `http://localhost:${process.env['E2E_BACKEND_PORT'] ?? '8181'}`;

async function loginAsCustomer(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('app_language', 'th'));
  await page.goto('/login');
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[type="email"]').fill(CUSTOMER_EMAIL);
  await page.locator('input[type="password"]').fill(CUSTOMER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
}

/**
 * The fixture's booking id, resolved through the API rather than hardcoded.
 *
 * <p>`bookings.id` is a serial, so its value depends on how many rows the seed wrote
 * before it — pinning a literal would work on the machine it was written on and nowhere
 * else. Every other fixture in this repo resolves foreign keys through natural keys for
 * the same reason; `booking_number` is this table's.
 */
async function resolveBookingId(page: Page): Promise<number> {
  const found = await page.evaluate(
    async ({ bookingNumber, apiOrigin }) => {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${apiOrigin}/api/private/bookings/me?page=0&size=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const raw = await res.text();
      let body: { data?: unknown };
      try {
        body = JSON.parse(raw);
      } catch {
        // Almost always ng-serve's index.html, i.e. the call never reached the backend.
        return { error: `non-JSON response from ${apiOrigin}: ${raw.slice(0, 80)}` };
      }
      const data = body?.data as { content?: unknown } | unknown[] | undefined;
      const rows = (Array.isArray(data) ? data : data?.content) ?? [];
      const match = (rows as { id: number; bookingNumber: string }[]).find(
        (b) => b.bookingNumber === bookingNumber
      );
      return match ? { id: match.id } : { error: 'not found', seen: (rows as unknown[]).length };
    },
    { bookingNumber: BOOKING_NUMBER, apiOrigin: API_ORIGIN }
  );

  expect(
    (found as { error?: string }).error,
    `could not resolve ${BOOKING_NUMBER} from /bookings/me — is obrs-732-3ds-fixture.sql the ` +
      'fixture this run seeded? (E2E_FIXTURE_SQL in playwright.obrs732.config.ts)'
  ).toBeUndefined();
  return (found as { id: number }).id;
}

/** Land on /payment for the fixture's booking, card tab active. */
async function openPaymentPage(page: Page): Promise<void> {
  await loginAsCustomer(page);
  const bookingId = await resolveBookingId(page);
  await page.evaluate((id) => localStorage.setItem('active_booking_id', String(id)), bookingId);

  await page.goto('/payment');
  await expect(page.locator('app-payment-creditcard .payment-btn')).toBeVisible({
    timeout: 30_000,
  });
  // The amount is asserted on Omise's own button in payWithCard(), NOT here.
  // <app-payment-summary> renders from `scheduleBooking` + `scheduleFilter` in NgRx, which
  // are populated by walking steps 1-3 of the booking flow; a deep link straight to
  // /payment leaves them empty and the component legitimately renders nothing. Asserting
  // it here measured the deep link, not the money.
  //
  // OBRS-391 pins the absence too: a card field back on our origin is the regression
  // this whole lane sits downstream of.
  await expect(page.locator('#creditCardNo, #cvv')).toHaveCount(0);
}

/**
 * Fill Omise's hosted form and submit it.
 *
 * <p>Fields are addressed by the `data-testid` Omise puts on them, read out of a real
 * trace rather than guessed — the first attempt guessed `name="omise-card-number"` and
 * matched nothing. Two reasons to prefer these over the accessible names: the dialog
 * renders in Thai here (`locale` is passed through from our language), so a name-based
 * locator would silently be a translation assertion; and `id`/`class` are styled-components
 * hashes that change on their build. The ids are Omise's own and their spelling is
 * inconsistent (`card-number` but `expiryDate`) — mirrored verbatim, not normalised.
 *
 * <p>If this starts failing, open the retained trace and re-read the markup. Do not
 * loosen a selector until it matches something.
 */
async function payWithCard(page: Page, cardNumber: string): Promise<void> {
  await page.locator('app-payment-creditcard .payment-btn').click();

  const frame = page.frameLocator(OMISE_FRAME);
  await expect(page.locator(OMISE_FRAME)).toHaveAttribute(
    'src',
    /^https:\/\/cdn\.omise\.co\//,
    { timeout: 30_000 }
  );
  await expect(frame.locator('input:visible').first()).toBeVisible({ timeout: 30_000 });

  // ── The money, on the only surface the passenger actually reads it from. ──────
  // OBRS-391 shipped this dialog priced at "Pay 0.00 THB" because `amount` was omitted,
  // and NOTHING caught it except a screenshot a human looked at. `resolveAmountDue()`
  // now fetches paymentSummary.outstandingAmount at click time and converts to satang,
  // so this is the assertion that would have failed then and must fail again if anyone
  // re-breaks it. Note it is deliberately Omise's rendering, not our input.
  await expect(
    frame.locator('button[type="submit"]'),
    `Omise's own button must show ${EXPECTED_TOTAL} — a 0.00 here means the amount never ` +
      'reached OmiseCard.open() (see OBRS-391)'
  ).toContainText(EXPECTED_TOTAL, { timeout: 15_000 });

  await frame.locator('[data-testid="card-number"]').fill(cardNumber);
  await frame.locator('[data-testid="card-holder-name"]').fill('E2E THREEDS');
  await frame.locator('[data-testid="expiryDate"]').fill('12/32');
  await frame.locator('[data-testid="securityCode"]').fill('123');
  // The dialog carries an email field of its own (Omise's receipt address, unrelated to
  // our booking). Filled because leaving a field the form renders empty is a validation
  // failure waiting to be mistaken for a payment failure.
  await frame.locator('[data-testid="cardholder-email"]').fill(CUSTOMER_EMAIL);

  await frame.locator('[data-testid="submit-button"]').click();
}

test('a 3-D Secure card really leaves our origin, authenticates, and comes back with a real charge', async ({
  page,
}) => {
  await openPaymentPage(page);

  // Every main-frame navigation from here on, recorded as it happens.
  //
  // The alternative — waiting for the URL to be off-origin after the fact — is a race this
  // lane loses: in test mode the authorize URL carries `acs=false`, so Omise settles and
  // bounces back without an interactive screen, and the whole excursion can be over before
  // the wait begins. It would then sit for its full timeout and report "never left
  // localhost", which is both wrong and the exact wrong-blame this file has already made
  // twice. A listener installed before the click cannot miss it.
  const visitedHosts: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    try {
      visitedHosts.push(new URL(frame.url()).hostname);
    } catch {
      /* about:blank and friends */
    }
  });

  await payWithCard(page, CARD_SUCCESS);

  // ── The challenge itself. ─────────────────────────────────────────────────────
  // Omise hosts this page. With `acs=false` there is no interactive bank screen to click
  // through, so a success control is looked for but NOT required — waiting for one that
  // will never render would fail a journey that worked. When 3DS is later exercised with a
  // real ACS (acs=true), this branch is what carries it.
  //
  // Guarded on being ON an Omise host: the same text filter would happily match one of our
  // own confirm buttons once the journey is back on /e-ticket, and click it.
  if (page.url().includes('omise')) {
    const success = page
      .locator('button, input[type="submit"], a')
      .filter({ hasText: /success|authorize|complete|ยืนยัน/i })
      .first();
    if (await success.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await success.click();
    }
  }

  // ── Back on our origin, through return_uri. ───────────────────────────────────
  // This is where a mismatched APP_FRONTEND_URL shows up as ERR_CONNECTION_REFUSED.
  // The failure branch reports what is ON SCREEN rather than guessing why: three previous
  // revisions of this file each turned one symptom into a confident wrong diagnosis.
  //
  // /payment/result, NOT /e-ticket — and that is a boundary, not a relaxation. See the
  // block below AC 3.
  await page.waitForURL(/\/payment\/result/, { timeout: 90_000 }).catch(async () => {
    const dialog = await page
      .locator('.swal2-popup')
      .innerText()
      .catch(() => '(no dialog on screen)');
    throw new Error(
      `The journey never came back to /payment/result. Final URL: ${page.url()}. Dialog: ` +
        `"${dialog.trim()}". Hosts visited: ${JSON.stringify(visitedHosts)}. If that dialog ` +
        'reports a payment failure, the Omise error behind it is in the backend log — an ' +
        'expired secret key appears there as 403 key_expired_error.'
    );
  });

  // ── AC 2: prove 3DS actually happened, from the navigation log. ───────────────
  // If 3-D Secure were disabled the charge would come back `successful` with no
  // authorize_uri, the browser would never leave :4210, and /e-ticket above would still be
  // reached — green, having tested nothing. So the excursion is asserted explicitly.
  //
  // NOT from the charge response body, which is the obvious way and does not work: the app
  // redirects to `authorizeUri` the instant it arrives, and reading a response whose page
  // has already navigated away throws. An earlier revision wrapped that read in a `.catch`
  // and so reported "Omise issued no 3-D Secure challenge" for a run in which 3DS worked
  // perfectly — the third time this file converted an unrelated failure into a confident
  // wrong diagnosis. The navigation log is recorded as it happens and cannot be outrun.
  expect(
    visitedHosts.filter((h) => h.includes('omise')),
    'the journey never navigated to an Omise host, so no 3-D Secure challenge was issued. ' +
      `The charge carried return_uri and ${CARD_SUCCESS} is a documented Omise test card, so ` +
      'the remaining cause is that 3DS is not enabled on this test account — a request to ' +
      'support@omise.co, not a dashboard toggle (docs.omise.co/api-testing). Do NOT relax ' +
      'this to "or it just succeeded"; that turns the lane back into what it replaced. ' +
      `Hosts visited: ${JSON.stringify(visitedHosts)}`
  ).not.toHaveLength(0);
  expect(
    visitedHosts[visitedHosts.length - 1],
    'the journey should end back on our own origin'
  ).toBe('localhost');

  // ── AC 3: the server's opinion, not the URL's. ────────────────────────────────
  // Landing back on our origin only proves the browser found its way home. Whether a real
  // charge exists at Omise is a server-side fact, so ask the server.
  const summary = await page.evaluate(async (apiOrigin) => {
    const token = localStorage.getItem('auth_token');
    const id = localStorage.getItem('active_booking_id');
    const res = await fetch(`${apiOrigin}/api/private/bookings/${id}/payments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return (await res.json())?.data;
  }, API_ORIGIN);

  const cardTxn = (summary?.transactions ?? []).find(
    (t: { paymentMethod: string }) => t.paymentMethod === 'card'
  );
  expect(cardTxn, 'a CARD transaction should exist on the booking').toBeTruthy();
  // `chrg_test_…` is Omise's id for a charge that really exists in their test ledger. A
  // charge that never happened has no id, so this is the line that separates "the journey
  // rendered correctly" from "money machinery actually ran".
  expect(
    String(cardTxn?.transactionId ?? ''),
    'the transaction should carry the real Omise charge id'
  ).toMatch(/^chrg_/);

  // ── WHY `fully_paid` IS NOT ASSERTED HERE ─────────────────────────────────────
  // Not an oversight, and not a softened assertion — it is unreachable in this lane by
  // construction, and pretending otherwise would leave a permanently red test that looks
  // like a product defect.
  //
  // After 3DS the charge sits `pending` until Omise reports the authentication outcome, and
  // the ONLY thing in this system that flips it to paid is OmiseWebhookService — an INBOUND
  // call from Omise. Verified while writing this: <app-payment-result> merely polls
  // GET /bookings/{id}/payments every 3s, that endpoint reads the database and never asks
  // Omise anything, and no @Scheduled job reconciles pending charges. Omise cannot reach a
  // laptop's localhost, so the poll would spin until its own timeout however long we waited.
  //
  // What that costs is real and is stated plainly rather than hidden: the settle-after-3DS
  // step is NOT covered here. Covering it needs either a public tunnel to this machine or a
  // signed webhook posted by the test — a different lane with a different setup.
  //
  // What IS covered is the part nothing else in the suite can see: the browser leaving our
  // origin for Omise, authenticating, and finding its way back through return_uri, with a
  // real charge on the other side.
});

test('a declined card reports failure in Thai, with no Omise English on screen', async ({
  page,
}) => {
  // The must-NOT half. A success-only lane cannot tell "payment works" from "the page
  // says success no matter what", and OBRS-569 exists because Omise's own English
  // wording once reached a Thai passenger's screen.
  await openPaymentPage(page);

  // ── Why the response is inspected and not just the dialog. ────────────────────
  // This test PASSED once while proving nothing: the Omise secret key had expired, every
  // charge died at 403 before the card was ever considered, and the Thai "ระบบชำระเงินไม่
  // พร้อมใช้งานชั่วคราว" outage message satisfied every assertion below. A test that cannot
  // tell a declined card from a dead gateway is not testing declines. So the backend's own
  // error code is read off the wire first: GATEWAY_ERROR means the lane is broken, not that
  // the product handled a decline well.
  const chargeResponse = page.waitForResponse(
    (r) => r.url().includes('/api/private/payments') && r.request().method() === 'POST',
    { timeout: 90_000 }
  );
  await payWithCard(page, CARD_DECLINED);
  const chargeBody = await (await chargeResponse).json().catch(() => ({}));
  expect(
    chargeBody?.errorCode,
    'the charge failed for an infrastructure reason, not a card decline — this run says ' +
      'nothing about how declines are presented. Fix the gateway (see the backend log) and ' +
      're-run; do NOT delete this assertion.'
  ).not.toBe('GATEWAY_ERROR');

  const alert = page.locator('.swal2-popup');
  await expect(alert).toBeVisible({ timeout: 90_000 });

  const text = (await alert.innerText()).trim();
  expect(text.length, 'the failure alert should say something').toBeGreaterThan(0);
  // Omise's failure_code values, verbatim from docs.omise.co/api-testing: insufficient_fund,
  // stolen_or_lost_card, failed_processing, payment_rejected, failed_fraud_check — plus
  // invalid_security_code. None may reach a Thai passenger's screen; they belong in the
  // console. `payment_rejected` is listed first because it is the one THIS card produces,
  // i.e. the one that would actually leak.
  expect(text).not.toMatch(
    /payment_rejected|insufficient|stolen_or_lost|failed_processing|failed_fraud|invalid_security|declined/i
  );
  // And we must not have navigated as if it worked.
  await expect(page).not.toHaveURL(/\/e-ticket/);
});
