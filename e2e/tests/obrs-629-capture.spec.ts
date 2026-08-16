import { Page, expect, test } from '@playwright/test';
import { seedGateAdminSession } from '../support/gate-admin-session';
import { seedAnalyticsConsent } from '../support/analytics-consent';

/**
 * OBRS-629 evidence capture — see playwright.obrs629capture.config.ts for how to run it.
 *
 * Every shot asserts what it is supposed to show BEFORE shooting it: a screenshot of a page that
 * silently failed to render the thing under test looks exactly like proof, which is the failure
 * mode this file exists to avoid.
 *
 * Screenshots land in e2e-evidence/ (gitignored) — the only prefix the e2e lane gate allows — are
 * uploaded to the card from there, then deleted.
 */

const ASSETS = 'e2e-evidence/obrs-629';

const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'OK', data }),
});

/** The config the published limits must come from — AC-3's whole point. */
const PARCEL_POLICY = {
  maxWeightKg: 100,
  carryOnFreeSizeMaxInch: 28,
  carryOnFreeAisleMaxPerTrip: 10,
  prohibitedCategories: ['flammable', 'explosive', 'weapon', 'narcotic', 'corpse'],
};

async function stubParcelPolicy(page: Page): Promise<void> {
  await page.route('**/api/parcel-policy', (route) => route.fulfill(ok(PARCEL_POLICY)));
}

/**
 * A fresh Playwright context has never answered the PDPA analytics question, so OBRS-867's banner
 * is up and `position: fixed; bottom: 0` — it covered clause 2 in the first run of this spec. The
 * settled answer is also the state a returning reader is in, so this is the honest layout, not a
 * cosmetic suppression (see e2e/support/analytics-consent.ts). Staff shots get it via
 * seedGateAdminSession, which already seeds it.
 */
async function seedSettledConsent(page: Page): Promise<void> {
  await seedAnalyticsConsent(page);
}

test.describe('OBRS-629 — parcel carriage terms', () => {
  test('AFTER-0: /parcel-policy renders all twelve clauses, with the limits from live config', async ({ page }) => {
    await seedSettledConsent(page);
    await stubParcelPolicy(page);
    await page.goto('/parcel-policy');

    // Clause 3 must show the CONFIG numbers, not a literal — the shot is worthless otherwise.
    const body = page.locator('.policy-card');
    await expect(body).toContainText('100');
    await expect(body).toContainText('28');
    // Clause 8's ceiling, the number the owner set from ระเบียบ ข้อ 82.
    await expect(body).toContainText('500');
    // Clause 2's list comes from the same config the intake check blocks on.
    await expect(page.locator('[data-testid="parcel-policy-prohibited"] li')).toHaveCount(5);
    // And no placeholder ever reaches a reader.
    await expect(body).not.toContainText('{{');

    await page.screenshot({ path: `${ASSETS}/OBRS-629-AFTER-0-parcel-policy-page.png`, fullPage: true });
  });

  test('AFTER-1: when the config cannot be read, clause 3 shows an error and retry — never an invented number', async ({ page }) => {
    await seedSettledConsent(page);
    await page.route('**/api/parcel-policy', (route) => route.abort());
    await page.goto('/parcel-policy');

    const body = page.locator('.policy-card');
    await expect(page.locator('.policy-inline-error')).toBeVisible();
    // The claim this shot makes: no fallback limit is printed in place of the missing one.
    await expect(body).not.toContainText('100');
    await expect(body).not.toContainText('28');
    // The other eleven clauses are not config-dependent and stay readable through the outage.
    await expect(body).toContainText('500');

    await page.screenshot({ path: `${ASSETS}/OBRS-629-AFTER-1-limits-unavailable.png`, fullPage: true });
  });

  test('AFTER-2: the footer carries a fifth link — the one the card reports as missing', async ({ page }) => {
    await seedSettledConsent(page);
    await stubParcelPolicy(page);
    await page.goto('/parcel-policy');

    const footerLinks = page.locator('app-footer .menu-container a.menu-text');
    await expect(footerLinks).toHaveCount(5);
    await expect(footerLinks.nth(4)).toHaveAttribute('href', '/parcel-policy');

    await footerLinks.nth(4).scrollIntoViewIfNeeded();
    await page.locator('app-footer .menu-container').screenshot({
      path: `${ASSETS}/OBRS-629-AFTER-2-footer-five-links.png`,
    });
  });

  test('AFTER-3: /business-policy items 4 and 5 state their own scope and link to the parcel terms', async ({ page }) => {
    await seedSettledConsent(page);
    await page.route('**/api/booking-policy', (route) =>
      route.fulfill(ok({ maxAdvanceDays: 60, cutoffMinutes: 20 }))
    );
    await page.goto('/business-policy');

    // Thai, because Thai is what the app boots in with no stored language — and Thai is the source
    // language for these terms, so it is the wording the ledger fingerprints.
    const body = page.locator('.policy-card');
    await expect(body).toContainText('สัมภาระที่ผู้โดยสารนำติดตัวขึ้นรถซึ่งเป็น');
    await expect(body).toContainText('ข้อ 4 และข้อ 5 ใช้กับสัมภาระที่ผู้โดยสารนำติดตัวขึ้นรถเท่านั้น');
    await expect(page.locator('.policy-cross-link a[href="/parcel-policy"]')).toBeVisible();
    // The version stamp must have moved with the wording, or the ledger is decorative.
    await expect(page.locator('[data-testid="business-policy-version"]')).toContainText('1.1');

    await page.screenshot({ path: `${ASSETS}/OBRS-629-AFTER-3-business-policy-scope.png`, fullPage: true });
  });

  test('AFTER-4: the counter consign form links the terms next to the prohibited-item acknowledgement', async ({ page }) => {
    await seedGateAdminSession(page, { username: 'staff@system.local', roles: ['salesperson'], language: 'th' });
    await stubParcelPolicy(page);
    await page.goto('/staff/parcels/consign');

    const terms = page.locator('.parcel-consign-form__terms-link a');
    await expect(terms).toBeVisible();
    await expect(terms).toHaveAttribute('href', '/parcel-policy');
    await expect(page.locator('.parcel-consign-form__prohibited li')).toHaveCount(5);

    await terms.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${ASSETS}/OBRS-629-AFTER-4-consign-form-terms-link.png` });
  });

  test('AFTER-5: the waybill prints the short-form terms, a third QR to the full text, and a signature line', async ({ page }) => {
    await seedGateAdminSession(page, { username: 'staff@system.local', roles: ['salesperson'], language: 'th' });
    await page.route('**/api/private/parcels/1/waybill', (route) =>
      route.fulfill(
        ok({
          trackingNumber: 'P-ABCDEFGHJK',
          sender: { name: 'สมชาย ใจดี', phone: '0801234567' },
          recipient: { name: 'สมหญิง รักดี', phone: '0819876543' },
          pickupStop: { slug: 'nong-chak', name: 'หนองชาก' },
          dropoffStop: { slug: 'mochit', name: 'หมอชิต' },
          weightKg: 12,
          amount: 200,
          departureAt: '17 ส.ค. 2569 08:30',
          collectionToken: 'collection-token-not-for-publication',
        })
      )
    );
    await page.goto('/staff/parcels/1/waybill');

    const terms = page.locator('[data-testid="parcel-waybill-terms"]');
    await expect(terms).toBeVisible();
    await expect(terms).toContainText('500');
    await expect(page.locator('.parcel-waybill-signature-rule')).toBeVisible();
    // Three QRs, and the third is the only one that is not per-parcel.
    await expect(page.locator('.parcel-waybill-paper .parcel-waybill-qr img')).toHaveCount(3);

    await page.screenshot({ path: `${ASSETS}/OBRS-629-AFTER-5-waybill-terms-and-qr.png`, fullPage: true });
  });
});
