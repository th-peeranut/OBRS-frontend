import { Page } from '@playwright/test';

/**
 * Scroll helpers shared by the probes that have to know exactly where the page
 * is standing before they measure anything.
 *
 * OBRS-1832 emptied this file of its original subject — OBRS-1207's hit-test for
 * the floating report FAB — when the FAB was retired and the report entry point
 * moved into the chrome. What stayed are the two pieces that were never about the
 * FAB: a scroll that is actually finished when it returns, and the selector for
 * "everything a user can click". `git log e2e/support/fab-occlusion.ts` has the
 * removed hit-test if the reasoning is ever needed again.
 */

/** Everything a user can click. */
export const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Puts the page at `y` and does not return until it is actually there.
 *
 * `window.scrollTo(0, y)` is NOT enough and the difference is not cosmetic.
 * Bootstrap's reboot sets `:root { scroll-behavior: smooth }` under
 * `prefers-reduced-motion: no-preference`, which this repo ships, so a plain
 * scrollTo starts an ANIMATION. Measured on /schedule-booking: `scrollTo(0,173)`
 * read back 37 one frame later, and `documentElement.scrollTop = 300` read back
 * 40 — a probe that trusted either number would measure a viewport nobody is
 * looking at and report a clean page. `behavior: 'instant'` overrides the
 * stylesheet at the call site, and the poll below turns "I asked" into "it is
 * there" rather than betting on a frame count.
 *
 * The same stylesheet rule is why the guard this card replaces was a coin toss:
 * `home.component.ts:65` calls `scrollIntoView({ behavior: 'smooth' })`, and the
 * search click navigates away mid-animation, so /schedule-booking inherits
 * whatever offset the animation had reached. Measured across three runs of the
 * same tree: 17, 18, 19.
 */
export async function scrollToInstantly(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => {
    window.scrollTo({ top, left: 0, behavior: 'instant' as ScrollBehavior });
  }, y);
  await page
    .waitForFunction(
      (top) => Math.abs(window.scrollY - top) <= 1,
      y,
      { timeout: 5_000, polling: 'raf' }
    )
    .catch(() => {
      /* Clamped by a shorter document than we solved against — the confirm
         step below re-reads the real geometry, so a missed target can only
         make this probe report LESS, never a false positive. */
    });
  // One more frame for anything that reacts to scrolling (sticky headers,
  // shrink-on-scroll bars) to settle before the point is sampled.
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  );
}

/**
 * Kills the smooth-scroll animation for the rest of the page's life and waits
 * for any animation already in flight to stop.
 *
 * Without this the probe is flaky in its OWN right, which was measured, not
 * feared: two consecutive runs of the home-page case on the same tree gave
 * `.btn-search` occluded at scrollY=39 and then a clean page, because
 * `home.component.ts:65` smooth-scrolls to the booking form on load and phase 1
 * read the geometry at whatever point that animation had reached. Shipping a
 * gate with the same defect it was written to remove would be the joke telling
 * itself.
 *
 * Overriding `scroll-behavior` does not weaken what is under test: the verdict
 * is "is there ANY reachable offset where a click is stolen", and the set of
 * reachable offsets is a property of the document's height, not of how the
 * browser animates its way between them.
 */
export async function stabilizeScrolling(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `*, *::before, *::after, :root { scroll-behavior: auto !important; }`,
  });
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __obrs1207Last?: number; __obrs1207Still?: number };
      const y = window.scrollY;
      if (w.__obrs1207Last === y) {
        w.__obrs1207Still = (w.__obrs1207Still ?? 0) + 1;
      } else {
        w.__obrs1207Still = 0;
      }
      w.__obrs1207Last = y;
      return (w.__obrs1207Still ?? 0) >= 5;
    },
    undefined,
    { timeout: 10_000, polling: 'raf' }
  );
}
