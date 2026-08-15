import { expect, test, Browser, Page } from '@playwright/test';
import { CUSTOMER_PAGES, seedCustomerSession, seedStore } from '../support/customer-pages';
import { findUnreachable, formatUnreachable, Unreachable } from '../support/consent-banner-reachability';

/**
 * OBRS-1372 — with the PDPA bar up, every control on a customer page must still be
 * reachable at some scroll offset.
 *
 * THE DEFECT. `.consent-banner` is `position: fixed; bottom: 0` at `z-index: 1000`,
 * and nothing compensated for it: the document ended where it always had, so the
 * bottom band of every page was not merely behind the bar, it was unreachable until
 * the visitor answered. Measured on prod (2026-08-15, WebKit, iPhone 14, th-TH): the
 * bar is 246px = 37.1% of the 664px viewport, and on the home page four of nine
 * pickup rows plus `ยืนยันจุดรับ` handed their tap to `p.consent-banner__body`. The
 * control arm was the same scroll offset with the question answered — `scrollY` 911
 * both times, occluded `true` then `false` — so the bar was the variable, not the
 * scroll position.
 *
 * WHY A PHONE VIEWPORT AND THAI. Both are the defect's preconditions rather than
 * decoration: at 1280px the copy fits one line and the bar is ~90px, and the English
 * copy is shorter than the Thai. The card came from an iPhone on a Thai site.
 *
 * WHY THE SWEEP IS THE WHOLE CUSTOMER SHELL. The bar mounts in `app.component.html`,
 * above `<router-outlet>`, so it is on every page the visitor has not answered on.
 * The card asked for `/passenger-info`, `/payment` and the results page specifically
 * — those are three of the eleven entries in `CUSTOMER_PAGES`, and sweeping the rest
 * costs page loads only, since the fixtures already exist for the contrast gate.
 *
 * `findUnreachable` (e2e/support/consent-banner-reachability.ts) explains why the
 * question is reachability and NOT "does the bar cover anything" — the bar is opaque
 * on purpose and the answer to that one is "yes, by design".
 */

/** iPhone 14 CSS px, the profile the prod measurement on the card was taken at. */
const PHONE = { width: 390, height: 664 };

function report(list: Unreachable[]): string {
  return (
    `${list.length} control(s) cannot be reached at any scroll offset while the ` +
    `consent bar is up:\n${formatUnreachable(list)}`
  );
}

/**
 * Thai, because the seven-line wrap is what makes the bar 246px tall. Runs AFTER
 * `seedCustomerSession`'s own init script, which sets `en`, and overwrites it.
 */
async function useThai(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('app_language', 'th'));
}

test.describe('OBRS-1372 — consent banner reachability', () => {
  /**
   * The sweep's own must-catch / must-not-catch, run before it is allowed to report
   * on the app — the same discipline as the contrast gate's OBRS-575 fixture.
   *
   * Both arms are the real geometry: a 246px `position: fixed` bar over a document
   * one viewport tall, with a button at the very bottom edge. The only difference
   * between them is the body padding this card adds. If the solver's clamp to
   * `maxScroll` were dropped — the one line that distinguishes "behind the bar right
   * now" from "behind it for good" — arm one would go quiet and the sweep below
   * would be green on a broken app.
   */
  test('the sweep fires on an unreachable button and stays quiet once the page reserves the room', async ({
    page,
  }) => {
    // The doctype is load-bearing, not boilerplate: without it `setContent` renders
    // in QUIRKS mode, where `documentElement.clientHeight` is the document's own
    // height rather than the viewport's. The solver reads maxScroll from those two
    // (as `fab-occlusion.ts` does), so it computes 0, decides nothing can be
    // scrolled anywhere, and reports a clean page — measured, on the first run of
    // this very fixture.
    const fixture = (bodyStyle: string) => `
      <!DOCTYPE html>
      <body style="margin:0;${bodyStyle}">
        <div style="height:900px">
          <button class="mid-btn" style="margin-top:300px">Mid-page, always reachable</button>
        </div>
        <button class="last-btn">The last control on the page</button>
        <div class="consent-banner" role="region"
             style="position:fixed;left:0;right:0;bottom:0;height:246px;z-index:1000;background:#fff">
          <p class="consent-banner__body">The seven-line Thai ask, at its measured height.</p>
        </div>
      </body>
    `;

    await page.setViewportSize(PHONE);

    await page.goto('about:blank');
    await page.setContent(fixture(''));
    const before = await findUnreachable(page, 'fixture/no-padding');
    expect(before.map((u) => u.victim), report(before)).toEqual(['button.last-btn']);
    expect(before[0].hitInstead).toContain('consent-banner');

    await page.goto('about:blank');
    await page.setContent(fixture('padding-bottom:246px'));
    const after = await findUnreachable(page, 'fixture/padding-reserved');
    expect(after, report(after)).toEqual([]);
  });

  test('no control on any customer page is out of reach while the bar is up (390x664, th)', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    test.setTimeout(300_000);

    const found: Unreachable[] = [];
    const swept: string[] = [];
    let barHeight = 0;

    for (const target of CUSTOMER_PAGES) {
      const context = await browser.newContext({ viewport: PHONE });
      const sheet = await context.newPage();
      try {
        // NO `seedAnalyticsConsent` here, deliberately: an answered decision removes
        // the bar and this spec would measure nothing while passing. `findUnreachable`
        // throws if the bar is absent, so that mistake cannot be made quietly.
        await seedCustomerSession(sheet, false);
        await useThai(sheet);
        await sheet.goto(target.url, { waitUntil: 'domcontentloaded' });
        await sheet.waitForTimeout(2500);
        if (target.seed) {
          await seedStore(sheet, target.storeOverride?.());
          await sheet.waitForTimeout(1200);
        }

        const href = await sheet.evaluate(() => location.pathname);
        expect(href, `${target.key}: landed on ${href}, so the page under test never rendered`).toBe(
          target.landsOn
        );

        barHeight = Math.max(
          barHeight,
          await sheet.locator('.consent-banner').evaluate((el) => (el as HTMLElement).offsetHeight)
        );
        found.push(...(await findUnreachable(sheet, target.key)));
        swept.push(target.key);
      } finally {
        await context.close();
      }
    }

    console.log(`  pages swept        : ${swept.length} (${swept.join(', ')})`);
    console.log(`  tallest bar        : ${barHeight}px = ${((barHeight / PHONE.height) * 100).toFixed(1)}% of ${PHONE.height}px`);
    console.log(`  unreachable        : ${found.length}`);

    expect(swept.length, 'every page must be swept, or the count above is a lie').toBe(
      CUSTOMER_PAGES.length
    );
    expect(found, report(found)).toEqual([]);
  });
});
