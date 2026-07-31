import { Page, expect, test } from '@playwright/test';

/**
 * OBRS-391 evidence capture — see playwright.obrs391.config.ts for how to run it
 * (two hand-started servers, no backend).
 *
 * <p>BEFORE and AFTER differ by ONE variable: the tree being served. Same
 * viewport, same seeded booking, same stubs, same language.
 *
 * <p>Every shot asserts what it is supposed to show BEFORE shooting, and asserts
 * that no SweetAlert overlay is on screen — a capture taken over a "cannot load"
 * dialog is worse than no capture, because it looks like proof.
 */

const BEFORE = 'http://localhost:4391';
const AFTER = 'http://localhost:4392';
const ASSETS = 'e2e-evidence/OBRS-391';

const MOBILE = { width: 390, height: 664 };

const ok = <T>(data: T) => ({ code: 200, message: 'OK', data });

/**
 * Enough state for /payment to render: the component reads the active booking id
 * and polls that booking's payments. Language is pinned to Thai because that is
 * what a passenger here actually sees, and the new hint line is the one piece of
 * copy this card adds.
 */
async function preparePaymentPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('active_booking_id', '123');
  });

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    // `outstandingAmount` is not decoration here: AFTER, the component reads this
    // to tell Omise what its dialog should say is due, and refuses to open one it
    // cannot price. A summary without it would leave the dialog shots failing for
    // a reason that has nothing to do with the thing being evidenced.
    const body = path.endsWith('/private/bookings/123/payments')
      ? ok({
          paymentSummary: {
            totalAmount: '1234.50',
            paidAmount: '0',
            outstandingAmount: '1234.50',
            currency: 'THB',
            status: 'pending',
          },
          transactions: [],
        })
      : ok(null);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

/** No dialog may be covering the page when a shot is taken. */
async function assertUncontaminated(page: Page): Promise<void> {
  await expect(page.locator('.swal2-container')).toHaveCount(0);
}

const payButton = (page: Page) => page.locator('app-payment-creditcard .payment-btn');

/** The review surface: the payment card itself, not the whole marketing page. */
const paymentCard = (page: Page) => page.locator('app-payment-creditcard .payment-card');

async function openPayment(page: Page, origin: string): Promise<void> {
  await preparePaymentPage(page);
  await page.goto(`${origin}/payment`, { waitUntil: 'domcontentloaded' });
  await expect(payButton(page)).toBeVisible({ timeout: 30_000 });
}

/**
 * Shoot the payment card, growing the WINDOW until the whole card fits first.
 *
 * <p>Never scroll to compensate for an over-tall element: Playwright does not
 * stitch: it returns the element's full box with the off-screen part UNPAINTED,
 * which is how OBRS-702's first evidence upload went out 44% blank white. The
 * BEFORE card is the taller of the two (it carries three input rows this branch
 * removes), so at 390x664 it does not fit and this is not hypothetical.
 *
 * <p>Sized from a live measurement rather than a constant, so a layout change
 * cannot silently reintroduce the clipping.
 */
async function shootPaymentCard(page: Page, file: string): Promise<void> {
  const card = paymentCard(page);
  await expect(card).toBeVisible({ timeout: 30_000 });

  const width = page.viewportSize()!.width;
  const bottom = await card.evaluate((el) => Math.ceil(el.getBoundingClientRect().bottom));
  if (bottom + 40 > page.viewportSize()!.height) {
    await page.setViewportSize({ width, height: bottom + 40 });
  }

  // Re-measure: a taller window can re-flow the layout it was measured from.
  await expect
    .poll(
      async () => card.evaluate((el) => Math.ceil(el.getBoundingClientRect().bottom)),
      { timeout: 5_000 }
    )
    .toBeLessThanOrEqual(page.viewportSize()!.height);

  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled, 'nothing may be scrolled when the card shot is taken').toBe(0);

  await assertUncontaminated(page);
  await card.screenshot({ path: `${ASSETS}/${file}` });
}

test('BEFORE (origin/dev 45c66cbd) — desktop: PAN, expiry and CVV are our own inputs', async ({
  page,
}) => {
  await openPayment(page, BEFORE);

  // The subject of the card. If these are absent the BEFORE server is serving the
  // wrong tree and the comparison is meaningless.
  await expect(page.locator('#creditCardNo')).toBeVisible();
  await expect(page.locator('#cvv')).toBeVisible();
  await expect(page.locator('p-datepicker')).toBeVisible();

  await shootPaymentCard(page, 'before-payment-desktop.png');
});

test('BEFORE — mobile 390x664', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await openPayment(page, BEFORE);

  await expect(page.locator('#creditCardNo')).toBeVisible();
  await expect(page.locator('#cvv')).toBeVisible();

  await shootPaymentCard(page, 'before-payment-mobile.png');
});

test('AFTER — desktop: no card field on our origin at all', async ({ page }) => {
  await openPayment(page, AFTER);

  // Absence is asserted alongside a POSITIVE check (the pay button above), so a
  // page that failed to render cannot pass this as "no card inputs".
  await expect(page.locator('#creditCardNo, #cvv')).toHaveCount(0);
  await expect(page.locator('app-payment-creditcard p-datepicker')).toHaveCount(0);
  await expect(page.locator('app-payment-creditcard input')).toHaveCount(0);
  await expect(page.locator('.hosted-card-hint')).toBeVisible();

  await shootPaymentCard(page, 'after-payment-desktop.png');
});

test('AFTER — mobile 390x664', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await openPayment(page, AFTER);

  await expect(page.locator('#creditCardNo, #cvv')).toHaveCount(0);
  await expect(page.locator('app-payment-creditcard input')).toHaveCount(0);
  await expect(page.locator('.hosted-card-hint')).toBeVisible();

  await shootPaymentCard(page, 'after-payment-mobile.png');
});

/**
 * The shot that carries the actual claim of this card: the fields still exist,
 * they are just not ours any more.
 *
 * <p>`cdn.omise.co` is reached for real here. The assertions below are what make
 * the image evidence rather than decoration — an iframe on a third-party origin,
 * displayed, with a card-number field INSIDE it that Playwright can only reach
 * through `frameLocator`. `page.locator('#creditCardNo')` cannot see across an
 * origin boundary, and that inability is precisely what SAQ A is about.
 */
async function openOmiseDialog(page: Page): Promise<void> {
  await openPayment(page, AFTER);
  await payButton(page).click();

  const frame = page.locator('#omise-checkout-iframe-app');
  await expect(frame).toHaveAttribute('src', /^https:\/\/cdn\.omise\.co\//, {
    timeout: 30_000,
  });
  // The bundle creates the iframe hidden at configure() time and only flips it to
  // `block` on open(), so an attached-but-hidden frame is the shape a broken
  // integration would leave behind.
  await expect(frame).toBeVisible({ timeout: 30_000 });

  // Wait for Omise's own form, not a stopwatch: the frame's first paint is a
  // blank white box and a shot taken there would show nothing at all.
  //
  // `:visible` is required, not tidiness. Omise's pay.html carries hidden
  // bookkeeping inputs — the first run of this spec matched
  // `<input type="hidden" name="location">` and timed out waiting for a field
  // that is hidden by definition, while the dialog was in fact rendered
  // correctly behind it. Asserting a VISIBLE field is also the stronger claim:
  // it is the one a passenger actually types into.
  await expect(
    page.frameLocator('#omise-checkout-iframe-app').locator('input:visible').first()
  ).toBeVisible({ timeout: 30_000 });

  // The submit button must state the REAL total. Two capture runs of this spec
  // were needed to get here and both findings are pinned by this one assertion:
  // with no `amount` the button read "Pay 0.00 THB", and adding a `submitLabel`
  // PREFIXED it rather than replacing it ("ชำระเงิน 0.00 THB"). The stub above
  // says 1234.50 THB is outstanding, so that is what a passenger must be asked
  // for. Asserted rather than left to whoever looks at the PNG — nobody re-reads
  // a screenshot for a regression.
  const submit = page.frameLocator('#omise-checkout-iframe-app').locator('button[type="submit"]');
  await expect(submit).toContainText('1,234.50', { timeout: 15_000 });
  await expect(submit).not.toContainText('0.00');
}

test('AFTER — desktop: the card fields now live in Omise\'s cross-origin iframe', async ({
  page,
}) => {
  await openOmiseDialog(page);
  await assertUncontaminated(page);

  await page.screenshot({ path: `${ASSETS}/after-omise-dialog-desktop.png` });
});

test('AFTER — mobile: the same dialog at 390x664', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await openOmiseDialog(page);
  await assertUncontaminated(page);

  await page.screenshot({ path: `${ASSETS}/after-omise-dialog-mobile.png` });
});
