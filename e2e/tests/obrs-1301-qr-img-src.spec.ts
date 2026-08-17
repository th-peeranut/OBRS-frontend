import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { test, expect, Page } from '@playwright/test';
import { seedCustomerSession, seedStore } from '../support/customer-pages';

/**
 * OBRS-1301 AC-3 — the gate that fires.
 *
 * THE DEFECT THIS EXISTS FOR is a load that has not happened yet. `img-src` names no
 * gateway host: OBRS-1379 removed `api.omise.co` and the S3 bucket its `download_uri`
 * 302s to, in the same commit that made the QR same-origin. So the day anything puts an
 * Omise URL back into the QR `<img>` — the legacy `transactions[].gatewayResponse` branch
 * of `getQrImageSource()` still yields one, and a backend change is all it takes to reach
 * it — the browser drops the load, `onQrError()` clears the frame, and the customer is
 * left looking at a blank square on the payment page with a 15-minute timer running. No
 * exception, no console error of our own, nothing on screen. That is why the card calls
 * it the most expensive shape of defect: it is not broken today, and the change that
 * breaks it will be made by someone with no reason to think about CSP.
 *
 * WHY THE GATES THAT ALREADY EXIST CANNOT SEE IT. `CspAllowlistMatchesInventoryTest` and
 * `check-payment-page-scripts.mjs` both assert that the allowlist matches the prose
 * inventory. Neither changes when a backend starts forwarding a different URL, because
 * nothing in the allowlist or the inventory moves. They watch whether the documents agree;
 * this watches what the app actually asks the browser to load.
 *
 * THE HEADER HERE IS ENFORCING AND IS READ FROM `netlify.toml`, NOT RETYPED. Report-Only
 * blocks nothing, so it cannot answer this question at all (OBRS-888/889). One directive
 * only — `img-src`, exactly as published — so the run measures the QR and cannot be turned
 * red by an unrelated directive that the dev server happens to violate.
 *
 * THE THREE CASES ARE A SET, and the first is why the other two mean anything:
 *   1. positive control — a blocked image really does reach the listener under this header.
 *      Without it, cases 2 and 3 could both pass while nothing was ever being measured.
 *   2. must-NOT-catch — the shape prod sends today renders, with zero violations.
 *   3. must-catch — the shape the card predicts is refused BEFORE it reaches `<img src>`,
 *      and the customer is told. Red on the code as it stood before this card: there the
 *      URL was bound, the browser blocked it, and the frame went quietly empty.
 */

/** The QR image and the empty frame that replaces it. Both come from the same `@if`. */
const QR_IMAGE = '.qr-image';
const QR_PLACEHOLDER = '.qr-placeholder';
const QR_PANEL = '.qr-panel';
/** AlertService renders into document.body, outside the component's own DOM. */
const ALERT = '.swal2-popup';

/**
 * A host on Omise's side of the fence, in the exact shape the backend forwarded during
 * OBRS-1351: `charge.source.scannable_code.image.download_uri`. It is a fixture, never a
 * request this spec issues — the header below stops it before DNS is consulted, which is
 * just as well, since this lane resolves nothing but localhost.
 */
const BLOCKED_QR_URL =
  'https://api.omise.co/charges/chrg_test_68pg4kb9eakt7batypq/documents/docu_test_68pg4kbc4/downloads/8B0B4B0C';
const BLOCKED_ORIGIN = 'https://api.omise.co';

/**
 * A real 120px QR of an EMVCo-shaped PromptPay payload. The assertion only needs
 * `naturalWidth > 0`, so a 1x1 pixel would do — but the AFTER capture this run writes is
 * card evidence, and a 1x1 scaled into the frame photographs as a solid coloured square
 * that reads as a BROKEN QR. The bytes are the difference between evidence and something
 * a reviewer has to be talked out of misreading.
 */
const QR_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAAAAAklEQVR4AewaftIAAASLSURBVO3BUY4cORbAQFKo+1+Z658E' +
    'HgxUutLd4/FoFWE/cGxrcWxtcWxtcWztxU9U/pSKJ1Smin+LylRxR+VPqbgsjq0tjq0tjq29+IWK76TyKZWp4gmVqeJTKlPF' +
    'd6n4TirvLI6tLY6tLY6tvXhI5YmKT6lMFXdUpoqpYlL5VMWkckdlqviUyhMVn1ocW1scW1scW3vxF6mYVKaKqWJSuVNxUfmK' +
    'iv+CxbG1xbG1xbG1F/+nKu6oTBX/RYtja4tja4tjay8eqvhTKiaVr1B5p2Kq+FMq/imLY2uLY2uLY2svfkHlT1GZKu5UTCpT' +
    'xaRyqZhUpopJZaqYVKaKd1T+lMWxtcWxtRc/qfhbVUwqU8WnVKaKSeWJijsV/4bFsbXFsbXFsbUXP1F5omJS+VMqJpWpYqp4' +
    'R+VOxRMq71Q8oTJVfGpxbG1xbG1xbO3FQxWTylTxKZWpYlKZKiaVJ1TeqZhUJpUnKiaVi8pXqEwV7yyOrS2OrS2Orb34hYpJ' +
    '5Y7KpyruVEwq36Xi31IxqUwVT6hMFZfFsbXFsbXFsbUXv6DyRMWnVKaKSeVOxaQyqUwVF5Wp4k7FEypTxUVlqphUpopJZap4' +
    'Z3FsbXFsbXFszX7ghspUcUdlqphUPlUxqdypuKNyqbijcqdiUpkqJpXfVTGp3Km4LI6tLY6tLY6tvfiJylQxqdypmFSmih2o' +
    'TBWTylRxUZkq/imLY2uLY2uLY2svHqp4omJSeafiiYrfpTJVTBWTylRxp2JSuVQ8oTJVTCrvLI6tLY6tvfhJxaTyFRVTxTsq' +
    'U8VUMalMFXcq3lH5CpU7FReVOxXfZXFsbXFsbXFs7cVPVO5U3FGZVN6puKMyVUwVk8pUMalcKu5UTCqTyp2KSeVSMalMKt9l' +
    'cWxtcWxtcWzNfuALVKaKSWWquKhMFZPKVDGpPFFxUfmKiknlTsWnVKaKSWWqeGdxbG1xbG1xbO3FT1SmiidUpopJ5VIxqdxR' +
    '+S4Vk8pU8RUVk8qlYlKZKu5UTCpTxWVxbG1xbG1xbM1+4IbKVHFH5U7FReVOxRMqv6viCZWpYlKZKi4qU8UTKlPFO4tja4tj' +
    'a4tja/YDg8pUcUdlqrij8k7FpPIVFZPKpeKOyt+qYlKZKi6LY2uLY2uLY2v2A38JlaliUrlTMal8quKOyhMVn1L5iop3FsfW' +
    'FsfWFsfWXvxE5U+puKMyVdxRuVNxUZlU7lRMKk+oXCruVDyhMlVcFsfWFsfWXvxCxXdS+VTFpHKn4o7Kpyq+U8XvUpkqpop3' +
    'FsfWFsfWFsfWXjyk8kTFP6XiiYpPqUwVU8WkMqn8LpWpYlK5U3FZHFtbHFtbHFt78RepeELliYqLylQxVUwqdyomlaniojJV' +
    'TCpPVLyzOLa2OLa2OLb24i+i8qdUPFFxR2WqeKdiUpkqJpWpYlKZKi6LY2uLY2uLY2svHqr4r6iYVC4Vk8pU8UTFpPJOxVQx' +
    'qTxR8c7i2Nri2Nri2NqLX1D5W1RMKndUporfpfJExadUpopJ5Y7KVHFZHFtbHFtbHFuzHzi2tTi2tji29j+6Wn3XfdojwAAA' +
    'AABJRU5ErkJggg==',
  'base64'
);

const BOOKING_ID = 501;
/** What the backend answers with today (OBRS-1379): our own path, fetched and bound as a blob:. */
const SAME_ORIGIN_QR_PATH = `/api/private/payments/${BOOKING_ID}/qr`;

/**
 * The `img-src` this repo publishes, taken from the file that publishes it. Retyping the
 * list here would make this spec a second source of truth that agrees with the header
 * until the day someone edits one of them — which is the failure mode the whole OBRS-889
 * seam exists to avoid.
 *
 * `netlify.toml` and `OBRS-backend/deploy/prod/Caddyfile` were compared token by token on
 * 2026-08-17 and their `img-src` lists differ in exactly one entry — the Supabase project
 * ref, SIT's vs prod's, which is deliberate. Neither names an omise.co origin, so for the
 * question this spec asks they are the same policy, and this repo's copy is the one a
 * change here can break. Prod already serves its copy as the enforcing header; SIT's is
 * still Report-Only, which is precisely why it has to be re-served enforcing to be tested.
 */
function publishedImgSrc(): string {
  const toml = readFileSync(resolve(process.cwd(), 'netlify.toml'), 'utf8');
  const policies = [...toml.matchAll(/Content-Security-Policy(?:-Report-Only)?\s*=\s*"([^"]*)"/g)];
  if (policies.length !== 1) {
    throw new Error(
      `netlify.toml declares ${policies.length} CSP header(s); this spec was written when ` +
        `there was exactly one and cannot tell which of several to measure. Point it at the ` +
        `one that governs /payment.`
    );
  }

  const directive = policies[0][1]
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('img-src'));
  if (!directive) {
    throw new Error('netlify.toml publishes a CSP with no img-src directive at all.');
  }
  return directive;
}

const IMG_SRC = publishedImgSrc();

/**
 * The premises the two arms rest on, checked against the real header rather than assumed.
 * If either flips, the arms below stop measuring what their names claim and this says so
 * instead of passing quietly.
 */
test('the published img-src still makes both arms of this gate meaningful', () => {
  expect(
    IMG_SRC.split(/\s+/),
    'img-src must allow blob: — the QR is fetched and bound as one (OBRS-1379). Without it ' +
      'the must-NOT-catch arm below is not measuring a policy that permits the QR at all.'
  ).toContain('blob:');

  expect(
    IMG_SRC,
    `img-src now names ${BLOCKED_ORIGIN}, so the must-catch arm below is no longer pointed at ` +
      `a BLOCKED origin and proves nothing. If that origin was re-added deliberately, re-point ` +
      `BLOCKED_QR_URL at a host img-src does not name — and check that the S3 bucket the ` +
      `download_uri 302s to was added too, because CSP checks every hop (OBRS-888).`
  ).not.toContain(BLOCKED_ORIGIN);
});

test.describe('OBRS-1301 AC-3: the QR under an enforcing img-src', () => {
  test.beforeEach(async ({ page }) => {
    await seedCustomerSession(page, false);

    await page.addInitScript((bookingId) => {
      // BookingService.getActiveBookingId() reads this; without it the component returns
      // before it ever asks for a payment.
      localStorage.setItem('active_booking_id', String(bookingId));

      (window as unknown as { __cspViolations: unknown[] }).__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        (window as unknown as { __cspViolations: unknown[] }).__cspViolations.push({
          directive: event.violatedDirective,
          blockedURI: event.blockedURI,
        });
      });
    }, BOOKING_ID);

    // The document, and only the document: the dev server has no CSP of its own, so this is
    // where the published policy gets put back on.
    await page.route(
      (url) => url.pathname === '/payment',
      async (route) => {
        if (route.request().resourceType() !== 'document') {
          await route.fallback();
          return;
        }
        const response = await route.fetch();
        await route.fulfill({
          response,
          headers: { ...response.headers(), 'content-security-policy': IMG_SRC },
        });
      }
    );
  });

  /**
   * Card evidence, off by default. `OBRS_CAPTURE=1 npm run e2e:gate -- obrs-1301-qr-img-src`
   * writes the two arms into `e2e-evidence/` (gitignored). Same shape as the
   * `OBRS_CAPTURE_STAGE` switch obrs-1222-capture uses, and for the same reason: the image
   * has to come out of the run that made the assertion, not a re-enactment of it.
   */
  async function captureIfAsked(page: Page, name: string): Promise<void> {
    if (!process.env['OBRS_CAPTURE']) return;
    // The QR panel sits below the fold at this lane's 1280x720, so an unscrolled viewport
    // shot photographs the stepper and calls it evidence. Scroll to the thing being claimed.
    await page.locator(QR_PANEL).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `e2e-evidence/OBRS-1301-AFTER-${name}.png` });
  }

  async function imgSrcViolations(page: Page): Promise<{ blockedURI: string }[]> {
    return page.evaluate(
      () =>
        (
          window as unknown as {
            __cspViolations: { directive: string; blockedURI: string }[];
          }
        ).__cspViolations.filter((v) => v.directive.startsWith('img-src'))
    );
  }

  /** Answer `POST /api/private/payments` with `data`, and serve the same-origin QR bytes. */
  async function stubPaymentCreate(page: Page, data: unknown): Promise<void> {
    await page.route(`**${SAME_ORIGIN_QR_PATH}`, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: QR_PNG })
    );
    // Registered after seedCustomerSession's catch-all, so it wins.
    await page.route('**/api/private/payments', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'OK', data }),
      })
    );
  }

  async function openPaymentPage(page: Page): Promise<void> {
    await page.goto('/payment');
    // The total the QR is for. watchAmount() only asks for a payment once it is above zero.
    await seedStore(page);
    // `activePaymentTab` starts at 'creditcard', so app-payment-qrcode is not in the DOM at
    // all until this click -- its ngOnInit, and therefore the whole QR path, is downstream
    // of it. Clicking beats setting the field: this is the door the customer uses.
    await page.getByRole('button', { name: /QR Payment/i }).click();
  }

  test('positive control: a blocked image reaches the violation listener under this header', async ({
    page,
  }) => {
    // The same document, under the same header — but no store and no QR tab, because the
    // question here is only whether the header and the listener work.
    await page.goto('/payment');

    await page.evaluate((url) => {
      const probe = document.createElement('img');
      probe.src = url;
      probe.alt = '';
      document.body.appendChild(probe);
    }, `${BLOCKED_ORIGIN}/favicon.ico`);

    await expect
      .poll(async () => (await imgSrcViolations(page)).length, {
        message:
          'No img-src violation was reported for an image on an origin img-src does not name. ' +
          'The header is not being enforced, or the listener is not attached — either way the ' +
          'two arms below would pass without measuring anything.',
      })
      .toBeGreaterThan(0);

    const violations = await imgSrcViolations(page);
    expect(violations.some((v) => v.blockedURI.startsWith(BLOCKED_ORIGIN))).toBe(true);
  });

  test('must-NOT-catch: the shape prod sends today renders, with no violation', async ({
    page,
  }) => {
    await stubPaymentCreate(page, {
      id: 7001,
      bookingId: BOOKING_ID,
      status: 'pending',
      paymentMethod: 'qr_promptpay',
      amount: 180,
      currency: 'THB',
      transactionId: 'chrg_test_obrs1301_same_origin',
      authorizeUri: 'https://pay.omise.co/offsites/ofsp_test_obrs1301/pay',
      qrImageUrl: SAME_ORIGIN_QR_PATH,
    });

    await openPaymentPage(page);

    const qr = page.locator(QR_IMAGE);
    await expect(qr).toBeVisible();

    // A bound src is not a rendered image: a CSP-blocked <img> keeps its attribute and
    // decodes to nothing. naturalWidth is the half that CSP can take away.
    await expect
      .poll(() => qr.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);

    expect(
      await qr.evaluate((el: HTMLImageElement) => el.src.slice(0, 5)),
      'The QR must be bound as a blob: — the whole reason img-src needs no gateway origin.'
    ).toBe('blob:');

    expect(await imgSrcViolations(page)).toEqual([]);
    await captureIfAsked(page, '0-same-origin-qr-renders');
  });

  test('must-catch: a QR on an origin img-src does not name never reaches <img src>, and the customer is told', async ({
    page,
  }) => {
    // The legacy gateway-response shape. `getQrImageSource()` walks
    // transactions[].gatewayResponse.source.scannable_code.image.download_uri and returns the
    // Omise URL from it — this is the branch the card predicted a backend change would wake up.
    await stubPaymentCreate(page, {
      bookingId: BOOKING_ID,
      paymentSummary: {
        totalAmount: '180.00',
        paidAmount: '0.00',
        outstandingAmount: '180.00',
        currency: 'THB',
        status: 'pending',
      },
      transactions: [
        {
          transactionId: 'chrg_test_obrs1301_gateway_url',
          status: 'pending',
          paymentMethod: 'qr_promptpay',
          amount: 180,
          currency: 'THB',
          gatewayResponse: JSON.stringify({
            source: { scannable_code: { image: { download_uri: BLOCKED_QR_URL } } },
          }),
        },
      ],
    });

    await openPaymentPage(page);

    // Loud: the same message a failed fetch produces, because it is the same failure.
    await expect(page.locator(ALERT)).toBeVisible();

    // Silent is what this gate forbids. The frame must be the empty placeholder, NOT an
    // <img> holding a URL the browser refused.
    await expect(page.locator(QR_PLACEHOLDER)).toBeVisible();
    await expect(page.locator(QR_IMAGE)).toHaveCount(0);
    await captureIfAsked(page, '1-gateway-origin-refused-and-said-so');

    // Nothing was ever requested, so there is nothing for the browser to block. A violation
    // here means the URL was bound after all and this gate is only watching the aftermath.
    expect(
      await imgSrcViolations(page),
      'The QR URL reached <img src> and the browser blocked it. That is the silent failure ' +
        'this card is about: onQrError() empties the frame and says nothing. Refuse the URL ' +
        'in loadQrImage() instead, or add its origin to netlify.toml, the prod Caddyfile and ' +
        'the inventory — all three, in the same change.'
    ).toEqual([]);
  });
});
