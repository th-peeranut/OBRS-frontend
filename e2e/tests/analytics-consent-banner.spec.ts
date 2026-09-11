/**
 * OBRS-882 — the banner-up state on the home page, asserted on purpose.
 *
 * READ THIS FIRST, IT IS THE ACTUAL LESSON OF THIS CARD
 * Nobody discovered the consent-bar overlap here. `obrs-854-account-deeplink.spec.ts`
 * found it HOURS EARLIER, on the same day, and dealt with it properly for its own page:
 * it seeds an answered decision for most cases and pins the first-visit overlap with its
 * own `document.elementFromPoint` test. That spec never went red. What it did not do —
 * what nobody asked it to do — was move any of that into shared support. So the
 * knowledge sat in one file, and when OBRS-867's merge landed, the identical failure
 * took out 23 cases in three OTHER specs and stayed red for four commits.
 *
 * That is the shape worth remembering: the regression was not undiscovered, it was
 * UNSHARED. A local workaround for a global change is a propagation site, not a fix.
 * `e2e/support/analytics-consent.ts` is now the one home for the key and the seeding, and
 * `obrs-854-account-deeplink.spec.ts` imports it rather than keeping its own copy.
 *
 * WHY THIS SPEC HAD TO EXIST BEFORE THE FIX COULD LAND
 * The fix for the 23 red cases is `e2e/support/analytics-consent.ts`, which seeds a
 * settled PDPA answer so `<app-analytics-consent-banner>` never renders. On its own that
 * is muting an alarm: the first visit — banner up, covering the bottom of the viewport —
 * is a real state for every real customer, and after the seeding fix nothing in the lane
 * would ever load a page in it again. So the state moves here, where it is asserted on
 * purpose, instead of being an accident every other spec has to work around.
 *
 * THE TEST THAT WOULD HAVE CAUGHT OBRS-867
 * `the banner no longer covers the report entry point at all`. It measures with
 * `document.elementFromPoint` at the trigger's own centre rather than asserting a
 * z-index or waiting for a click to time out:
 *   - a z-index assertion is a proxy — it cannot see a stacking context, and OBRS-750
 *     already recorded what a proxy costs in this lane (`force: true` reporting success
 *     for a click that landed on a parent);
 *   - a click timeout is 60 s of nothing, and reports the wrong element by name, which
 *     is exactly why the original failure read as "the FAB is broken".
 * `elementFromPoint` returns the element the browser would actually deliver the click
 * to. That is the effect, not a proxy for it. (Same technique as
 * `obrs-854-account-deeplink.spec.ts`, deliberately: that spec measures the overlap over
 * the close-account button at a 390px phone viewport, this one over the report trigger
 * at 1280×720. Different surface, different viewport, same question.)
 *
 * THE OVERLAP IS GONE — OBRS-1832 REMOVED THE ELEMENT IT WAS WITH.
 * It used to be deliberate and pinned as such: analytics-consent-banner.component.scss
 * carries `z-index: 1000` with the comment "Above the usability FAB (z-index 900) — the
 * two share the bottom-right corner, and while the question is unanswered this one is
 * the more urgent." Nothing shares that corner any more: the report entry point moved
 * into the navbar, so the case below pins the opposite — the trigger is clickable WHILE
 * the banner is up. The banner's own z-index is untouched; it still outranks anything
 * that arrives in that corner later.
 *
 * ✅ THE OPEN PRODUCT QUESTION THIS COMMENT USED TO CARRY IS ANSWERED (OBRS-887).
 * It was raised on OBRS-882 as an overlap: the banner covered `button.btn-success` on the
 * walk-in POS and the save button on the trip-details edit form, and the note said staff
 * dismiss it once so it is a first-run cost rather than a block.
 *
 * The overlap turned out to be the small half of it. Clarity does session REPLAY, and a
 * POS screen is full of a *customer's* name and phone number — which the staff member
 * pressing accept has no standing to consent to. So the answer is not "hide the bar":
 * measurement is off entirely on every route carrying `requiredRoles`, and the bar not
 * rendering there is a consequence of having nothing to ask for. See
 * `src/app/shared/lib/analytics-route-scope.ts` and ADR-0034 §6.
 *
 * Nothing in THIS spec changed with that card: every case here runs on customer routes,
 * where the banner and the overlap it pins both still exist.
 */

import { test, expect, Page } from '@playwright/test';
import stationsFixture from '../fixtures/stations.json';
import schedulesFixture from '../fixtures/schedules.json';
import { ANALYTICS_CONSENT_KEY, seedAnalyticsConsent } from '../support/analytics-consent';

const BANNER = '.consent-banner';
const ACCEPT = '.consent-banner__btn--accept';
const DECLINE = '.consent-banner__actions .consent-banner__btn:not(.consent-banner__btn--accept)';
const TRIGGER = '.navbar-tools .report-trigger';

/**
 * The measurement vendors, blocked at the browser.
 *
 * OBRS-1179. This spec is the one place in the lane that presses ACCEPT, and since
 * that card the gate build carries a (deliberately invalid) measurement ID — the bar
 * cannot render without one, which is the whole point of the card. So accept now
 * reaches `AnalyticsTagsService.load()` for real and it builds a `googletagmanager.com`
 * URL, exactly as production would.
 *
 * Nothing in this spec asserts on that traffic; `obrs-867-analytics-consent-gate.spec.ts`
 * owns the network claim, on a lane that is allowed to have a network. Here the request
 * would only be an external dependency in a lane whose entire premise is that it has
 * none — so it is aborted by name. `e2e/support/analytics-consent.ts` keeps every OTHER
 * spec away from these hosts by seeding a settled `denied`; this is the same guarantee
 * for the one spec that cannot use that seed.
 */
const TAG_HOSTS = ['**googletagmanager.com/**', '**clarity.ms/**', '**google-analytics.com/**'];

/**
 * Home-page traffic only. Same two stubs the rest of the lane uses for `/`; nothing else
 * is needed, which is what keeps this spec admissible to the hermetic lane.
 */
async function stubHome(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
  });
  for (const host of TAG_HOSTS) {
    await page.route(host, (route) => route.abort());
  }
  await page.route('**/api/stops', (route) => route.fulfill({ json: stationsFixture }));
  await page.route('**/api/schedules/search', (route) =>
    route.fulfill({ json: schedulesFixture })
  );
}

/**
 * What the browser would deliver a click at the FAB's centre to.
 *
 * Reads the whole hit stack with `elementsFromPoint` (plural) rather than just the top
 * element, and reports the first entry that is one of the two things this spec is about.
 * That is not defensive padding — the first version of this helper took only the topmost
 * element and failed with `Received: "DIV"` on BOTH the banner-up and banner-absent cases.
 * The DIV was `.swal2-container`, which `src/styles.scss` lifts to `z-index: 1400` (above
 * every app overlay, deliberately — OBRS-265) and which SweetAlert2 leaves parked in the
 * DOM as a full-viewport `position: fixed` element for a moment after a popup closes. It
 * is transient: the original OBRS-867 CI trace shows Playwright retrying past it twice
 * before settling on the consent banner for the remaining 112 attempts.
 *
 * So the stack, not the top, is the honest measurement of "is the FAB reachable, and if
 * not, what is in front of it" — and `expect.poll` at the call sites lets the transient
 * layer clear without hiding a permanent one.
 */
async function topmostOverTrigger(page: Page): Promise<string> {
  return page.evaluate((triggerSelector) => {
    const trigger = document.querySelector(triggerSelector);
    if (!trigger) return 'NO-TRIGGER';
    const box = trigger.getBoundingClientRect();
    const stack = document.elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2);

    for (const element of stack) {
      if (element.closest('.consent-banner')) return 'CONSENT-BANNER';
      if (element.closest(triggerSelector)) return 'TRIGGER';
    }
    // Neither is in the stack at all. Name what IS on top, so a third overlay arriving
    // one day reports itself instead of hiding behind a bare "not TRIGGER".
    return stack[0] ? `OTHER:${stack[0].className || stack[0].tagName}` : 'NOTHING';
  }, TRIGGER);
}

/** `topmostOverTrigger`, polled — see that helper for why a transient layer has to clear. */
async function expectTopmostOverTrigger(page: Page, expected: string, because: string) {
  await expect
    .poll(() => topmostOverTrigger(page), { message: because, timeout: 10_000 })
    .toBe(expected);
}

const readDecision = (page: Page): Promise<string | null> =>
  page.evaluate((key) => localStorage.getItem(key), ANALYTICS_CONSENT_KEY);

test.describe('Analytics consent banner — the undecided state', () => {
  test.beforeEach(async ({ page }) => stubHome(page));

  test('renders on a fresh visit with both answers, and no untranslated keys', async ({
    page,
  }) => {
    await page.goto('/');

    const banner = page.locator(BANNER);
    await expect(banner).toBeVisible({ timeout: 15_000 });

    // Both buttons present. The component puts Decline FIRST in the DOM on purpose, so
    // that the cheaper answer for us is not also the one that gets keyboard focus first
    // — assert the ORDER, not just presence, or that intent has no gate.
    const buttons = banner.locator('.consent-banner__btn');
    await expect(buttons).toHaveCount(2);
    await expect(buttons.nth(0)).not.toHaveClass(/consent-banner__btn--accept/);
    await expect(buttons.nth(1)).toHaveClass(/consent-banner__btn--accept/);

    // A missing translation renders the raw key. That is the shape `test:i18n` guards in
    // the key sets; this catches the other half — a key that exists but was never wired.
    await expect(banner).not.toContainText('ANALYTICS_CONSENT.');
    await expect(banner).toContainText('May we measure how this site is used?');
  });

  test('the banner no longer covers the report entry point at all (OBRS-1832)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator(BANNER)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(TRIGGER)).toBeVisible();

    // THE REGRESSION, restated. Until OBRS-1832 this case pinned the OPPOSITE:
    // the banner deliberately sat over the report FAB in the bottom-right corner,
    // and 23 gate cases were silently running in a state where the only way to
    // report a problem was unclickable. The entry point is in the navbar now, so
    // a bar pinned to the bottom edge cannot reach it — and that is the claim.
    await expectTopmostOverTrigger(
      page,
      'TRIGGER',
      'the report trigger must be clickable WHILE the PDPA question is unanswered — ' +
        'it is in the top bar and the banner is on the bottom edge. If this reads ' +
        'CONSENT-BANNER, something re-introduced a full-viewport overlay.'
    );
    await page.locator(TRIGGER).click();
    await expect(page.locator('.report-modal, [role="dialog"]').first()).toBeVisible();
    await page.keyboard.press('Escape');

    await page.locator(DECLINE).click();
    await expect(page.locator(BANNER)).toHaveCount(0);
    await expectTopmostOverTrigger(page, 'TRIGGER', 'dismissal must not leave an invisible interceptor');
  });
});

test.describe('Analytics consent banner — answering it', () => {
  test.beforeEach(async ({ page }) => stubHome(page));

  // Deliberately ONE test here, not a full accept/decline/reload matrix.
  // `obrs-867-analytics-consent-gate.spec.ts` already covers persistence and the returning
  // visitor, and it does it far better than a DOM assertion could — by watching the WIRE
  // for requests to the tag hosts. What it cannot be is a merge gate: it needs the
  // `analytics-e2e` build (the only one carrying a measurement ID) and so runs under its
  // own config. This is the gated crumb of that coverage: accepting must dismiss the bar.
  // Decline's dismissal is asserted in the position test above, where it is load-bearing.
  test('Accept persists "granted" and dismisses the banner', async ({ page }) => {
    await page.goto('/');
    await page.locator(ACCEPT).click();

    await expect(page.locator(BANNER)).toHaveCount(0);
    expect(await readDecision(page)).toBe('granted');
  });
});

test.describe('Analytics consent banner — a settled answer', () => {
  test('a seeded decision means the banner never renders', async ({ page }) => {
    // Pins the helper every other spec in this lane now depends on. If `seedAnalyticsConsent`
    // ever writes the wrong key — say the service's version suffix moves to `_v2` — this
    // goes red HERE, once, instead of returning the 23 timeouts it was written to end.
    await stubHome(page);
    await seedAnalyticsConsent(page);

    await page.goto('/');
    await expect(page.locator(TRIGGER)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(BANNER)).toHaveCount(0);
    await expectTopmostOverTrigger(page, 'TRIGGER', 'a seeded decision must leave the trigger clickable');
  });
});
