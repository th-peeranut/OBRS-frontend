import { expect, test } from '@playwright/test';
import { seedCustomerSession } from '../support/customer-pages';

/**
 * OBRS-1572 evidence - see playwright.obrs1572capture.config.ts for how to run it.
 *
 * The card changes comments only, so a BEFORE/AFTER pair of the page would be two
 * identical pictures. What needs proving is the claim the corrected comment makes, and
 * the one the `_loading.scss` note now rests on:
 *
 *   1. `.admin-skeleton` RENDERS on a customer-shell page. The wording this card
 *      replaces said it was scoped under `.admin-shell` and "would resolve to nothing"
 *      off the admin shell; /refund-policy has no `.admin-shell` ancestor and reaches
 *      the primitive through <app-loading-state variant="skeleton">.
 *   2. It renders in BOTH themes with no `body.is-dark` rule of its own - because its
 *      rgba() stops composite against whatever is behind them. That is the reason
 *      AC-3 was answered "no dark pair", so the two composited fills are read here
 *      rather than left as arithmetic.
 *
 * The skeleton is only up while GET /api/cancellation-policy is in flight, so that one
 * call is held open (registered after seedCustomerSession, which Playwright matches
 * most-recently-added first). Nothing reaches a real backend either way.
 */
const ASSETS = `e2e-evidence/obrs-1572`;

test.describe('OBRS-1572 - .admin-skeleton on a customer-shell page, both themes', () => {
  for (const dark of [false, true]) {
    const theme = dark ? 'dark' : 'light';

    test(`refund-policy skeleton renders in ${theme}`, async ({ page }) => {
      await seedCustomerSession(page, dark);
      await page.route('**/api/cancellation-policy*', () => {
        /* never fulfilled: pins the loading window open for the shot */
      });

      await page.goto('/refund-policy', { waitUntil: 'domcontentloaded' });

      const bars = page.locator('app-loading-state .admin-skeleton');
      await expect(bars.first()).toBeVisible();
      // Asserted, not assumed: a renamed theme key would shoot light twice and both
      // pictures would look correct.
      expect(await page.evaluate(() => document.body.classList.contains('is-dark'))).toBe(dark);
      // The point of claim 1 - "resolves to nothing" would be a zero-height box with no
      // background, on a page that has no .admin-shell ancestor to scope it.
      expect(await page.locator('.admin-shell').count()).toBe(0);

      const reading = await bars.first().evaluate((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          w: Math.round(r.width),
          h: Math.round(r.height),
          bg: cs.backgroundImage,
          // What the translucent stops actually composite to here: the nearest
          // ancestor that paints an opaque background is the surface behind the bar.
          surface: (() => {
            let n: HTMLElement | null = el;
            while (n) {
              const c = getComputedStyle(n).backgroundColor;
              if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
              n = n.parentElement;
            }
            return 'none';
          })(),
        };
      });

      expect(reading.w).toBeGreaterThan(0);
      expect(reading.h).toBeGreaterThan(0);
      expect(reading.bg).toContain('gradient');
      // eslint-disable-next-line no-console
      console.log(
        `[OBRS-1572] ${theme}: ${await bars.count()} bar(s), first ${reading.w}x${reading.h}px` +
          `\n            surface behind it ${reading.surface}` +
          `\n            background-image  ${reading.bg}`
      );

      await page.locator('.policy-card').first().screenshot({
        path: `${ASSETS}/OBRS-1572-refund-policy-skeleton-${theme}.png`,
      });
    });
  }
});
