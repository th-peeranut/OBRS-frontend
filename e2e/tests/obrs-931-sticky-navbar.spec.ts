import { expect, test, type Browser, type Page } from '@playwright/test';
import { seedCustomerSession, seedStore } from '../support/customer-pages';
import { CUSTOMER_SWEEP, newSweepPage, visit, type SweepPage } from '../support/host-boxes';

/**
 * OBRS-931. The customer navbar stays at the top of the viewport while the page scrolls.
 *
 * WHY A BROWSER SPEC AND NOT A STYLESHEET ASSERTION. `position: sticky` is a used value,
 * not a declared one: any ancestor with `overflow` other than `visible`, or with a
 * `transform`/`filter`/`contain`, silently turns it back into a box that scrolls away —
 * and the customer area mounts `<app-navbar>` per page on 21 templates, each with its own
 * ancestors. A parser reading `navbar.component.scss` would report a pass on every one of
 * them. Only a real layout engine, scrolled, knows which pages actually keep it.
 *
 * THE SCROLL IS THE PRECONDITION, SO IT IS ASSERTED, NOT ASSUMED. A page shorter than its
 * viewport cannot demonstrate anything: the navbar is at `top: 0` there whether it is
 * sticky or static, which is a pass that proves nothing. Every case therefore asserts the
 * page really moved before it judges the bar, and pages that could not scroll are counted,
 * named and excluded from the verdict — with a floor on how many DID scroll, so the whole
 * sweep cannot go green by measuring nothing (the failure mode OBRS-851 names one card
 * over).
 *
 * NOTHING MAY COVER IT. AC-3 asks that no page ends up with the bar under its content, so
 * the assertion is not "the rect is at 0" alone — `elementFromPoint` at the bar's own
 * centre must land INSIDE `app-navbar`. A z-index that loses to a page's own positioned
 * element puts a visible bar behind the content, which a geometry check alone reads as a
 * pass.
 *
 * TWO VIEWPORTS, and the mobile one is not decoration: `navbar.component.scss` switches
 * `.navbar-container` to `height: auto` at 992px, so the stuck bar is a different box
 * there, and 80px of a 844px-tall phone is the case the card asked to see measured.
 */

/** The card's own desktop viewport, and a phone the 992px/576px blocks both cover. */
const VIEWPORTS = [
  { name: 'desktop', w: 1536, h: 864 },
  { name: 'mobile', w: 390, h: 844 },
];

/** Enough scroll to leave an 80px bar behind several times over. */
const SCROLL_PX = 1200;

/** Below this, the page never moved and its verdict would be vacuous. */
const MIN_SCROLLED_PX = 100;

/**
 * How many pages must actually scroll, per viewport. Measured on this tree when the spec
 * was written: 17 of the customer pages that mount the bar on desktop (only `track-parcel`
 * was too short) and 18 on mobile, where the narrower viewport makes every page taller.
 * The run prints both numbers and names what it skipped, so the floor can be read against
 * what the tree actually produces; it sits well below both so one page growing shorter
 * does not fail the run, while a sweep that stopped visiting pages altogether does.
 */
const MIN_PAGES_MEASURED = 8;

interface StuckState {
  scrollY: number;
  navTop: number;
  navHeight: number;
  /** What the browser hands a click at the bar's own centre. */
  topmostIsNavbar: boolean;
  topmostTag: string;
}

async function scrollAndMeasure(page: Page): Promise<StuckState> {
  // A wheel event rather than `window.scrollTo`: the app restores scroll on navigation,
  // and a programmatic assignment made from outside the framework can be undone by that
  // restoration between the write and the read. A wheel is what a customer does anyway.
  await page.mouse.wheel(0, SCROLL_PX);
  await page.waitForTimeout(400);

  return page.evaluate(() => {
    const nav = document.querySelector('app-navbar') as HTMLElement;
    const r = nav.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return {
      scrollY: Math.round(window.scrollY),
      navTop: Math.round(r.top),
      navHeight: Math.round(r.height),
      topmostIsNavbar: !!hit && !!hit.closest('app-navbar'),
      topmostTag: hit ? hit.tagName.toLowerCase() : 'none',
    };
  });
}

async function sweep(browser: Browser, pages: SweepPage[], w: number, h: number, label: string): Promise<void> {
  const page = await newSweepPage(browser, w, h);
  await seedCustomerSession(page, false);

  const tooShort: string[] = [];
  let measured = 0;

  for (const p of pages) {
    await visit(page, p, seedStore);
    if ((await page.locator('app-navbar').count()) === 0) {
      continue; // Not every customer route mounts the bar; /login does not.
    }

    const s = await scrollAndMeasure(page);
    if (s.scrollY < MIN_SCROLLED_PX) {
      tooShort.push(p.key);
      continue;
    }

    expect(
      s.navTop,
      `${p.key}@${label}: the navbar is at top ${s.navTop} after scrolling ${s.scrollY}px, so it scrolled ` +
        'away with the page — an ancestor is breaking `position: sticky`, or the rule is gone'
    ).toBe(0);

    expect(
      s.topmostIsNavbar,
      `${p.key}@${label}: a click at the middle of the navbar lands on <${s.topmostTag}>, which is outside ` +
        'app-navbar — the bar is stuck in the right place but painted underneath this page`s content'
    ).toBe(true);

    measured++;
  }

  await page.context().close();

  console.log(`[OBRS-931] ${label}: measured ${measured} page(s); too short to scroll: ${tooShort.join(', ') || 'none'}`);
  expect(
    measured,
    `${label}: only ${measured} page(s) could be measured, so this sweep would pass without having ` +
      'watched the navbar survive a single scroll'
  ).toBeGreaterThanOrEqual(MIN_PAGES_MEASURED);
}

/**
 * AC-3's other half, which geometry alone cannot answer. Giving the host a `z-index` makes it a
 * NEW STACKING CONTEXT, and the navbar's own overlays live inside it — the profile menu at 50, the
 * mobile panel at 40. Those numbers now mean "inside 110", not "above everything", so the question
 * "does the menu still open over the page?" stops being the arithmetic it used to be. Reasoning
 * about the numbers is what the doc-comment above rejects for the sticky rule itself; it is no
 * better here. So the panel is opened, on a scrolled page, and the browser is asked what a click
 * at its centre would hit.
 */
async function assertPanelPaintsOverThePage(
  page: Page,
  trigger: string,
  panel: string,
  label: string
): Promise<void> {
  await page.locator(trigger).click();
  await page.locator(panel).waitFor({ state: 'visible' });

  const hit = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement;
    const r = el.getBoundingClientRect();
    const point = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return {
      width: Math.round(r.width),
      height: Math.round(r.height),
      inside: !!point && (point === el || el.contains(point)),
      topmostTag: point ? point.tagName.toLowerCase() : 'none',
    };
  }, panel);

  expect(hit.width * hit.height, `${label}: ${panel} opened with no area, so hit-testing it proves nothing`).toBeGreaterThan(0);
  expect(
    hit.inside,
    `${label}: a click at the middle of ${panel} lands on <${hit.topmostTag}>, outside the panel — the ` +
      "navbar's own overlay is being painted under the page it opened over"
  ).toBe(true);
}

test.describe.configure({ mode: 'serial' });

test.describe('OBRS-931 the customer navbar stays put while the page scrolls', () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name} ${vp.w}x${vp.h}`, async ({ browser }) => {
      await sweep(browser, CUSTOMER_SWEEP, vp.w, vp.h, `${vp.name}/${vp.w}`);
    });
  }

  /**
   * The deliberate half of the rule, pinned so nobody "completes" it later without reading why.
   * Below 700px of viewport height the bar goes back to scrolling with the page: its own height
   * is spent permanently, and on a short screen that is on top of the consent banner and the
   * floating Search bar the customer area already reserves at the bottom. Made sticky
   * unconditionally, `obrs-639-stepper-geometry` went red at exactly this viewport in EN because
   * the trip's select button could no longer be clicked.
   */
  test('short screens deliberately keep the old behaviour', async ({ browser }) => {
    const page = await newSweepPage(browser, 390, 664);
    await seedCustomerSession(page, false);
    await visit(page, home(), seedStore);

    const s = await scrollAndMeasure(page);

    expect(s.scrollY, 'the page did not scroll, so this case proves nothing either way').toBeGreaterThanOrEqual(
      MIN_SCROLLED_PX
    );
    expect(
      s.navTop,
      'at 390x664 the navbar is stuck to the top — the min-height guard has gone, and with it the ' +
        'reachability this card measured (see obrs-639-stepper-geometry at this viewport in EN)'
    ).toBeLessThan(0);
    await page.context().close();
  });

  test('desktop: the profile menu still opens over the page, on a scrolled page', async ({ browser }) => {
    const page = await newSweepPage(browser, VIEWPORTS[0].w, VIEWPORTS[0].h);
    await seedCustomerSession(page, false);
    await visit(page, home(), seedStore);
    await page.mouse.wheel(0, SCROLL_PX);
    await page.waitForTimeout(400);
    await assertPanelPaintsOverThePage(page, '.navbar-avatar', '.navbar-profile-menu', 'desktop/profile-menu');
    await page.context().close();
  });

  test('mobile: the slide-down menu still opens over the page, on a scrolled page', async ({ browser }) => {
    const page = await newSweepPage(browser, VIEWPORTS[1].w, VIEWPORTS[1].h);
    await seedCustomerSession(page, false);
    await visit(page, home(), seedStore);
    await page.mouse.wheel(0, SCROLL_PX);
    await page.waitForTimeout(400);
    await assertPanelPaintsOverThePage(page, '.navbar-hamburger', '.navbar-mobile-panel', 'mobile/mobile-panel');
    await page.context().close();
  });
});

/** The home page's own sweep entry — taken from the shared list, never re-declared here. */
function home(): SweepPage {
  const p = CUSTOMER_SWEEP.find((x) => x.key === 'home');
  if (!p) throw new Error('OBRS-931: CUSTOMER_SWEEP has no `home` entry — the list moved under this spec.');
  return p;
}
