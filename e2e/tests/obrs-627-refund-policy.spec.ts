import { expect, Page, test } from '@playwright/test';
import { seedAnalyticsConsent } from '../support/analytics-consent';

/**
 * OBRS-627 — the published refund terms are the enforced ones.
 *
 * `/refund-policy` is linked from the site footer on every page and from
 * `/payment`, so a customer reads it before they hand over money. Until this
 * card it described a refund this system has never performed: submit the
 * original paper ticket plus two ID copies, wait three business days, come to
 * an office to collect cash, and forfeit the money if you do not come within
 * seven. The app has always let the customer cancel from My Bookings and
 * refunded automatically, and the page never named a refund rate at all.
 *
 * WHY THIS NEEDS A BROWSER, given the component already has a unit suite.
 * The unit suite proves the component interpolates whatever the service hands
 * it. It cannot see the two things that killed the equivalent claim one page
 * over on OBRS-564: whether the page a real user loads calls the endpoint at
 * all, and whether a raw `{{refundRateEarlyPercent}}` reaches the screen. Both
 * live in the assembled app — the route, the module, the real i18n JSON — and
 * none of it is present in a TestBed.
 *
 * The real `public/i18n/th.json` is what renders here, so this also asserts on
 * the SHIPPED wording rather than a fixture: the sentences the card exists to
 * delete must be gone from the page a customer actually sees.
 *
 * Hermetic on the same terms as the rest of the gate lane: `/api/**` is
 * fulfilled here and nothing is listening on :8080.
 */

const ok = <T>(data: T) => ({ code: 200, message: 'OK', data });

// Deliberately NOT the shipped 2 / 24 / 0.80 / 0.50. Those are the one set of
// values a hardcoded fallback would also produce, so a spec using them could not
// tell "rendered from the wire" from "rendered from a literal". 36h / 3h / 90% /
// 45% can only appear on screen if they crossed the network.
const WIRE = {
  cancelWindowHours: 3,
  earlyWindowHours: 36,
  refundRateEarly: 0.9,
  refundRateLate: 0.45,
  // OBRS-1136 AC-1, and 11 for exactly the reason above: 7 is the shipped default, so a page
  // that had gone back to typing the wait into i18n would still read 7 and this spec could not
  // tell the difference.
  manualRefundDueDays: 11,
};

/**
 * Every DEMAND the card exists to remove, in the shipped Thai.
 *
 * Each needle is the affirmative phrasing only. `ตั๋วโดยสารตัวจริง` ("the
 * original ticket") is deliberately NOT in this list even though it is the
 * headline thing being retired: the new copy says the customer does not need
 * one, and a substring check cannot tell a demand from its rebuttal. This list
 * caught that on its first run — the assertion was wrong, not the page. Anchor
 * on the document-list header instead, which only ever appears where the
 * documents were actually being required.
 */
const RETIRED_TH = [
  'เอกสารที่ใช้ในการคืนตั๋วโดยสาร', // the "documents required" list header
  'สำเนาบัตรประจำตัวประชาชน',       // the ID copies
  '3 วันทำการ',                    // "within 3 business days of complete documents"
  'ติดต่อรับเงินภายใน 7 วันทำการ',  // the in-person pickup deadline
  'ขอสงวนสิทธิ์ไม่คืนเงิน',         // the forfeiture the system never enforced
];

async function stubPolicy(page: Page, body: unknown, status = 200): Promise<void> {
  await page.route('**/api/cancellation-policy', (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  );
  // Anything else this page's shell reaches for (navbar/footer) gets an empty OK
  // rather than an ECONNREFUSED that would surface as a global error alert.
  await page.route('**/api/**', (route) =>
    route.request().url().includes('/api/cancellation-policy')
      ? route.fallback()
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) })
  );
}

test.beforeEach(async ({ page }) => {
  await seedAnalyticsConsent(page);
});

test('states the rates that came off the wire, and none of the retired paper-ticket terms', async ({
  page,
}) => {
  await stubPolicy(page, ok(WIRE));
  await page.goto('/refund-policy');

  const rates = page.getByTestId('refund-policy-rates');
  await expect(rates).toBeVisible();

  const card = page.locator('.policy-card');
  const text = (await card.innerText()).replace(/\s+/g, ' ');

  // The wire values, not the shipped defaults.
  expect(text).toContain('36');
  expect(text).toContain('90%');
  expect(text).toContain('45%');
  expect(text).toContain('3');

  // The failure mode a unit test cannot see: a placeholder that reached a user.
  expect(text).not.toContain('{{');

  for (const retired of RETIRED_TH) {
    expect(text, `retired clause still published: ${retired}`).not.toContain(retired);
  }

  // OBRS-1136 AC-1: the manual-refund wait is published here too, and from the same wire.
  // Note it is CALENDAR days — '3 วันทำการ' above is a retired clause, and the new sentence
  // must not reintroduce the business-day unit the clock does not count in.
  await expect(page.getByTestId('refund-policy-manual-timing')).toBeVisible();
  expect(text).toContain('11');
  expect(text).not.toContain('วันทำการ');
});

/**
 * OBRS-1136 AC-1's other half. The frontend (Netlify) and the backend (Koyeb) deploy
 * separately, so for a few minutes on every release a build is live against a backend that
 * does not send this field. The page must then say NOTHING about timing — never a default
 * somebody typed here — while the rates it DID receive still render.
 */
test('a policy response without the manual-refund wait: no timing sentence, rates unaffected', async ({
  page,
}) => {
  const { manualRefundDueDays: _omitted, ...withoutWait } = WIRE;
  await stubPolicy(page, ok(withoutWait));
  await page.goto('/refund-policy');

  await expect(page.getByTestId('refund-policy-rates')).toBeVisible();
  await expect(page.getByTestId('refund-policy-manual-timing')).toHaveCount(0);

  const text = (await page.locator('.policy-card').innerText()).replace(/\s+/g, ' ');
  expect(text).toContain('90%');
  expect(text).not.toContain('{{');
});

/**
 * AC-3, and the reason this endpoint was built rather than the numbers typed in.
 * Publishing a WRONG refund rate is worse than publishing none: the customer
 * relies on it before paying. So a failed read must show an error and state no
 * rate — never quietly substitute the shipped defaults the way the home page's
 * date-picker legitimately does for its own cap.
 */
test('on a failed config read: an inline error and NO rate at all', async ({ page }) => {
  await stubPolicy(page, { code: 500, message: 'boom', data: null }, 500);
  await page.goto('/refund-policy');

  await expect(page.getByTestId('refund-policy-rates-error')).toBeVisible();
  await expect(page.getByTestId('refund-policy-rates')).toHaveCount(0);

  const text = (await page.locator('.policy-card').innerText()).replace(/\s+/g, ' ');
  expect(text).not.toContain('80%');
  expect(text).not.toContain('50%');
  expect(text).not.toContain('{{');

  // The non-numeric half of the notice still renders — a customer who arrives
  // during an outage still learns they can cancel in the app.
  expect(text).toContain('การจองของฉัน');
});

/**
 * AC-5. `/refund-policy` is now the single source of the refund terms and
 * `/business-policy` item 7, which used to repeat them verbatim, points here.
 * Asserting the round trip in a browser is what proves the two routerLinks
 * resolve — a unit test only sees the attribute.
 */
test('cross-links with /business-policy in both directions', async ({ page }) => {
  await stubPolicy(page, ok(WIRE));
  await page.goto('/refund-policy');

  await page.locator('.policy-cross-link a').click();
  await expect(page).toHaveURL(/\/business-policy$/);

  // Anchored on the href since OBRS-629: /business-policy now carries a second cross-link (to
  // /parcel-policy), so a bare `.policy-cross-link a` is a strict-mode violation here, not a link.
  await page.locator('.policy-cross-link a[href="/refund-policy"]').click();
  await expect(page).toHaveURL(/\/refund-policy$/);
  await expect(page.getByTestId('refund-policy-rates')).toBeVisible();
});
