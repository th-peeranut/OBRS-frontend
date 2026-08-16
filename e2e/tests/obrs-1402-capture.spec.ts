import { Page, expect, test } from '@playwright/test';
import { seedGateAdminSession } from '../support/gate-admin-session';
import { seedAnalyticsConsent } from '../support/analytics-consent';

/**
 * OBRS-1402 evidence capture - see playwright.obrs1402capture.config.ts for how to run it.
 *
 * What each half of this file proves, stated plainly so the shots are not read for more than
 * they are worth:
 *
 *  - The BEFORE stub is the array `parcel.prohibited_categories` held before this card
 *    (five slugs); the AFTER stub is the array the seed files hold after it (seven). Both
 *    screens render whatever the config serves, so the same page under the two stubs IS the
 *    before/after of this change on the display side.
 *  - That the SEEDED config really is those seven - and that intake really rejects the two new
 *    ones - is proved in the backend against a real database, not here:
 *    ParcelConsignedDeliveryIT#prohibitedCategory_valuables_rejects409 / _animal_rejects409.
 *
 * The AFTER assertions check that no row falls through to UNLISTED_KEY, which is what a missing
 * translation looks like: it renders the RAW SLUG inside a sentence and still looks like a
 * working page. Asserting the count alone would pass on exactly that defect.
 *
 * Screenshots land in e2e-evidence/ (gitignored) - the only prefix the e2e lane gate allows - are
 * uploaded to the card from there, then deleted.
 */

const ASSETS = 'e2e-evidence/obrs-1402';

const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'OK', data }),
});

const LIMITS = {
  maxWeightKg: 100,
  carryOnFreeSizeMaxInch: 28,
  carryOnFreeAisleMaxPerTrip: 10,
};

/** What the config held before this card. */
const BEFORE_CATEGORIES = ['flammable', 'explosive', 'weapon', 'narcotic', 'corpse'];
/** What lookups.sql / data.sql / prod_seed.sql / V99 hold after it. */
const AFTER_CATEGORIES = [...BEFORE_CATEGORIES, 'valuables', 'animal'];

async function stubParcelPolicy(page: Page, prohibitedCategories: string[]): Promise<void> {
  await page.route('**/api/parcel-policy', (route) =>
    route.fulfill(ok({ ...LIMITS, prohibitedCategories }))
  );
}

/** OBRS-867's consent banner is `position: fixed; bottom: 0` and covers clause 2 otherwise. */
async function seedSettledConsent(page: Page): Promise<void> {
  await seedAnalyticsConsent(page);
}

async function expectNoRawSlugs(page: Page, selector: string): Promise<void> {
  const list = page.locator(selector);
  // UNLISTED_KEY interpolates the raw slug into the sentence, so the slug appearing in the
  // rendered text is exactly the "no copy shipped" state - readable, and indistinguishable
  // from a bug to the sender reading it.
  await expect(list).not.toContainText('valuables');
  await expect(list).not.toContainText('animal');
  await expect(list).not.toContainText('PARCEL.PROHIBITED');
  await expect(list).not.toContainText('{{');
}

test.describe('OBRS-1402 - valuables and animal reach the prohibited list', () => {
  test('BEFORE-0: /parcel-policy clause 2 lists five categories', async ({ page }) => {
    await seedSettledConsent(page);
    await stubParcelPolicy(page, BEFORE_CATEGORIES);
    await page.goto('/parcel-policy');

    await expect(page.locator('[data-testid="parcel-policy-prohibited"] li')).toHaveCount(5);

    await page.screenshot({ path: `${ASSETS}/OBRS-1402-BEFORE-0-parcel-policy-five.png`, fullPage: true });
  });

  test('AFTER-0: /parcel-policy clause 2 lists seven, both new ones in Thai copy', async ({ page }) => {
    await seedSettledConsent(page);
    await stubParcelPolicy(page, AFTER_CATEGORIES);
    await page.goto('/parcel-policy');

    const items = page.locator('[data-testid="parcel-policy-prohibited"] li');
    await expect(items).toHaveCount(7);
    await expect(items.nth(5).locator('.material-symbols-outlined')).toHaveText('diamond');
    await expect(items.nth(6).locator('.material-symbols-outlined')).toHaveText('pets');
    await expectNoRawSlugs(page, '[data-testid="parcel-policy-prohibited"]');

    await page.screenshot({ path: `${ASSETS}/OBRS-1402-AFTER-0-parcel-policy-seven.png`, fullPage: true });
  });

  test('BEFORE-1: the counter consign form lists five categories', async ({ page }) => {
    await seedGateAdminSession(page, { username: 'staff@system.local', roles: ['salesperson'], language: 'th' });
    await stubParcelPolicy(page, BEFORE_CATEGORIES);
    await page.goto('/staff/parcels/consign');

    const list = page.locator('.parcel-consign-form__prohibited-list li');
    await expect(list).toHaveCount(5);

    await page.locator('.parcel-consign-form__prohibited').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${ASSETS}/OBRS-1402-BEFORE-1-consign-form-five.png` });
  });

  test('AFTER-1: the counter consign form lists the same seven the published terms do', async ({ page }) => {
    await seedGateAdminSession(page, { username: 'staff@system.local', roles: ['salesperson'], language: 'th' });
    await stubParcelPolicy(page, AFTER_CATEGORIES);
    await page.goto('/staff/parcels/consign');

    const list = page.locator('.parcel-consign-form__prohibited-list li');
    await expect(list).toHaveCount(7);
    await expect(list.nth(5).locator('.material-symbols-outlined')).toHaveText('diamond');
    await expect(list.nth(6).locator('.material-symbols-outlined')).toHaveText('pets');
    await expectNoRawSlugs(page, '.parcel-consign-form__prohibited-list');

    await page.locator('.parcel-consign-form__prohibited').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${ASSETS}/OBRS-1402-AFTER-1-consign-form-seven.png` });
  });
});
