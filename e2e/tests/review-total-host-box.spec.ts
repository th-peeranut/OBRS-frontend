import { test, expect } from '@playwright/test';
import { seedCustomerSession, seedStore } from '../support/customer-pages';

/**
 * OBRS-753 -- the review module's component hosts must be well-formed boxes.
 *
 * WHAT WENT WRONG. `review-schedule-booking-total.component.scss` set no `:host`
 * display, so the host was Angular's default `display: inline` while its template
 * put two BLOCK-LEVEL children side by side (`div.card-container`, and
 * `button.btn-confirm`, which its own rule makes `display: flex`). Per CSS an
 * inline box cannot contain block-level boxes: the browser splits it and wraps the
 * children in anonymous block boxes, and the host's own border box stops describing
 * anything you can reason about. Measured at 1280x720 on 2026-07-26 it spanned
 * y=218..567 -- the full height of both children -- so Playwright's hit test at the
 * button resolved to `app-review-schedule-booking-total`, the button's own PARENT,
 * and counted it as an interceptor. That is what made `b2c-critical-path` the single
 * red in the gate lane the first time it ran on a GitHub runner (OBRS-750).
 *
 * WHY THIS IS A GATE AND NOT A COMMENT. The defect is a MISSING declaration. Nothing
 * in the source says "this host is inline" -- you get it by not writing anything, so
 * no reviewer reading the diff of a new component will see it, and no stylesheet
 * parser can tell a host that is inline-and-fine (all children inline) from one that
 * is inline-and-malformed. Only the cascade knows, and the cascade only exists in a
 * browser. Same reason OBRS-584's contrast gate had to run in one.
 *
 * SCOPE IS THE MODULE, DELIBERATELY. A static census over this repo (2026-07-27)
 * found 169 components with an `app-*` selector, 123 whose host never sets a display,
 * and 111 of those with a block-level root child. That is not 111 bugs -- a host that
 * is a flex or grid ITEM is blockified by its parent and is perfectly well-formed --
 * but it is far too wide to sweep behind a card about one component. The runtime
 * count for this module is asserted below; the codebase-wide sweep is its own card.
 *
 * NOT A USER-FACING BUG, AND THE SPEC SAYS SO IN ASSERTIONS. At the button's resting
 * position `elementFromPoint` at its centre already returned the button before the
 * fix -- a person could always click it. Case 2 pins that so a future change cannot
 * quietly take it away, and cases 3-4 pin the geometry the fix had to leave alone.
 */

/** The four widths that matter: the desktop measurement plus each media-query step. */
const VIEWPORTS = [
  { w: 1280, h: 720 },
  { w: 1024, h: 800 },
  { w: 768, h: 800 },
  { w: 576, h: 800 },
];

/** Displays that make a box BLOCK-LEVEL, i.e. illegal inside an inline box. */
const BLOCK_LEVEL = /^(block|flex|grid|table|list-item|flow-root)$/;

/** Every component host this module renders. */
const MODULE_HOST = 'app-review-schedule-booking';

/**
 * `.card-container` is NOT unique on this page -- the summary component uses the same
 * class. Everything below is scoped to the total component's own subtree; Playwright's
 * strict mode caught the unscoped version rather than letting it measure the summary's
 * card and report it as this component's geometry.
 */
const TOTAL = 'app-review-schedule-booking-total';
const CARD = `${TOTAL} .card-container`;
const BTN = `${TOTAL} .btn-confirm`;

interface HostBox {
  tag: string;
  display: string;
  blockChildren: string[];
  rect: { x: number; y: number; w: number; h: number };
}

test.beforeEach(async ({ page }) => {
  await seedCustomerSession(page, false);
});

async function gotoReview(page: import('@playwright/test').Page) {
  await page.goto('/review-schedule-booking');
  await seedStore(page);
  // The card only exists once the store has a booking; without this the whole
  // `*ngIf` subtree is absent and every box below measures an empty component.
  await page.locator(CARD).waitFor();
  await page.locator(BTN).waitFor();

  // The app's HTTP interceptor opens a SweetAlert "Loading..." for EVERY /api/ call and
  // closes it in `finalize`. Its container is position:fixed, covers the viewport, and
  // keeps `pointer-events: auto` right through the closing transition -- so a hit test
  // taken a few frames early reports `div.swal2-container` as the topmost element. That
  // is a true statement about a modal on its way out and says nothing about this
  // component; it cost this spec one wrong red before the wait was added. Every case
  // below measures a quiescent page.
  await expect(page.locator('.swal2-container')).toHaveCount(0, { timeout: 15_000 });
}

/** Every host in this module, with the block-level children that make it malformed. */
async function measureHosts(page: import('@playwright/test').Page, prefix: string) {
  return page.evaluate((p): HostBox[] => {
    const blockLevel = /^(block|flex|grid|table|list-item|flow-root)$/;
    const out: HostBox[] = [];
    for (const el of Array.from(document.querySelectorAll(p + ', ' + p + '-summary, ' + p + '-total'))) {
      const cs = getComputedStyle(el);
      const kids = Array.from(el.children)
        .filter((c) => blockLevel.test(getComputedStyle(c).display))
        .map((c) => c.tagName.toLowerCase() + (c.className ? '.' + String(c.className).split(/\s+/)[0] : ''));
      const r = el.getBoundingClientRect();
      out.push({
        tag: el.tagName.toLowerCase(),
        display: cs.display,
        blockChildren: kids,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      });
    }
    return out;
  }, prefix);
}

test.describe('OBRS-753 review module host boxes', () => {
  for (const vp of VIEWPORTS) {
    test(`no inline host wraps block children at ${vp.w}x${vp.h}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await gotoReview(page);

      const hosts = await measureHosts(page, MODULE_HOST);

      // A run that measured nothing must not read as a pass. `-total` alone would be
      // enough for the assertion below and would hide the day the page host or the
      // summary host stops rendering.
      expect(hosts.map((h) => h.tag).sort()).toEqual([
        'app-review-schedule-booking',
        'app-review-schedule-booking-summary',
        'app-review-schedule-booking-total',
      ]);

      // eslint-disable-next-line no-console
      console.log(`OBRS753 ${vp.w}x${vp.h} hosts ` + JSON.stringify(hosts));

      const malformed = hosts.filter((h) => h.display === 'inline' && h.blockChildren.length > 0);
      expect(
        malformed,
        'inline host(s) wrapping block-level children: ' + JSON.stringify(malformed)
      ).toEqual([]);
    });
  }

  test('a click at the confirm button lands on the confirm button (1280x720)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await gotoReview(page);

    // SCROLL FIRST, and not as a convenience. The card recorded `topIsTheButton: true`
    // at the button's RESTING position and concluded no user is affected -- correct, but
    // it is also not the state that failed. At 1280x720 with the store seeded the button
    // sits at y=728, i.e. below the fold, where `elementFromPoint` returns null and a
    // naive version of this assertion goes red for a reason that has nothing to do with
    // the defect. Playwright scrolls the element into view before every click, so the
    // scrolled position IS the state OBRS-750 tripped over. Measure that one.
    const btn = page.locator(BTN);
    await btn.scrollIntoViewIfNeeded();

    const hit = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        topIsTheButton: top === el,
        top: top ? top.tagName.toLowerCase() + (top.className ? '.' + String(top.className).split(/\s+/)[0] : '') : null,
        btn: { y: Math.round(r.y), h: Math.round(r.height) },
      };
    }, BTN);

    // eslint-disable-next-line no-console
    console.log('OBRS753 elementFromPoint ' + JSON.stringify(hit));
    expect(hit.topIsTheButton, `topmost element at the button centre was <${hit.top}>`).toBe(true);

    // `trial` runs every actionability check -- visible, stable, enabled, and RECEIVES
    // EVENTS -- and then does not click. It is the only way to assert Playwright's own
    // hit test here without navigating away, and Playwright's hit test is the thing that
    // actually failed on the CI runner. `elementFromPoint` above and this check can
    // disagree (they did, for the whole life of this defect), so assert both.
    //
    // Never `force` here or anywhere else on this button: `force` does not aim the event,
    // it only skips these checks, so it would turn this assertion into a no-op that always
    // passes -- which is precisely how OBRS-750 stayed hidden.
    await btn.click({ trial: true });
  });

  for (const vp of VIEWPORTS) {
    test(`the fix changed no geometry at ${vp.w}x${vp.h}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await gotoReview(page);

      // `.card-container` is `width: 100%` and `.btn-confirm` is `min-width: 100%`.
      // Both resolve against their containing block, and the containing block is
      // exactly what a `:host { display }` changes -- from the enclosing
      // `.total-container` to the host itself. Same numbers means the fix is invisible.
      const geo = await page.evaluate(([total, card, btn]) => {
        const q = (s: string) => document.querySelector(s) as HTMLElement;
        const box = (el: HTMLElement) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        };
        const outer = q('.total-container');
        const cs = getComputedStyle(outer);
        return {
          outer: box(outer),
          outerPadLeft: parseFloat(cs.paddingLeft),
          outerPadRight: parseFloat(cs.paddingRight),
          host: box(q(total)),
          hostDisplay: getComputedStyle(q(total)).display,
          card: box(q(card)),
          cardMarginTop: parseFloat(getComputedStyle(q(card)).marginTop),
          btn: box(q(btn)),
        };
      }, [TOTAL, CARD, BTN]);

      // eslint-disable-next-line no-console
      console.log(`OBRS753 ${vp.w}x${vp.h} geo ` + JSON.stringify(geo));

      const innerLeft = geo.outer.x + geo.outerPadLeft;
      const innerWidth = geo.outer.w - geo.outerPadLeft - geo.outerPadRight;

      // The card and the button still span the container's content box exactly.
      expect(geo.card.x).toBeCloseTo(innerLeft, 1);
      expect(geo.card.w).toBeCloseTo(innerWidth, 1);
      expect(geo.btn.x).toBeCloseTo(innerLeft, 1);
      expect(geo.btn.w).toBeCloseTo(innerWidth, 1);

      // The clamp() margin still separates the card from the top of the container.
      // A `:host` display can move where that margin collapses to; if it escaped, this
      // gap would be 0 and the card would sit flush, which is the visible regression
      // the card warned about.
      expect(geo.card.y - geo.outer.y).toBeCloseTo(geo.cardMarginTop, 1);
    });
  }
});
