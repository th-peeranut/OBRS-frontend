import { test, expect } from '@playwright/test';
import { CUSTOMER_PAGES, seedCustomerSession, seedStore } from '../support/customer-pages';
import { seedAnalyticsConsent } from '../support/analytics-consent';

/**
 * OBRS-795 — evidence that the widened GATE fixture actually renders the three
 * dark-mode surfaces it was widened for.
 *
 *   npx playwright test --config=playwright.obrs795.config.ts
 *
 * The card's proof of COVERAGE is the mutation test, not these frames: revert one
 * of OBRS-771's declarations and `customer-contrast-gate.spec.ts` goes red at that
 * element. What a screenshot adds is the other half — that the element on screen
 * is the one the gate scored, in the state it scored it in. A green gate over a
 * screen nobody looked at is the OBRS-734 false green this card exists to close.
 *
 * So every shot asserts its subject rendered IN THE STATE UNDER TEST before it
 * shoots: a chip at rest (not the active one, which always rendered and was never
 * the defect), and the OPEN-seating badge (which no entry rendered at all until
 * `passenger-info-open` was added). An `expect` that fails here means the fixture
 * drifted back and the frames would have been of the wrong screen.
 *
 * Screenshots land in e2e-evidence/ (gitignored — the only prefix the e2e lane
 * gate accepts, and it reads the literal, so these paths are not built from a
 * variable).
 */
const ASSETS = 'e2e-evidence/obrs-795';

const entry = (key: string) => {
  const p = CUSTOMER_PAGES.find((c) => c.key === key);
  if (!p) throw new Error(`no CUSTOMER_PAGES entry for "${key}" — the fixture list moved under this probe`);
  return p;
};

/** Kill transitions so a frame cannot catch a colour that is in no stylesheet. */
async function settle(page: import('@playwright/test').Page): Promise<void> {
  await page.addStyleTag({
    content: '*, *::before, *::after, :root { scroll-behavior: auto !important; transition: none !important }',
  });
  await page.waitForTimeout(600);
}

test.describe('OBRS-795 evidence — the fixture reaches the surfaces', () => {
  test('AFTER passenger-info dark: two chips, so one is at REST', async ({ page }) => {
    const target = entry('passenger-info');
    await seedCustomerSession(page, true);
    await seedAnalyticsConsent(page);
    await page.goto(target.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await seedStore(page, target.storeOverride?.());
    await page.waitForTimeout(1500);
    await settle(page);

    // The claim this card is built on: before it, exactly one chip rendered and it
    // was always `.active`, so every rule written for the rest state controlled
    // nothing the sweep could see.
    const chips = page.locator('.seat-passenger-chip');
    const rest = page.locator('.seat-passenger-chip:not(.active)');
    await expect(chips, 'the seed must render one chip per passenger').toHaveCount(2);
    await expect(rest, 'a chip AT REST is the state the gate could not see before').toHaveCount(1);
    // The badge is the worst reading of the four (1.12:1 before OBRS-771) and it
    // lives inside the chip, so it is only at rest when its chip is.
    await expect(rest.locator('.seat-passenger-chip-badge')).toHaveCount(1);

    await page.locator('.seat-passenger-chips').screenshot({
      path: `${ASSETS}/OBRS-795-AFTER-1-passenger-info-chip-row-dark.png`,
    });
    await page.screenshot({ path: `${ASSETS}/OBRS-795-AFTER-2-passenger-info-dark.png`, fullPage: true });
  });

  test('AFTER passenger-info-open dark: the OPEN-seating badge renders', async ({ page }) => {
    const target = entry('passenger-info-open');
    await seedCustomerSession(page, true);
    await seedAnalyticsConsent(page);
    await page.goto(target.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    // The override is READ FROM THE ENTRY rather than restated here, so this frame
    // cannot drift away from what the gate seeds.
    await seedStore(page, target.storeOverride?.());
    await page.waitForTimeout(1500);
    await settle(page);

    const badge = page.locator('.open-seating-badge');
    await expect(badge, 'no CUSTOMER_PAGES entry rendered this at all before OBRS-795').toHaveCount(1);
    // The form's half of the same branch: with OPEN seating the seat map and the
    // chip row are replaced by the shared passenger-count card.
    await expect(page.locator('.open-seat-card')).toHaveCount(1);
    await expect(page.locator('.seat-passenger-chip')).toHaveCount(0);

    await badge.screenshot({ path: `${ASSETS}/OBRS-795-AFTER-3-open-seating-badge-dark.png` });
    await page.screenshot({ path: `${ASSETS}/OBRS-795-AFTER-4-passenger-info-open-dark.png`, fullPage: true });
  });
});
