import { test, Page } from '@playwright/test';
import { CUSTOMER_PAGES, seedCustomerSession, seedStore } from '../support/customer-pages';

/**
 * OBRS-1372 -- BEFORE/AFTER evidence for the Jira card.
 *
 * Screenshots ONLY. Every assertion lives in
 * obrs-1372-consent-banner-reachability.spec.ts, which is the gate; this file has
 * to run unchanged against BOTH trees, so it can assert nothing that is true of
 * only one of them.
 *
 *   OBRS_CAPTURE_STAGE=BEFORE  npx playwright test --config=playwright.obrs1372capture.config.ts
 *   OBRS_CAPTURE_STAGE=AFTER   npx playwright test --config=playwright.obrs1372capture.config.ts
 *
 * The BEFORE run is taken with `git stash push -- src/` applied, i.e. against the
 * real previous runtime.
 *
 * WHAT EACH FRAME SHOWS. The page scrolled as far DOWN as it will go, at an
 * iPhone 14 viewport, with the PDPA question unanswered. That is the whole
 * defect in one frame: on the BEFORE tree the document ends where it always did,
 * so the bottom of the page is still underneath the bar at maximum scroll and no
 * gesture can bring it out; on the AFTER tree the same content sits above the
 * bar, because the body now carries the bar's measured height as padding.
 *
 * ASCII-only source.
 */

const STAGE = process.env['OBRS_CAPTURE_STAGE'] ?? 'AFTER';
const ASSETS = 'e2e-evidence/OBRS-1372';

/** The reported screen first, then the two the card named, then the results page. */
const SHOOT = ['home', 'passenger-info', 'payment', 'schedule-booking'];

async function settleAtBottom(page: Page): Promise<void> {
  // Bootstrap's reboot sets `scroll-behavior: smooth`, so a plain scrollTo starts
  // an animation and the shutter can beat it -- see e2e/support/fab-occlusion.ts
  // for the measurements that cost.
  await page.addStyleTag({ content: '*, *::before, *::after, :root { scroll-behavior: auto !important }' });
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: 'instant' as ScrollBehavior })
  );
  await page.waitForTimeout(1200);
}

for (const key of SHOOT) {
  const target = CUSTOMER_PAGES.find((p) => p.key === key)!;

  test(`${STAGE} ${key}: the bottom of the page, with the consent bar up`, async ({ page }) => {
    await seedCustomerSession(page, false);
    // Thai: the seven-line wrap is what makes the bar 246px tall, and it is what
    // the reporter on prod was looking at.
    await page.addInitScript(() => localStorage.setItem('app_language', 'th'));

    await page.goto(target.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    if (target.seed) {
      await seedStore(page, target.storeOverride?.());
      await page.waitForTimeout(1200);
    }

    await settleAtBottom(page);
    await page.screenshot({
      path: `${ASSETS}/OBRS-1372-${STAGE}-${SHOOT.indexOf(key)}-${key}-scrolled-to-bottom.png`,
    });
  });
}
