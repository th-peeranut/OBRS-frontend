/**
 * OBRS-769 before/after evidence.
 *
 * TWO separate clipped frames per phase, one per review surface, deliberately NOT
 * one composed sheet: OBRS-811's evidence image forced four dropdown panels open
 * at once to fit them in a single shot and was read as a layout bug, because a
 * picture cannot caption itself. Each shot here is a state a user can actually
 * reach.
 *
 *   1. /my-bookings in LIGHT -- the biggest cluster (12 of the 39 white-surface
 *      sightings): `.booking-card__ref .label` and every `.booking-card__meta dt`,
 *      2.78:1 before, 4.60:1 after.
 *   2. / in DARK -- `.recent-routes-title` on the dark booking card, the ONE site
 *      where the old token was legible and the repoint alone would have broken it
 *      (3.25:1). It should look unchanged; that is the claim being evidenced.
 *
 * Servers are started by hand, one per phase (the OBRS-575 / OBRS-702 idiom):
 *   BEFORE  a throwaway worktree at origin/dev  -> OBRS769_PORT=4761
 *   AFTER   this worktree                       -> OBRS769_PORT=4762
 * Run once per phase with OBRS769_PHASE=before|after.
 *
 * ASCII-only source.
 */

import { test } from '@playwright/test';
import { CUSTOMER_PAGES, seedCustomerSession, seedStore } from '../support/customer-pages';

const PHASE = (process.env['OBRS769_PHASE'] ?? 'after').toUpperCase();
// Paths below are written out in full rather than built from a constant: the lane
// gate reads the literal, so a variable -- however correct -- reads to it as an
// unknown destination. It rejects anything outside e2e-evidence/ (gitignored)
// because two specs once wrote screenshots into a DIFFERENT git repository via a
// path that looked fine in review.

const page_ = (key: string) => {
  const p = CUSTOMER_PAGES.find((c) => c.key === key);
  if (!p) throw new Error(`no CUSTOMER_PAGES entry for "${key}"`);
  return p;
};

test.describe(`OBRS-769 evidence (${PHASE})`, () => {
  test('my-bookings booking card, light', async ({ browser }) => {
    const target = page_('my-bookings');
    const context = await browser.newContext({ viewport: { width: 1440, height: 1400 }, deviceScaleFactor: 2 });
    const sheet = await context.newPage();
    await seedCustomerSession(sheet, false);
    await sheet.goto(target.url, { waitUntil: 'domcontentloaded' });
    await sheet.waitForSelector('article.booking-card', { timeout: 30_000 });
    await sheet.waitForTimeout(2000);
    await sheet
      .locator('article.booking-card')
      .first()
      .screenshot({ path: `e2e-evidence/OBRS-769-${PHASE}-my-bookings-labels-light.png` });
    await context.close();
  });

  test('home recent-routes caption, dark', async ({ browser }) => {
    const target = page_('home');
    const context = await browser.newContext({ viewport: { width: 1440, height: 1400 }, deviceScaleFactor: 2 });
    const sheet = await context.newPage();
    await seedCustomerSession(sheet, true);
    await sheet.goto(target.url, { waitUntil: 'domcontentloaded' });
    await sheet.waitForSelector('.recent-route-btn', { timeout: 30_000 });
    if (target.seed) {
      await seedStore(sheet);
      await sheet.waitForTimeout(1200);
    }
    await sheet.waitForTimeout(1500);
    await sheet
      .locator('.recent-routes-quick-pick')
      .first()
      .screenshot({ path: `e2e-evidence/OBRS-769-${PHASE}-recent-routes-dark.png` });
    await context.close();
  });
});
