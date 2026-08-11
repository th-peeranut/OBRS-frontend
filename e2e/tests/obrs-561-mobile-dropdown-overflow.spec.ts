/**
 * OBRS-561 — the station dropdown panel must contain its own option text on mobile.
 *
 * Reported via Usability Report #2 as a "background" problem: on a phone, long stop
 * names appeared painted straight over the page behind the dropdown. The background
 * was never transparent (measured `rgb(255,255,255)`) and the stacking was never
 * wrong (`z-index: 1000`, `position: absolute`). The panel was simply 60px wide —
 * `.dropdown` is a shrink-to-fit flex item inside `.station-group`, so the old
 * `width: 100%; min-width: 0` in the <=576px block resolved against ~60px. Bootstrap's
 * `.dropdown-item { white-space: nowrap }` then pushed ~229px of text outside the
 * painted box, where there is no background beneath it.
 *
 * So this spec asserts GEOMETRY, not colour — the assertion has to be the thing that
 * actually broke. Against unfixed code (e.g. `--base-url https://sit-obrs-frontend.netlify.app`
 * before the fix ships) it fails on `overflow` with ~229px.
 */

import { test, expect } from '@playwright/test';

// Both consumers of the shared component render the same two pickers.
// The mobile viewport comes from the project in playwright.obrs561.config.ts.
const ROUTES = ['/', '/schedule-booking'];

for (const route of ROUTES) {
  test(`${route}: every station option stays inside the dropdown panel on mobile`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });

    const toggles = page.locator('app-dropdown-group-obrs .dropdown-toggle');
    await toggles.first().waitFor({ state: 'visible', timeout: 20_000 });
    const toggleCount = await toggles.count();
    expect(toggleCount, 'origin + destination pickers should both render').toBeGreaterThanOrEqual(2);

    // Check both pickers: the destination one sits at the right edge of the flex row,
    // so it is the one that would be pushed off-screen by a naive width increase.
    for (let i = 0; i < toggleCount; i++) {
      await toggles.nth(i).click();

      const panel = page.locator('app-dropdown-group-obrs ul.dropdown-menu.show');
      await panel.waitFor({ state: 'visible', timeout: 5_000 });

      const result = await panel.evaluate((menu: HTMLElement) => {
        const r = menu.getBoundingClientRect();
        const items = Array.from(menu.querySelectorAll<HTMLElement>('a.dropdown-item'));

        // scrollWidth > clientWidth means the text is wider than the box painting
        // behind it — i.e. it is being drawn on top of whatever is behind the panel.
        let worstOverflow = 0;
        let worstText = '';
        for (const item of items) {
          const overflow = item.scrollWidth - item.clientWidth;
          if (overflow > worstOverflow) {
            worstOverflow = overflow;
            worstText = (item.textContent ?? '').trim();
          }
        }

        return {
          panelWidth: r.width,
          panelHeight: r.height,
          panelLeft: r.left,
          panelRight: r.right,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          itemCount: items.length,
          worstOverflow,
          worstText,
        };
      });

      expect(result.itemCount, 'the picker should list stations').toBeGreaterThan(0);

      // The defect itself.
      expect(
        result.worstOverflow,
        `option text overflows the panel by ${result.worstOverflow}px ("${result.worstText}") ` +
          `— panel is ${result.panelWidth}px wide`,
      ).toBeLessThanOrEqual(1);

      // The panel must be wide enough to be usable, and must not leave the screen.
      expect(result.panelWidth).toBeGreaterThanOrEqual(200);
      expect(result.panelLeft).toBeGreaterThanOrEqual(0);
      expect(result.panelRight).toBeLessThanOrEqual(result.viewportWidth);

      // A 28-stop list previously rendered 1138px tall inside a 664px viewport.
      expect(
        result.panelHeight,
        `panel is ${result.panelHeight}px tall in a ${result.viewportHeight}px viewport`,
      ).toBeLessThanOrEqual(result.viewportHeight);

      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'hidden', timeout: 5_000 });
    }
  });
}
